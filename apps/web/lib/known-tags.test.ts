import { EMPTY_PLACE_FILTERS } from '@angiday/shared';
import { describe, expect, it } from 'vitest';
import { dropUnknownTags } from './known-tags';

const KNOWN = 'a'.repeat(24);
const DELETED = 'b'.repeat(24);

describe('dropUnknownTags', () => {
  it('keeps the ids of tags the group still has and drops the rest (ADR-0006)', () => {
    const filters = { ...EMPTY_PLACE_FILTERS, q: 'bun bo', tagIds: [DELETED, KNOWN] };

    expect(dropUnknownTags(filters, [{ id: KNOWN }])).toEqual({ ...filters, tagIds: [KNOWN] });
  });

  it('leaves filters without tags untouched', () => {
    expect(dropUnknownTags(EMPTY_PLACE_FILTERS, [{ id: KNOWN }])).toEqual(EMPTY_PLACE_FILTERS);
  });
});
