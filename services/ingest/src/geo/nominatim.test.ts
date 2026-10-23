import { describe, expect, it, vi } from 'vitest';
import bunRieuQ2 from './fixtures/nominatim-bun-rieu-q2.json';
import haNoi from './fixtures/nominatim-ha-noi.json';
import sea from './fixtures/nominatim-sea.json';
import thienTamQ2 from './fixtures/nominatim-thien-tam-q2.json';
import toGheQ1 from './fixtures/nominatim-to-ghe-q1.json';
import vungTau from './fixtures/nominatim-vung-tau.json';
import { createReverseGeocoder, NOMINATIM_USER_AGENT, parseNominatimReverse } from './nominatim';

const HCMC = 'Thành phố Hồ Chí Minh';

describe('parseNominatimReverse (real responses, 2026-10-23)', () => {
  it.each([
    ['to-ghe-q1', toGheQ1, 'Đường Nguyễn Phi Khanh, Phường Tân Định, ' + HCMC, 'Phường Tân Định', HCMC],
    ['bun-rieu-q2', bunRieuQ2, 'Lê Văn Thịnh, Phường Bình Trưng, ' + HCMC, 'Phường Bình Trưng', HCMC],
    ['thien-tam-q2', thienTamQ2, null, 'Phường Cát Lái', HCMC],
    ['vung-tau', vungTau, 'Nam Kỳ Khởi Nghĩa, Phường Vũng Tàu, ' + HCMC, 'Phường Vũng Tàu', HCMC],
    ['ha-noi', haNoi, 'Phố Lê Thái Tổ, Phường Hoàn Kiếm, Hà Nội', 'Phường Hoàn Kiếm', 'Hà Nội'],
    ['sea', sea, null, null, HCMC],
  ])('%s', (_label, body, address, ward, city) => {
    expect(parseNominatimReverse(body)).toEqual({ kind: 'found', address, ward, city });
  });
});

describe('parseNominatimReverse rules', () => {
  const parse = (address: Record<string, string>) => parseNominatimReverse({ address });

  it('skips a non-ward quarter and takes the suburb', () => {
    expect(parse({ quarter: 'Khu phố 3', suburb: 'Phường Xuân Hòa' })).toMatchObject({ ward: 'Phường Xuân Hòa' });
  });

  it('accepts a commune stored under village', () => {
    expect(parse({ village: 'Xã Bình Hưng' })).toMatchObject({ ward: 'Xã Bình Hưng' });
  });

  it('ignores a suburb that is not a ward', () => {
    expect(parse({ suburb: 'Khu dân cư X' })).toMatchObject({ ward: null });
  });

  it('prefers the province-level state over a lower-level city', () => {
    expect(parse({ state: 'Tỉnh Lâm Đồng', city: 'Đà Lạt' })).toMatchObject({ city: 'Tỉnh Lâm Đồng' });
  });

  it('never puts a house number or POI name in the address', () => {
    const result = parse({ house_number: '89', amenity: 'Mầm non X', road: 'Đường A', suburb: 'Phường B', city: 'Thành phố C' });

    expect(result).toEqual({ kind: 'found', address: 'Đường A, Phường B, Thành phố C', ward: 'Phường B', city: 'Thành phố C' });
  });

  it('maps an error body to not_found', () => {
    expect(parseNominatimReverse({ error: 'Unable to geocode' })).toEqual({ kind: 'none', reason: 'not_found' });
  });

  it('maps an unexpected shape to bad_response', () => {
    expect(parseNominatimReverse({ hello: 'world' })).toEqual({ kind: 'none', reason: 'bad_response' });
  });
});

describe('createReverseGeocoder', () => {
  const ok = () => new Response(JSON.stringify(toGheQ1), { status: 200 });

  it('calls /reverse with the policy-required params and User-Agent', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok());

    await createReverseGeocoder({ baseUrl: 'https://nominatim.openstreetmap.org', fetchFn })(10.7917492, 106.6951764);

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/reverse');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      format: 'jsonv2',
      addressdetails: '1',
      'accept-language': 'vi',
      lat: '10.7917492',
      lon: '106.6951764',
    });
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(NOMINATIM_USER_AGENT);
    expect(init.signal).toBeDefined();
  });

  it.each(['https://geo.example.com/nominatim', 'https://geo.example.com/nominatim/'])('keeps a path in the base URL: %s', async (baseUrl) => {
    const fetchFn = vi.fn().mockResolvedValue(ok());

    await createReverseGeocoder({ baseUrl, fetchFn })(10.7, 106.7);

    expect(String(fetchFn.mock.calls[0]![0])).toMatch(/^https:\/\/geo\.example\.com\/nominatim\/reverse\?/);
  });

  it('returns found for a good response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok());

    expect(await createReverseGeocoder({ baseUrl: 'https://x.test', fetchFn })(10.79, 106.69)).toMatchObject({
      kind: 'found',
      ward: 'Phường Tân Định',
    });
  });

  it('maps HTTP 429 to http_error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }));

    expect(await createReverseGeocoder({ baseUrl: 'https://x.test', fetchFn })(10.7, 106.7)).toEqual({ kind: 'none', reason: 'http_error' });
  });

  it.each([
    ['a network error', new TypeError('fetch failed')],
    ['a timeout', new DOMException('The operation timed out', 'TimeoutError')],
  ])('maps %s to network without throwing', async (_label, error) => {
    const fetchFn = vi.fn().mockRejectedValue(error);

    expect(await createReverseGeocoder({ baseUrl: 'https://x.test', fetchFn })(10.7, 106.7)).toEqual({ kind: 'none', reason: 'network' });
  });

  it('does not throw when cancelling the body of a failed response rejects', async () => {
    const body = new ReadableStream({ start: (controller) => controller.error(new Error('conn reset')) });
    const fetchFn = vi.fn().mockResolvedValue(new Response(body, { status: 503 }));

    expect(await createReverseGeocoder({ baseUrl: 'https://x.test', fetchFn })(10.7, 106.7)).toEqual({ kind: 'none', reason: 'http_error' });
  });

  it('maps a non-JSON body to bad_response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));

    expect(await createReverseGeocoder({ baseUrl: 'https://x.test', fetchFn })(10.7, 106.7)).toEqual({ kind: 'none', reason: 'bad_response' });
  });
});
