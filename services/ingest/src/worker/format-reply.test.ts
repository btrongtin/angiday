import { EMPTY_AREA } from '@angiday/shared';
import { describe, expect, it } from 'vitest';
import { formatSavedReply } from './format-reply';

const bare: Parameters<typeof formatSavedReply>[0] = { name: 'X', area: EMPTY_AREA, cuisine: [], dishType: [], priceRange: null, highlights: [] };

describe('formatSavedReply', () => {
  it('shows area, classification, highlights and tags on their own lines', () => {
    const reply = formatSavedReply(
      {
        name: 'Bún Bò Huế Thiện Tâm',
        area: { legacyDistrict: 'q2', ward: 'Phường Cát Lái', city: 'Thành phố Hồ Chí Minh' },
        cuisine: ['vietnamese'],
        dishType: ['noodle_soup'],
        priceRange: 'under_50k',
        highlights: ['bún bò cay'],
      },
      ['hẹn hò'],
    );

    expect(reply).toBe(
      'Đã lưu: Bún Bò Huế Thiện Tâm — Q2 · Phường Cát Lái\nViệt · Món nước · < 50k\nMón nổi bật: bún bò cay\nTag: hẹn hò',
    );
  });

  it('is just the name when there is nothing else', () => {
    expect(formatSavedReply(bare, [])).toBe('Đã lưu: X');
  });
});
