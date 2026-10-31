import {
  type Area,
  buildPlaceSearchText,
  EMPTY_AREA,
  type LegacyDistrict,
  type NewTelegramPlace,
  normalizeForSearch,
  type Place,
} from '@angiday/shared';
import type { Db } from 'mongodb';
import { type PlaceDoc, placesCollection, toObjectId } from './collections';

function toPlace({ _id, groupId, tagIds, ...rest }: PlaceDoc): Place {
  const mapsFeatureId = rest.mapsFeatureId ?? null;
  const address = rest.address ?? null;
  const area = rest.area ?? EMPTY_AREA;
  const highlights = rest.highlights ?? [];
  const searchText = rest.searchText ?? buildPlaceSearchText({ name: rest.name, address, area, highlights });
  return {
    ...rest,
    mapsFeatureId,
    address,
    area,
    cuisine: rest.cuisine ?? [],
    dishType: rest.dishType ?? [],
    priceRange: rest.priceRange ?? null,
    highlights,
    tagIds: (tagIds ?? []).map((id) => id.toHexString()),
    searchText,
    id: _id.toHexString(),
    groupId: groupId.toHexString(),
  };
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
      $set: {
        name: input.name,
        mapsUrl: input.mapsUrl,
        mapsFeatureId: input.mapsFeatureId,
        location: input.location,
        address: input.address,
        area: input.area,
        cuisine: input.cuisine,
        dishType: input.dishType,
        priceRange: input.priceRange,
        highlights: input.highlights,
        tagIds: input.tagIds.map(toObjectId),
        searchText: buildPlaceSearchText(input),
        ingestStatus: 'saved',
        updatedAt: now,
      },
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

/** The place a Telegram update produced, if any (a retried SQS message finds its earlier result here). */
export async function findPlaceByTelegramUpdate(db: Db, groupId: string, updateId: number): Promise<Place | null> {
  const doc = await placesCollection(db).findOne({ groupId: toObjectId(groupId), 'source.telegramUpdateId': updateId });
  return doc ? toPlace(doc) : null;
}

export interface BackfillOptions {
  /** Injected so `packages/db` never imports the polygon data. */
  findLegacyDistrict: (lat: number, lng: number) => LegacyDistrict | null;
  dryRun?: boolean;
}

/**
 * Gives places saved before S2/S3 the fields later queries rely on. Sets only fields that are missing (`undefined`) and never
 * touches `updatedAt`; a place that already has everything is left alone. Does not call Nominatim or the LLM: old places
 * keep `address: null`, empty classification and no tags.
 */
export async function backfillPlaceDefaults(
  db: Db,
  groupId: string,
  options: BackfillOptions,
): Promise<{ scanned: number; updated: number }> {
  const collection = placesCollection(db);
  let scanned = 0;
  let updated = 0;
  for await (const doc of collection.find({ groupId: toObjectId(groupId) })) {
    scanned += 1;
    const set: Record<string, unknown> = {};
    if (doc.mapsFeatureId === undefined) set.mapsFeatureId = null;
    if (doc.address === undefined) set.address = null;
    if (doc.area === undefined) {
      const [lng, lat] = doc.location.coordinates;
      set.area = { city: null, ward: null, legacyDistrict: options.findLegacyDistrict(lat, lng) } satisfies Area;
    }
    if (doc.cuisine === undefined) set.cuisine = [];
    if (doc.dishType === undefined) set.dishType = [];
    if (doc.priceRange === undefined) set.priceRange = null;
    if (doc.highlights === undefined) set.highlights = [];
    if (doc.tagIds === undefined) set.tagIds = [];
    if (doc.searchText === undefined) {
      set.searchText = buildPlaceSearchText({
        name: doc.name,
        address: (set.address ?? doc.address ?? null) as string | null,
        area: (set.area ?? doc.area ?? EMPTY_AREA) as Area,
        highlights: (set.highlights ?? doc.highlights ?? []) as string[],
      });
    }
    if (Object.keys(set).length === 0) continue;
    updated += 1;
    if (!options.dryRun) await collection.updateOne({ _id: doc._id }, { $set: set });
  }
  return { scanned, updated };
}

/** Two saved places with the same name closer than this are one place (ADR-0019). */
export const DUPLICATE_RADIUS_METERS = 50;
const EARTH_RADIUS_METERS = 6_378_100;

/**
 * A saved place of the group that `candidate` repeats (ADR-0019): the same Maps feature id, else the same name
 * (ignoring case and accents) within `DUPLICATE_RADIUS_METERS`. Only `saved` places count.
 */
export async function findDuplicatePlace(
  db: Db,
  groupId: string,
  candidate: { mapsFeatureId: string | null; name: string; lat: number; lng: number },
): Promise<Place | null> {
  const collection = placesCollection(db);
  const base = { groupId: toObjectId(groupId), ingestStatus: 'saved' as const };

  if (candidate.mapsFeatureId !== null) {
    const byFeatureId = await collection.findOne({ ...base, mapsFeatureId: candidate.mapsFeatureId });
    if (byFeatureId) return toPlace(byFeatureId);
  }

  const nearby = await collection
    .find({
      ...base,
      location: { $geoWithin: { $centerSphere: [[candidate.lng, candidate.lat], DUPLICATE_RADIUS_METERS / EARTH_RADIUS_METERS] } },
    })
    .toArray();
  const wanted = normalizeForSearch(candidate.name);
  const sameName = nearby.find((doc) => normalizeForSearch(doc.name) === wanted);
  return sameName ? toPlace(sameName) : null;
}
