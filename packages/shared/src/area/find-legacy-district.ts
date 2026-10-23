import { z } from 'zod';
import districtData from './hcmc-legacy-districts.json';
import { legacyDistrictSchema, type LegacyDistrict } from './legacy-districts';

// Imported only through the `@angiday/shared/legacy-district` subpath so the ~180 KB of polygons
// never ends up in a client bundle that imports the package index.

type Ring = number[][];

const featureSchema = z.object({
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  properties: z.object({ key: legacyDistrictSchema }),
  geometry: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) }),
});

const districts = z.object({ features: z.array(featureSchema) }).parse(districtData).features;

/** Ray casting: a ray from the point to the right crosses an odd number of edges when the point is inside. */
function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/** `rings[0]` is the outer boundary, the rest are holes. Coordinates are `[lng, lat]`. */
export function pointInPolygon(point: [lng: number, lat: number], rings: number[][][]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !inRing(point, outer)) return false;
  return !holes.some((hole) => inRing(point, hole));
}

/** The pre-2025 HCMC district containing the point, or null outside the 24 polygons. */
export function findLegacyDistrict(lat: number, lng: number): LegacyDistrict | null {
  for (const { bbox, properties, geometry } of districts) {
    if (lng < bbox[0] || lat < bbox[1] || lng > bbox[2] || lat > bbox[3]) continue;
    if (pointInPolygon([lng, lat], geometry.coordinates)) return properties.key;
  }
  return null;
}
