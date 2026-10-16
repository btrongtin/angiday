import type { Db } from 'mongodb';
import { telegramUpdatesCollection, toObjectId } from './collections';

/**
 * Record that we started an update. `new` = first time; `retry` = seen before but never finished
 * (a crash or an SQS redelivery — process it again); `done` = finished, skip it (Phase 1 plan → Idempotency).
 */
export async function claimTelegramUpdate(db: Db, groupId: string, updateId: number): Promise<'new' | 'retry' | 'done'> {
  const groupObjectId = toObjectId(groupId);
  const before = await telegramUpdatesCollection(db).findOneAndUpdate(
    { groupId: groupObjectId, updateId },
    { $setOnInsert: { groupId: groupObjectId, updateId, status: 'processing', createdAt: new Date() } },
    { upsert: true, returnDocument: 'before' },
  );
  if (!before) return 'new';
  return before.status === 'done' ? 'done' : 'retry';
}

export async function markTelegramUpdateDone(db: Db, groupId: string, updateId: number): Promise<void> {
  await telegramUpdatesCollection(db).updateOne(
    { groupId: toObjectId(groupId), updateId },
    { $set: { status: 'done', doneAt: new Date() } },
  );
}
