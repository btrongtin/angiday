import { MAX_TAG_NAME_LENGTH, MAX_TAGS_PER_PLACE } from '../place-extraction';
import { normalizeForSearch } from '../text/search-text';

/** Display form of a tag name: NFC, no leading `#`, underscores as spaces, single spaces. */
export function cleanTagName(name: string): string {
  return name.normalize('NFC').trim().replace(/^#+/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Key a tag is matched by: accent-free, lower-case ("#Hẹn_Hò" → "hen ho"). */
export function normalizeTagName(name: string): string {
  return normalizeForSearch(cleanTagName(name));
}

/**
 * Maps the tag names the LLM proposed to ids (ADR-0006). An existing tag wins; otherwise the name may become a new
 * tag only if the user wrote it (its words appear whole in the normalized note). The LLM never produces ids.
 */
export function matchTags(input: {
  proposed: readonly string[];
  existing: readonly { id: string; normalized: string }[];
  note: string;
}): { tagIds: string[]; toCreate: string[] } {
  const byNormalized = new Map(input.existing.map((tag) => [tag.normalized, tag.id]));
  const paddedNote = ` ${normalizeForSearch(input.note)} `;
  const seen = new Set<string>();
  const tagIds: string[] = [];
  const toCreate: string[] = [];

  for (const name of input.proposed) {
    if (tagIds.length + toCreate.length >= MAX_TAGS_PER_PLACE) break;
    const normalized = normalizeTagName(name);
    if (normalized === '' || normalized.length > MAX_TAG_NAME_LENGTH || seen.has(normalized)) continue;
    seen.add(normalized);

    const existingId = byNormalized.get(normalized);
    if (existingId !== undefined) tagIds.push(existingId);
    else if (paddedNote.includes(` ${normalized} `)) toCreate.push(cleanTagName(name));
  }
  return { tagIds, toCreate };
}
