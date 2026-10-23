import { z } from 'zod';
import { cuisineSchema, dishTypeSchema, priceRangeSchema } from './taxonomy';

export const MAX_TAGS_PER_PLACE = 5;
export const MAX_HIGHLIGHTS = 5;
export const MAX_HIGHLIGHT_LENGTH = 60;
export const MAX_TAG_NAME_LENGTH = 40;

/**
 * What the LLM must return (ADR-0009). No length caps here: lists are cleaned in code, so an over-long
 * answer does not cost a re-prompt. Tags are names, never ids (ADR-0006).
 */
export const placeExtractionSchema = z.object({
  cuisine: z.array(cuisineSchema),
  dishType: z.array(dishTypeSchema),
  priceRange: priceRangeSchema.nullable(),
  highlights: z.array(z.string()),
  tags: z.array(z.string()),
});

export type PlaceExtraction = z.infer<typeof placeExtractionSchema>;
