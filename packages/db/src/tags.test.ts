import { type Db, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tagsCollection } from './collections';
import { ensureTags, listTags } from './tags';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

describe('ensureTags', () => {
  it('reuses a tag across spelling variants and keeps its first display name', async () => {
    const groupId = new ObjectId().toHexString();

    const [first] = await ensureTags(db, groupId, ['Hẹn hò']);
    const second = await ensureTags(db, groupId, ['#hen_ho', 'đi nhậu']);

    expect(await tagsCollection(db).countDocuments({ groupId: new ObjectId(groupId) })).toBe(2);
    expect(second[0]?.id).toBe(first?.id);
    expect(second[0]?.name).toBe('Hẹn hò');
    expect(second[1]).toMatchObject({ name: 'đi nhậu', normalized: 'di nhau' });
  });

  it('creates one tag under concurrent calls', async () => {
    const groupId = new ObjectId().toHexString();

    const results = await Promise.all(Array.from({ length: 5 }, () => ensureTags(db, groupId, ['hẹn hò'])));

    expect(await tagsCollection(db).countDocuments({ groupId: new ObjectId(groupId) })).toBe(1);
    expect(new Set(results.map(([tag]) => tag?.id)).size).toBe(1);
  });

  it('returns [] for no names', async () => {
    expect(await ensureTags(db, new ObjectId().toHexString(), [])).toEqual([]);
  });

  it('scopes tags by group', async () => {
    const a = new ObjectId().toHexString();
    const b = new ObjectId().toHexString();
    const [tagA] = await ensureTags(db, a, ['hẹn hò']);
    const [tagB] = await ensureTags(db, b, ['hẹn hò']);

    expect(tagA?.id).not.toBe(tagB?.id);
    expect((await listTags(db, a)).map((tag) => tag.id)).toEqual([tagA?.id]);
  });
});

describe('listTags', () => {
  it('sorts by name', async () => {
    const groupId = new ObjectId().toHexString();
    await ensureTags(db, groupId, ['b tag', 'a tag']);

    expect((await listTags(db, groupId)).map((tag) => tag.name)).toEqual(['a tag', 'b tag']);
  });
});
