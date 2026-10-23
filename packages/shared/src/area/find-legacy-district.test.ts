import { describe, expect, it } from 'vitest';
import districts from './hcmc-legacy-districts.json';
import { findLegacyDistrict, pointInPolygon } from './find-legacy-district';
import { LEGACY_DISTRICT_KEYS } from './legacy-districts';

describe('findLegacyDistrict', () => {
  it.each([
    ['owner: TÔ GHẸ (Tân Định)', 10.7917492, 106.6951764, 'q1'],
    ['owner: Bún riêu Út Nhỏ', 10.7866592, 106.7691656, 'q2'],
    ['owner: Bún Bò Huế Thiện Tâm', 10.7788544, 106.7605133, 'q2'],
    ['Chợ Bến Thành', 10.7725, 106.698, 'q1'],
    ['Hồ Con Rùa', 10.7826, 106.6958, 'q3'],
    ['Landmark 81', 10.795, 106.7218, 'binh_thanh'],
    ['Sân bay Tân Sơn Nhất', 10.8188, 106.6519, 'tan_binh'],
    ['Chợ Bình Tây', 10.7496, 106.6509, 'q6'],
    ['Crescent Mall', 10.729, 106.7189, 'q7'],
    ['Thảo Điền', 10.803, 106.735, 'q2'],
    ['Suối Tiên', 10.8665, 106.803, 'q9'],
    ['Đầm Sen', 10.7685, 106.639, 'q11'],
    ['Địa đạo Củ Chi', 11.1426, 106.4637, 'cu_chi'],
  ])('%s → %s', (_label, lat, lng, key) => {
    expect(findLegacyDistrict(lat, lng)).toBe(key);
  });

  it.each([
    ['Vũng Tàu (new HCMC, outside old districts)', 10.346, 107.084],
    ['Thủ Dầu Một', 10.98, 106.65],
    ['Hà Nội', 21.0287, 105.8524],
    ['null island', 0, 0],
  ])('%s → null', (_label, lat, lng) => {
    expect(findLegacyDistrict(lat, lng)).toBeNull();
  });
});

describe('pointInPolygon', () => {
  const square = [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ];

  it('is false inside a hole', () => {
    expect(pointInPolygon([5, 5], square)).toBe(false);
  });

  it('is true between the hole and the outer edge', () => {
    expect(pointInPolygon([2, 2], square)).toBe(true);
  });

  it('is false outside', () => {
    expect(pointInPolygon([11, 5], square)).toBe(false);
  });
});

describe('district data', () => {
  it('has exactly the 24 known keys', () => {
    const keys = districts.features.map((f) => f.properties.key);

    expect(keys).toHaveLength(24);
    expect(new Set(keys)).toEqual(new Set(LEGACY_DISTRICT_KEYS));
  });
});
