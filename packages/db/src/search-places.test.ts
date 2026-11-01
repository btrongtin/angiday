import { type Area, EMPTY_AREA, EMPTY_PLACE_FILTERS, type NewTelegramPlace, type PlaceFilters } from '@angiday/shared';
import { type Db, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placesCollection } from './collections';
import { upsertPlaceFromTelegram } from './places';
import { SEARCH_LIMIT, searchPlaces } from './search-places';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

const groupA = new ObjectId().toHexString();
const groupB = new ObjectId().toHexString();
const tagHenHo = new ObjectId().toHexString();
const tagRe = new ObjectId().toHexString();
const tagOfB = new ObjectId().toHexString();

let updateId = 0;
function place(name: string, overrides: Partial<NewTelegramPlace> = {}): NewTelegramPlace {
  updateId += 1;
  return {
    name,
    mapsUrl: `https://www.google.com/maps/place/${updateId}/@10.7,106.7,17z`,
    mapsFeatureId: null,
    location: { type: 'Point', coordinates: [106.7, 10.7] },
    address: null,
    area: EMPTY_AREA,
    cuisine: [],
    dishType: [],
    priceRange: null,
    highlights: [],
    tagIds: [],
    source: { telegramChatId: -1001, telegramMessageId: updateId, telegramUpdateId: updateId },
    ...overrides,
  };
}
const area = (legacyDistrict: Area['legacyDistrict'], ward: string | null = null): Area => ({
  legacyDistrict,
  ward,
  city: 'Thành phố Hồ Chí Minh',
});

const filters = (overrides: Partial<PlaceFilters>): PlaceFilters => ({ ...EMPTY_PLACE_FILTERS, ...overrides });
const names = async (group: string, f: Partial<PlaceFilters>) => (await searchPlaces(db, group, filters(f))).map((p) => p.name).sort();

