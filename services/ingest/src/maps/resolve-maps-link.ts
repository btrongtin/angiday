import { isGoogleMapsHost } from '@angiday/shared';

export interface ResolveMapsLinkOptions {
  fetchFn?: typeof fetch;
  maxHops?: number;
  timeoutMs?: number;
}

/**
 * Follow a shared Maps link (`maps.app.goo.gl/…`) to its long `/maps/place/…` URL, one redirect at a
 * time (ADR-0016). Every hop must stay on a Google Maps host, so a crafted link can't make the worker
 * call arbitrary URLs. Returns the last URL reached (the parser decides if it is usable), or null when
 * the chain leaves Google or exceeds `maxHops`. Network errors and 5xx throw so SQS retries.
 */
export async function resolveMapsLink(
  url: string,
  { fetchFn = fetch, maxHops = 5, timeoutMs = 5_000 }: ResolveMapsLinkOptions = {},
): Promise<string | null> {
  let current = url;
  for (let hop = 0; ; hop++) {
    const parsed = URL.parse(current);
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !isGoogleMapsHost(parsed.hostname)) {
      return null;
    }
    if (parsed.pathname.startsWith('/maps/place/')) return current;
    if (hop === maxHops) return null;

    const response = await fetchFn(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    await response.body?.cancel();
    if (response.status >= 500) throw new Error(`Maps link resolution failed: HTTP ${response.status}`);

    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return current;
    current = new URL(location, current).toString();
  }
}
