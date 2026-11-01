import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLACE_FILTERS,
  hasActiveFilters,
  parsePlaceFilters,
  placeFiltersToSearchParams,
  priceRangesUpTo,
  type PlaceFilters,
} from './place-filters';

const TAG_ID = 'a'.repeat(24);

const FULL: PlaceFilters = {
  q: 'bun bo',
  area: 'q.3',
  cuisine: ['korean', 'japanese'],
  dishType: ['grill'],
  maxPrice: '100k_200k',
  tagIds: [TAG_ID],
  visitStatus: 'visited',
};

describe('parsePlaceFilters', () => {
  it('parses every key', () => {
    const params = new URLSearchParams(
      `q=bun%20bo&area=q.3&cuisine=korean&cuisine=japanese&dish=grill&price=100k_200k&tag=${TAG_ID}&visit=visited`,
    );

    expect(parsePlaceFilters(params)).toEqual(FULL);
    expect(
      parsePlaceFilters({ cuisine: ['korean', 'japanese'], q: 'bun bo', area: 'q.3', dish: 'grill', price: '100k_200k', tag: TAG_ID, visit: 'visited' }),
    ).toEqual(FULL);
  });

  it('drops what it does not know', () => {
    const params = new URLSearchParams('cuisine=pizza&cuisine=korean&cuisine=korean&price=cheap&tag=abc&visit=maybe&q=%20%20&area=');

    expect(parsePlaceFilters(params)).toEqual({
      ...EMPTY_PLACE_FILTERS,
      cuisine: ['korean'],
    });
  });

  it('takes the first value of a single-valued key', () => {
    expect(parsePlaceFilters(new URLSearchParams('price=under_50k&price=over_500k&q=a&q=b'))).toMatchObject({
      maxPrice: 'under_50k',
      q: 'a',
    });
  });

  it('truncates long text', () => {
    const filters = parsePlaceFilters({ q: 'a'.repeat(300), area: 'b'.repeat(300) });

    expect(filters.q).toHaveLength(100);
    expect(filters.area).toHaveLength(60);
  });

  it('round-trips', () => {
    expect(parsePlaceFilters(placeFiltersToSearchParams(FULL))).toEqual(FULL);
    expect(placeFiltersToSearchParams(EMPTY_PLACE_FILTERS).toString()).toBe('');
  });
});

describe('hasActiveFilters', () => {
  it('is false for empty filters and true with a single field set', () => {
    expect(hasActiveFilters(EMPTY_PLACE_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_PLACE_FILTERS, visitStatus: 'visited' })).toBe(true);
  });
});

describe('priceRangesUpTo', () => {
  it('includes the maximum and everything cheaper', () => {
    expect(priceRangesUpTo('100k_200k')).toEqual(['under_50k', '50k_100k', '100k_200k']);
    expect(priceRangesUpTo('under_50k')).toEqual(['under_50k']);
  });
});
