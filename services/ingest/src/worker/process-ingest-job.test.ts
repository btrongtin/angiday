import { type Db, upsertGroupByTelegramChatId } from '@angiday/db';
import { startMemoryMongo } from '@angiday/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReverseGeocode, ReverseGeocodeResult } from '../geo/nominatim';
import { createTestLog, makeJob, TEST_CHAT_ID, TEST_PLACE_FEATURE_ID, TEST_PLACE_URL } from '../test/fixtures';
import type { SendMessageInput } from '../telegram/api';
import { processIngestJob, REPLY_UNREADABLE_LINK, replySaved } from './process-ingest-job';

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

function deps(overrides: { resolveMapsLink?: (url: string) => Promise<string | null>; reverseGeocode?: ReverseGeocode } = {}) {
  return {
    db,
    telegram: { sendMessage },
    resolveMapsLink: overrides.resolveMapsLink ?? (async () => TEST_PLACE_URL),
    reverseGeocode: overrides.reverseGeocode ?? (async () => FOUND_IN_Q1),
    logger: createTestLog(),
  };
}

const places = () => db.collection('places');

describe('processIngestJob', () => {
  it('saves the place and replies in the same topic', async () => {
    const job = makeJob({ updateId: nextUpdateId++, threadId: 77 });
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
      ingestStatus: 'saved',
    });
    expect(saved?.searchText).toContain('phuong tan dinh');
    expect(saved?.groupId.toHexString()).toBe(groupId);
    expect(reverseGeocode).toHaveBeenCalledWith(10.7895109, 106.6906025);
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: TEST_CHAT_ID,
      text: replySaved('Phở Hòa', 'Q1 · Phường Tân Định'),
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
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text: replySaved('Phở Hòa', 'Q1') }));
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

    const outcome = await processIngestJob(job, deps({ resolveMapsLink: async () => 'https://www.google.com/maps?q=x', reverseGeocode }));

    expect(outcome).toBe('unparsed');
    expect(reverseGeocode).not.toHaveBeenCalled();
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
});