beforeAll(async () => {
  const seeds: [string, NewTelegramPlace][] = [
    [groupA, place('Nướng Hàn Q3', { cuisine: ['korean'], dishType: ['grill'], priceRange: '100k_200k', area: area('q3'), tagIds: [tagHenHo, tagRe] })],
    [groupA, place('Bún Bò Xuân Hòa', { cuisine: ['vietnamese'], dishType: ['noodle_soup'], priceRange: 'under_50k', area: area('q3', 'Phường Xuân Hòa'), highlights: ['bún bò'], tagIds: [tagHenHo] })],
    [groupA, place('Lẩu Hàn Q1', { cuisine: ['korean'], dishType: ['hotpot'], priceRange: '200k_500k', area: area('q1') })],
    [groupA, place('Sushi Q10', { cuisine: ['japanese'], area: area('q10') })],
    [groupA, place('Quán Q2', { area: area('q2') })],
    [groupA, place('Quán Q9', { area: area('q9') })],
    [groupA, place('Quán Thủ Đức', { area: area('thu_duc') })],
    [groupA, place('Quán Ngoài Quận', { area: area(null) })],
    [groupB, place('Nướng Hàn B', { cuisine: ['korean'], dishType: ['grill'], priceRange: '100k_200k', area: area('q3', 'Phường Xuân Hòa'), highlights: ['bún bò'], tagIds: [tagOfB] })],
  ];

  for (const [group, newPlace] of seeds) {
    await upsertPlaceFromTelegram(db, group, newPlace);
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
  await placesCollection(db).insertOne({
    _id: new ObjectId(),
    groupId: new ObjectId(groupA),
    name: 'Chưa xong',
    mapsUrl: 'https://www.google.com/maps/place/x/@10.7,106.7,17z',
    location: { type: 'Point', coordinates: [106.7, 10.7] },
    ingestStatus: 'needs_info',
    visitStatus: 'want_to_try',
    source: { telegramChatId: -1001, telegramMessageId: 1, telegramUpdateId: 9999 },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe('searchPlaces', () => {
  it('returns the saved places of the group, newest first', async () => {
    const places = await searchPlaces(db, groupA, EMPTY_PLACE_FILTERS);

    expect(places).toHaveLength(8);
    expect(places.map((p) => p.name)).not.toContain('Chưa xong');
    expect(places.map((p) => p.name)).not.toContain('Nướng Hàn B');
    const times = places.map((p) => p.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('treats cuisine as OR within the field', async () => {
    expect(await names(groupA, { cuisine: ['korean', 'japanese'] })).toEqual(['Lẩu Hàn Q1', 'Nướng Hàn Q3', 'Sushi Q10']);
  });

  it('ANDs different fields (the demo: Hàn + nướng + Q3 + ≤ 200k)', async () => {
    const result = await names(groupA, { cuisine: ['korean'], dishType: ['grill'], area: 'q3', maxPrice: '100k_200k' });

    expect(result).toEqual(['Nướng Hàn Q3']);
  });

  it('includes cheaper buckets for maxPrice and excludes unknown prices', async () => {
    expect(await names(groupA, { maxPrice: '100k_200k' })).toEqual(['Bún Bò Xuân Hòa', 'Nướng Hàn Q3']);
  });

  it('ANDs tags and ignores tags of other groups', async () => {
    expect(await names(groupA, { tagIds: [tagHenHo] })).toEqual(['Bún Bò Xuân Hòa', 'Nướng Hàn Q3']);
    expect(await names(groupA, { tagIds: [tagHenHo, tagRe] })).toEqual(['Nướng Hàn Q3']);
    expect(await names(groupA, { tagIds: [tagRe, new ObjectId().toHexString()] })).toEqual([]);
    expect(await names(groupA, { tagIds: [tagOfB] })).toEqual([]);
  });

  it('resolves area aliases to districts without confusing q1 and q10', async () => {
    expect(await names(groupA, { area: 'q.3' })).toEqual(['Bún Bò Xuân Hòa', 'Nướng Hàn Q3']);
    expect(await names(groupA, { area: 'q1' })).toEqual(['Lẩu Hàn Q1']);
    expect(await names(groupA, { area: 'quận 10' })).toEqual(['Sushi Q10']);
  });

  it('maps "thủ đức" to q2, q9 and thu_duc, and "quận thủ đức" to thu_duc only', async () => {
    expect(await names(groupA, { area: 'thủ đức' })).toEqual(['Quán Q2', 'Quán Q9', 'Quán Thủ Đức']);
    expect(await names(groupA, { area: 'quận thủ đức' })).toEqual(['Quán Thủ Đức']);
  });

  it('searches searchText for an area that is not an alias', async () => {
    expect(await names(groupA, { area: 'Xuân Hòa' })).toEqual(['Bún Bò Xuân Hòa']);
  });

  it('matches q as an accent-insensitive whole-word phrase', async () => {
    expect(await names(groupA, { q: 'bun bo' })).toEqual(['Bún Bò Xuân Hòa']);
    expect(await names(groupA, { q: 'BÚN BÒ' })).toEqual(['Bún Bò Xuân Hòa']);
    expect(await names(groupA, { q: 'bun b' })).toEqual([]);
    expect(await names(groupA, { q: 'quận 1' })).toEqual(['Lẩu Hàn Q1']);
  });

  it('ignores a q that normalizes to nothing', async () => {
    expect(await searchPlaces(db, groupA, filters({ q: '...' }))).toHaveLength(8);
  });

  it('filters by visit status', async () => {
    await placesCollection(db).updateOne({ name: 'Sushi Q10', groupId: new ObjectId(groupA) }, { $set: { visitStatus: 'visited' } });

    expect(await names(groupA, { visitStatus: 'visited' })).toEqual(['Sushi Q10']);
    expect(await searchPlaces(db, groupA, filters({ visitStatus: 'want_to_try' }))).toHaveLength(7);
  });

  it.each<[string, Partial<PlaceFilters>]>([
    ['cuisine', { cuisine: ['korean'] }],
    ['dish type', { dishType: ['grill'] }],
    ['max price', { maxPrice: '100k_200k' }],
    ['tag', { tagIds: [tagOfB] }],
    ['district alias', { area: 'q3' }],
    ['area text', { area: 'xuan hoa' }],
    ['free text', { q: 'bun bo' }],
    ['visit status', { visitStatus: 'want_to_try' }],
  ])('never returns another group\'s places (%s)', async (_label, f) => {
    const result = await searchPlaces(db, groupA, filters(f));

    expect(result.every((p) => p.groupId === groupA)).toBe(true);
  });

  it('limits the number of results', async () => {
    expect(SEARCH_LIMIT).toBe(100);
    expect(await searchPlaces(db, groupA, EMPTY_PLACE_FILTERS, { limit: 2 })).toHaveLength(2);
  });

  it('reads places saved before S2 and S3 with defaults', async () => {
    const groupC = new ObjectId();
    await placesCollection(db).insertOne({
      _id: new ObjectId(),
      groupId: groupC,
      name: 'Phở Cũ',
      mapsUrl: 'https://www.google.com/maps/place/x/@10.7,106.7,17z',
      location: { type: 'Point', coordinates: [106.7, 10.7] },
      ingestStatus: 'saved',
      visitStatus: 'want_to_try',
      source: { telegramChatId: -1001, telegramMessageId: 1, telegramUpdateId: 1 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [old] = await searchPlaces(db, groupC.toHexString(), EMPTY_PLACE_FILTERS);

    expect(old).toMatchObject({ mapsFeatureId: null, address: null, area: EMPTY_AREA, cuisine: [], dishType: [], priceRange: null, highlights: [], tagIds: [] });
  });
});
