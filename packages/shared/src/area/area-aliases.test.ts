import { describe, expect, it } from 'vitest';
import { resolveAreaQuery } from './area-aliases';
import { LEGACY_DISTRICT_KEYS, LEGACY_DISTRICTS } from './legacy-districts';

const districts = (...keys: string[]) => ({ kind: 'districts', districts: keys });

describe('resolveAreaQuery', () => {
  it.each(['q3', 'Q3', 'q.3', 'Q. 3 ', 'quận 3', 'QUẬN 3', 'quan 3', 'district 3'])('resolves %j to q3', (input) => {
    expect(resolveAreaQuery(input)).toEqual(districts('q3'));
  });

  it('never confuses q1 with q10', () => {
    expect(resolveAreaQuery('q1')).toEqual(districts('q1'));
    expect(resolveAreaQuery('q10')).toEqual(districts('q10'));
    expect(resolveAreaQuery('quận 12')).toEqual(districts('q12'));
  });

  it.each([
    ['Bình Thạnh', 'binh_thanh'],
    ['binh thanh', 'binh_thanh'],
    ['q. bình thạnh', 'binh_thanh'],
    ['quận Bình Thạnh', 'binh_thanh'],
    ['Tân Phú', 'tan_phu'],
    ['Tân Bình', 'tan_binh'],
    ['Bình Tân', 'binh_tan'],
    ['Củ Chi', 'cu_chi'],
    ['huyện Củ Chi', 'cu_chi'],
  ])('resolves the named district %j', (input, key) => {
    expect(resolveAreaQuery(input)).toEqual(districts(key));
  });

  it.each(['thủ đức', 'TP Thủ Đức', 'tp. thu duc', 'thành phố Thủ Đức'])('resolves %j to the three 2020 districts', (input) => {
    expect(resolveAreaQuery(input)).toEqual(districts('q2', 'q9', 'thu_duc'));
  });

  it('keeps q2, q9 and "quận Thủ Đức" separate', () => {
    expect(resolveAreaQuery('quận Thủ Đức')).toEqual(districts('thu_duc'));
    expect(resolveAreaQuery('q2')).toEqual(districts('q2'));
    expect(resolveAreaQuery('q9')).toEqual(districts('q9'));
  });

  it('treats anything else as normalized text', () => {
    expect(resolveAreaQuery('Xuân Hòa')).toEqual({ kind: 'text', text: 'xuan hoa' });
    expect(resolveAreaQuery('Phường Bến Thành')).toEqual({ kind: 'text', text: 'phuong ben thanh' });
  });

  it.each(['', '  ', '...'])('returns null for %j', (input) => {
    expect(resolveAreaQuery(input)).toBeNull();
  });

  it('reaches every district by its label and by its full name', () => {
    for (const key of LEGACY_DISTRICT_KEYS) {
      for (const name of [LEGACY_DISTRICTS[key].label, LEGACY_DISTRICTS[key].fullName]) {
        const result = resolveAreaQuery(name);
        expect(result?.kind === 'districts' && result.districts.includes(key), `${name} → ${key}`).toBe(true);
      }
    }
  });
});
