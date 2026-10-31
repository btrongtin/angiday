# ADR-0019: Detect an already-saved place by feature id, then by name and distance

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

Saving is idempotent per Telegram update (a retried SQS message never creates two places), but nothing stops the group from sharing the same restaurant twice: two different updates make two places, and each one also costs a geocoder call and an LLM request. The free Gemini tier is small (500 requests/day on Flash Lite, [ADR-0009](0009-gemini-via-ai-sdk.md) assumed far more), so repeated links are also a quota waste. The backlog already lists "merge duplicates by Maps feature id, else name + distance" ([ADR-0016](0016-place-details-from-url-and-nominatim.md) kept the feature id for this purpose).

## Options

1. **Same resolved URL.** Easy, but the same place has many URLs (`entry=…`, `@viewport`, short links that resolve differently).
2. **Feature id only.** Exact when present, but some links carry no `!1s0x…:0x…` segment, and places saved before S2 have none stored.
3. **Feature id, then normalized name within about 50 m.** Catches different short links to one place and older documents without a feature id.

## Decision

Option 3. After the link is resolved and parsed, and **before** reverse geocoding and the LLM, the worker looks for a saved place of the same group (`ingestStatus = 'saved'`) with the same `mapsFeatureId`; failing that, for one whose name is equal after `normalizeForSearch` and whose location is within 50 m (`$geoWithin` + `$centerSphere`, no index needed at this size). If found, the bot replies that the place was saved before ("Quán này đã được lưu trước đó: …") and saves nothing. The existing place is not modified.

## Consequences

- No duplicate places and no wasted geocoder or LLM calls for repeated links.
- The check is not atomic: two links for the same new place processed at the same moment (worker `maxConcurrency: 2`) can both pass it. Accepted; merging duplicates after the fact stays in the backlog.
- A shared place is never refreshed by re-sharing; editing is S7.
- Two different restaurants with the same name closer than 50 m (food court stalls) would be treated as one only when their feature ids are missing; with feature ids present they are told apart first.
- A non-unique index `{ groupId, mapsFeatureId }` is added; it is not unique because places saved before this ADR may already contain duplicates.
