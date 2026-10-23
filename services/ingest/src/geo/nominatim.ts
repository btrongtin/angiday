export const NOMINATIM_USER_AGENT = 'AnGiDay/1.0 (+https://github.com/btrongtin/angiday)';

export type GeocodeFailure = 'not_found' | 'http_error' | 'network' | 'bad_response';

export type ReverseGeocodeResult =
  | { kind: 'found'; address: string | null; ward: string | null; city: string | null }
  | { kind: 'none'; reason: GeocodeFailure };

export type ReverseGeocode = (lat: number, lng: number) => Promise<ReverseGeocodeResult>;

const WARD_PREFIX = /^(Phường|Xã|Đặc khu|Thị trấn)\s/u;
const WARD_KEYS = ['suburb', 'quarter', 'city_district', 'village', 'town'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads only the `address` object. `display_name` and `name` describe the nearest OSM object (a kindergarten,
 * a bus stop…), not our restaurant, and so does `house_number`; none of them is used (ADR-0016).
 */
export function parseNominatimReverse(body: unknown): ReverseGeocodeResult {
  if (!isRecord(body)) return { kind: 'none', reason: 'bad_response' };
  if (typeof body.error === 'string') return { kind: 'none', reason: 'not_found' };
  if (!isRecord(body.address)) return { kind: 'none', reason: 'bad_response' };

  const a: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(body.address)) if (typeof value === 'string') a[key] = value;
  const ward = WARD_KEYS.map((key) => a[key]).find((value) => value !== undefined && WARD_PREFIX.test(value)) ?? null;
  const city = a.state ?? a.province ?? a.city ?? null;
  const address = a.road === undefined ? null : [a.road, ward, city].filter((part) => part !== null).join(', ');
  return { kind: 'found', address, ward, city };
}

export interface ReverseGeocoderOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** Nominatim reverse geocoding as enrichment, not a blocker: every failure becomes `{ kind: 'none' }`, never a throw. */
export function createReverseGeocoder({ baseUrl, fetchFn = fetch, timeoutMs = 3_000 }: ReverseGeocoderOptions): ReverseGeocode {
  const endpoint = new URL('reverse', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  return async (lat, lng) => {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      format: 'jsonv2',
      addressdetails: '1',
      'accept-language': 'vi',
      lat: String(lat),
      lon: String(lng),
    }).toString();

    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { kind: 'none', reason: 'network' };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { kind: 'none', reason: 'http_error' };
    }
    try {
      return parseNominatimReverse(await response.json());
    } catch {
      return { kind: 'none', reason: 'bad_response' };
    }
  };
}
