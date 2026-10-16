import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { groupsCollection } from './collections';
import { ensureIndexes } from './indexes';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

describe('ensureIndexes', () => {
  it('can run twice', async () => {
    await expect(ensureIndexes(db)).resolves.toBeUndefined();
  });

  it('enforces one group per Telegram chat', async () => {
    const doc = { name: 'G', telegramChatId: -1001, createdAt: new Date() };
    await groupsCollection(db).insertOne({ ...doc } as never);

    await expect(groupsCollection(db).insertOne({ ...doc } as never)).rejects.toThrow(/E11000/);
  });
});
