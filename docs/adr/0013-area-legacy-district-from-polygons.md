# ADR-0013: Area model — legacy district derived from polygons

- **Status:** Accepted
- **Date:** 2026-10-10
- **Note:** `ward` / `city` now come from OpenStreetMap reverse geocoding instead of Google `addressComponents` ([ADR-0016](0016-place-details-from-url-and-nominatim.md)). The model and polygon approach are unchanged.

## Context
Since 1 July 2025 Vietnam has no district level (two tiers: province/city and ward/commune), and Ho Chi Minh City merged with Bình Dương and Bà Rịa–Vũng Tàu. Google addresses mix the old and new units. Users still say "Q3", "quận 3", "Thủ Đức", but may also use new ward names.

We need area filters and chat queries that understand both.

## Options
1. **Derive the legacy district from coordinates at ingest** (point-in-polygon against a static GeoJSON of pre-2025 HCMC districts); keep Google's ward/city as given; resolve user input through an alias table at query time.
   - Pros: deterministic, offline, free, no rate limits; independent of how Google formats the address.
   - Cons: needs a prepared GeoJSON file; one city at a time.
2. **Let the LLM infer the old district from the address during extraction.**
   - Pros: no data file.
   - Cons: unreliable, especially for post-reform ward names; wrong values silently produce wrong filters.

## Decision
Option 1, Ho Chi Minh City only for now.

- **Data:** pre-2025 HCMC district polygons from GADM (level 2), simplified with `mapshaper`, committed as a static JSON file in `packages/shared` (target: a few hundred KB). GADM is free for non-commercial use, which fits this project; source and licence are noted next to the file.
- **Model:** `area: { city, ward, legacyDistrict }`.
  - `legacyDistrict`: key such as `q1`…`q12`, `thu_duc`, `binh_thanh`, `go_vap`…, or `null` outside the polygons.
  - `ward`, `city`: from Google `addressComponents`, as Google returns them.
  - The full address is also in `searchText` (normalized, accent-free).
- **Ingest:** after Places lookup, run point-in-polygon on the coordinates and set `legacyDistrict`.
- **Query:** filters and the chat tool accept a free-text `area`. Code normalizes it through an alias table (`q3`, `q.3`, `quận 3`, `quan 3`, `district 3` → `q3`; `q2`, `q9`, `thủ đức` → `thu_duc`). No alias match → treat it as a ward/area name and search `searchText`.
- The LLM passes the user's words through; it never needs to know about the reform.

## Consequences
- Area filters are exact for HCMC and work with old and new names.
- Places outside HCMC are still saved and searchable by address, with `legacyDistrict = null`.
- Adding another city means adding its GeoJSON and aliases.
- The glossary term "district" now maps to `area.legacyDistrict` (old) and `area.ward` (new).
- Index: `{ groupId, "area.legacyDistrict" }`.
