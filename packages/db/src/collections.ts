import type { Group, Place } from '@angiday/shared';
import { type Db, ObjectId } from 'mongodb';

export type GroupDoc = Omit<Group, 'id'> & { _id: ObjectId };
export type PlaceDoc = Omit<Place, 'id' | 'groupId'> & { _id: ObjectId; groupId: ObjectId };
export interface TelegramUpdateDoc {
  groupId: ObjectId;
  updateId: number;
  status: 'processing' | 'done';
  createdAt: Date;
  doneAt?: Date;
}

export const groupsCollection = (db: Db) => db.collection<GroupDoc>('groups');
export const placesCollection = (db: Db) => db.collection<PlaceDoc>('places');
export const telegramUpdatesCollection = (db: Db) => db.collection<TelegramUpdateDoc>('telegram_updates');

/** groupId strings cross package boundaries; Mongo stores ObjectIds. Throws on a malformed id. */
export function toObjectId(id: string): ObjectId {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new Error('Invalid id: expected a 24-character hex ObjectId');
  return new ObjectId(id);
}
