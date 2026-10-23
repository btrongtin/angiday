import type { ExtractionInput, ExtractionResult } from '@angiday/ai';
import { type Db, listTags, upsertGroupByTelegramChatId } from '@angiday/db';
import { startMemoryMongo } from '@angiday/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReverseGeocode, ReverseGeocodeResult } from '../geo/nominatim';
import { createTestLog, makeJob, TEST_CHAT_ID, TEST_PLACE_FEATURE_ID, TEST_PLACE_URL } from '../test/fixtures';
import type { SendMessageInput } from '../telegram/api';
import { processIngestJob, REPLY_UNREADABLE_LINK } from './process-ingest-job';

let db: Db;
let stop: () => Promise<void>;
let groupId: string;
beforeAll(async () => {
  ({ db, stop } = await startMemoryMongo());
  groupId = (await upsertGroupByTelegramChatId(db, { telegramChatId: TEST_CHAT_ID, name: 'Test' })).id;
});
afterAll(() => stop());

let nextUpdateId = 1;
let sendMessage: ReturnType<typeof vi.fn<(input: SendMessageInput) => Promise<{ messageId: number }>>>;
beforeEach(() => {
  sendMessage = vi.fn<(input: SendMessageInput) => Promise<{ messageId: number }>>().mockResolvedValue({ messageId: 999 });
});

const FOUND_IN_Q1: ReverseGeocodeResult = {
  kind: 'found',
  address: 'Đường Nguyễn Phi Khanh, Phường Tân Định, Thành phố Hồ Chí Minh',
  ward: 'Phường Tân Định',
  city: 'Thành phố Hồ Chí Minh',
};

const NOTE_TEXT = 'bún bò cay, rẻ, hợp hẹn hò https://maps.app.goo.gl/AbC123xyz';
const EXTRACTED: ExtractionResult = {
  details: { cuisine: ['vietnamese'], dishType: ['noodle_soup'], priceRange: 'under_50k', highlights: ['bún bò cay'], tags: ['hẹn hò'] },
  attempts: 1,
  inputTokens: 100,
  outputTokens: 20,
};
type Extract = (input: ExtractionInput) => Promise<ExtractionResult>;

function deps(
  overrides: { resolveMapsLink?: (url: string) => Promise<string | null>; reverseGeocode?: ReverseGeocode; extractPlaceDetails?: Extract } = {},
) {
  return {
    db,
    telegram: { sendMessage },
    resolveMapsLink: overrides.resolveMapsLink ?? (async () => TEST_PLACE_URL),
    reverseGeocode: overrides.reverseGeocode ?? (async () => FOUND_IN_Q1),
    extractPlaceDetails: overrides.extractPlaceDetails ?? (async () => EXTRACTED),
    logger: createTestLog(),
  };
}

const places = () => db.collection('places');

