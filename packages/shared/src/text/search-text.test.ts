import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from './search-text';

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
