import { normalizeForSearch } from '../text/search-text';
import { LEGACY_DISTRICT_KEYS, LEGACY_DISTRICTS, type LegacyDistrict } from './legacy-districts';

export type AreaQuery = { kind: 'districts'; districts: LegacyDistrict[] } | { kind: 'text'; text: string };

/** "Q. 3" → "q3": accents, case, punctuation and spaces do not matter when matching an alias. */
const compact = (text: string) => normalizeForSearch(text).replaceAll(' ', '');

function buildAliases(): Map<string, LegacyDistrict[]> {
  const aliases = new Map<string, LegacyDistrict[]>();
  for (const key of LEGACY_DISTRICT_KEYS) {
    const { label, fullName } = LEGACY_DISTRICTS[key];
    const names = [compact(label), compact(fullName), `q${compact(label)}`];
    const number = /^q(\d+)$/.exec(key)?.[1];
    if (number) names.push(`district${number}`);
    for (const name of names) aliases.set(name, [key]);
  }
  // ADR-0018: the open data predates the 2021 merge, so the city of Thủ Đức is three keys; "quận Thủ Đức" is the district.
  const thuDucCity: LegacyDistrict[] = ['q2', 'q9', 'thu_duc'];
  for (const name of ['thuduc', 'tpthuduc', 'thanhphothuduc']) aliases.set(name, thuDucCity);
  aliases.set('quanthuduc', ['thu_duc']);
  return aliases;
}

const ALIASES = buildAliases();

/** What a typed area means: old districts when it is an alias (ADR-0013), else normalized text for `searchText`. */
export function resolveAreaQuery(input: string): AreaQuery | null {
  const text = normalizeForSearch(input);
  if (text === '') return null;
  const districts = ALIASES.get(text.replaceAll(' ', ''));
  return districts ? { kind: 'districts', districts: [...districts] } : { kind: 'text', text };
}
