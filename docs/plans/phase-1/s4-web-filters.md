# S4 — Web Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development (the owner chooses — see [CLAUDE.md](../../../CLAUDE.md) → "Workflow per slice") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the web list, filter "Hàn + nướng + Q3 + ≤ 200k", or type "q.3" / "Xuân Hòa" / "bun bo", and get the right places — on a designed, mobile-first page with light and dark themes.

**Architecture:** `packages/shared` gains the filter model (`placeFiltersSchema`, tolerant URL parsing) and the area alias table (`resolveAreaQuery`, built from `LEGACY_DISTRICTS`, never a copied list). `packages/db` replaces `listPlaces` with `searchPlaces(db, groupId, filters)`, one Mongo query scoped by `groupId`, with two new indexes. The web home page stays a Server Component: it parses `searchParams`, calls `searchPlaces` + `listTags`, and renders a plain GET form (filters live in the URL, no client state) and place cards. UI is Tailwind v4 + shadcn/ui, designed with the Hallmark skill as an app screen; colours and fonts only through tokens (new ADR-0021).

**Tech Stack:** unchanged, plus in `apps/web`: `tailwindcss` v4 + `@tailwindcss/postcss`, shadcn/ui (`components.json`, `clsx`, `tailwind-merge`, `class-variance-authority`, whatever `shadcn add` pulls), `next-themes`; tests: `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `happy-dom`, `@vitejs/plugin-react`. Versions resolved by `pnpm add` under the workspace's `minimumReleaseAge`; record the exact versions in the commit that adds them.

**Spec:** [Phase 1 plan → S4](../phase-1-ingest-and-list.md#s4--web-filters--10h); ADRs [0006](../../adr/0006-tag-registry-with-ids.md) (filter by tag id, dangling ids ignored), [0012](../../adr/0012-cuisine-dishtype-price-taxonomy.md) (enums + labels), [0013](../../adr/0013-area-legacy-district-from-polygons.md) (alias table at query time, index `{ groupId, "area.legacyDistrict" }`), [0015](../../adr/0015-testing-and-observability-baseline.md) (integration tests per filter, Testing Library for the filter form), [0018](../../adr/0018-district-polygons-from-geoboundaries.md) (`q2`/`q9`/`thu_duc` separate; "thủ đức" → all three), [0019](../../adr/0019-duplicate-places-by-feature-id-then-name-and-distance.md), [0020](../../adr/0020-gemini-flash-lite-for-extraction.md) (no extra Gemini calls); [architecture.md](../../architecture.md) → F4, Data model; [progress.md](../../progress.md) session log 2026-10-31 and Backlog.

## Global Constraints

Everything in S1–S3's Global Constraints still applies (catalog versions, JIT packages, `groupId` on every repo function, thin handlers, no network in tests, secrets rules, Vietnamese user-facing text, explicit `git add` paths, the owner deploys). Additionally:

- Work on branch **`s4-web-filters`**.
- **Commits:** the executor may commit without asking, but before **every** commit a separate fresh subagent reviews the staged diff (read-only); Important findings are fixed first. Push / PR still need the owner's go-ahead.
- **No Gemini, Nominatim or AWS change in this slice.** No `cdk deploy` is needed; the ingest Lambdas are untouched except for the `listPlaces` removal compiling.
- **Every query is scoped by `groupId`** and by `ingestStatus: 'saved'` (default list hides `needs_info` / `failed`; the admin filter is S6).
- **Labels come from `packages/shared`** (`CUISINE_LABELS`, `DISH_TYPE_LABELS`, `PRICE_RANGE_LABELS`, `LEGACY_DISTRICTS`) and option lists from the `*_KEYS` arrays. No copied lists in web code or tests.
- **Tags are filtered by id** (`tagIds`), never by name; `searchText` does not contain tag names.
- **URL keys** (exact): `q`, `area`, `cuisine` (repeatable), `dish` (repeatable), `price` (one value: the maximum bucket), `tag` (repeatable, tag id), `visit`.
- **Design tokens** (owner's rule): every colour and font goes through a token in `apps/web/app/tokens.css`; shadcn's variables point at those tokens; no literal colour, hex, `oklch()` or `font-family` in components or other CSS; both light and dark themes. `apps/web/DESIGN.md` is the locked system and is updated in the same commit as any token change.
- Hallmark Floor rule 10 applies to the web: no middle-dot-joined meta strings on the card. `formatAreaLabel` / `formatClassificationLine` stay for the bot reply; the card renders district, ward, cuisine, dish and price as separate elements.
- `apps/web/AGENTS.md`: read the relevant guide in `node_modules/next/dist/docs/` before writing Next code (Next 16.4; `searchParams` is a Promise).
- `pnpm dlx shadcn` and `pnpm add` need the network: run them outside the sandbox.
- Concept brief (Vietnamese, before Task 3): multikey index on an array field, `$in` vs `$all`, why an anchored-by-space regex on a precomputed `searchText` is enough at this scale (no Atlas Search / text index).

## Deviations from the phase plan (decided here)

| Phase plan / ADR says | This plan does | Why |
|---|---|---|
| "price" filter (Phase plan S4) | One select **"Tối đa"** (`price=<bucket>`) → places whose `priceRange` is that bucket or cheaper; places with `priceRange: null` are excluded while it is set | The demo asks "< 200k", a maximum, not a set of buckets; one control on mobile |
| (not specified) | Within one field values are OR (`cuisine=korean&cuisine=japanese` → Hàn **or** Nhật); across fields AND; **tags are AND** (`$all`: "hẹn hò" + "rẻ" means both) | Tags are what people combine to narrow; enums are alternatives |
| "free text" (Phase plan S4) | `q` and a non-alias `area` match `searchText` as a whole-word phrase: the normalized input must appear bounded by spaces or the ends (`bun bo` matches "bún bò huế", not "bún bột"; `quan 1` does not match "quận 10") | Accent-insensitive, predictable, no text index; tokens from `normalizeForSearch` are letters/digits only, so no regex escaping is needed |
| `q2`, `q9`, `thủ đức` → `thu_duc` (ADR-0013, superseded by ADR-0018) | "thủ đức" / "tp thủ đức" / "thành phố thủ đức" → `q2`, `q9`, `thu_duc`; "quận thủ đức" → `thu_duc` only; "q2" / "q9" → themselves | ADR-0018 keeps three keys; "quận Thủ Đức" names the 2020 district |
| UI unstyled (S1–S3) | Tailwind v4 + shadcn/ui + Hallmark, light/dark, tokens — **new ADR-0021** | Owner's choice; a UI stack is an architectural decision |
| Vercel deploy (S1 Task 12) | Still deferred | Owner's decision for this slice |
| (not specified) | Up to 100 results, newest first, no pagination; "Hiển thị 100 quán mới nhất" note when the limit is hit | Two users, a few hundred places at most |
| (not specified) | `next/form` (`<Form action="/">`, a GET form): client-side navigation, still works without JavaScript. The results sit in their own `Suspense` boundary and there is no `app/loading.tsx` | First version used a plain `<form>` plus a page-level `loading.tsx`: Enter reloaded the whole page, then the skeleton replaced the header and the form too (owner feedback after the S4 demo) |

## Review Focus

1. **A hand-edited or stale URL** — `?cuisine=korean&cuisine=pizza&price=cheap&tag=abc&tag=<deleted tag id>&visit=maybe&q=%20%20`. Expected: unknown values dropped, the page renders (never a 500), a deleted tag id simply matches nothing and shows no chip. Pinned in Task 1 (`parsePlaceFilters`) and Task 3 (a malformed id never reaches `toObjectId`).
2. **Area words that look alike** — "q1" vs "q10", "quận 1" typed into `q`, "Tân Phú" vs "Tân Bình" vs "Bình Tân", "Q.3 " with spaces, "QUẬN 3". Expected: exact district for aliases; free text never lets "quan 1" match "quận 10". Pinned in Task 2 (alias table) and Task 3 (phrase match).
3. **Another group's data** — a tag id from group B in group A's URL; two groups with places in Q3. Expected: nothing from B, ever. Pinned in Task 3 (scoping test per filter path).
4. **Places with missing fields** — `priceRange: null`, `legacyDistrict: null` (outside the polygons), no address, no tags, a tag id whose tag was deleted. Expected: card renders without empty rows; null price is excluded only when a price filter is set. Pinned in Task 3 and Task 5 (`PlaceCard`).
5. **Phone screen, both themes** — 360 px wide, dark mode, keyboard only. Expected: no horizontal scroll, filters usable (collapsed behind a disclosure on mobile), visible focus, contrast passes in both themes. Pinned in Task 5 (Hallmark `sloplint --scope app` + manual check list in Task 6).

---

## File map

```
docs/adr/0021-web-ui-tailwind-shadcn-tokens.md      new ADR
docs/adr/README.md                                  index line

