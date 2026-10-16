import type { NewTelegramPlace } from '@angiday/shared';
import { type Db, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placesCollection } from './collections';
import { listPlaces, upsertPlaceFromTelegram } from './places';
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
    location: { type: 'Point', coordinates: [106.7, 10.7] },
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
      ingestStatus: 'needs_info',
      visitStatus: 'want_to_try',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const places = await listPlaces(db, groupB);

    expect(places.map((p) => p.id)).toEqual([newer.id, older.id]);
  });

  it('applies the limit', async () => {
    expect(await listPlaces(db, groupB, { limit: 1 })).toHaveLength(1);
  });
});
