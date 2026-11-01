import type { PlaceFilters } from '@angiday/shared';

/**
 * Tag ids in the URL that the group no longer has (deleted, or from another group) are ignored, not matched:
 * ADR-0006 says dangling ids are ignored on read, and otherwise a stale bookmark shows an empty list with no visible filter.
 */
export function dropUnknownTags(filters: PlaceFilters, tags: readonly { id: string }[]): PlaceFilters {
  const known = new Set(tags.map((tag) => tag.id));
  return { ...filters, tagIds: filters.tagIds.filter((id) => known.has(id)) };
}
