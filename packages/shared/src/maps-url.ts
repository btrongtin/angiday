/** Hosts a Google Maps link can live on: share short links and the long www/maps.google forms. */
const GOOGLE_MAPS_HOST = /^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.|maps\.)?google\.com(?:\.vn)?)$/i;

/**
 * A Maps URL inside free text: short links, goo.gl/maps, google.com[.vn]/maps…, maps.google.com[.vn]/…
 * The scheme is optional (people paste `maps.app.goo.gl/…`); the look-behind stops a host from matching
 * as the tail of another word (`fakegoogle.com/maps`). Curly quotes and guillemets end the URL.
 */
const MAPS_URL_IN_TEXT =
  /(?<![\w.@-])(https?:\/\/)?(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(?:www\.)?google\.com(?:\.vn)?\/maps|maps\.google\.com(?:\.vn)?\/)[^\s<>"'“”‘’«»]*/i;
const TRAILING_PUNCTUATION = /[).,!?;:\]]+$/;

const PLACE_PATH = /^\/maps\/place\/([^/]+)/;
/** Pin coordinates inside the `data=` segment: `!3d<lat>!4d<lng>`. */
const PIN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
/** Viewport centre: `/@<lat>,<lng>,<zoom>z`. Less precise than the pin. */
const VIEWPORT = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
/** Maps feature id inside the `data=` segment: `!1s0x<hex>:0x<hex>`. */
const FEATURE_ID = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i;

export interface ParsedMapsPlace {
  name: string;
  lat: number;
  lng: number;
  /** Lower-case `0x<hex>:0x<hex>`; null when the URL has no `!1s` segment. */
  featureId: string | null;
}

export function isGoogleMapsHost(hostname: string): boolean {
  return GOOGLE_MAPS_HOST.test(hostname);
}

/**
 * First Google Maps URL in `text`, or null. Always returns a URL with a scheme (`https://` is added when
 * the text has none). Trailing `).,!?;:]` (sentence punctuation) is dropped.
 */
export function extractMapsUrl(text: string): string | null {
  const match = MAPS_URL_IN_TEXT.exec(text);
  if (!match) return null;
  const url = match[0].replace(TRAILING_PUNCTUATION, '');
  return match[1] ? url : `https://${url}`;
}

/**
 * Name and coordinates from a resolved `/maps/place/<name>/…` URL (ADR-0016). Prefers the pin
 * (`!3d…!4d…`) over the viewport (`@lat,lng`). Returns null for anything else; never throws.
 */
export function parseMapsPlaceUrl(url: string): ParsedMapsPlace | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!isGoogleMapsHost(parsed.hostname)) return null;

  const nameSegment = PLACE_PATH.exec(parsed.pathname)?.[1];
  const name = nameSegment === undefined ? null : decodePlaceName(nameSegment);
  if (name === null) return null;

  const coordinates = PIN.exec(parsed.pathname) ?? VIEWPORT.exec(parsed.pathname);
  if (!coordinates) return null;
  const lat = Number(coordinates[1]);
  const lng = Number(coordinates[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const featureId = FEATURE_ID.exec(parsed.pathname)?.[1]?.toLowerCase() ?? null;

  return { name, lat, lng, featureId };
}

/** `Ph%E1%BB%9F+H%C3%B2a` → `Phở Hòa` (NFC). `+` is a space; a real plus arrives as `%2B`. */
function decodePlaceName(segment: string): string | null {
  try {
    const name = decodeURIComponent(segment.replace(/\+/g, ' ')).normalize('NFC').trim();
    return name === '' ? null : name;
  } catch {
    return null;
  }
}
