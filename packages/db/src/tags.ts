import { cleanTagName, normalizeTagName, type Tag } from '@angiday/shared';
import type { Db } from 'mongodb';
import { type TagDoc, tagsCollection, toObjectId } from './collections';

function toTag({ _id, groupId, ...rest }: TagDoc): Tag {
  return { ...rest, id: _id.toHexString(), groupId: groupId.toHexString() };
}

/** The group's tags, sorted by name. */
export async function listTags(db: Db, groupId: string): Promise<Tag[]> {
  const docs = await tagsCollection(db).find({ groupId: toObjectId(groupId) }).sort({ name: 1 }).toArray();
  return docs.map(toTag);
}

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

/**
 * The tags for `names` (existing or new), in input order; spelling variants resolve to the same tag. The unique index on
 * `{ groupId, normalized }` makes concurrent creates safe: the loser of a race gets a duplicate-key error and just reads again.
 */
export async function ensureTags(db: Db, groupId: string, names: string[]): Promise<Tag[]> {
  const groupObjectId = toObjectId(groupId);
  const collection = tagsCollection(db);
  const tags: Tag[] = [];
  for (const name of names) {
    const normalized = normalizeTagName(name);
    const filter = { groupId: groupObjectId, normalized };
    const update = { $setOnInsert: { name: cleanTagName(name), createdAt: new Date() } };
    try {
      await collection.updateOne(filter, update, { upsert: true });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      await collection.updateOne(filter, update, { upsert: true });
    }
    const doc = await collection.findOne(filter);
    if (!doc) throw new Error('Tag upsert returned no document');
    tags.push(toTag(doc));
  }
  return tags;
}
