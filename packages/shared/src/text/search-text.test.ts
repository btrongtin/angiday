import { describe, expect, it } from 'vitest';
import { EMPTY_AREA } from '../area/legacy-districts';
import { buildPlaceSearchText, normalizeForSearch } from './search-text';

describe('normalizeForSearch', () => {
  it.each([
    ['Phở Hòa', 'pho hoa'],
    ['Đường Trần Quang Khải', 'duong tran quang khai'],
    ['Pho\u031B\u0309 Ho\u0300a', 'pho hoa'],
    ['TÔ GHẸ - HỦ TIẾU GHẸ Tân Định', 'to ghe hu tieu ghe tan dinh'],
    ['  Q.3,  Phường 8 ', 'q 3 phuong 8'],
    ['Coffee + Tea', 'coffee tea'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeForSearch(input)).toBe(expected);
  });
});

describe('buildPlaceSearchText', () => {
  it('joins name, address, ward, city and the district full name, accent-free', () => {
    expect(
      buildPlaceSearchText({
        name: 'Bún bò Huế O Phượng',
        address: 'Đường Nguyễn Đình Chiểu, Phường Xuân Hòa',
        area: { legacyDistrict: 'q3', ward: 'Phường Xuân Hòa', city: 'Thành phố Hồ Chí Minh' },
        highlights: [],
      }),
    ).toBe('bun bo hue o phuong duong nguyen dinh chieu phuong xuan hoa phuong xuan hoa thanh pho ho chi minh quan 3');
  });

  it('skips missing parts', () => {
    expect(buildPlaceSearchText({ name: 'Bún bò Huế O Phượng', address: null, area: EMPTY_AREA, highlights: [] })).toBe(
      'bun bo hue o phuong',
    );
  });
});

describe('buildPlaceSearchText highlights', () => {
  it('appends accent-free highlights after the area parts', () => {
    expect(buildPlaceSearchText({ name: 'Quán A', address: null, area: EMPTY_AREA, highlights: ['bún bò cay'] })).toBe(
      'quan a bun bo cay',
    );
  });
});
