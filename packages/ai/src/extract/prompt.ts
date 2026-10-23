import {
  CUISINE_KEYS,
  CUISINE_LABELS,
  DISH_TYPE_KEYS,
  DISH_TYPE_LABELS,
  MAX_HIGHLIGHTS,
  MAX_TAGS_PER_PLACE,
  PRICE_RANGE_KEYS,
  PRICE_RANGE_LABELS,
} from '@angiday/shared';

export interface ExtractionInput {
  /** The user's own words with Maps links removed (`stripMapsUrls`). May be empty. */
  note: string;
  place: { name: string; address: string | null; areaLabel: string | null };
  existingTagNames: string[];
}

const list = <K extends string>(keys: readonly K[], labels: Record<K, string>) =>
  keys.map((key) => `  - ${key}: ${labels[key]}`).join('\n');

const SYSTEM = `You classify a restaurant that a Vietnamese user saved from Google Maps, using their short note and the place name.
Answer with a JSON object that follows the given schema. Text values (highlights, tags) are Vietnamese, as the user would write them.

cuisine (array, may hold several values; use "other" only when nothing fits):
${list(CUISINE_KEYS, CUISINE_LABELS)}

dishType (array; use "other" only when nothing fits):
${list(DISH_TYPE_KEYS, DISH_TYPE_LABELS)}

priceRange (one value or null), price per person:
${list(PRICE_RANGE_KEYS, PRICE_RANGE_LABELS)}
  - An amount in the note ("tầm 40k") maps to its range. A vague word ("rẻ", "hơi mắc") maps to the best range for that kind of food. No price cue at all: null.

highlights (array of at most ${MAX_HIGHLIGHTS}): standout dishes or features, taken only from the note or the place name ("bún bò cay"). Specific dishes belong here, never in cuisine or dishType. Do not invent anything.

tags (array of at most ${MAX_TAGS_PER_PLACE}): short labels for the occasion or mood the user wrote ("hợp hẹn hò", "đi nhậu"). Reuse an existing tag name exactly when it fits. Propose a new tag only for a phrase the user actually wrote. Never use a dish name or a cuisine as a tag. With no such phrase in the note, return [].

Never guess values the note and the place name do not support.`;

export function buildExtractionPrompt(input: ExtractionInput): { system: string; prompt: string } {
  const { place } = input;
  const note = input.note.trim();
  const lines = [
    `Note: ${note === '' ? '(no note)' : note}`,
    `Place name: ${place.name}`,
    `Address: ${place.address ?? '(unknown)'}`,
    `Area: ${place.areaLabel ?? '(unknown)'}`,
    `Existing tags: ${input.existingTagNames.length === 0 ? '(none)' : input.existingTagNames.join(', ')}`,
  ];
  return { system: SYSTEM, prompt: lines.join('\n') };
}
