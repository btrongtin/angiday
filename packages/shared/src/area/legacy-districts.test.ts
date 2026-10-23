import { describe, expect, it } from 'vitest';
import { EMPTY_AREA, formatAreaLabel, LEGACY_DISTRICT_KEYS, LEGACY_DISTRICTS } from './legacy-districts';

describe('formatAreaLabel', () => {
  it.each([
    ['district + ward', { legacyDistrict: 'q3', ward: 'Phường Xuân Hòa', city: 'Thành phố Hồ Chí Minh' }, 'Q3 · Phường Xuân Hòa'],
    ['district without ward', { legacyDistrict: 'binh_thanh', ward: null, city: 'Thành phố Hồ Chí Minh' }, 'Bình Thạnh'],
    ['no district: ward · city', { legacyDistrict: null, ward: 'Phường Vũng Tàu', city: 'Thành phố Hồ Chí Minh' }, 'Phường Vũng Tàu · Thành phố Hồ Chí Minh'],
    ['empty', EMPTY_AREA, null],
  ] as const)('%s', (_label, area, expected) => {
    expect(formatAreaLabel(area)).toBe(expected);
  });
});

describe('LEGACY_DISTRICTS', () => {
  it('has an entry for every key', () => {
    expect(new Set(Object.keys(LEGACY_DISTRICTS))).toEqual(new Set(LEGACY_DISTRICT_KEYS));
  });

  it.each([
    ['q1', 'Q1', 'Quận 1'],
    ['thu_duc', 'Thủ Đức', 'Quận Thủ Đức'],
    ['cu_chi', 'Củ Chi', 'Huyện Củ Chi'],
  ] as const)('%s → %s / %s', (key, label, fullName) => {
    expect(LEGACY_DISTRICTS[key]).toEqual({ label, fullName });
  });
});
