# S2 — Place Details & Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development (the owner chooses — see [CLAUDE.md](../../../CLAUDE.md) → "Workflow per slice") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A saved place carries its Maps feature id, a human-readable address, and `area` (`legacyDistrict` + new ward + city); the bot reply and the web card show e.g. "Q3 · Phường Xuân Hòa", with OpenStreetMap attribution.

**Architecture:** The worker pipeline from S1 gains three steps between "parse URL" and "save": (1) the URL parser also returns the feature id; (2) a small injectable Nominatim client reverse-geocodes the coordinates into address/ward/city and never throws (enrichment, not a blocker — ADR-0016); (3) a pure point-in-polygon lookup against a committed GeoJSON of the 24 pre-2025 HCMC districts sets `area.legacyDistrict`. The places repository derives `searchText` (accent-free) on every write. The web list renders the new fields.

**Tech Stack:** unchanged from S1 (Node 24, TypeScript 6.0, zod 4, Vitest 5, MongoDB driver 7, Powertools Logger, CDK 2, Next.js 16). No new runtime dependency: point-in-polygon is ~20 lines; HTTP tests inject `fetch` (ADR-0017), so no MSW; no `mapshaper` (see Task 0 → ADR-0018).

**Spec:** [Phase 1 plan → S2](../phase-1-ingest-and-list.md#s2--place-details--area--8h); ADRs [0013](../../adr/0013-area-legacy-district-from-polygons.md) (area model), [0016](../../adr/0016-place-details-from-url-and-nominatim.md) (URL + Nominatim, failure rules, usage policy), [0017](../../adr/0017-inject-fetch-for-http-tests.md) (inject `fetch`), [0015](../../adr/0015-testing-and-observability-baseline.md); [architecture.md](../../architecture.md) → F1, Error handling. S1 review minors to fold in: [progress.md](../../progress.md) session log 2026-10-16 (`extractMapsUrl` smart quotes + missing `https://`).

## Global Constraints

Everything in S1's Global Constraints still applies (catalog versions, JIT packages, `groupId` on every repo function, thin handlers, no network in tests, secrets rules, Vietnamese user-facing text, explicit `git add` paths, ask before every commit, `aws login --profile angiday` before AWS commands). Additionally:

- Work on branch **`s2-place-details-and-area`**.
- Nominatim calls: `GET <base>/reverse?format=jsonv2&addressdetails=1&accept-language=vi&lat=<lat>&lon=<lng>` with `User-Agent: AnGiDay/1.0 (+https://github.com/btrongtin/angiday)`; base URL from env `NOMINATIM_BASE_URL`, default `https://nominatim.openstreetmap.org`.
- Reverse geocoding **never fails the job**: any error/timeout/empty result → save without address/ward/city, `logger.warn` with `groupId` and a reason.
- District data source: geoBoundaries `gbOpen/VNM/ADM2`, commit `9469f09` (OCHA ROAP / Government of Viet Nam, **CC BY 3.0 IGO**). GADM must **not** be committed (its licence forbids redistribution; ADR-0018).
- The polygon JSON is imported only through the subpath `@angiday/shared/legacy-district`, never from the package index (keeps ~180 KB out of any future client bundle).
- Attribution copy on the web (exact): `Dữ liệu địa chỉ © OpenStreetMap contributors` (linking `https://www.openstreetmap.org/copyright`) and `Ranh giới quận cũ: geoBoundaries / OCHA ROAP (CC BY 3.0 IGO)` (linking `https://www.geoboundaries.org`).
- Concept briefs (in Vietnamese, before the task that needs them): reverse geocoding + Nominatim usage policy (Task 5); GeoJSON + point-in-polygon (Task 3); plain Lambda env var vs SSM parameter for non-secret config (Task 6).

## Deviations from the phase plan (decided here)

| Phase plan says | This plan does | Why |
|---|---|---|
| GADM level 2 + `mapshaper` | geoBoundaries ADM2, no simplification | GADM forbids redistribution and the repo is public; the full-resolution HCMC subset is ~180 KB at 5 decimals (~1 m), so simplifying buys nothing. Recorded as ADR-0018 (Task 0). |
| `legacyDistrict` merges Q2/Q9/Thủ Đức into `thu_duc` (ADR-0013 alias line) | Three keys `q2`, `q9`, `thu_duc` | The open data represents 2020 (before the 2021 merge). Keeping them separate loses nothing; S4's alias table maps "thủ đức" / "tp thủ đức" → all three. ADR-0018. |
| No coordinates → `needs_info` | Keep S1 behaviour: reply "chưa đọc được", save nothing | A `needs_info` place without the reply-to-bot follow-up (S5) is a dead end; S5 adds the state together with the flow. |
| MSW tests for Nominatim | Injected `fetch` | ADR-0017 made this the shape for small clients in `services/ingest`. |

## Review Focus

1. **Reverse geocoding returns the *nearest OSM object*, not our restaurant** — the real fixtures (2026-10-23) hit a kindergarten, a bus stop named "23-25 Lê Văn Thịnh", a residential street and a house at "89 Nam Kỳ Khởi Nghĩa". Expected: the stored address never shows another POI's name or house number; it is street-level ("Đường Nguyễn Phi Khanh, Phường Tân Định, Thành phố Hồ Chí Minh"). Ward is in `suburb` and city in `city` in all fixtures, but Hà Nội comes back as plain "Hà Nội" (no "Thành phố" prefix), and a point at sea returns the HCMC boundary instead of an error. Pinned in Task 5 by the fixtures + rule tests.
2. **Nominatim unreachable or throttled** (403/429, DNS failure, timeout, an `{"error":"Unable to geocode"}` body, or a city-only hit with no street/ward). Expected: place still saved with `legacyDistrict`, bot still replies, one warn log with `groupId` + reason. Pinned in Task 5 (client) and Task 6 (worker).
3. **Points outside the polygons** — places in old Bà Rịa–Vũng Tàu / Bình Dương (now part of HCMC city) or Hà Nội. Expected: `legacyDistrict = null`, address/ward/city still saved, label falls back to "ward · city". Pinned in Task 3 and Task 4 (`formatAreaLabel`).
4. **Links pasted in odd wrappers** — `“…”`, `‘…’`, `«…»`, no `https://`, `goo.gl/maps/…`. Expected: the clean link is found and normalised to `https://`; look-alike hosts (`fakegoogle.com/maps`, `evilmaps.app.goo.gl`) never match. Pinned in Task 1.
5. **Places saved by S1 lack the new fields.** Expected: the web list still renders them (no address, no area label) instead of crashing. Pinned in Task 4 (repository read test).

---

## File map

```
.env.example                                       + NOMINATIM_BASE_URL (optional, commented)
docs/adr/0018-district-polygons-from-geoboundaries.md   NEW
docs/adr/README.md, docs/adr/0013-*.md (Note line only)

packages/shared/
  package.json                                     + export "./legacy-district"
  scripts/build-hcmc-districts.mjs                 one-off generator (geoBoundaries → JSON)
  src/maps-url.ts (+test, fixtures)                featureId; extractMapsUrl: smart quotes, no scheme
  src/text/search-text.ts (+test)                  normalizeForSearch, buildPlaceSearchText
  src/area/legacy-districts.ts (+test)             LEGACY_DISTRICT_KEYS, legacyDistrictSchema, LEGACY_DISTRICTS, areaSchema, formatAreaLabel
  src/area/find-legacy-district.ts (+test)         findLegacyDistrict, pointInPolygon  (subpath export)
  src/area/hcmc-legacy-districts.json              generated data
  src/area/SOURCE.md                               source, licence, regeneration steps
  src/place.ts                                     + mapsFeatureId, address, area, searchText
  src/app-env.ts (+test)                           + NOMINATIM_BASE_URL
  src/index.ts                                     re-exports

packages/db/src/collections.ts, places.ts (+test)  new fields, searchText on write, S1-doc defaults

services/ingest/
  src/geo/nominatim.ts (+test)                     createReverseGeocoder, parseNominatimReverse
  src/geo/fixtures/nominatim-*.json                real responses (captured in Task 5)
  src/worker/process-ingest-job.ts (+test)         enrichment steps, reply with area
  src/worker/handler.ts                            wiring
  src/test/fixtures.ts                             TEST_PLACE_FEATURE_ID

infra/lib/config.ts, ingest-stack.ts (+test)       worker env NOMINATIM_BASE_URL
apps/web/app/page.tsx                              address + area label + attribution
```

---

### Task 0: Branch, ADR-0018, owner inputs

**Files:**
- Create: `docs/adr/0018-district-polygons-from-geoboundaries.md`
- Modify: `docs/adr/README.md` (index row), `docs/adr/0013-area-legacy-district-from-polygons.md` (add one `- **Note:**` line under Status pointing to ADR-0018; decision text untouched)

**Interfaces:** Produces: branch `s2-place-details-and-area`; ADR-0018; 6 Nominatim fixture files for Task 5.

- [x] **Step 1: Branch from an up-to-date main**

```bash
git switch main && git pull && git switch -c s2-place-details-and-area
```

- [x] **Step 2: Write ADR-0018** in the house format (Status Accepted, Date, "Partially supersedes: ADR-0013 (data source and the q2/q9 → thu_duc alias line)"). Content to record:
  - Context: ADR-0013 planned to commit GADM-derived JSON; GADM licence: "Redistribution or commercial use is not allowed without prior permission"; the repo is public (portfolio).
  - Options: (1) GADM downloaded at build time, never committed — extra build step, still bundled into a deployed artefact; (2) **geoBoundaries gbOpen VNM ADM2** (boundaryID `VNM-ADM2-81297802`, year 2020, source OCHA ROAP / Government of Viet Nam, CC BY 3.0 IGO) — committable with attribution; (3) OSM admin boundaries (ODbL) — post-reform OSM no longer reliably maps the old districts, share-alike.
  - Decision: option 2, pinned to commit `9469f09`; select the 24 HCMC features by `shapeID`; no simplification (~180 KB at 5 decimals); keys keep the 2020 split `q2`, `q9`, `thu_duc`; S4's alias table maps "thủ đức"/"tp thủ đức" to all three.
  - Consequences: attribution in `SOURCE.md`, README and the web footer; verified at plan time that 12 known landmarks land in the right district (see Task 3 tests).

- [x] **Step 3: Commit plan + ADR (ask the owner first)**

```bash
git add docs/plans/phase-1/s2-place-details-and-area.md docs/adr/0018-district-polygons-from-geoboundaries.md docs/adr/README.md docs/adr/0013-area-legacy-district-from-polygons.md docs/progress.md
git commit -m "docs: add S2 plan and ADR-0018 (district polygons from geoBoundaries)"
```

- [x] **Step 4: Owner checklist — Nominatim fixtures (needed by Task 5 Step 1)**

**Done 2026-10-23:** the owner fetched the 6 URLs from another network (the machine's DNS resolves `nominatim.openstreetmap.org` to `127.0.0.1`). The responses are saved verbatim, untracked, at `services/ingest/src/geo/fixtures/nominatim-<label>.json`; they carry over to the branch in Step 1 and are committed with Task 5. Do not re-fetch. Note: `sea` did **not** return an error — it returned the HCMC boundary relation (city only).

| label | lat | lon | why |
|---|---|---|---|
| `to-ghe-q1` | 10.7917492 | 106.6951764 | owner place, Q1 / Tân Định |
| `bun-rieu-q2` | 10.7866592 | 106.7691656 | owner place, Q2 |
| `thien-tam-q2` | 10.7788544 | 106.7605133 | owner place, Q2 |
| `vung-tau` | 10.346 | 107.084 | in today's HCMC city, outside the old districts |
| `ha-noi` | 21.0287 | 105.8524 | another province-level city |
| `sea` | 10.0 | 107.5 | point with no street/ward (returned the HCMC boundary) |

URL template: `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=vi&lat=<lat>&lon=<lon>`

---

### Task 1: Maps URL — feature id, smart quotes, links without a scheme

**Files:**
- Modify: `packages/shared/src/maps-url.ts`, `packages/shared/src/maps-url.fixtures.ts`, `packages/shared/src/maps-url.test.ts`

**Interfaces:**
- Produces: `ParsedMapsPlace` gains `featureId: string | null` (lower-case `0x<hex>:0x<hex>`). `extractMapsUrl(text: string): string | null` now always returns a URL with a scheme.

- [x] **Step 1: Write the failing tests**

Fixtures — add `featureId` to every `expected` in `placeUrlFixtures`:

| label | featureId |
|---|---|
| desktop place URL … | `'0x31752f2c8b0b8d0f:0x6f6b1f0b3a1c9e2d'` |
| mobile share URL … | `'0x31752f3a1b2c3d4e:0x1a2b3c4d5e6f7a8b'` |
| viewport only / NFD / %2B | `null` |
| owner: TÔ GHẸ | `'0x317529006656f9ef:0xe1f83b4b1284b797'` |
| owner: Bún riêu Út Nhỏ | `'0x317527003688e4af:0x8ad9b8dc409ab37e'` |
| owner: Bún Bò Huế Thiện Tâm | `'0x317525aeb993110b:0x4b7f6044688f0e1e'` |

Add one fixture: label `'upper-case hex in the feature id is lower-cased'`, url `https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x31752F2C:0x6F6B!8m2!3d10.7!4d106.7`, expected `{ name: 'X', lat: 10.7, lng: 106.7, featureId: '0x31752f2c:0x6f6b' }`.

New `extractMapsUrl` cases (in the existing `it.each`):

```ts
['curly double quotes', '“https://maps.app.goo.gl/AbC123”', 'https://maps.app.goo.gl/AbC123'],
['curly single quotes + comma', '‘https://maps.app.goo.gl/AbC123’, ngon', 'https://maps.app.goo.gl/AbC123'],
['guillemets', '«https://maps.app.goo.gl/AbC123»', 'https://maps.app.goo.gl/AbC123'],
['short link without scheme', 'quán này maps.app.goo.gl/AbC123 nhé', 'https://maps.app.goo.gl/AbC123'],
['goo.gl/maps without scheme', 'goo.gl/maps/XyZ987', 'https://goo.gl/maps/XyZ987'],
['goo.gl/maps with scheme', 'https://goo.gl/maps/XyZ987', 'https://goo.gl/maps/XyZ987'],
['desktop URL without scheme', 'www.google.com/maps/place/X/@10.7,106.7,17z', 'https://www.google.com/maps/place/X/@10.7,106.7,17z'],
['http is kept', 'http://maps.app.goo.gl/AbC123', 'http://maps.app.goo.gl/AbC123'],
```

New null cases: `['look-alike host', 'fakegoogle.com/maps/place/X']`, `['look-alike short host', 'evilmaps.app.goo.gl/AbC']`, `['goo.gl link that is not Maps', 'goo.gl/AbC123']`.

- [x] **Step 2: Run — expect the new cases to FAIL**

Run: `pnpm --filter @angiday/shared test -- maps-url`

- [x] **Step 3: Implement**

- Feature id: `const FEATURE_ID = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i;` matched on `parsed.pathname`, `.toLowerCase()`, else `null`.
- URL in text — one regex, optional scheme, a look-behind so a host can't be the tail of another word, and curly quotes / guillemets excluded from the URL body:

```ts
const MAPS_URL_IN_TEXT =
  /(?<![\w.@-])(https?:\/\/)?(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(?:www\.)?google\.com(?:\.vn)?\/maps|maps\.google\.com(?:\.vn)?\/)[^\s<>"'“”‘’«»]*/i;
```

  Prefix `https://` when group 1 is empty; keep the trailing-punctuation strip. Update the doc comment.

- [x] **Step 4: Run — expect PASS** (`pnpm --filter @angiday/shared test`), then `pnpm --filter @angiday/shared typecheck` (callers of `ParsedMapsPlace` still compile — the worker only reads `name/lat/lng` until Task 6).

- [x] **Step 5: Commit** — `feat(shared): parse Maps feature id; accept links in curly quotes or without https`

---

### Task 2: Vietnamese search normalisation

**Files:**
- Create: `packages/shared/src/text/search-text.ts`, `packages/shared/src/text/search-text.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `normalizeForSearch(text: string): string`. (`buildPlaceSearchText` is added to this file in Task 4.)

- [x] **Step 1: Write the failing tests** — `it.each` on `normalizeForSearch`:

| input | expected |
|---|---|
| `'Phở Hòa'` | `'pho hoa'` |
| `'Đường Trần Quang Khải'` | `'duong tran quang khai'` |
| `'Phở Hòa'` (NFD) | `'pho hoa'` |
| `'TÔ GHẸ - HỦ TIẾU GHẸ Tân Định'` | `'to ghe hu tieu ghe tan dinh'` |
| `'  Q.3,  Phường 8 '` | `'q 3 phuong 8'` |
| `'Coffee + Tea'` | `'coffee tea'` |
| `''` | `''` |

- [x] **Step 2: Run — FAIL** (`pnpm --filter @angiday/shared test -- search-text`)
- [x] **Step 3: Implement** — NFD → drop `\p{M}` → `đ/Đ` → `d` → lower-case → runs of `[^\p{L}\p{N}]` → one space → trim.
- [x] **Step 4: Run — PASS**
- [x] **Step 5: Commit** — `feat(shared): add accent-free search normalisation`

---

### Task 3: Legacy district polygons + point-in-polygon

**Concept brief (Vietnamese, before coding):** GeoJSON (Polygon = list of rings, `[lng, lat]` order, ring đầu là biên ngoài, các ring sau là lỗ), thuật toán ray casting, `bbox` để loại nhanh.

**Files:**
- Create: `packages/shared/scripts/build-hcmc-districts.mjs`, `packages/shared/src/area/hcmc-legacy-districts.json` (generated), `packages/shared/src/area/SOURCE.md`, `packages/shared/src/area/legacy-districts.ts`, `packages/shared/src/area/find-legacy-district.ts`, `packages/shared/src/area/find-legacy-district.test.ts`
- Modify: `packages/shared/package.json` (`exports["./legacy-district"] = "./src/area/find-legacy-district.ts"`), `packages/shared/src/index.ts` (export the key list/schema only)

**Interfaces:**
- Produces (index): `LEGACY_DISTRICT_KEYS` (readonly tuple, order below), `legacyDistrictSchema = z.enum(LEGACY_DISTRICT_KEYS)`, `type LegacyDistrict`.
- Produces (subpath `@angiday/shared/legacy-district`): `findLegacyDistrict(lat: number, lng: number): LegacyDistrict | null`; `pointInPolygon(point: [lng: number, lat: number], rings: number[][][]): boolean`.

Keys and their geoBoundaries `shapeID` (verified against commit `9469f09`; `Binh Tan` and `Tan Phu` have namesakes in other provinces, so select by id, never by name):

| key | shapeName | shapeID |
|---|---|---|
| `q1` | Quan 1 | `81297802B34545275526363` |
| `q2` | Quan 2 | `81297802B76466747653960` |
| `q3` | Quan 3 | `81297802B4427483692725` |
| `q4` | Quan 4 | `81297802B29563104023098` |
| `q5` | Quan 5 | `81297802B17569327634169` |
| `q6` | Quan 6 | `81297802B35379290873600` |
| `q7` | Quan 7 | `81297802B84259990428862` |
| `q8` | Quan 8 | `81297802B52284124086366` |
| `q9` | Quan 9 | `81297802B54605917200404` |
| `q10` | Quan 10 | `81297802B93335721036450` |
| `q11` | Quan 11 | `81297802B37641712637141` |
| `q12` | Quan 12 | `81297802B78652503258302` |
| `binh_chanh` | Binh Chanh | `81297802B93683261125538` |
| `binh_tan` | Binh Tan | `81297802B42527210401893` |
| `binh_thanh` | Binh Thanh | `81297802B74412015974526` |
| `can_gio` | Can Gio | `81297802B7702852417854` |
| `cu_chi` | Cu Chi | `81297802B99873561685500` |
| `go_vap` | Go Vap | `81297802B93588362587103` |
| `hoc_mon` | Hoc Mon | `81297802B64363050509880` |
| `nha_be` | Nha Be | `81297802B80984092880643` |
| `phu_nhuan` | Phu Nhuan | `81297802B72603937188235` |
| `tan_binh` | Tan Binh | `81297802B72151759297882` |
| `tan_phu` | Tan Phu | `81297802B97138813252769` |
| `thu_duc` | Thu Duc | `81297802B1678031067910` |

- [x] **Step 1: Generate the data**

`build-hcmc-districts.mjs <input.geojson>` (plain Node ESM, no deps; the key → shapeID table above lives in the script): select the 24 features by `shapeID`, fail loudly if any id is missing/duplicated or a geometry is not a `Polygon`, round coordinates to 5 decimals, write a `FeatureCollection` whose features are `{ type: 'Feature', bbox: [minLng, minLat, maxLng, maxLat], properties: { key }, geometry }` to `src/area/hcmc-legacy-districts.json`.

```bash
curl -L -o "$TMP/vnm-adm2.geojson" https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/VNM/ADM2/geoBoundaries-VNM-ADM2.geojson
node packages/shared/scripts/build-hcmc-districts.mjs "$TMP/vnm-adm2.geojson"
```

(`$TMP` = the session scratchpad; the 44 MB download never enters the repo.) Expected: 24 features, file ≈ 180 KB.

`SOURCE.md`: dataset name, boundaryID `VNM-ADM2-81297802`, commit `9469f09`, year represented 2020, source "OCHA ROAP, Government of Viet Nam", licence CC BY 3.0 IGO with link, "selected 24 HCMC districts by shapeID, coordinates rounded to 5 decimals, no other changes", and the two commands above.

- [x] **Step 2: Write the failing tests** (`find-legacy-district.test.ts`)

```ts
it.each([
  ['owner: TÔ GHẸ (Tân Định)', 10.7917492, 106.6951764, 'q1'],
  ['owner: Bún riêu Út Nhỏ', 10.7866592, 106.7691656, 'q2'],
  ['owner: Bún Bò Huế Thiện Tâm', 10.7788544, 106.7605133, 'q2'],
  ['Chợ Bến Thành', 10.7725, 106.698, 'q1'],
  ['Hồ Con Rùa', 10.7826, 106.6958, 'q3'],
  ['Landmark 81', 10.795, 106.7218, 'binh_thanh'],
  ['Sân bay Tân Sơn Nhất', 10.8188, 106.6519, 'tan_binh'],
  ['Chợ Bình Tây', 10.7496, 106.6509, 'q6'],
  ['Crescent Mall', 10.729, 106.7189, 'q7'],
  ['Thảo Điền', 10.803, 106.735, 'q2'],
  ['Suối Tiên', 10.8665, 106.803, 'q9'],
  ['Đầm Sen', 10.7685, 106.639, 'q11'],
  ['Địa đạo Củ Chi', 11.1426, 106.4637, 'cu_chi'],
])('%s → %s', (_label, lat, lng, key) => expect(findLegacyDistrict(lat, lng)).toBe(key));

it.each([
  ['Vũng Tàu (new HCMC, outside old districts)', 10.346, 107.084],
  ['Thủ Dầu Một', 10.98, 106.65],
  ['Hà Nội', 21.0287, 105.8524],
  ['null island', 0, 0],
])('%s → null', (_label, lat, lng) => expect(findLegacyDistrict(lat, lng)).toBeNull());
```

Plus: `pointInPolygon` on a 10×10 square with a 2×2 hole → centre of hole `false`, a point between hole and edge `true`, outside `false`; data file has exactly 24 features whose keys equal `LEGACY_DISTRICT_KEYS` as a set.

- [x] **Step 3: Run — FAIL**
- [x] **Step 4: Implement** — `legacy-districts.ts`: keys tuple + schema. `find-legacy-district.ts`: import the JSON, validate it once at module load with a small zod schema (`properties.key` must be `legacyDistrictSchema`), then for each feature: skip if outside `bbox`, else `pointInPolygon` (ray casting on ring 0, minus holes). First hit wins. Use `with { type: 'json' }` on the import only if `tsc` asks for it.
- [x] **Step 5: Run — PASS**; also `pnpm --filter @angiday/shared lint typecheck`
- [x] **Step 6: Commit** — `feat(shared): add HCMC legacy district polygons and point-in-polygon lookup` (stage the script, JSON, SOURCE.md, sources, tests, package.json, index.ts)

---

### Task 4: Place schema, labels, `searchText`, repository

**Files:**
- Modify: `packages/shared/src/area/legacy-districts.ts` (+ create `legacy-districts.test.ts`), `packages/shared/src/text/search-text.ts` (+test), `packages/shared/src/place.ts`, `packages/shared/src/index.ts`
- Modify: `packages/db/src/collections.ts`, `packages/db/src/places.ts`, `packages/db/src/places.test.ts`

**Interfaces:**
- Consumes: `normalizeForSearch` (Task 2), `LegacyDistrict` (Task 3).
- Produces (shared):
  - `LEGACY_DISTRICTS: Record<LegacyDistrict, { label: string; fullName: string }>` — `q1`…`q12` → `{ label: 'Q1', fullName: 'Quận 1' }` …; `binh_tan, binh_thanh, go_vap, phu_nhuan, tan_binh, tan_phu, thu_duc` → label = Vietnamese name ("Bình Tân", "Bình Thạnh", "Gò Vấp", "Phú Nhuận", "Tân Bình", "Tân Phú", "Thủ Đức"), fullName = `Quận <name>`; `binh_chanh, can_gio, cu_chi, hoc_mon, nha_be` → label "Bình Chánh", "Cần Giờ", "Củ Chi", "Hóc Môn", "Nhà Bè", fullName = `Huyện <name>`.
  - `areaSchema = z.object({ city: z.string().min(1).nullable(), ward: z.string().min(1).nullable(), legacyDistrict: legacyDistrictSchema.nullable() })`, `type Area`, `EMPTY_AREA: Area` (all null).
  - `formatAreaLabel(area: Area): string | null` — with a `legacyDistrict`: `[label, ward]`; without: `[ward, city]`; non-null parts joined by `' · '`; `null` when empty.
  - `buildPlaceSearchText(place: { name: string; address: string | null; area: Area }): string` — `normalizeForSearch` of `[name, address, ward, city, LEGACY_DISTRICTS[legacyDistrict].fullName]` (nulls skipped) joined by spaces.
  - `placeSchema` gains `mapsFeatureId: z.string().nullable()`, `address: z.string().min(1).nullable()`, `area: areaSchema`, `searchText: z.string()`.
  - `NewTelegramPlace = Pick<Place, 'name' | 'mapsUrl' | 'mapsFeatureId' | 'location' | 'address' | 'area' | 'source'>` (no `searchText`: the repository derives it).
- Produces (db): `upsertPlaceFromTelegram` sets the four new fields (`searchText` from `buildPlaceSearchText`); `listPlaces` returns S1-era documents with `mapsFeatureId: null`, `address: null`, `area: EMPTY_AREA`, `searchText: buildPlaceSearchText(...)`.

- [x] **Step 1: Write the failing tests**

`legacy-districts.test.ts` — `formatAreaLabel`:

| area | expected |
|---|---|
| `{ legacyDistrict: 'q3', ward: 'Phường Xuân Hòa', city: 'Thành phố Hồ Chí Minh' }` | `'Q3 · Phường Xuân Hòa'` |
| `{ legacyDistrict: 'binh_thanh', ward: null, city: '…' }` | `'Bình Thạnh'` |
| `{ legacyDistrict: null, ward: 'Phường Vũng Tàu', city: 'Thành phố Hồ Chí Minh' }` | `'Phường Vũng Tàu · Thành phố Hồ Chí Minh'` |
| `EMPTY_AREA` | `null` |

Plus: `Object.keys(LEGACY_DISTRICTS)` equals `LEGACY_DISTRICT_KEYS` as a set.

`search-text.test.ts` — `buildPlaceSearchText({ name: 'Bún bò Huế O Phượng', address: 'Đường Nguyễn Đình Chiểu, Phường Xuân Hòa', area: { legacyDistrict: 'q3', ward: 'Phường Xuân Hòa', city: 'Thành phố Hồ Chí Minh' } })` → `'bun bo hue o phuong duong nguyen dinh chieu phuong xuan hoa phuong xuan hoa thanh pho ho chi minh quan 3'`; with `address: null, area: EMPTY_AREA` → `'bun bo hue o phuong'`.

`places.test.ts`:
- `newPlace()` gains `mapsFeatureId: '0x1:0x2'`, `address: null`, `area: EMPTY_AREA`.
- `'stores feature id, address, area and a derived searchText'` — upsert with `address: '12 Trần Quang Khải, Phường Tân Định'`, `area: { legacyDistrict: 'q1', ward: 'Phường Tân Định', city: 'Thành phố Hồ Chí Minh' }`, name `'Phở Hòa'` → returned place has those values and `searchText` containing `'pho hoa'`, `'phuong tan dinh'` and `'quan 1'`.
- `'reads a place saved before S2 (no address/area fields)'` — `insertOne` a doc without the four fields (as the S1 test already does for `needs_info`, but `ingestStatus: 'saved'`) → `listPlaces` returns it with `mapsFeatureId: null`, `address: null`, `area: EMPTY_AREA`, `searchText: normalizeForSearch(name)`.

- [x] **Step 2: Run — FAIL** (`pnpm --filter @angiday/shared test`, `pnpm --filter @angiday/db test`)
- [x] **Step 3: Implement** — in `collections.ts` make the four new fields optional on `PlaceDoc` (comment: "absent on places saved before S2"); `toPlace` fills the defaults; `upsertPlaceFromTelegram` `$set`s them plus `searchText`.
- [x] **Step 4: Run — PASS**, then `pnpm check` (the worker's call to `upsertPlaceFromTelegram` now fails typecheck — expected until Task 6; if you want the tree green at this commit, pass `mapsFeatureId: parsed.featureId, address: null, area: EMPTY_AREA` in the worker as a stop-gap and note it).
- [x] **Step 5: Commit** — `feat(shared,db): add address, area and searchText to places`

---

### Task 5: Nominatim reverse geocoding client

**Concept brief (Vietnamese, before coding):** reverse geocoding là gì; Nominatim usage policy (≤ 1 req/s, User-Agent định danh, attribution, không dùng kiểu autocomplete); vì sao lỗi Nominatim không được làm fail job (ADR-0016).

**Files:**
- Create: `services/ingest/src/geo/nominatim.ts`, `services/ingest/src/geo/nominatim.test.ts`
- Commit (already on disk from Task 0 Step 4): `services/ingest/src/geo/fixtures/nominatim-*.json`
- Modify: `packages/shared/src/app-env.ts`, `packages/shared/src/app-env.test.ts`, `.env.example`

**Interfaces:**
- Produces (shared): `appEnvShape.NOMINATIM_BASE_URL = z.url().default('https://nominatim.openstreetmap.org')`.
- Produces (ingest):

```ts
export const NOMINATIM_USER_AGENT = 'AnGiDay/1.0 (+https://github.com/btrongtin/angiday)';
export type GeocodeFailure = 'not_found' | 'http_error' | 'network' | 'bad_response';
export type ReverseGeocodeResult =
  | { kind: 'found'; address: string | null; ward: string | null; city: string | null }
  | { kind: 'none'; reason: GeocodeFailure };
export type ReverseGeocode = (lat: number, lng: number) => Promise<ReverseGeocodeResult>;
export function createReverseGeocoder(options: { baseUrl: string; fetchFn?: typeof fetch; timeoutMs?: number }): ReverseGeocode; // timeoutMs default 3_000; never throws
export function parseNominatimReverse(body: unknown): ReverseGeocodeResult; // pure
```

Mapping rules (fixed against the real fixtures of 2026-10-23). Only the `address` object is read; `display_name` and `name` are ignored, because they describe the nearest OSM object (a kindergarten, a bus stop…), not our restaurant:
- `ward`: the first value among `address.suburb, address.quarter, address.city_district, address.village, address.town` that matches `/^(Phường|Xã|Đặc khu|Thị trấn)\s/u`; else `null`. (All fixtures use `suburb`; the prefix rule skips `quarter: 'Khu phố cổ'`.)
- `city`: `address.state ?? address.province ?? address.city ?? null` — no prefix check (Hà Nội arrives as plain `'Hà Nội'`). Province-level keys come first so a lower-level `city` never beats the province.
- `address`: when `address.road` exists → `[road, ward, city]` (nulls skipped) joined by `', '`; otherwise `null`. Never include `house_number`, `neighbourhood` ("Khu phố N") or POI keys (`amenity`, `highway`, `historic`, …): the house number belongs to whatever object Nominatim hit, not necessarily the restaurant.
- `{ error: … }` body → `not_found`; non-2xx → `http_error`; fetch rejection/timeout → `network`; non-JSON or schema mismatch → `bad_response`.

- [x] **Step 1: Write the failing tests**
  - `it.each` over the 6 fixtures → `parseNominatimReverse(fixture)` equals (all `kind: 'found'`):

| fixture | address | ward | city |
|---|---|---|---|
| `to-ghe-q1` | `'Đường Nguyễn Phi Khanh, Phường Tân Định, Thành phố Hồ Chí Minh'` | `'Phường Tân Định'` | `'Thành phố Hồ Chí Minh'` |
| `bun-rieu-q2` | `'Lê Văn Thịnh, Phường Bình Trưng, Thành phố Hồ Chí Minh'` | `'Phường Bình Trưng'` | `'Thành phố Hồ Chí Minh'` |
| `thien-tam-q2` | `null` | `'Phường Cát Lái'` | `'Thành phố Hồ Chí Minh'` |
| `vung-tau` | `'Nam Kỳ Khởi Nghĩa, Phường Vũng Tàu, Thành phố Hồ Chí Minh'` | `'Phường Vũng Tàu'` | `'Thành phố Hồ Chí Minh'` |
| `ha-noi` | `'Phố Lê Thái Tổ, Phường Hoàn Kiếm, Hà Nội'` | `'Phường Hoàn Kiếm'` | `'Hà Nội'` |
| `sea` | `null` | `null` | `'Thành phố Hồ Chí Minh'` |

  - Rule tests on synthetic bodies: `{ quarter: 'Khu phố 3', suburb: 'Phường Xuân Hòa' }` → ward `'Phường Xuân Hòa'`; `{ village: 'Xã Bình Hưng' }` → `'Xã Bình Hưng'`; `{ suburb: 'Khu dân cư X' }` → ward `null`; `{ state: 'Tỉnh Lâm Đồng', city: 'Đà Lạt' }` → city `'Tỉnh Lâm Đồng'`; `{ error: 'Unable to geocode' }` → `{ kind: 'none', reason: 'not_found' }`.
  - Client tests with `fetchFn = vi.fn()`:
    - `'calls /reverse with the policy-required params and User-Agent'` — URL path `/reverse`, search params `format=jsonv2, addressdetails=1, accept-language=vi, lat=10.7917492, lon=106.6951764`; `init.headers['User-Agent'] === NOMINATIM_USER_AGENT`; `init.signal` set.
    - `'keeps a path in the base URL'` — `baseUrl: 'https://geo.example.com/nominatim'` (with and without trailing `/`) → request URL starts with `https://geo.example.com/nominatim/reverse?`.
    - `429` → `{ kind: 'none', reason: 'http_error' }`; `fetchFn` rejects (incl. a `TimeoutError` DOMException) → `network`; body `'<html>'` → `bad_response`. None of them throws.
  - `app-env.test.ts`: `loadAppEnv({}, ['NOMINATIM_BASE_URL'])` → default; a custom URL is kept; `'not a url'` throws.

- [x] **Step 2: Run — FAIL** (`pnpm --filter @angiday/ingest test -- nominatim`, `pnpm --filter @angiday/shared test -- app-env`)
- [x] **Step 3: Implement.** Build the request URL with `new URL('reverse', base.endsWith('/') ? base : base + '/')`; validate the body by hand (`ingest` has no zod dependency; Deviation: not a zod schema). `.env.example`: add a commented `# NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org` under a new "Reverse geocoding (worker)" heading, noting it is optional and not a secret.
- [x] **Step 4: Run — PASS**
- [x] **Step 5: Commit** — `feat(ingest): add Nominatim reverse geocoding client` (stage the 6 fixture files too)

---

### Task 6: Worker pipeline, infra env, deploy

**Concept brief (Vietnamese, before coding):** vì sao `NOMINATIM_BASE_URL` là env var thường do CDK đặt (không bí mật, đổi bằng `cdk deploy` mà không đổi code) còn token/URI ở SSM.

**Files:**
- Modify: `services/ingest/src/worker/process-ingest-job.ts`, `services/ingest/src/worker/process-ingest-job.test.ts`, `services/ingest/src/worker/handler.ts`, `services/ingest/src/test/fixtures.ts`
- Modify: `infra/lib/config.ts`, `infra/lib/ingest-stack.ts`, `infra/lib/ingest-stack.test.ts`

**Interfaces:**
- Consumes: `ParsedMapsPlace.featureId` (Task 1), `findLegacyDistrict` (Task 3, subpath import), `formatAreaLabel`, `NewTelegramPlace` (Task 4), `ReverseGeocode` (Task 5).
- Produces: `ProcessIngestJobDeps.reverseGeocode: ReverseGeocode`; `replySaved(name: string, areaLabel: string | null): string` → `` `Đã lưu: ${name} — ${areaLabel}` `` or `` `Đã lưu: ${name}` ``; `infra/lib/config.ts` exports `NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'`.

Pipeline after a successful parse: `reverseGeocode(lat, lng)` → on `none`, `logger.warn('Reverse geocoding found nothing; saving without address', { groupId, reason })` → `legacyDistrict = findLegacyDistrict(lat, lng)` → upsert with `mapsFeatureId`, `address`, `area` → reply `replySaved(place.name, formatAreaLabel(place.area))`. Unreadable links skip geocoding.

- [x] **Step 1: Write the failing tests** (`fixtures.ts`: add `TEST_PLACE_FEATURE_ID = '0x1:0x2'`; `TEST_PLACE_URL`'s pin 10.7895109, 106.6906025 is inside Q1 — checked at plan time. `deps()` gains `reverseGeocode` defaulting to `found` with `address: 'Đường Nguyễn Phi Khanh, Phường Tân Định, Thành phố Hồ Chí Minh'`, `ward: 'Phường Tân Định'`, `city: 'Thành phố Hồ Chí Minh'`.)
  - Update `'saves the place and replies in the same topic'`: doc also has `mapsFeatureId: '0x1:0x2'`, the address, `area: { legacyDistrict: 'q1', ward: 'Phường Tân Định', city: 'Thành phố Hồ Chí Minh' }`, `searchText` containing `'phuong tan dinh'`; reply text `replySaved('Phở Hòa', 'Q1 · Phường Tân Định')`; `reverseGeocode` called with `(10.7895109, 106.6906025)`.
  - `'saves without address when reverse geocoding finds nothing, and warns'` — stub `{ kind: 'none', reason: 'http_error' }` → outcome `'saved'`, `address: null`, `area: { legacyDistrict: 'q1', ward: null, city: null }`, reply `replySaved('Phở Hòa', 'Q1')`, `logger.warn` called with a message and `expect.objectContaining({ groupId, reason: 'http_error' })`.
  - `'a place outside the old districts gets legacyDistrict null'` — resolver returns `https://www.google.com/maps/place/H%E1%BB%93+G%C6%B0%C6%A1m/@21.0287,105.8524,17z` → `area.legacyDistrict` `null`.
  - In the existing "chưa đọc được" test: `reverseGeocode` not called.
  - `ingest-stack.test.ts`: the worker's env includes `NOMINATIM_BASE_URL: 'https://nominatim.openstreetmap.org'`.
- [x] **Step 2: Run — FAIL** (`pnpm --filter @angiday/ingest test`, `pnpm --filter @angiday/infra test`)
- [x] **Step 3: Implement** the pipeline; `handler.ts` adds `reverseGeocode: createReverseGeocoder({ baseUrl: loadAppEnv(process.env, ['NOMINATIM_BASE_URL']).NOMINATIM_BASE_URL })` inside `getDeps`; the stack sets the worker env var from `config.ts`.
- [x] **Step 4: Run — PASS**, then `pnpm check` and `pnpm --filter @angiday/infra cdk synth` (bundles the polygon JSON into the worker; no AWS credentials needed).
- [x] **Step 5: Commit** — `feat(ingest): enrich saved places with address and area`
- [x] **Step 6: Deploy (owner session).** Owner runs `aws login --profile angiday`; then `pnpm --filter @angiday/infra cdk diff --profile angiday` (expect: worker code + one env var, nothing else) → `pnpm --filter @angiday/infra cdk deploy --profile angiday`.
- [x] **Step 7: Demo in Telegram.** Owner posts one of their real links in "Lưu quán". Expected reply: `Đã lưu: TÔ GHẸ - HỦ TIẾU GHẸ Tân Định — Q1 · Phường Tân Định` (the TÔ GHẸ link; the two Q2 links give `Q2 · Phường Bình Trưng` and `Q2 · Phường Cát Lái`). If the reply has only "Q1", read the worker log line `Reverse geocoding found nothing or too little` for the reason (CloudWatch Logs Insights, filter by `updateId`).

---

### Task 7: Web card — address, area, attribution

**Files:**
- Modify: `apps/web/app/page.tsx`

**Interfaces:** Consumes `Place.address`, `Place.area`, `formatAreaLabel` (Task 4).

- [x] **Step 1: Implement.** Under each place link: the area label (when not null) and the address (when not null) on their own lines. Below the list, when the list is not empty, a `<footer>` with the two attribution lines from Global Constraints. No client components, no styling work (S4 does the card design).
- [x] **Step 2: Verify** — `pnpm --filter @angiday/web lint typecheck` and `pnpm --filter @angiday/web build`; then owner runs `pnpm --filter @angiday/web dev`, logs in at `http://localhost:3000`: the place from Task 6 shows "Q1 · Phường Tân Định" and "Đường Nguyễn Phi Khanh, Phường Tân Định, Thành phố Hồ Chí Minh"; S1-era places still render (name only); footer shows both attributions with working links.
- [x] **Step 3: Commit** — `feat(web): show address, area and data attribution on the place list`

---

### Task 8: Verify and finish the slice

**Files:** `docs/progress.md`, `docs/architecture.md`, `docs/plans/phase-1-ingest-and-list.md`, `CLAUDE.md`, `README.md` (attribution line)

- [ ] **Step 1:** `superpowers:verification-before-completion` — `pnpm check` green; Task 6 Step 7 and Task 7 Step 2 demos done (owner confirms).
- [x] **Step 2: Docs.**
  - `progress.md`: tick S2 (update its one-line description: geoBoundaries instead of GADM polygons); session-log line incl. ADR-0018, the 2 S1 minors fixed (smart quotes, missing `https://`, plus the `goo.gl/maps/` test gap), `needs_info` deferred to S5, Nominatim DNS note; Now/Next → S3.
  - `architecture.md`: Data model → Area paragraph links ADR-0018 and names geoBoundaries; places index list unchanged (the `area.legacyDistrict` index stays "later", S4 adds it with the query).
  - Phase plan S2 bullets: GADM/mapshaper → geoBoundaries (ADR-0018); `needs_info` → S5.
  - `CLAUDE.md`: Current phase line → "S2 done; next: slice S3".
  - `README.md`: one "Data" line with OSM (ODbL) and geoBoundaries (CC BY 3.0 IGO) attribution.
- [ ] **Step 3:** `superpowers:finishing-a-development-branch` (ask before commit / push / PR).
