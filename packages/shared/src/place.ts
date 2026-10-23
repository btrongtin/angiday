import { z } from 'zod';
import { areaSchema } from './area/legacy-districts';
import { objectIdSchema } from './ids';

/** Pipeline state (architecture.md → Data model). */
export const ingestStatusSchema = z.enum(['processing', 'needs_info', 'saved', 'failed']);
/** User state, independent of the pipeline. */
export const visitStatusSchema = z.enum(['want_to_try', 'visited']);

/** GeoJSON point: coordinates are [lng, lat] (ready for a 2dsphere index later). */
export const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

/** Where a place came from; `telegramUpdateId` makes saving idempotent. */
export const telegramSourceSchema = z.object({
  telegramChatId: z.number().int(),
  telegramMessageId: z.number().int(),
  telegramUpdateId: z.number().int(),
  telegramUserId: z.number().int().optional(),
});

export const placeSchema = z.object({
  id: objectIdSchema,
  groupId: objectIdSchema,
  name: z.string().min(1),
  /** The resolved (long) Google Maps URL. */
  mapsUrl: z.url(),
  /** Lower-case `0x<hex>:0x<hex>` from the Maps URL; null when the URL has none. */
  mapsFeatureId: z.string().nullable(),
  location: geoPointSchema,
  /** Street-level address from reverse geocoding (never another POI's name or house number); null when unknown. */
  address: z.string().min(1).nullable(),
  area: areaSchema,
  /** Accent-free text derived from name, address and area on every write (repository). */
  searchText: z.string(),
  ingestStatus: ingestStatusSchema,
  visitStatus: visitStatusSchema,
  source: telegramSourceSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const groupSchema = z.object({
  id: objectIdSchema,
  name: z.string().min(1),
  telegramChatId: z.number().int(),
  createdAt: z.date(),
});

export type IngestStatus = z.infer<typeof ingestStatusSchema>;
export type VisitStatus = z.infer<typeof visitStatusSchema>;
export type GeoPoint = z.infer<typeof geoPointSchema>;
export type Place = z.infer<typeof placeSchema>;
export type NewTelegramPlace = Pick<Place, 'name' | 'mapsUrl' | 'mapsFeatureId' | 'location' | 'address' | 'area' | 'source'>;
export type Group = z.infer<typeof groupSchema>;
