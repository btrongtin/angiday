// @vitest-environment happy-dom
import {
  CUISINE_LABELS,
  DISH_TYPE_LABELS,
  EMPTY_AREA,
  LEGACY_DISTRICTS,
  PRICE_RANGE_LABELS,
  type Place,
} from '@angiday/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlaceCard } from './place-card';

const TAG_ID = 'a'.repeat(24);

const FULL: Place = {
  id: 'c'.repeat(24),
  groupId: 'b'.repeat(24),
  name: 'Nướng Hàn Quốc',
  mapsUrl: 'https://www.google.com/maps/place/x/@10.7,106.7,17z',
  mapsFeatureId: null,
  location: { type: 'Point', coordinates: [106.7, 10.7] },
  address: '12 Võ Văn Tần',
  area: { legacyDistrict: 'q3', ward: 'Phường Xuân Hòa', city: 'Thành phố Hồ Chí Minh' },
  cuisine: ['korean'],
  dishType: ['grill'],
  priceRange: '100k_200k',
  highlights: ['ba chỉ bò'],
  tagIds: [TAG_ID],
  searchText: 'nuong han quoc',
  ingestStatus: 'saved',
  visitStatus: 'want_to_try',
  source: { telegramChatId: -1, telegramMessageId: 1, telegramUpdateId: 1 },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const tagNames = new Map([[TAG_ID, 'hẹn hò']]);

describe('PlaceCard', () => {
  it('shows the place with its details and links to Google Maps', () => {
    render(<PlaceCard place={FULL} tagNames={tagNames} />);

    const link = screen.getByRole('link', { name: FULL.name });
    expect(link).toHaveAttribute('href', FULL.mapsUrl);
    expect(link).toHaveAttribute('target', '_blank');
    for (const text of [
      LEGACY_DISTRICTS.q3.label,
      'Phường Xuân Hòa',
      '12 Võ Văn Tần',
      CUISINE_LABELS.korean,
      DISH_TYPE_LABELS.grill,
      PRICE_RANGE_LABELS['100k_200k'],
      'ba chỉ bò',
      'hẹn hò',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it('hides "other" and tags whose tag was deleted', () => {
    render(<PlaceCard place={{ ...FULL, cuisine: ['other', 'korean'], tagIds: [TAG_ID, 'd'.repeat(24)] }} tagNames={tagNames} />);

    expect(screen.queryByText(CUISINE_LABELS.other)).toBeNull();
    expect(screen.getAllByText('hẹn hò')).toHaveLength(1);
  });

  it('renders only the name when nothing else is known', () => {
    const bare: Place = { ...FULL, address: null, area: EMPTY_AREA, cuisine: [], dishType: [], priceRange: null, highlights: [], tagIds: [] };
    const { container } = render(<PlaceCard place={bare} tagNames={tagNames} />);

    expect(screen.getByRole('link', { name: FULL.name })).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.textContent).toBe(FULL.name);
  });

  it('marks a visited place only', () => {
    const { rerender } = render(<PlaceCard place={{ ...FULL, visitStatus: 'visited' }} tagNames={tagNames} />);
    expect(screen.getByText('Đã ăn')).toBeInTheDocument();

    rerender(<PlaceCard place={FULL} tagNames={tagNames} />);
    expect(screen.queryByText('Đã ăn')).toBeNull();
  });
});
