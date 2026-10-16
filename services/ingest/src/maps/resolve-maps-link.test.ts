import { describe, expect, it, vi } from 'vitest';
import { TEST_PLACE_URL, TEST_SHORT_LINK } from '../test/fixtures';
import { resolveMapsLink } from './resolve-maps-link';

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

/** Fake fetch: a map from URL to the response it returns. */
function fakeFetch(routes: Record<string, Response>) {
  return vi.fn<typeof fetch>(async (input) => routes[String(input)] ?? new Response('not found', { status: 404 }));
}

describe('resolveMapsLink', () => {
  it('follows a short link to the place URL with manual redirects', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: redirect(TEST_PLACE_URL) });

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).toBe(TEST_PLACE_URL);
    expect(fetchFn.mock.calls[0]![1]?.redirect).toBe('manual');
  });

  it('follows relative Location headers and several hops', async () => {
    const fetchFn = fakeFetch({
      [TEST_SHORT_LINK]: redirect('https://www.google.com/maps?share=1'),
      'https://www.google.com/maps?share=1': redirect(new URL(TEST_PLACE_URL).pathname, 301),
    });

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).toBe(TEST_PLACE_URL.replace(/\?.*$/, ''));
  });

  it('returns a long place URL without any request', async () => {
    const fetchFn = fakeFetch({});

    expect(await resolveMapsLink(TEST_PLACE_URL, { fetchFn })).toBe(TEST_PLACE_URL);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses to follow a redirect to a non-Google host', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: redirect('http://169.254.169.254/latest/meta-data') });

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxHops (redirect loop)', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: redirect(TEST_SHORT_LINK) });
    fetchFn.mockImplementation(async () => redirect(TEST_SHORT_LINK));

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn, maxHops: 3 })).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('returns the last URL when Google answers 200 with a non-place page', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: new Response('<html>consent</html>', { status: 200 }) });

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).toBe(TEST_SHORT_LINK);
  });

  it('throws on HTTP 5xx so SQS retries', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: new Response('oops', { status: 503 }) });

    await expect(resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).rejects.toThrow('HTTP 503');
  });
});
