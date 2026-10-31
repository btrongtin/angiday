import { describe, expect, it } from 'vitest';
import { dropPlaceEcho } from './note';

describe('dropPlaceEcho', () => {
  it('drops lines that only repeat the place name or address (Maps share text)', () => {
    const note = 'Quán Nhậu Bờ Kè\n12 Đường Trần Quang Khải, Phường Tân Định';
    expect(dropPlaceEcho(note, ['Quán Nhậu Bờ Kè', '12 Đường Trần Quang Khải, Phường Tân Định'])).toBe('');
  });

  it('matches without accents and keeps the user own words', () => {
    expect(dropPlaceEcho('QUAN NHAU BO KE\nhợp hẹn hò', ['Quán Nhậu Bờ Kè'])).toBe('hợp hẹn hò');
  });

  it('keeps a line that is more than the place name', () => {
    expect(dropPlaceEcho('Quán Nhậu Bờ Kè ngon, đi nhậu', ['Quán Nhậu Bờ Kè'])).toBe('Quán Nhậu Bờ Kè ngon, đi nhậu');
  });

  it('keeps everything when there are no names', () => {
    expect(dropPlaceEcho('ngon nè', [])).toBe('ngon nè');
  });
});
