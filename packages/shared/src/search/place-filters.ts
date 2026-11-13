import { z } from 'zod';
import { objectIdSchema } from '../ids';
import { visitStatusSchema } from '../place';
import { type Cuisine, cuisineSchema, type DishType, dishTypeSchema, PRICE_RANGE_KEYS, type PriceRange, priceRangeSchema } from '../taxonomy';

const MAX_QUERY_LENGTH = 100;
const MAX_AREA_LENGTH = 60;

/** Filters of the place list and of the Phase 2 `search_places` tool; the strict form of what `parsePlaceFilters` produces. */
export const placeFiltersSchema = z.object({
  /** Free text, matched against `searchText`. */
  q: z.string().trim().min(1).max(MAX_QUERY_LENGTH).nullable(),
  /** A district alias ("q3", "quận 3") or a ward/area name. */
  area: z.string().trim().min(1).max(MAX_AREA_LENGTH).nullable(),
  cuisine: z.array(cuisineSchema),
  dishType: z.array(dishTypeSchema),
  /** The most expensive bucket accepted. */
  maxPrice: priceRangeSchema.nullable(),
  /** Tag ids; a place must have all of them (ADR-0006). */
  tagIds: z.array(objectIdSchema),
  visitStatus: visitStatusSchema.nullable(),
});

export type PlaceFilters = z.infer<typeof placeFiltersSchema>;

export const EMPTY_PLACE_FILTERS: PlaceFilters = {
  q: null,
  area: null,
  cuisine: [],
  dishType: [],
  maxPrice: null,
  tagIds: [],
  visitStatus: null,
};

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function getAll(params: RawParams, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const value = params[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(params: RawParams, key: string, maxLength: number): string | null {
  const value = getAll(params, key)[0]?.trim() ?? '';
  return value === '' ? null : value.slice(0, maxLength).trim();
}

function parseMany<T>(values: string[], schema: z.ZodType<T>): T[] {
  const parsed: T[] = [];
  for (const value of values) {
    const result = schema.safeParse(value);
    if (result.success && !parsed.includes(result.data)) parsed.push(result.data);
  }
  return parsed;
}

function parseOne<T>(values: string[], schema: z.ZodType<T>): T | null {
  const result = schema.safeParse(values[0]);
  return result.success ? result.data : null;
}

/** Reads the URL keys `q, area, cuisine, dish, price, tag, visit`. Never throws: unknown values are dropped. */
export function parsePlaceFilters(params: RawParams): PlaceFilters {
  return {
    q: text(params, 'q', MAX_QUERY_LENGTH),
    area: text(params, 'area', MAX_AREA_LENGTH),
    cuisine: parseMany<Cuisine>(getAll(params, 'cuisine'), cuisineSchema),
    dishType: parseMany<DishType>(getAll(params, 'dish'), dishTypeSchema),
    maxPrice: parseOne(getAll(params, 'price'), priceRangeSchema),
    tagIds: parseMany(getAll(params, 'tag'), objectIdSchema),
    visitStatus: parseOne(getAll(params, 'visit'), visitStatusSchema),
  };
}

export function placeFiltersToSearchParams(filters: PlaceFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q !== null) params.set('q', filters.q);
  if (filters.area !== null) params.set('area', filters.area);
  for (const value of filters.cuisine) params.append('cuisine', value);
  for (const value of filters.dishType) params.append('dish', value);
  if (filters.maxPrice !== null) params.set('price', filters.maxPrice);
  for (const value of filters.tagIds) params.append('tag', value);
  if (filters.visitStatus !== null) params.set('visit', filters.visitStatus);
  return params;
}

export function hasActiveFilters(filters: PlaceFilters): boolean {
  return placeFiltersToSearchParams(filters).size > 0;
}

/** `max` and every cheaper bucket. */
export function priceRangesUpTo(max: PriceRange): PriceRange[] {
  return PRICE_RANGE_KEYS.slice(0, PRICE_RANGE_KEYS.indexOf(max) + 1);
}
