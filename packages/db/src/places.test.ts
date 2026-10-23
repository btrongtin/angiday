import { EMPTY_AREA, normalizeForSearch, type NewTelegramPlace } from '@angiday/shared';
import { type Db, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placesCollection } from './collections';
import { findPlaceByTelegramUpdate, listPlaces, upsertPlaceFromTelegram } from './places';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

const groupA = new ObjectId().toHexString();
const groupB = new ObjectId().toHexString();

function newPlace(updateId: number, name = `Quán ${updateId}`): NewTelegramPlace {
  return {
    name,
    mapsUrl: `https://www.google.com/maps/place/Q${updateId}/@10.7,106.7,17z`,
    mapsFeatureId: '0x1:0x2',
    location: { type: 'Point', coordinates: [106.7, 10.7] },
    address: null,
    area: EMPTY_AREA,
    cuisine: [],
    dishType: [],
    priceRange: null,
    highlights: [],
    tagIds: [],
    source: { telegramChatId: -1001, telegramMessageId: updateId, telegramUpdateId: updateId, telegramUserId: 111 },
  };
}

describe('upsertPlaceFromTelegram', () => {
  it('saves a place with default statuses', async () => {
    const place = await upsertPlaceFromTelegram(db, groupA, newPlace(1, 'Phở Hòa'));

    expect(place).toMatchObject({ groupId: groupA, name: 'Phở Hòa', ingestStatus: 'saved', visitStatus: 'want_to_try' });
    expect(place.id).toMatch(/^[0-9a-f]{24}$/);
    expect(place.createdAt).toBeInstanceOf(Date);
  });

  it('is idempotent per (groupId, Telegram update id)', async () => {
    const first = await upsertPlaceFromTelegram(db, groupA, newPlace(2));
    const second = await upsertPlaceFromTelegram(db, groupA, newPlace(2));

    expect(second.id).toBe(first.id);
    expect(await placesCollection(db).countDocuments({ 'source.telegramUpdateId': 2 })).toBe(1);
  });

  it('stores feature id, address, area and a derived searchText', async () => {
    const area = { legacyDistrict: 'q1', ward: 'Phường Tân Định', city: 'Thành phố Hồ Chí Minh' } as const;

    const place = await upsertPlaceFromTelegram(db, groupA, {
      ...newPlace(4, 'Phở Hòa'),
      address: '12 Trần Quang Khải, Phường Tân Định',
      area,
    });

    expect(place).toMatchObject({ mapsFeatureId: '0x1:0x2', address: '12 Trần Quang Khải, Phường Tân Định', area });
    expect(place.searchText).toContain('pho hoa');
    expect(place.searchText).toContain('phuong tan dinh');
    expect(place.searchText).toContain('quan 1');
  });

  it('stores classification, highlights and tag ids, and puts highlights in searchText', async () => {
    const tagId = new ObjectId().toHexString();

    const place = await upsertPlaceFromTelegram(db, groupA, {
      ...newPlace(5, 'Quán Bún'),
      cuisine: ['vietnamese'],
      dishType: ['noodle_soup'],
      priceRange: 'under_50k',
      highlights: ['bún bò'],
      tagIds: [tagId],
    });

    expect(place).toMatchObject({
      cuisine: ['vietnamese'],
      dishType: ['noodle_soup'],
      priceRange: 'under_50k',
      highlights: ['bún bò'],
      tagIds: [tagId],
    });
    expect(place.searchText).toContain('bun bo');
  });

  it('rejects a malformed groupId', async () => {
    await expect(upsertPlaceFromTelegram(db, 'not-an-id', newPlace(3))).rejects.toThrow(/ObjectId/);
  });
});

describe('listPlaces', () => {
  it('returns only the group’s saved places, newest first', async () => {
    const older = await upsertPlaceFromTelegram(db, groupB, newPlace(10));
    const newer = await upsertPlaceFromTelegram(db, groupB, newPlace(11));
    await placesCollection(db).updateOne({ 'source.telegramUpdateId': 11 }, { $set: { createdAt: new Date(Date.now() + 1000) } });
    await upsertPlaceFromTelegram(db, groupA, newPlace(12));
    await placesCollection(db).insertOne({
      ...newPlace(13),
      _id: new ObjectId(),
      groupId: new ObjectId(groupB),
      tagIds: [],
      ingestStatus: 'needs_info',
      visitStatus: 'want_to_try',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const places = await listPlaces(db, groupB);

    expect(places.map((p) => p.id)).toEqual([newer.id, older.id]);
  });

  it('reads a place saved before S2 (no address/area fields)', async () => {
    const groupC = new ObjectId();
    const { name, mapsUrl, location, source } = newPlace(20, 'Phở Cũ');
    await placesCollection(db).insertOne({
      name,
      mapsUrl,
      location,
      source,
      _id: new ObjectId(),
      groupId: groupC,
      ingestStatus: 'saved',
      visitStatus: 'want_to_try',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [place] = await listPlaces(db, groupC.toHexString());

    expect(place).toMatchObject({
      mapsFeatureId: null,
      address: null,
      area: EMPTY_AREA,
      searchText: normalizeForSearch('Phở Cũ'),
    });
  });

  it('reads a place saved before S3 (no classification fields)', async () => {
    const groupD = new ObjectId();
    const { name, mapsUrl, location, source } = newPlace(21, 'Phở S2');
    await placesCollection(db).insertOne({
      name,
      mapsUrl,
      location,
      source,
      mapsFeatureId: null,
      address: null,
      area: EMPTY_AREA,
      searchText: 'pho s2',
      _id: new ObjectId(),
      groupId: groupD,
      ingestStatus: 'saved',
      visitStatus: 'want_to_try',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [place] = await listPlaces(db, groupD.toHexString());

    expect(place).toMatchObject({ cuisine: [], dishType: [], priceRange: null, highlights: [], tagIds: [] });
  });

  it('applies the limit', async () => {
    expect(await listPlaces(db, groupB, { limit: 1 })).toHaveLength(1);
  });
});

describe('findPlaceByTelegramUpdate', () => {
  it('finds a place by (groupId, update id) and never across groups', async () => {
    const saved = await upsertPlaceFromTelegram(db, groupA, newPlace(30));

    expect((await findPlaceByTelegramUpdate(db, groupA, 30))?.id).toBe(saved.id);
    expect(await findPlaceByTelegramUpdate(db, groupB, 30)).toBeNull();
    expect(await findPlaceByTelegramUpdate(db, groupA, 31)).toBeNull();
  });
});
