import { type Db, upsertGroupByTelegramChatId } from '@angiday/db';
import { startMemoryMongo } from '@angiday/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestLog, makeJob, TEST_CHAT_ID, TEST_PLACE_URL } from '../test/fixtures';
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

function deps(overrides: { resolveMapsLink?: (url: string) => Promise<string | null> } = {}) {
  return {
    db,
    telegram: { sendMessage },
    resolveMapsLink: overrides.resolveMapsLink ?? (async () => TEST_PLACE_URL),
    logger: createTestLog(),
  };
}

const places = () => db.collection('places');

describe('processIngestJob', () => {
  it('saves the place and replies in the same topic', async () => {
    const job = makeJob({ updateId: nextUpdateId++, threadId: 77 });

    expect(await processIngestJob(job, deps())).toBe('saved');

    const saved = await places().findOne({ 'source.telegramUpdateId': job.updateId });
    expect(saved).toMatchObject({
      name: 'Phở Hòa',
      mapsUrl: TEST_PLACE_URL,
      location: { type: 'Point', coordinates: [106.6906025, 10.7895109] },
      ingestStatus: 'saved',
    });
    expect(saved?.groupId.toHexString()).toBe(groupId);
    expect(sendMessage).toHaveBeenCalledWith({ chatId: TEST_CHAT_ID, text: replySaved('Phở Hòa'), replyToMessageId: 42, threadId: 77 });
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

    const outcome = await processIngestJob(job, deps({ resolveMapsLink: async () => 'https://www.google.com/maps?q=x' }));

    expect(outcome).toBe('unparsed');
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
