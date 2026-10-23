import { type Area, LEGACY_DISTRICTS } from '../area/legacy-districts';

/**
 * Accent-free, lower-case form used for `searchText` and for matching what people type:
 * "Đường Trần Quang Khải" → "duong tran quang khai". Punctuation becomes single spaces.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Accent-free text a place can be found by: name, address, ward, city and the old district's full name. */
export function buildPlaceSearchText(place: { name: string; address: string | null; area: Area }): string {
  const { area } = place;
  const parts = [
    place.name,
    place.address,
    area.ward,
    area.city,
    area.legacyDistrict ? LEGACY_DISTRICTS[area.legacyDistrict].fullName : null,
  ];
  return normalizeForSearch(parts.filter((part) => part !== null).join(' '));
}
