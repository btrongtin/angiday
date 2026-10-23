import { normalizeForSearch } from './search-text';

/**
 * Removes lines that only repeat the place (name or address): the Maps app's "Chia sẻ" text is "<name>\n<address>\n<link>",
 * and those words are not something the user wrote. A line that says more than the name is kept.
 */
export function dropPlaceEcho(note: string, placeTexts: readonly string[]): string {
  const known = placeTexts.map(normalizeForSearch).filter((text) => text !== '');
  return note
    .split('\n')
    .filter((line) => {
      const normalized = normalizeForSearch(line);
      return normalized === '' || !known.some((text) => text.includes(normalized));
    })
    .join('\n');
}
