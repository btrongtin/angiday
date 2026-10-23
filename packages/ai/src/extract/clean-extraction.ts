import {
  cleanTagName,
  MAX_HIGHLIGHT_LENGTH,
  MAX_HIGHLIGHTS,
  MAX_TAG_NAME_LENGTH,
  MAX_TAGS_PER_PLACE,
  normalizeForSearch,
  normalizeTagName,
  type PlaceExtraction,
} from '@angiday/shared';

/** Unique values in order; `other` is dropped when a real value is present. */
function cleanEnum<T extends string>(values: readonly T[]): T[] {
  const unique = [...new Set(values)];
  const real = unique.filter((value) => value !== 'other');
  return real.length > 0 ? real : unique;
}

interface StringRules {
  clean: (value: string) => string;
  key: (value: string) => string;
  maxLength: number;
  max: number;
}

/** Clean each value, drop blanks and over-long entries, dedupe by `key`, keep the first `max`. */
function cleanStrings(values: readonly string[], { clean, key, maxLength, max }: StringRules): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = clean(raw);
    const id = key(value);
    if (value === '' || value.length > maxLength || id === '' || seen.has(id)) continue;
    seen.add(id);
    out.push(value);
    if (out.length === max) break;
  }
  return out;
}

/**
 * Makes an LLM answer storable: deduped enums, trimmed and capped lists. Caps are applied here, not in the schema,
 * so a long list costs no re-prompt.
 */
export function cleanExtraction(raw: PlaceExtraction): PlaceExtraction {
  return {
    cuisine: cleanEnum(raw.cuisine),
    dishType: cleanEnum(raw.dishType),
    priceRange: raw.priceRange,
    highlights: cleanStrings(raw.highlights, {
      clean: (value) => value.replace(/\s+/g, ' ').trim(),
      key: normalizeForSearch,
      maxLength: MAX_HIGHLIGHT_LENGTH,
      max: MAX_HIGHLIGHTS,
    }),
    tags: cleanStrings(raw.tags, {
      clean: cleanTagName,
      key: normalizeTagName,
      maxLength: MAX_TAG_NAME_LENGTH,
      max: MAX_TAGS_PER_PLACE,
    }),
  };
}