packages/shared/src/
  search/place-filters.ts (+test)                   placeFiltersSchema, parsePlaceFilters, placeFiltersToSearchParams,
                                                    hasActiveFilters, priceRangesUpTo, EMPTY_PLACE_FILTERS
  area/area-aliases.ts (+test)                      resolveAreaQuery
  index.ts                                          re-exports

packages/db/src/
  places.ts (+test)                                 export toPlace for search; listPlaces removed
  search-places.ts (+test)                          searchPlaces, SEARCH_LIMIT
  indexes.ts (+test)                                groupId_tagIds, groupId_legacyDistrict
  index.ts

apps/web/
  package.json, postcss.config.mjs, components.json  Tailwind, shadcn, next-themes, test deps
  vitest.config.mts, vitest.setup.ts                  happy-dom per file, jest-dom, @ alias
  app/tokens.css                                      Hallmark tokens, light + dark (source of truth)
  app/globals.css                                     Tailwind, shadcn variables → tokens
  app/layout.tsx                                      fonts, ThemeProvider, globals.css
  app/page.tsx                                        searchParams → searchPlaces; form + cards + states
  app/loading.tsx, app/error.tsx                      skeleton, error state
  app/login/page.tsx                                  restyled with the same tokens
  components/ui/*                                     shadcn (button, input, label, badge, …)
  components/place-filter-form.tsx (+test)
  components/place-card.tsx (+test)
  components/theme-toggle.tsx, components/theme-provider.tsx
  lib/utils.ts                                        cn() (shadcn)
  DESIGN.md                                           locked design system (Hallmark)

docs/architecture.md, docs/progress.md, CLAUDE.md   Task 6
```

---

### Task 0: Branch, ADR-0021, plan commit, owner checklist

**Files:** Create `docs/adr/0021-web-ui-tailwind-shadcn-tokens.md`; Modify `docs/adr/README.md`.

- [ ] **Step 1: Branch from an up-to-date main** — `git switch main && git pull && git switch -c s4-web-filters`
- [ ] **Step 2: Write ADR-0021** (format of the other ADRs). Context: web was unstyled; two users mostly on phones, opened from Telegram; light/dark wanted; tokens must stay maintainable. Options: CSS Modules + CSS variables (no deps) / Tailwind v4 + shadcn/ui / a component library with its own theme (MUI, Mantine). Decision: Tailwind v4 + shadcn/ui (components copied into `apps/web/components/ui`, owned by us), designed with Hallmark as an app screen; `apps/web/app/tokens.css` is the only place colours and fonts are defined (light + `.dark`), shadcn's variables map onto it, `apps/web/DESIGN.md` is the locked system; themes via `next-themes` (class strategy, default `system`). Consequences: new deps pinned by the lockfile; shadcn components are ours to update by hand; any colour change goes through `tokens.css` + `DESIGN.md`; Testing Library needs a DOM environment in `apps/web`.
- [ ] **Step 3: Commit (after the review subagent)** — `git add docs/plans/phase-1/s4-web-filters.md docs/adr/0021-web-ui-tailwind-shadcn-tokens.md docs/adr/README.md docs/progress.md` → `docs: add S4 plan (web filters) and ADR-0021`
- [ ] **Step 4: Owner checklist — demo data** (needed only for Task 6's demo; Tasks 1–5 use synthetic test data). Share these as real Maps links in the Telegram group (≈ 8 Gemini calls of the 500/day), writing a short note with each. Tell Claude which places you used (names only):
  1. A Korean grill (BBQ) in old Q3, note with a price under 200k (e.g. "tầm 150k").
  2. A second Q3 place that is **not** Korean or not grill (to prove the AND).
  3. A place in the new ward **Xuân Hòa** (old Q3 area).
  4. A bún bò place anywhere (note "bún bò").
  5. A place in old Q2, Q9 or Thủ Đức (to check "thủ đức" → all three).
  6. A place in old Q1 and one in Q10 (to check "q1" ≠ "q10").
  7. A place with an explicit tag in the note, e.g. "hợp hẹn hò", and another with "rẻ" + "hẹn hò" (tag AND).
  8. A place over 500k or with no price written (null price drops out under a price filter).
  9. Optional: mark one place `visited` — there is no UI until S7; skip it and the visit filter is shown by tests only, or set it in Atlas Data Explorer yourself.
  - After merging (Task 6), run `pnpm seed:group` once with the existing chat id (it is idempotent) so Atlas gets the two new indexes; or do it now on the branch after Task 3.

---

### Task 1: Filter model and URL parsing (shared)

**Files:** Create `packages/shared/src/search/place-filters.ts`, `packages/shared/src/search/place-filters.test.ts`; Modify `packages/shared/src/index.ts`.

**Interfaces:**
- Produces:
  - `placeFiltersSchema` (zod) and `type PlaceFilters = { q: string | null; area: string | null; cuisine: Cuisine[]; dishType: DishType[]; maxPrice: PriceRange | null; tagIds: string[]; visitStatus: VisitStatus | null }`. Strings trimmed, max 100 chars for `q`, 60 for `area`; the schema is reused by the Phase 2 `search_places` tool, so it is the strict form.
  - `EMPTY_PLACE_FILTERS: PlaceFilters`
  - `parsePlaceFilters(params: Record<string, string | string[] | undefined> | URLSearchParams): PlaceFilters` — tolerant: never throws.
  - `placeFiltersToSearchParams(filters: PlaceFilters): URLSearchParams` — keys in the order `q, area, cuisine, dish, price, tag, visit`; empty values omitted.
  - `hasActiveFilters(filters: PlaceFilters): boolean`
  - `priceRangesUpTo(max: PriceRange): PriceRange[]` — prefix of `PRICE_RANGE_KEYS` up to and including `max`.

- [ ] **Step 1: Write the failing tests** (`place-filters.test.ts`)
  - `'parses every key'` — `?q=bun%20bo&area=q.3&cuisine=korean&cuisine=japanese&dish=grill&price=100k_200k&tag=<24-hex>&visit=visited` → `{ q: 'bun bo', area: 'q.3', cuisine: ['korean','japanese'], dishType: ['grill'], maxPrice: '100k_200k', tagIds: ['<24-hex>'], visitStatus: 'visited' }`. Also from the record form `{ cuisine: ['korean','japanese'], q: 'bun bo' }`.
  - `'drops what it does not know'` — `cuisine=pizza&cuisine=korean&cuisine=korean&price=cheap&tag=abc&visit=maybe&q=%20%20&area=` → `cuisine: ['korean']`, `maxPrice: null`, `tagIds: []`, `visitStatus: null`, `q: null`, `area: null`.
  - `'takes the first value of a single-valued key'` — `price=under_50k&price=over_500k` → `'under_50k'`; `q=a&q=b` → `'a'`.
  - `'truncates long text'` — 300 × `'a'` in `q` → length 100.
  - `'round-trips'` — for the full example, `parsePlaceFilters(placeFiltersToSearchParams(f))` equals `f`; `placeFiltersToSearchParams(EMPTY_PLACE_FILTERS).toString() === ''`.
  - `hasActiveFilters(EMPTY_PLACE_FILTERS) === false`; true with only `visitStatus`.
  - `priceRangesUpTo('100k_200k')` → `['under_50k','50k_100k','100k_200k']`; `priceRangesUpTo('under_50k')` → `['under_50k']`.
- [ ] **Step 2: Run** `pnpm --filter @angiday/shared test` → FAIL (module missing).
- [ ] **Step 3: Implement** in `search/place-filters.ts`. Parse each key with the existing enum schemas (`cuisineSchema.safeParse`, `objectIdSchema.safeParse`), dedupe preserving order; `URLSearchParams` and the record form go through one `getAll(key)` helper.
- [ ] **Step 4: Re-export** from `packages/shared/src/index.ts`; run tests → PASS; `pnpm --filter @angiday/shared typecheck lint` green.
- [ ] **Step 5: Commit** — `feat(shared): place filter model with tolerant URL parsing`

---

### Task 2: Area alias table (shared)

**Files:** Create `packages/shared/src/area/area-aliases.ts`, `packages/shared/src/area/area-aliases.test.ts`; Modify `packages/shared/src/index.ts`.

**Interfaces:**
- Produces: `resolveAreaQuery(text: string): AreaQuery | null` with `type AreaQuery = { kind: 'districts'; districts: LegacyDistrict[] } | { kind: 'text'; text: string }` (`text` is `normalizeForSearch(input)`); `null` when the input normalizes to `''`.

Matching rule: compact form = `normalizeForSearch(input).replaceAll(' ', '')`, looked up in a map built once from `LEGACY_DISTRICTS`:
- every district: compact `label` and compact `fullName` (`q3`, `quan3`; `binhthanh`, `quanbinhthanh`; `cuchi`, `huyencuchi`), plus `q` + compact label for named districts (`qbinhthanh`, `qtanphu`);
- numbered districts `q1`…`q12` also: `district<n>`;
- Thủ Đức override: `thuduc`, `tpthuduc`, `thanhphothuduc` → `['q2','q9','thu_duc']`; `quanthuduc` → `['thu_duc']`.
- No match → `{ kind: 'text', text }`.

- [ ] **Step 1: Write the failing tests**
  - `it.each` → `['q3']`: `'q3'`, `'Q3'`, `'q.3'`, `'Q. 3 '`, `'quận 3'`, `'QUẬN 3'`, `'quan 3'`, `'district 3'`.
  - `'q1'` → `['q1']` and `'q10'` → `['q10']` (never each other); `'quận 12'` → `['q12']`.
  - `'Bình Thạnh'`, `'binh thanh'`, `'q. bình thạnh'`, `'quận Bình Thạnh'` → `['binh_thanh']`; `'Tân Phú'` → `['tan_phu']`, `'Tân Bình'` → `['tan_binh']`, `'Bình Tân'` → `['binh_tan']`; `'Củ Chi'`, `'huyện Củ Chi'` → `['cu_chi']`.
  - `'thủ đức'`, `'TP Thủ Đức'`, `'tp. thu duc'`, `'thành phố Thủ Đức'` → `['q2','q9','thu_duc']`; `'quận Thủ Đức'` → `['thu_duc']`; `'q2'` → `['q2']`, `'q9'` → `['q9']`.
  - `'Xuân Hòa'` → `{ kind: 'text', text: 'xuan hoa' }`; `'Phường Bến Thành'` → text `'phuong ben thanh'`.
  - `''`, `'  '`, `'...'` → `null`.
  - `'every district is reachable by its label and full name'` — loop over `LEGACY_DISTRICT_KEYS`: `resolveAreaQuery(LEGACY_DISTRICTS[k].fullName)` contains `k` (no hard-coded list).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `area-aliases.ts` (map built at module load; the override entries are set after the generated ones so they win).
- [ ] **Step 4: Re-export, run tests → PASS.**
- [ ] **Step 5: Commit** — `feat(shared): area alias table for district queries (ADR-0013, ADR-0018)`

---

### Task 3: `searchPlaces` and indexes (db)

Before this task: concept brief in Vietnamese (see Global Constraints).

**Files:** Create `packages/db/src/search-places.ts`, `packages/db/src/search-places.test.ts`; Modify `packages/db/src/places.ts` (export `toPlace`, remove `listPlaces`), `places.test.ts` (move the `listPlaces` cases to `searchPlaces` with `EMPTY_PLACE_FILTERS`), `indexes.ts`, `indexes.test.ts`, `index.ts`.

**Interfaces:**
- Consumes: `PlaceFilters`, `priceRangesUpTo` (Task 1), `resolveAreaQuery` (Task 2), `toObjectId`, `placesCollection`.
- Produces: `searchPlaces(db: Db, groupId: string, filters: PlaceFilters, options?: { limit?: number }): Promise<Place[]>` and `SEARCH_LIMIT = 100`. `listPlaces` no longer exists (web is its only caller; Task 5 switches it).

Query: `{ groupId, ingestStatus: 'saved' }` plus, only for set fields: `cuisine: { $in }`, `dishType: { $in }`, `priceRange: { $in: priceRangesUpTo(max) }`, `tagIds: { $all: ids.map(toObjectId) }`, `visitStatus`, area `districts` → `'area.legacyDistrict': { $in }`, area `text` and `q` → each a `searchText: { $regex: '(^| )' + text + '( |$)' }` inside `$and`. `q` is normalized with `normalizeForSearch` first; a `q` that normalizes to `''` adds no condition. Sort `{ createdAt: -1, _id: -1 }`, limit `options.limit ?? SEARCH_LIMIT`.

Indexes added to `ensureIndexes`: `{ groupId: 1, tagIds: 1 }` named `groupId_tagIds`; `{ groupId: 1, 'area.legacyDistrict': 1 }` named `groupId_legacyDistrict`.

- [ ] **Step 1: Write the failing tests** (`search-places.test.ts`; seed with `upsertPlaceFromTelegram` + a small `place(overrides)` helper, two groups)
  - Seed in group A: Korean grill Q3 `100k_200k` tags [hẹn hò, rẻ]; Vietnamese noodle soup Q3 `under_50k` highlights ['bún bò'] ward 'Phường Xuân Hòa'; Korean hotpot Q1 `200k_500k`; Japanese Q10 null price; one in `q2`, one in `q9`, one in `thu_duc`; one `legacyDistrict: null` city 'Thành phố Hồ Chí Minh'. Group B: a Korean grill Q3 with the same tag names (its own tag ids). One A doc with `ingestStatus: 'needs_info'` inserted directly.
  - `'empty filters → all saved places of the group, newest first'` (needs_info hidden, B absent).
  - `'cuisine is OR within the field'` (`korean`+`japanese` → 3); `'fields are AND'` — `{ cuisine: ['korean'], dishType: ['grill'], area: 'q3', maxPrice: '100k_200k' }` → only the Korean grill Q3 (the demo).
  - `'maxPrice includes cheaper buckets and excludes null'` — `'100k_200k'` → grill + noodle, not the Japanese null-price place.
  - `'tags are AND'` — [hẹn hò] → 1; [hẹn hò, rẻ] → 1; [rẻ, <unused id>] → 0; B's tag id in A's query → 0.
  - `'area alias → district'` — `'q.3'` → the two Q3 places; `'q1'` → only Q1 (not Q10); `'thủ đức'` → the three q2/q9/thu_duc places; `'quận thủ đức'` → one.
  - `'area text → searchText'` — `'Xuân Hòa'` → the noodle place.
  - `'q is a whole-word phrase'` — `'bun bo'` → noodle; `'BÚN BÒ'` → noodle; `'bun b'` → none; `'quận 1'` → only the Q1 place (searchText has "quan 1", Q10 has "quan 10").
  - `'visitStatus'` — set one A place `visited` via `placesCollection(db).updateOne` → `visited` → 1, `want_to_try` → the rest.
  - `'every filter path stays inside the group'` — `it.each` of one filter per field (matching B's grill) → no result has `groupId === groupB`.
  - `'limit'` — `{ limit: 2 }` → 2.
  - `indexes.test.ts`: both new indexes exist with the exact keys.
- [ ] **Step 2: Run** `pnpm --filter @angiday/db test` → FAIL.
- [ ] **Step 3: Implement** `search-places.ts`; export `toPlace` from `places.ts`; delete `listPlaces` and move its existing tests (`'reads a place saved before S2'`, `'… before S3'`, limit, group scoping) to `searchPlaces(db, g, EMPTY_PLACE_FILTERS)`; add the indexes; update `index.ts` exports.
- [ ] **Step 4: Keep web compiling** — in `apps/web/app/page.tsx` replace `listPlaces(db, env.GROUP_ID)` with `searchPlaces(db, env.GROUP_ID, EMPTY_PLACE_FILTERS)` (Task 5 wires the real filters). Run `pnpm check` → green.
- [ ] **Step 5: Commit** — `feat(db): searchPlaces with filters and indexes; replace listPlaces`

---

### Task 4: Tailwind, shadcn, themes and test setup (web)

**Files:** Create `apps/web/postcss.config.mjs`, `components.json`, `lib/utils.ts`, `app/globals.css`, `app/tokens.css` (placeholder tokens, real values in Task 5), `components/theme-provider.tsx`, `components/theme-toggle.tsx`, `vitest.config.mts`, `vitest.setup.ts`, `components/ui/*`; Modify `apps/web/package.json`, `app/layout.tsx`, `eslint.config.mjs` (if shadcn files need an ignore).

- [ ] **Step 1: Read** `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` (Tailwind section) and the shadcn Next.js + Tailwind v4 install docs (context7).
- [ ] **Step 2: Install** (outside the sandbox): `pnpm --filter @angiday/web add next-themes` and `pnpm --filter @angiday/web add -D tailwindcss @tailwindcss/postcss @testing-library/react @testing-library/dom @testing-library/jest-dom happy-dom @vitejs/plugin-react`; then in `apps/web`: `pnpm dlx shadcn@latest init` (base colour neutral, CSS variables on) and `pnpm dlx shadcn@latest add button input label badge checkbox` — keep only what Task 5 uses. If a pinned version is younger than `minimumReleaseAge`, pick the newest allowed one rather than adding to `minimumReleaseAgeExclude`.
- [ ] **Step 3: Wire themes** — `ThemeProvider` (client, `next-themes`, `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`); `layout.tsx` imports `globals.css`, wraps children, `<html lang="vi" suppressHydrationWarning>`. `ThemeToggle` (client) switches light/dark/system, with an accessible name in Vietnamese ("Đổi giao diện sáng/tối").
- [ ] **Step 4: Token plumbing** — `globals.css` imports `tailwindcss` then `tokens.css`; shadcn's `:root` / `.dark` variables are assignments to Hallmark token names (`--background: var(--color-paper)` …, per Hallmark `references/export-formats.md` → shadcn). Keep Hallmark's `--color-accent` / `--color-muted` out of `@theme inline` (they collide with shadcn's names). `tokens.css` holds the only literal colour values.
- [ ] **Step 5: Test setup** — `vitest.config.mts`: `plugins: [react()]`, `resolve.alias['@']` = the `apps/web` directory, `setupFiles: ['./vitest.setup.ts']` (imports `@testing-library/jest-dom/vitest`, registers `cleanup` after each test). Component test files start with `// @vitest-environment happy-dom`; `lib/auth.test.ts` stays in Node.
- [ ] **Step 6: Verify** — `pnpm --filter @angiday/web typecheck lint test` green; `pnpm --filter @angiday/web build` succeeds without env vars (as CI does); `pnpm --filter @angiday/web dev` shows the (still unstyled-looking) page with the theme toggle switching the `class` on `<html>`.
- [ ] **Step 7: Commit** — `build(web): add Tailwind v4, shadcn/ui, next-themes and Testing Library` (exact versions in the body).

---

### Task 5: Filter form, place card and the designed page (web)

**Files:** Create `apps/web/components/place-filter-form.tsx` (+`.test.tsx`), `components/place-card.tsx` (+`.test.tsx`), `app/loading.tsx`, `app/error.tsx`, `DESIGN.md`; Modify `app/page.tsx`, `app/tokens.css`, `app/globals.css`, `app/layout.tsx` (fonts), `app/login/page.tsx`.

**Interfaces:**
- Consumes: `searchPlaces`, `listTags` (db); `PlaceFilters`, `parsePlaceFilters`, `hasActiveFilters`, `CUISINE_KEYS`/`LABELS`, `DISH_TYPE_KEYS`/`LABELS`, `PRICE_RANGE_KEYS`/`LABELS`, `LEGACY_DISTRICTS`, `LEGACY_DISTRICT_KEYS` (shared).
- Produces:
  - `PlaceFilterForm({ filters, tags }: { filters: PlaceFilters; tags: readonly Tag[] })` — `<form method="get" action="/">` with: `q` (search input, label "Tìm quán, món, địa chỉ"), `area` (input + `<datalist>` of every `LEGACY_DISTRICTS[k].label`, label "Khu vực", placeholder "q3, Bình Thạnh, Xuân Hòa…"), `cuisine` and `dish` checkboxes (value = key, label from `*_LABELS`, `other` included as "Khác"), `price` native `<select>` ("Mọi mức giá" = empty value, then "Tối đa " + label), `visit` native `<select>` ("Tất cả" / "Muốn thử" / "Đã ăn"), `tag` checkboxes (value = id, label = name; whole fieldset absent when there are no tags), submit "Lọc", and a "Xóa lọc" link to `/` shown when `hasActiveFilters`. Controls are native inputs (styled shadcn primitives are fine only if they submit a real form field). On narrow screens the fields sit in a `<details>` ("Bộ lọc"), open when filters are active.
  - `PlaceCard({ place, tagNames }: { place: Place; tagNames: ReadonlyMap<string, string> })` — name as a link to `place.mapsUrl` (`target="_blank" rel="noreferrer"`); district label and ward as separate elements; address; cuisine, dish and price as badges (`other` hidden); highlights; tags (dangling ids skipped); an "Đã ăn" badge when `visitStatus === 'visited'`. Rows with no data are not rendered.
  - `page.tsx`: `HomePage({ searchParams }: PageProps<'/'>)` → `requireSession()`; `filters = parsePlaceFilters(await searchParams)`; `Promise.all([searchPlaces(db, GROUP_ID, filters), listTags(db, GROUP_ID)])`; renders header (wordmark, theme toggle, logout), the form, a result count ("12 quán"), cards, and the states: no places and no filters → the existing "Chưa có quán nào…" message; filters but no match → "Không có quán nào khớp bộ lọc." + "Xóa lọc"; `places.length === SEARCH_LIMIT` → "Hiển thị 100 quán mới nhất — thu hẹp bộ lọc để thấy thêm."; the OSM + geoBoundaries attribution footer is kept on every state.

- [ ] **Step 1: Write the failing tests**
  - `place-filter-form.test.tsx`:
    - `'reflects the current filters'` — filters `{ q: 'bun bo', area: 'q3', cuisine: ['korean'], dishType: ['grill'], maxPrice: '100k_200k', tagIds: [tag1.id], visitStatus: 'visited' }` → the `q` input has value `'bun bo'`; checkbox labelled `CUISINE_LABELS.korean` is checked, `CUISINE_LABELS.japanese` is not; the price select's value is `'100k_200k'`; the tag checkbox labelled `tag1.name` is checked.
    - `'submits back to the same filters'` — `parsePlaceFilters(new URLSearchParams(new FormData(form) as never))` equals the input filters (and equals `EMPTY_PLACE_FILTERS` for an empty form: blank inputs do not become filters).
    - `'one checkbox per enum key'` — count of `name="cuisine"` inputs === `CUISINE_KEYS.length`; same for `dish`.
    - `'no tag fieldset without tags'`; `'"Xóa lọc" links to / only when a filter is active'`; the form's `method` is `get` and `action` ends with `/`.
  - `place-card.test.tsx`:
    - full place → link to `mapsUrl` with `target="_blank"`; text `LEGACY_DISTRICTS.q3.label`, the ward, `CUISINE_LABELS.korean`, `PRICE_RANGE_LABELS['100k_200k']`, the highlight, the tag name.
    - `cuisine: ['other','korean']` → "Khác" not shown; a tag id missing from `tagNames` → nothing rendered for it, no error.
    - `address: null`, `area: EMPTY_AREA`, `priceRange: null`, no tags → only the name link (no empty list items, no stray separators).
    - `visitStatus: 'visited'` → "Đã ăn" visible; `want_to_try` → not.
- [ ] **Step 2: Run** `pnpm --filter @angiday/web test` → FAIL.
- [ ] **Step 3: Implement the two components and `page.tsx`** to pass the tests with minimal structure (semantic HTML, Tailwind classes from tokens only).
- [ ] **Step 4: Design with Hallmark** — invoke the `hallmark` skill for this **app screen** (scope: app, not a marketing page; flow.md → App screens). Answers to its "ask once": *Material*: the real list (owner's places from Task 0's checklist; start `pnpm --filter @angiday/web dev` and let it capture), no photos, no numbers beyond the count; *Audience*: two friends in Saigon picking where to eat, on phones from a Telegram link; *Use*: narrow the list and open a place in Google Maps; *Tone*: a warm food notebook ("sổ tay ăn uống"), mobile-first. Requirements: light **and** dark themes (`references/dark-mode.md`), Vietnamese diacritics render in the chosen faces (check "Phường Xuân Hòa", "Bún bò Huế", "ỷ ẵ ữ"), fonts via `next/font` assigned to token names, controls 44 px hit targets, `:focus-visible` on every control, no horizontal scroll at 360 px. Apply its output to `tokens.css` (light + `.dark`), `globals.css`, `layout.tsx`, the components, `loading.tsx` (skeleton of cards), `error.tsx` (client, "Không tải được danh sách." + "Thử lại" calling `reset`), and restyle `login/page.tsx` with the same tokens. Then ask Hallmark to **lock the system** → `apps/web/DESIGN.md` (tokens.css stays the source of truth; its Exports section names the shadcn mapping).
- [ ] **Step 5: Sweep** — `node <hallmark-dir>/scripts/sloplint.mjs apps/web --render --scope app` (or on the rendered page as the skill says): fix every FAIL, fix or waive every REFLEX with a reason. Grep check: `rg -n "#[0-9a-fA-F]{3,8}\b|oklch\(|rgb\(|hsl\(|font-family" apps/web --glob '!app/tokens.css' --glob '!node_modules' --glob '!.next'` returns nothing outside `tokens.css`.
- [ ] **Step 6: Verify** — `pnpm check` green; `pnpm --filter @angiday/web build` green; in `dev`, by hand at 360 px and desktop, light and dark: the demo filter "Hàn + Nướng + q3 + Tối đa 100–200k" shows only the Korean grill; `area=q.3`, `area=Xuân Hòa`, `q=bun bo` work; back/forward restores the form; keyboard Tab reaches every control with a visible focus ring.
- [ ] **Step 7: Commit** — `feat(web): filter form, place cards and design system (ADR-0021)`; screenshots (light/dark, mobile/desktop) attached to the PR, not committed.

---

### Task 6: Verification, demo, docs

**Files:** Modify `docs/architecture.md`, `docs/progress.md`, `docs/plans/phase-1-ingest-and-list.md` (S4 notes), `CLAUDE.md`.

- [ ] **Step 1: `superpowers:verification-before-completion`** — `pnpm check` green (paste the summary); `pnpm --filter @angiday/web build` green.
- [ ] **Step 2: Demo with real data** (owner's places from Task 0, after `pnpm seed:group` created the indexes on Atlas): the phase-plan demo — "Hàn + nướng + Q3 + ≤ 200k", then "q.3", "Xuân Hòa", "bun bo", "thủ đức", "q1" (not Q10), tag "hẹn hò" + "rẻ". Owner confirms on their phone (same Wi-Fi, `next dev -H 0.0.0.0`) in both themes.
- [ ] **Step 3: Docs** — `architecture.md`: the two places indexes lose "(later)"; F4 states the filter semantics (OR within a field, AND across, tags AND, max price, phrase match, `ingestStatus: saved`); Modules row for `apps/web` mentions Tailwind/shadcn and `DESIGN.md`. `CLAUDE.md` → Conventions: one line "Web styling: colours/fonts only via tokens in `apps/web/app/tokens.css`; `apps/web/DESIGN.md` is the locked system (ADR-0021)"; update "Current phase". Phase plan S4: note the deviations table lives in this plan. `progress.md`: tick S4, Now/Next → S5, session-log line (what was done, deviations, deferred review minors, Vercel still open).
- [ ] **Step 4: Review before commit** — dispatch one fresh subagent to review the whole branch (`superpowers:requesting-code-review`, read-only), fix Important findings, list Minor ones in the session log.
- [ ] **Step 5: Commit docs, then `superpowers:finishing-a-development-branch`** (ask before push/PR).
