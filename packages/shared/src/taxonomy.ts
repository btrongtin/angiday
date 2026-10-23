import { z } from 'zod';

// Values and rules: ADR-0012. Keys are English; labels are what users see.

export const CUISINE_KEYS = [
  'vietnamese',
  'chinese',
  'japanese',
  'korean',
  'thai',
  'other_asian',
  'western',
  'vegetarian',
  'other',
] as const;
export const cuisineSchema = z.enum(CUISINE_KEYS);
export type Cuisine = z.infer<typeof cuisineSchema>;
export const CUISINE_LABELS: Record<Cuisine, string> = {
  vietnamese: 'Việt',
  chinese: 'Hoa',
  japanese: 'Nhật',
  korean: 'Hàn',
  thai: 'Thái',
  other_asian: 'Châu Á khác',
  western: 'Âu Mỹ',
  vegetarian: 'Chay',
  other: 'Khác',
};

export const DISH_TYPE_KEYS = [
  'noodle_soup',
  'dry_noodle',
  'rice',
  'hotpot',
  'grill',
  'fried',
  'seafood',
  'snack',
  'dessert',
  'drink',
  'other',
] as const;
export const dishTypeSchema = z.enum(DISH_TYPE_KEYS);
export type DishType = z.infer<typeof dishTypeSchema>;
export const DISH_TYPE_LABELS: Record<DishType, string> = {
  noodle_soup: 'Món nước',
  dry_noodle: 'Món khô/trộn',
  rice: 'Cơm',
  hotpot: 'Lẩu',
  grill: 'Nướng',
  fried: 'Chiên',
  seafood: 'Hải sản',
  snack: 'Ăn vặt',
  dessert: 'Tráng miệng',
  drink: 'Đồ uống',
  other: 'Khác',
};

/** Per person. */
export const PRICE_RANGE_KEYS = ['under_50k', '50k_100k', '100k_200k', '200k_500k', 'over_500k'] as const;
export const priceRangeSchema = z.enum(PRICE_RANGE_KEYS);
export type PriceRange = z.infer<typeof priceRangeSchema>;
export const PRICE_RANGE_LABELS: Record<PriceRange, string> = {
  under_50k: '< 50k',
  '50k_100k': '50–100k',
  '100k_200k': '100–200k',
  '200k_500k': '200–500k',
  over_500k: '> 500k',
};

/** "Việt, Hàn · Món nước · 50–100k"; `other` is never shown; null when nothing is left. */
export function formatClassificationLine(c: {
  cuisine: readonly Cuisine[];
  dishType: readonly DishType[];
  priceRange: PriceRange | null;
}): string | null {
  const groups = [
    c.cuisine.filter((key) => key !== 'other').map((key) => CUISINE_LABELS[key]).join(', '),
    c.dishType.filter((key) => key !== 'other').map((key) => DISH_TYPE_LABELS[key]).join(', '),
    c.priceRange === null ? '' : PRICE_RANGE_LABELS[c.priceRange],
  ].filter((group) => group !== '');
  return groups.length === 0 ? null : groups.join(' · ');
}
