import { type Db, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTelegramUpdate, markTelegramUpdateDone } from './telegram-updates';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

const groupId = new ObjectId().toHexString();

describe('telegram update idempotency', () => {
  it('new → retry while processing → done after marking', async () => {
    expect(await claimTelegramUpdate(db, groupId, 500)).toBe('new');
    expect(await claimTelegramUpdate(db, groupId, 500)).toBe('retry');

    await markTelegramUpdateDone(db, groupId, 500);

    expect(await claimTelegramUpdate(db, groupId, 500)).toBe('done');
  });

  it('two concurrent claims of a new update never both see "new"', async () => {
    const results = await Promise.all([claimTelegramUpdate(db, groupId, 501), claimTelegramUpdate(db, groupId, 501)]);

    expect(results.filter((r) => r === 'new')).toHaveLength(1);
  });
});
