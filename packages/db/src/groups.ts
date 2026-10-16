import type { Group } from '@angiday/shared';
import type { Db } from 'mongodb';
import { type GroupDoc, groupsCollection } from './collections';

function toGroup({ _id, ...rest }: GroupDoc): Group {
  return { ...rest, id: _id.toHexString() };
}

/**
 * Create the group for a Telegram chat, or return the existing one (used by `pnpm seed:group`).
 * Takes no groupId on purpose: it is how a group comes to exist (ADR-0002).
 */
export async function upsertGroupByTelegramChatId(
  db: Db,
  input: { telegramChatId: number; name: string },
): Promise<Group> {
  const doc = await groupsCollection(db).findOneAndUpdate(
    { telegramChatId: input.telegramChatId },
    { $setOnInsert: { telegramChatId: input.telegramChatId, name: input.name, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );
  if (!doc) throw new Error('Group upsert returned no document');
  return toGroup(doc);
}

/**
 * Resolve the tenant of an incoming Telegram chat. The one read that cannot take a groupId:
 * it is how the worker finds the groupId (ADR-0002).
 */
export async function findGroupByTelegramChatId(db: Db, telegramChatId: number): Promise<Group | null> {
  const doc = await groupsCollection(db).findOne({ telegramChatId });
  return doc ? toGroup(doc) : null;
}
