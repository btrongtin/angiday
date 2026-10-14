# ADR-0010: Google Places API (New) for place details

- **Status:** Superseded by [ADR-0016](0016-place-details-from-url-and-nominatim.md)
- **Date:** 2026-10-10

## Context
Users share Google Maps short links (`maps.app.goo.gl/...`). We need a canonical name, address, coordinates and a stable id per place (for filters, distance, and later duplicate merging).

Resolving the short link needs no API: it is an HTTP redirect whose final URL contains the place name and coordinates (`/maps/place/<name>/@lat,lng` and `!3d<lat>!4d<lng>`). It does not contain a clean address or the Google `place_id`.

Pricing at the time of writing: Google replaced the $200 monthly credit (March 2025) with free monthly caps per SKU (Essentials 10,000 / Pro 5,000 / Enterprise 1,000 events). Goong gives a one-time $100 credit (Place Detail ≈ $7 per 1,000).

## Options
1. **Google Places API (New)**: Text Search with the parsed name, location-biased to the parsed coordinates, `maxResultCount: 1`.
   - Pros: real Google `place_id` matching the shared link; one call per place; usage far below every free cap.
   - Cons: needs a billing account (credit card) even inside free caps.
2. **Goong**: search by name + coordinates.
   - Pros: no card, strong Vietnam data, credit lasts years at our volume.
   - Cons: no Google `place_id`, so re-matching may pick the wrong branch; duplicate merging is harder; two data sources for one link.
3. **No Maps API**: parse the URL only, let the LLM guess the rest.
   - Pros: no account, no cost.
   - Cons: no address, so area filters are unreliable.

## Decision
Option 1.

Pipeline in the worker:
1. Follow redirects manually (`redirect: 'manual'`, max ~5 hops) and parse name + coordinates from the final URL. The parser is a pure function in `packages/shared`, tested against real URL fixtures.
2. Call Places API (New) Text Search with a minimal `X-Goog-FieldMask` (id, display name, formatted address, address components, location, types, price level, Google Maps URI).
3. If parsing fails, fall back to Text Search using the user's message text. If nothing matches, mark the place `needs_info` and ask for a better link.

Cost guards:
- API key restricted to Places API (New) only.
- Hard daily quota on the API in Cloud Console (e.g. 100 requests/day).
- Google Cloud budget alert.
- Key stored in SSM Parameter Store.

## Consequences
- We store Google `place_id`, which enables duplicate merging later (backlog).
- Google may change its URL format; fixture tests catch it and the Text Search fallback keeps ingest working.
- The field mask decides the price tier; adding fields later must be checked against the SKU table.
- Vietnamese addresses from Google may mix the pre- and post-July-2025 administrative units; handled in the taxonomy/area decision.
