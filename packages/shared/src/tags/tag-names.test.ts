import { describe, expect, it } from 'vitest';
import { cleanTagName, matchTags, normalizeTagName } from './tag-names';

describe('cleanTagName / normalizeTagName', () => {
  it('strips #, underscores and extra spaces', () => {
    expect(cleanTagName('  #hẹn_hò ')).toBe('hẹn hò');
  });

  it('normalizes accents and case', () => {
    expect(normalizeTagName('#Hẹn_Hò')).toBe('hen ho');
  });
});

describe('matchTags', () => {
  const A = { id: 'a'.repeat(24), normalized: 'hen ho' };

  it.each([
    ['maps to an existing tag by normalized name', ['Hẹn hò'], [A], '', { tagIds: [A.id], toCreate: [] }],
    ['dedupes spelling variants', ['#hẹn_hò', 'hen ho'], [A], '', { tagIds: [A.id], toCreate: [] }],
    ['creates a tag the user wrote', ['hẹn hò'], [], 'bún bò cay, rẻ, hợp hẹn hò', { tagIds: [], toCreate: ['hẹn hò'] }],
    ['drops a tag the user did not write', ['giá rẻ'], [], 'bún bò cay, rẻ', { tagIds: [], toCreate: [] }],
    ['matches whole words only', ['date'], [], 'datenight', { tagIds: [], toCreate: [] }],
    ['skips blank names', ['', '   ', '#'], [], 'x', { tagIds: [], toCreate: [] }],
  ])('%s', (_name, proposed, existing, note, expected) => {
    expect(matchTags({ proposed, existing, note })).toEqual(expected);
  });

  it('caps at 5 tags', () => {
    const names = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'];
    const result = matchTags({ proposed: names, existing: [], note: names.join(' ') });
    expect(result.toCreate).toHaveLength(5);
  });

  it('skips names longer than 40 characters', () => {
    const long = 'x'.repeat(41);
    expect(matchTags({ proposed: [long], existing: [], note: long })).toEqual({ tagIds: [], toCreate: [] });
  });
});
