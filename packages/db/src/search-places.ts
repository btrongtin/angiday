import { type PlaceFilters, type Place, normalizeForSearch, priceRangesUpTo, resolveAreaQuery } from '@angiday/shared';
import type { Db, Filter } from 'mongodb';
import { type PlaceDoc, placesCollection, toObjectId } from './collections';
import { toPlace } from './places';

export const SEARCH_LIMIT = 100;

/** `text` is `normalizeForSearch` output (letters, digits, single spaces), so it needs no regex escaping. */
const wholeWords = (text: string): Filter<PlaceDoc> => ({ searchText: { $regex: `(^| )${text}( |$)` } });

/**
 * The group's saved places that match `filters`, newest first. Values within one field are alternatives (OR), fields are
 * ANDed, and a place needs every selected tag. `needs_info` / `failed` places stay hidden (architecture.md → F2).
 */
export async function searchPlaces(
  db: Db,
  groupId: string,
  filters: PlaceFilters,
  options: { limit?: number } = {},
): Promise<Place[]> {
  const query: Filter<PlaceDoc> = { groupId: toObjectId(groupId), ingestStatus: 'saved' };
  const and: Filter<PlaceDoc>[] = [];

  if (filters.cuisine.length > 0) query.cuisine = { $in: filters.cuisine };
  if (filters.dishType.length > 0) query.dishType = { $in: filters.dishType };
  if (filters.maxPrice !== null) query.priceRange = { $in: priceRangesUpTo(filters.maxPrice) };
  if (filters.tagIds.length > 0) query.tagIds = { $all: filters.tagIds.map(toObjectId) };
  if (filters.visitStatus !== null) query.visitStatus = filters.visitStatus;

  const area = filters.area === null ? null : resolveAreaQuery(filters.area);
  if (area?.kind === 'districts') query['area.legacyDistrict'] = { $in: area.districts };
  else if (area?.kind === 'text') and.push(wholeWords(area.text));

  const text = filters.q === null ? '' : normalizeForSearch(filters.q);
  if (text !== '') and.push(wholeWords(text));
  if (and.length > 0) query.$and = and;

  const docs = await placesCollection(db)
    .find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(options.limit ?? SEARCH_LIMIT)
    .toArray();
  return docs.map(toPlace);
}