describe('processIngestJob', () => {
  it('saves the place, extracts details and replies in the same topic', async () => {
    const job = makeJob({ updateId: nextUpdateId++, threadId: 77, text: NOTE_TEXT });
    const reverseGeocode = vi.fn<ReverseGeocode>().mockResolvedValue(FOUND_IN_Q1);

    expect(await processIngestJob(job, deps({ reverseGeocode }))).toBe('saved');

    const saved = await places().findOne({ 'source.telegramUpdateId': job.updateId });
    expect(saved).toMatchObject({
      name: 'Phở Hòa',
      mapsUrl: TEST_PLACE_URL,
      mapsFeatureId: TEST_PLACE_FEATURE_ID,
      location: { type: 'Point', coordinates: [106.6906025, 10.7895109] },
      address: FOUND_IN_Q1.kind === 'found' ? FOUND_IN_Q1.address : null,
      area: { legacyDistrict: 'q1', ward: 'Phường Tân Định', city: 'Thành phố Hồ Chí Minh' },
      cuisine: ['vietnamese'],
      dishType: ['noodle_soup'],
      priceRange: 'under_50k',
      highlights: ['bún bò cay'],
      ingestStatus: 'saved',
    });
    expect(saved?.searchText).toContain('phuong tan dinh');
    expect(saved?.groupId.toHexString()).toBe(groupId);
    expect(reverseGeocode).toHaveBeenCalledWith(10.7895109, 106.6906025);
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: TEST_CHAT_ID,
      text: 'Đã lưu: Phở Hòa — Q1 · Phường Tân Định\nViệt · Món nước · < 50k\nMón nổi bật: bún bò cay\nTag: hẹn hò',
      replyToMessageId: 42,
      threadId: 77,
    });
  });

  it('saves without address when reverse geocoding finds nothing, and warns', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });
    const testDeps = deps({ reverseGeocode: async () => ({ kind: 'none', reason: 'http_error' }) });

    expect(await processIngestJob(job, testDeps)).toBe('saved');

    const saved = await places().findOne({ 'source.telegramUpdateId': job.updateId });
    expect(saved).toMatchObject({ address: null, area: { legacyDistrict: 'q1', ward: null, city: null } });
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringMatching(/^Đã lưu: Phở Hòa — Q1\n/) }));
    expect(testDeps.logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ groupId, reason: 'http_error' }));
  });

  it.each([
    ['no ward', { kind: 'found', address: null, ward: null, city: 'Thành phố Hồ Chí Minh' }, 'no_ward'],
    ['no street', { kind: 'found', address: null, ward: 'Phường Tân Định', city: 'Thành phố Hồ Chí Minh' }, 'no_street'],
  ] as const)('warns once when the geocoder answers with %s', async (_label, result, reason) => {
    const testDeps = deps({ reverseGeocode: async () => result });

    await processIngestJob(makeJob({ updateId: nextUpdateId++ }), testDeps);

    expect(testDeps.logger.warn).toHaveBeenCalledTimes(1);
    expect(testDeps.logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ groupId, reason }));
  });

  it('does not warn when the geocoder returns ward and street', async () => {
    const testDeps = deps();

    await processIngestJob(makeJob({ updateId: nextUpdateId++ }), testDeps);

    expect(testDeps.logger.warn).not.toHaveBeenCalled();
  });

  it('a place outside the old districts gets legacyDistrict null', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });
    const hoGuom = 'https://www.google.com/maps/place/H%E1%BB%93+G%C6%B0%C6%A1m/@21.0287,105.8524,17z';

    await processIngestJob(job, deps({ resolveMapsLink: async () => hoGuom }));

    const saved = await places().findOne({ 'source.telegramUpdateId': job.updateId });
    expect(saved?.area).toMatchObject({ legacyDistrict: null });
  });

  it('skips an update that already finished: one place, one reply', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });

    await processIngestJob(job, deps());
    const second = await processIngestJob(job, deps());

    expect(second).toBe('duplicate');
    expect(await places().countDocuments({ 'source.telegramUpdateId': job.updateId })).toBe(1);
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('a retry after a crash between saving and replying still replies, without a second place', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });
    sendMessage.mockRejectedValueOnce(new Error('Telegram timeout'));

    await expect(processIngestJob(job, deps())).rejects.toThrow('Telegram timeout');
    expect(await processIngestJob(job, deps())).toBe('saved');

    expect(await places().countDocuments({ 'source.telegramUpdateId': job.updateId })).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('replies "chưa đọc được" and saves nothing when the link has no place', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });
    const reverseGeocode = vi.fn<ReverseGeocode>();
    const extract = vi.fn<Extract>();

    const outcome = await processIngestJob(
      job,
      deps({ resolveMapsLink: async () => 'https://www.google.com/maps?q=x', reverseGeocode, extractPlaceDetails: extract }),
    );

    expect(outcome).toBe('unparsed');
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(await places().countDocuments({ 'source.telegramUpdateId': job.updateId })).toBe(0);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text: REPLY_UNREADABLE_LINK }));
    expect(await processIngestJob(job, deps())).toBe('duplicate');
  });

  it('treats a resolver refusal (non-Google redirect) as unreadable', async () => {
    const outcome = await processIngestJob(makeJob({ updateId: nextUpdateId++ }), deps({ resolveMapsLink: async () => null }));

    expect(outcome).toBe('unparsed');
  });

  it('does nothing for a chat with no group (seed missing) and does not throw', async () => {
    const outcome = await processIngestJob(makeJob({ updateId: nextUpdateId++, chatId: -100777 }), deps());

    expect(outcome).toBe('unknown_group');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('lets a resolver network error propagate so SQS retries', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });

    await expect(
      processIngestJob(job, deps({ resolveMapsLink: async () => Promise.reject(new Error('ECONNRESET')) })),
    ).rejects.toThrow('ECONNRESET');
  });

  it('creates the tag the user wrote and passes the note and place to the extractor', async () => {
    const job = makeJob({ updateId: nextUpdateId++, text: NOTE_TEXT });
    const extract = vi.fn<Extract>().mockResolvedValue(EXTRACTED);

    await processIngestJob(job, deps({ extractPlaceDetails: extract }));

    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'bún bò cay, rẻ, hợp hẹn hò',
        place: expect.objectContaining({ name: 'Phở Hòa', areaLabel: 'Q1 · Phường Tân Định' }),
      }),
    );
    const saved = await places().findOne({ 'source.telegramUpdateId': job.updateId });
    const hen = (await listTags(db, groupId)).find((tag) => tag.normalized === 'hen ho');
    expect(hen).toBeDefined();
    expect(saved?.tagIds.map((id: { toHexString(): string }) => id.toHexString())).toEqual([hen?.id]);
  });

  it('reuses an existing tag and drops tags the user did not write', async () => {
    const before = (await listTags(db, groupId)).length;
    const job = makeJob({ updateId: nextUpdateId++, text: NOTE_TEXT });
    const extract = async (): Promise<ExtractionResult> => ({
      ...EXTRACTED,
      details: { ...EXTRACTED.details, tags: ['hen ho', 'giá rẻ'] },
    });

    await processIngestJob(job, deps({ extractPlaceDetails: extract }));

    const saved = await places().findOne({ 'source.telegramUpdateId': job.updateId });
    expect(saved?.tagIds).toHaveLength(1);
    expect(await listTags(db, groupId)).toHaveLength(before);
  });

  it('gives the extractor the names of the existing tags of the group', async () => {
    const extract = vi.fn<Extract>().mockResolvedValue(EXTRACTED);

    await processIngestJob(makeJob({ updateId: nextUpdateId++, text: NOTE_TEXT }), deps({ extractPlaceDetails: extract }));

    expect(extract.mock.calls[0]?.[0].existingTagNames).toContain('hẹn hò');
  });

  it('throws and saves nothing when extraction fails (SQS retries later)', async () => {
    const job = makeJob({ updateId: nextUpdateId++, text: NOTE_TEXT });

    await expect(
      processIngestJob(job, deps({ extractPlaceDetails: async () => Promise.reject(new Error('429 Too Many Requests')) })),
    ).rejects.toThrow('429');

    expect(await places().countDocuments({ 'source.telegramUpdateId': job.updateId })).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(await processIngestJob(job, deps())).toBe('saved');
  });

  it('a retry after a saved place replies from the database without geocoding or calling the LLM again', async () => {
    const job = makeJob({ updateId: nextUpdateId++, text: NOTE_TEXT });
    sendMessage.mockRejectedValueOnce(new Error('Telegram timeout'));
    await expect(processIngestJob(job, deps())).rejects.toThrow('Telegram timeout');
    const reverseGeocode = vi.fn<ReverseGeocode>().mockResolvedValue({ kind: 'none', reason: 'http_error' });
    const extract = vi.fn<Extract>();

    expect(await processIngestJob(job, deps({ reverseGeocode, extractPlaceDetails: extract }))).toBe('saved');

    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    const saved = await places().findOne({ 'source.telegramUpdateId': job.updateId });
    expect(saved?.address).toBe('Đường Nguyễn Phi Khanh, Phường Tân Định, Thành phố Hồ Chí Minh');
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]?.[0].text).toBe(sendMessage.mock.calls[0]?.[0].text);
  });
});
