import { describe, expect, it } from 'vitest';
import { placeExtractionSchema } from './place-extraction';
import {
  CUISINE_KEYS,
  CUISINE_LABELS,
  DISH_TYPE_KEYS,
  DISH_TYPE_LABELS,
  formatClassificationLine,
  PRICE_RANGE_KEYS,
  PRICE_RANGE_LABELS,
} from './taxonomy';

const sorted = (keys: readonly string[]) => [...keys].sort();

describe('taxonomy', () => {
  it('uses exactly the ADR-0012 keys', () => {
    expect(sorted(CUISINE_KEYS)).toEqual(
      sorted(['vietnamese', 'chinese', 'japanese', 'korean', 'thai', 'other_asian', 'western', 'vegetarian', 'other']),
    );
    expect(sorted(DISH_TYPE_KEYS)).toEqual(
      sorted(['noodle_soup', 'dry_noodle', 'rice', 'hotpot', 'grill', 'fried', 'seafood', 'snack', 'dessert', 'drink', 'other']),
    );
    expect(sorted(PRICE_RANGE_KEYS)).toEqual(sorted(['under_50k', '50k_100k', '100k_200k', '200k_500k', 'over_500k']));
  });

  it('has a Vietnamese label for every key and no extras', () => {
    expect(sorted(Object.keys(CUISINE_LABELS))).toEqual(sorted(CUISINE_KEYS));
    expect(sorted(Object.keys(DISH_TYPE_LABELS))).toEqual(sorted(DISH_TYPE_KEYS));
    expect(sorted(Object.keys(PRICE_RANGE_LABELS))).toEqual(sorted(PRICE_RANGE_KEYS));
  });
});

describe('formatClassificationLine', () => {
  it('joins labels per group and groups with " · "', () => {
    expect(
      formatClassificationLine({ cuisine: ['vietnamese', 'korean'], dishType: ['noodle_soup'], priceRange: '50k_100k' }),
    ).toBe('Việt, Hàn · Món nước · 50–100k');
  });

  it('returns null when only "other" values remain', () => {
    expect(formatClassificationLine({ cuisine: ['other'], dishType: [], priceRange: null })).toBeNull();
  });

  it('never shows "other" next to real values', () => {
    expect(formatClassificationLine({ cuisine: [], dishType: ['grill', 'other'], priceRange: 'over_500k' })).toBe('Nướng · > 500k');
  });
});

describe('placeExtractionSchema', () => {
  const valid = { cuisine: ['vietnamese'], dishType: ['rice'], priceRange: null, highlights: [], tags: [] };

  it('accepts a null price range', () => {
    expect(placeExtractionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a cuisine outside the taxonomy', () => {
    expect(placeExtractionSchema.safeParse({ ...valid, cuisine: ['italian'] }).success).toBe(false);
  });
});
