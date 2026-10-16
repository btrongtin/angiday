import type { NewTelegramPlace, Place } from '@angiday/shared';
import type { Db } from 'mongodb';
import { type PlaceDoc, placesCollection, toObjectId } from './collections';

function toPlace({ _id, groupId, ...rest }: PlaceDoc): Place {
  return { ...rest, id: _id.toHexString(), groupId: groupId.toHexString() };
}

/**
 * Save a place from a Telegram message. Idempotent per (groupId, source.telegramUpdateId): a retried
 * SQS message updates the same document instead of creating a duplicate.
 */
export async function upsertPlaceFromTelegram(db: Db, groupId: string, input: NewTelegramPlace): Promise<Place> {
  const groupObjectId = toObjectId(groupId);
  const now = new Date();
  const doc = await placesCollection(db).findOneAndUpdate(
    { groupId: groupObjectId, 'source.telegramUpdateId': input.source.telegramUpdateId },
    {
      $set: { name: input.name, mapsUrl: input.mapsUrl, location: input.location, ingestStatus: 'saved', updatedAt: now },
      $setOnInsert: { groupId: groupObjectId, visitStatus: 'want_to_try', source: input.source, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!doc) throw new Error('Place upsert returned no document');
  return toPlace(doc);
}

/** The group's saved places, newest first. `needs_info` / `failed` stay hidden (architecture.md → F2). */
export async function listPlaces(db: Db, groupId: string, options: { limit?: number } = {}): Promise<Place[]> {
  const docs = await placesCollection(db)
    .find({ groupId: toObjectId(groupId), ingestStatus: 'saved' })
    .sort({ createdAt: -1, _id: -1 })
    .limit(options.limit ?? 100)
    .toArray();
  return docs.map(toPlace);
}
