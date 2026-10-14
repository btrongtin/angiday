# ADR-0016: Place details from the Maps URL + OpenStreetMap reverse geocoding

- **Status:** Accepted
- **Date:** 2026-10-14
- **Supersedes:** [ADR-0010](0010-google-places-api.md)

## Context
ADR-0010 chose Google Places API (New), which needs a Cloud Billing account. Vietnam is on the [Google Maps Platform Prohibited Territories](https://cloud.google.com/maps-platform/terms/maps-prohibited-territories) list, so the owner cannot create a billing profile for Maps.

The [Maps Demo Key](https://developers.google.com/maps/demo-key) needs no billing, but its [terms](https://cloud.google.com/terms/maps-platform/demo-project-terms) say "Production use is strictly prohibited", let Google "zero-out these usage limits at any time without notice", and still include the Google Maps Platform Terms (with the same territory restriction). A daily-use bot cannot rely on it.

What the pipeline actually needs per place:
- Name and coordinates: already in the resolved Maps URL (`/maps/place/<name>/…!3d<lat>!4d<lng>`), no API needed.
- `area.legacyDistrict`: point-in-polygon on the coordinates ([ADR-0013](0013-area-legacy-district-from-polygons.md)), no API needed.
- A stable id for later duplicate merging: the resolved URL usually carries a feature id (`!1s0x<hex>:0x<hex>`).
- A human-readable address and ward/city: needs reverse geocoding.
- Price: comes from the user's note first anyway ([ADR-0012](0012-cuisine-dishtype-price-taxonomy.md)).

## Options
1. **Maps Demo Key**: Google Places Text Search without billing.
   - Pros: same data as ADR-0010, no code change.
   - Cons: production use forbidden by its terms; limits can drop to zero without notice; territory restriction still applies.
2. **Goong** (Vietnamese maps provider): reverse geocoding / place search by name + coordinates.
   - Pros: strong Vietnam data, no card, one-time free credit.
   - Cons: another account and API key; the credit runs out eventually; no Google id.
3. **Parse the URL + OpenStreetMap Nominatim reverse geocoding**.
   - Pros: no account, no key, no card; free; data under ODbL, which allows storing results; one call per place.
   - Cons: OSM address data in Vietnam can be less complete than Google's and may still use pre-2025 wards; public Nominatim allows at most 1 request/second and requires attribution and an identifying User-Agent.
4. **Parse the URL only**, let the LLM guess the rest.
   - Pros: nothing external.
   - Cons: no address; ward/city unknown.

## Decision
Option 3.

Pipeline in the worker:
1. Follow redirects manually (unchanged from ADR-0010) and parse from the final URL: **name**, **coordinates** (prefer the pin `!3d…!4d…` over the viewport `@lat,lng`), and the **feature id** (`0x…:0x…`) when present. The parser is a pure function in `packages/shared`, tested against real URL fixtures.
2. Reverse geocode the coordinates with Nominatim (`/reverse`, `format=jsonv2`, `addressdetails=1`, `accept-language=vi`) → display address, `area.ward`, `area.city`. Which Nominatim address keys map to ward and city is fixed in S2 against fixtures.
3. Point-in-polygon → `area.legacyDistrict` (unchanged).

Failure rules:
- No coordinates in the URL (parse fails, or the link is not a place link) → `needs_info`, bot asks for a better link. There is no "search by message text" fallback any more.
- Nominatim error, timeout or empty result → save the place **without** address/ward/city and log a warning. Reverse geocoding is enrichment, not a blocker: coordinates, `legacyDistrict` and the Maps link still work.

Nominatim usage policy, applied:
- Identifying `User-Agent` (app name + contact), never the HTTP library default.
- Results are stored on the place, so each place is geocoded once; at our volume we stay far below 1 request/second.
- The base URL is configuration (env var), not code, so we can switch to another Nominatim instance or provider without a release. The lookup sits behind a small `reverseGeocode(lat, lng)` function so Goong (option 2) can replace it if OSM data proves too thin.
- The web app shows "© OpenStreetMap contributors" wherever addresses are displayed.

Data stored per place: `mapsUrl` (resolved), `mapsFeatureId` (nullable), `location`, `address` (nullable), `area`. Field definitions live in the zod schemas in `packages/shared`.

## Consequences
- No Google Cloud project, billing account, or Places API key; one fewer secret in SSM.
- No Google `place_id`. Duplicate merging (backlog) uses `mapsFeatureId` when present, otherwise name + distance. The feature id format is undocumented; fixture tests catch changes.
- No Google `priceLevel` or `types`. `priceRange` comes from the user's note or the LLM only; cuisine and dish type come from the LLM only. This changes the inputs described in ADR-0012, not its taxonomy.
- `area.ward` / `area.city` come from OSM instead of Google `addressComponents`. The area model in ADR-0013 is unchanged; alias matching and `searchText` already tolerate old and new ward names.
- Without a coordinates-based link we cannot save a place: text-only fallback is gone. The `/add` ask-back flow (ADR-0008) covers this.
- The backlog item "`/add` auto-search with inline buttons" can no longer use Places Text Search. Nominatim forbids autocomplete-style use, so that feature would need Goong or another provider; decide when it is picked up.
- If Google starts serving the Lambda a consent or interstitial page instead of a redirect, ingest falls back to `needs_info`; the URL fixtures and the `failed` / `needs_info` admin filter make this visible.
