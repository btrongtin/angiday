import { describe, expect, it } from 'vitest';
import { extractMapsUrl, isGoogleMapsHost, parseMapsPlaceUrl } from './maps-url';
import { placeUrlFixtures, unparseableUrlFixtures } from './maps-url.fixtures';

describe('parseMapsPlaceUrl', () => {
  it.each(placeUrlFixtures)('$label', ({ url, expected }) => {
    expect(parseMapsPlaceUrl(url)).toEqual(expected);
  });

  it.each(unparseableUrlFixtures)('returns null: $label', ({ url }) => {
    expect(parseMapsPlaceUrl(url)).toBeNull();
  });

  it('returns names in NFC so they match what people type', () => {
    const name = parseMapsPlaceUrl(placeUrlFixtures[3]!.url)?.name;

    expect(name).toBe(name?.normalize('NFC'));
  });
});

describe('extractMapsUrl', () => {
  it.each([
    ['iOS short link with g_st', 'quán này ngon nè https://maps.app.goo.gl/AbC123xyz?g_st=ic', 'https://maps.app.goo.gl/AbC123xyz?g_st=ic'],
    ['Android short link', 'https://maps.app.goo.gl/q1W2e3R4t5Y6u7I8o', 'https://maps.app.goo.gl/q1W2e3R4t5Y6u7I8o'],
    ['trailing punctuation', '(xem https://maps.app.goo.gl/AbC123).', 'https://maps.app.goo.gl/AbC123'],
    ['long desktop URL', 'https://www.google.com/maps/place/X/@10.7,106.7,17z rất ngon', 'https://www.google.com/maps/place/X/@10.7,106.7,17z'],
    ['google.com.vn', 'https://www.google.com.vn/maps/place/X/@10.7,106.7,17z', 'https://www.google.com.vn/maps/place/X/@10.7,106.7,17z'],
    ['first of two links', 'https://maps.app.goo.gl/First https://maps.app.goo.gl/Second', 'https://maps.app.goo.gl/First'],
    ['curly double quotes', '“https://maps.app.goo.gl/AbC123”', 'https://maps.app.goo.gl/AbC123'],
    ['curly single quotes + comma', '‘https://maps.app.goo.gl/AbC123’, ngon', 'https://maps.app.goo.gl/AbC123'],
    ['guillemets', '«https://maps.app.goo.gl/AbC123»', 'https://maps.app.goo.gl/AbC123'],
    ['short link without scheme', 'quán này maps.app.goo.gl/AbC123 nhé', 'https://maps.app.goo.gl/AbC123'],
    ['goo.gl/maps without scheme', 'goo.gl/maps/XyZ987', 'https://goo.gl/maps/XyZ987'],
    ['goo.gl/maps with scheme', 'https://goo.gl/maps/XyZ987', 'https://goo.gl/maps/XyZ987'],
    ['desktop URL without scheme', 'www.google.com/maps/place/X/@10.7,106.7,17z', 'https://www.google.com/maps/place/X/@10.7,106.7,17z'],
    ['http is kept', 'http://maps.app.goo.gl/AbC123', 'http://maps.app.goo.gl/AbC123'],
  ])('%s', (_label, text, expected) => {
    expect(extractMapsUrl(text)).toBe(expected);
  });

  it.each([
    ['no link', 'bún bò cô Ba quận 3'],
    ['non-Maps Google link', 'https://www.google.com/search?q=bun+bo'],
    ['other site', 'https://www.foody.vn/ho-chi-minh/bun-bo'],
    ['look-alike host', 'fakegoogle.com/maps/place/X'],
    ['look-alike short host', 'evilmaps.app.goo.gl/AbC'],
    ['goo.gl link that is not Maps', 'goo.gl/AbC123'],
  ])('returns null: %s', (_label, text) => {
    expect(extractMapsUrl(text)).toBeNull();
  });
});

describe('isGoogleMapsHost', () => {
  it.each(['maps.app.goo.gl', 'goo.gl', 'google.com', 'www.google.com', 'maps.google.com', 'www.google.com.vn'])('accepts %s', (host) => {
    expect(isGoogleMapsHost(host)).toBe(true);
  });

  it.each(['google.com.evil.example', 'evilgoogle.com', 'consent.google.com', 'example.com'])('rejects %s', (host) => {
    expect(isGoogleMapsHost(host)).toBe(false);
  });
});
