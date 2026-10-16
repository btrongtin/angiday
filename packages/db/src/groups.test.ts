import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findGroupByTelegramChatId, upsertGroupByTelegramChatId } from './groups';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

describe('groups', () => {
  it('upsert is idempotent per Telegram chat id', async () => {
    const first = await upsertGroupByTelegramChatId(db, { telegramChatId: -1001, name: 'Nhà mình' });
    const second = await upsertGroupByTelegramChatId(db, { telegramChatId: -1001, name: 'Other name' });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Nhà mình');
    expect(first.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('finds a group by chat id, or null', async () => {
    const group = await upsertGroupByTelegramChatId(db, { telegramChatId: -1002, name: 'G2' });

    expect(await findGroupByTelegramChatId(db, -1002)).toEqual(group);
    expect(await findGroupByTelegramChatId(db, -1999)).toBeNull();
  });
});
