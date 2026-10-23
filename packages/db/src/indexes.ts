import type { Db } from 'mongodb';
import { groupsCollection, placesCollection, tagsCollection, telegramUpdatesCollection } from './collections';

/** Telegram stops redelivering an update after ~24h; a week of history is plenty for idempotency. */
export const TELEGRAM_UPDATE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Idempotent: safe to run on every seed and in every test. */
export async function ensureIndexes(db: Db): Promise<void> {
  await groupsCollection(db).createIndex({ telegramChatId: 1 }, { name: 'telegramChatId_unique', unique: true });
  await placesCollection(db).createIndexes([
    { key: { groupId: 1, createdAt: -1 }, name: 'groupId_createdAt' },
    {
      key: { groupId: 1, 'source.telegramUpdateId': 1 },
      name: 'groupId_telegramUpdateId_unique',
      unique: true,
      partialFilterExpression: { 'source.telegramUpdateId': { $exists: true } },
    },
  ]);
  await tagsCollection(db).createIndex({ groupId: 1, normalized: 1 }, { name: 'groupId_normalized_unique', unique: true });
  await telegramUpdatesCollection(db).createIndexes([
    { key: { groupId: 1, updateId: 1 }, name: 'groupId_updateId_unique', unique: true },
    { key: { createdAt: 1 }, name: 'createdAt_ttl', expireAfterSeconds: TELEGRAM_UPDATE_TTL_SECONDS },
  ]);
}
