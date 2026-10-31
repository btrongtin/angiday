# S3 — LLM Extraction & Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development (the owner chooses — see [CLAUDE.md](../../../CLAUDE.md) → "Workflow per slice") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Maps link with a note ("bún bò cay, rẻ, hợp hẹn hò") is saved with cuisine, dish type, price range, highlights and tags; the bot reply and the web card show them.

**Architecture:** The worker pipeline from S2 gains one LLM step between "reverse geocode" and "save". `packages/ai` owns `getModel('extract')` and `extractPlaceDetails()`, which calls Gemini through the AI SDK with the zod schema from `packages/shared` and re-prompts with the validation error (max 2 re-prompts). The LLM returns tag **names**; a pure `matchTags()` maps them to existing tag ids by normalized name and allows a new tag only when the user wrote it (ADR-0006). A place already saved for the same update is never re-enriched on an SQS retry. A one-off backfill gives S1/S2 places the fields S4 will query.

**Tech Stack:** unchanged from S2, plus `ai` (AI SDK 7) and `@ai-sdk/google` in `packages/ai` (versions resolved by `pnpm add` under the workspace's `minimumReleaseAge`; record the exact versions in the Task 4 commit). Tests use `MockLanguageModelV4` from `ai/test`. `tsx` for the eval script.

**Spec:** [Phase 1 plan → S3](../phase-1-ingest-and-list.md#s3--llm-extraction--tags--10h); ADRs [0006](../../adr/0006-tag-registry-with-ids.md) (tag registry, LLM never produces ids), [0009](../../adr/0009-gemini-via-ai-sdk.md) (Gemini via AI SDK, `getModel`, re-prompt), [0012](../../adr/0012-cuisine-dishtype-price-taxonomy.md) (enum values, rules), [0015](../../adr/0015-testing-and-observability-baseline.md) (mock model in CI, manual eval), [0016](../../adr/0016-place-details-from-url-and-nominatim.md) (price from the note/LLM only), [0017](../../adr/0017-inject-fetch-for-http-tests.md); [architecture.md](../../architecture.md) → F1, F3, Error handling. S2 deferred minors folded in: [progress.md](../../progress.md) session log 2026-10-23 (SQS retry overwrites good address with null; S1-era documents lack `searchText`/`area`).

## Global Constraints

Everything in S1/S2's Global Constraints still applies (catalog versions, JIT packages, `groupId` on every repo function, thin handlers, no network in tests, secrets rules, Vietnamese user-facing text, explicit `git add` paths, ask before every commit, remind the owner to run `aws login --profile angiday` before `cdk diff`/`deploy`; the owner deploys). Additionally:

- Work on branch **`s3-llm-extraction-and-tags`**.
- No real LLM call in CI or in `pnpm check`. Only `pnpm eval:extract` calls Gemini, and only the owner runs it.
- `packages/ai` is the only place that imports `@ai-sdk/google` or names a model id (ADR-0009).
- LLM output is validated with `placeExtractionSchema` (zod, `packages/shared`); the LLM never produces ids (ADR-0006).
- AI SDK calls use `generateText` + `Output.object({ schema })` (`generateObject` is deprecated in AI SDK 7), `maxRetries: 0` (SQS redelivery is the outer retry for 429/5xx/network — ADR-0009), and an `abortSignal`.
- Gemini key: SSM SecureString `/angiday/gemini-api-key` (created by the owner in S0) → app env `GOOGLE_GENERATIVE_AI_API_KEY`. Model override: optional plain env `GEMINI_EXTRACT_MODEL`; the default model id lives in `packages/ai/src/models.ts` and is the one the owner confirms in Task 0.
- Caps: at most **5 tags** per place, **5 highlights**, highlight ≤ **60** chars, tag name ≤ **40** chars.
- Concept briefs (in Vietnamese, before the task that needs them): structured output + zod validation + re-prompt loop, mock model in tests (Task 4); Gemini free-tier rate limits vs SQS redelivery, why `maxRetries: 0` (Task 6); unique index + upsert as the race guard for tags (Task 3).

## Deviations from the phase plan (decided here)

| Phase plan / ADR says | This plan does | Why |
|---|---|---|
| `generateObject` (Phase plan S3, ADR-0009) | `generateText` with `output: Output.object({ schema })` | Same feature; `generateObject` is deprecated in AI SDK 7. API rename only, ADR-0009's decision is unchanged — no new ADR. |
| "create a tag only if the user wrote it" (ADR-0006) | "Wrote it" = the tag's normalized name appears as whole words in the normalized note (`matchTags`, Task 2) | Deterministic and testable; does not trust an LLM flag. Implementation of ADR-0006, not a change to it. |
| Worker timeout 30 s | 60 s (visibility timeout 360 s) | One LLM call plus up to 2 re-prompts after geocoding can approach 30 s (S1 deferred minor on worst-case latency). |
| (not in phase plan) | A place already `saved` for this update is replied from the database on retry: no second geocode, no second LLM call | Fixes the S2 deferred minor (a retry overwriting a good address with null) and saves LLM quota. |
| (not in phase plan) | Backfill script for S1/S2 places (Task 8) | S4 queries `area` and `searchText`; S1 documents have neither. Backfill sets derived fields and defaults only; it does **not** run the LLM on old places (they have no stored note) — the owner may delete and re-share those few test places instead. |

## Review Focus

1. **A note that says almost nothing** — link only, "ngon nè", or the Maps app's share text (place name + link). Expected: `priceRange: null`, no tags (the user wrote none), cuisine/dish type at most what the place name implies, highlights only from the name or note — nothing invented. Pinned in Task 2 (`matchTags` drops unwritten names, `stripMapsUrls`) and in Task 5 (eval samples from real messages).
2. **Tag spelling variants and races** — "hen ho", "Hẹn hò", "#hẹn_hò" for an existing "hẹn hò"; two workers (`maxConcurrency: 2`) creating the same new tag at once. Expected: one tag document, every place gets the same id. Pinned in Task 2 (`matchTags`) and Task 3 (`ensureTags` concurrency test).
3. **Gemini unavailable** — 429 (free-tier RPM), 5xx, timeout, bad key. Expected: the job throws, no place is written, no reply, no re-prompt burned on a transport error; SQS retries later (the `failed` notice is S6). Pinned in Task 4 (one model call, error propagates) and Task 6 (worker test).
4. **Retry after the place was saved** (Telegram reply or `markDone` failed). Expected: the retry sends the same reply from the stored place; Nominatim and the LLM are not called; the stored address/ward are untouched. Pinned in Task 6.
5. **Messy LLM output** — duplicate enum values, `other` next to real values, blank or whitespace-padded strings, 8 tags, a 200-char "highlight". Expected: deduped, `other` dropped when another value exists, trimmed, blanks dropped, capped. Pinned in Task 4 (`cleanExtraction`).

---

## File map

```
.env.example                                        + GEMINI_EXTRACT_MODEL (optional, commented)
package.json                                        + eval:extract, backfill:places aliases
CLAUDE.md                                           test-workspace list gains ai

packages/shared/src/
  taxonomy.ts (+test)                               enums, Vietnamese labels, formatClassificationLine
  place-extraction.ts                               placeExtractionSchema (the LLM output schema)
  tags/tag-names.ts (+test)                         cleanTagName, normalizeTagName, matchTags
  maps-url.ts (+test)                               + stripMapsUrls
  place.ts                                          place + tag fields, tagSchema
  text/search-text.ts (+test)                       + highlights
  app-env.ts (+test)                                + GEMINI_EXTRACT_MODEL
  index.ts                                          re-exports

packages/db/src/
  collections.ts, indexes.ts (+test)                tags collection + unique index
  tags.ts (+test)                                   listTags, ensureTags
  places.ts (+test)                                 new fields, findPlaceByTelegramUpdate, backfillPlaceDefaults
  index.ts

packages/ai/
  package.json, tsconfig.json                       deps, test + eval:extract scripts, include scripts/
  src/models.ts                                     getModel, DEFAULT_MODEL_IDS
  src/extract/prompt.ts                             buildExtractionPrompt
  src/extract/clean-extraction.ts                   cleanExtraction
  src/extract/extract-place-details.ts (+test)      extractPlaceDetails, ExtractionFailedError
  src/extract/fixtures/gemini-*.json                real responses (captured in Task 5)
  src/extract/fixtures.test.ts                      replays them through the mock model
  eval/extract-samples.json                         15–20 real messages (owner, Task 0)
  scripts/eval-extract.ts                           pnpm eval:extract [--save-fixtures]
  src/index.ts

services/ingest/
  package.json                                      + @angiday/ai, backfill:places script
  src/worker/format-reply.ts (+test)                formatSavedReply (replaces replySaved)
  src/worker/process-ingest-job.ts (+test)          extraction + tags + resume-on-retry
  src/worker/handler.ts                             wiring
  scripts/backfill-places.ts                        one-off

infra/lib/config.ts, ingest-stack.ts (+test)        Gemini SSM param on worker, timeout 60 s
apps/web/app/page.tsx                               classification line, highlights, tags
```

---

### Task 0: Branch, plan commit, owner inputs

**Interfaces:** Produces: branch `s3-llm-extraction-and-tags`; `packages/ai/eval/extract-samples.json` (owner content); the confirmed default model id.

- [ ] **Step 1: Branch from an up-to-date main** — `git switch main && git pull && git switch -c s3-llm-extraction-and-tags`
- [ ] **Step 2: Commit the plan (ask the owner first)** — `git add docs/plans/phase-1/s3-llm-extraction-and-tags.md docs/progress.md` → `docs: add S3 plan (LLM extraction & tags)`
- [ ] **Step 3: Owner checklist** (Tasks 1–4 can start while this is open; Task 5 needs items 1–3, Task 6 deploy needs item 4)
  1. **Real messages.** Write 15–20 entries in `packages/ai/eval/extract-samples.json` (Claude creates the file with the shape below and 2 placeholder entries for you to replace). Copy at least 3 messages **verbatim** from the Telegram group, including at least one sent via the Google Maps app's "Chia sẻ" button (so we see its exact share text). Cover: link only; vague praise ("ngon nè"); an explicit price ("tầm 40k"); vague price ("rẻ", "hơi mắc"); a tag-like phrase ("hợp hẹn hò", "#đi_nhậu"); a non-Vietnamese cuisine (Hàn, Nhật, Thái); a drink/dessert place; a vegetarian place. For `place`, use the name shown in Google Maps (and the address/area if you know it). For `expect`, fill only what you are sure about. Confirm the content may be committed to the public repo.
     ```json
     [{ "id": "bun-bo-hen-ho", "text": "<message exactly as sent, incl. link>",
        "place": { "name": "Bún Bò Huế Thiện Tâm", "address": null, "areaLabel": "Q2 · Phường Cát Lái" },
        "existingTags": ["đi nhậu"],
        "expect": { "cuisine": ["vietnamese"], "dishType": ["noodle_soup"], "priceRange": "under_50k", "tags": ["hẹn hò"] } }]
     ```
  2. **Model id.** In Google AI Studio → rate limits for your key's project, pick the Flash model that is on the **free tier** and note its exact id (e.g. `gemini-…-flash`) plus its RPM/RPD. Tell Claude the id and limits (not the key). It becomes `DEFAULT_MODEL_IDS.extract`.
  3. **Local key.** Root `.env` has `GOOGLE_GENERATIVE_AI_API_KEY` from the project **without billing** (S0 checklist). Never paste it in chat.
  4. **SSM.** After `aws login --profile angiday`: `aws ssm describe-parameters --parameter-filters Key=Name,Values=/angiday/gemini-api-key --profile angiday --region ap-southeast-1` lists one `SecureString` (names only; no values are printed).

---

### Task 1: Taxonomy and extraction schema (shared)

**Files:**
- Create: `packages/shared/src/taxonomy.ts`, `packages/shared/src/taxonomy.test.ts`, `packages/shared/src/place-extraction.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `CUISINE_KEYS`, `cuisineSchema`, `type Cuisine`, `CUISINE_LABELS: Record<Cuisine, string>`; same trio for `DISH_TYPE_*`/`dishTypeSchema`/`DishType` and `PRICE_RANGE_*`/`priceRangeSchema`/`PriceRange`. Keys exactly as ADR-0012.
  - Labels (owner may adjust in review): cuisine `vietnamese 'Việt'`, `chinese 'Hoa'`, `japanese 'Nhật'`, `korean 'Hàn'`, `thai 'Thái'`, `other_asian 'Châu Á khác'`, `western 'Âu Mỹ'`, `vegetarian 'Chay'`, `other 'Khác'`; dish type `noodle_soup 'Món nước'`, `dry_noodle 'Món khô/trộn'`, `rice 'Cơm'`, `hotpot 'Lẩu'`, `grill 'Nướng'`, `fried 'Chiên'`, `seafood 'Hải sản'`, `snack 'Ăn vặt'`, `dessert 'Tráng miệng'`, `drink 'Đồ uống'`, `other 'Khác'`; price `under_50k '< 50k'`, `50k_100k '50–100k'`, `100k_200k '100–200k'`, `200k_500k '200–500k'`, `over_500k '> 500k'`.
  - `formatClassificationLine(c: { cuisine: Cuisine[]; dishType: DishType[]; priceRange: PriceRange | null }): string | null` — labels of non-`other` values joined `', '` per group; non-empty groups joined `' · '`; `null` when nothing is left (`other` is never displayed).
  - `placeExtractionSchema = z.object({ cuisine: z.array(cuisineSchema), dishType: z.array(dishTypeSchema), priceRange: priceRangeSchema.nullable(), highlights: z.array(z.string()), tags: z.array(z.string()) })`, `type PlaceExtraction`. No `.max()`/`.min()` here: caps are applied in code (Task 4), so a long list is cleaned instead of triggering a re-prompt.
  - Constants `MAX_TAGS_PER_PLACE = 5`, `MAX_HIGHLIGHTS = 5`, `MAX_HIGHLIGHT_LENGTH = 60`, `MAX_TAG_NAME_LENGTH = 40` (in `place-extraction.ts`).

- [ ] **Step 1: Write the failing tests** (`taxonomy.test.ts`)
  - Each label record has exactly its key list (set equality), and the key lists equal ADR-0012's.
  - `formatClassificationLine`: `{ ['vietnamese','korean'], ['noodle_soup'], '50k_100k' }` → `'Việt, Hàn · Món nước · 50–100k'`; `{ ['other'], [], null }` → `null`; `{ [], ['grill','other'], 'over_500k' }` → `'Nướng · > 500k'`.
  - `placeExtractionSchema.safeParse({ cuisine: ['italian'], … })` fails; `priceRange: null` passes.
- [ ] **Step 2: Run — FAIL** (`pnpm --filter @angiday/shared test -- taxonomy`)
- [ ] **Step 3: Implement** with `as const` key arrays and `z.enum(KEYS)`.
- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit** — `feat(shared): add cuisine, dish type and price taxonomy`

---

### Task 2: Note and tag-name helpers (shared)

**Files:**
- Create: `packages/shared/src/tags/tag-names.ts`, `packages/shared/src/tags/tag-names.test.ts`
- Modify: `packages/shared/src/maps-url.ts`, `packages/shared/src/maps-url.test.ts`, `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `normalizeForSearch` (S2), `MAX_TAGS_PER_PLACE`, `MAX_TAG_NAME_LENGTH` (Task 1).
- Produces:
  - `stripMapsUrls(text: string): string` — removes every Maps URL that `MAPS_URL_IN_TEXT` matches (all occurrences, with any wrapping quote/guillemet characters), trims each line, drops empty lines, joins with `'\n'`. This is the "note" the LLM sees.
  - `cleanTagName(name: string): string` — NFC, strip leading `#`s, `_` → space, collapse whitespace, trim.
  - `normalizeTagName(name: string): string` — `normalizeForSearch(cleanTagName(name))`.
  - `matchTags(input: { proposed: string[]; existing: { id: string; normalized: string }[]; note: string }): { tagIds: string[]; toCreate: string[] }` — in order: skip names whose normalized form is empty, longer than `MAX_TAG_NAME_LENGTH`, or already seen; existing normalized match → its id; else, if `` ` ${normalizeForSearch(note)} ` `` contains `` ` ${normalized} ` `` → `toCreate` gets `cleanTagName(name)`; else drop. Stop once `tagIds.length + toCreate.length === MAX_TAGS_PER_PLACE`.

- [ ] **Step 1: Write the failing tests**
  - `stripMapsUrls`: `'ngon nè https://maps.app.goo.gl/AbC123xyz'` → `'ngon nè'`; `'“https://maps.app.goo.gl/AbC” bún bò cay'` → `'bún bò cay'`; `'maps.app.goo.gl/AbC'` → `''`; `'TÔ GHẸ\nhttps://maps.app.goo.gl/x\n\nhợp hẹn hò'` → `'TÔ GHẸ\nhợp hẹn hò'`; two links → both removed. Add the verbatim share-text sample(s) from Task 0 once available.
  - `cleanTagName('  #hẹn_hò ')` → `'hẹn hò'`; `normalizeTagName('#Hẹn_Hò')` → `'hen ho'`.
  - `matchTags` (existing `A = { id: 'a'.repeat(24), normalized: 'hen ho' }`):
    | proposed | existing | note | result |
    |---|---|---|---|
    | `['Hẹn hò']` | `[A]` | `''` | `{ tagIds: [A.id], toCreate: [] }` |
    | `['#hẹn_hò', 'hen ho']` | `[A]` | `''` | `{ tagIds: [A.id], toCreate: [] }` |
    | `['hẹn hò']` | `[]` | `'bún bò cay, rẻ, hợp hẹn hò'` | `{ tagIds: [], toCreate: ['hẹn hò'] }` |
    | `['giá rẻ']` | `[]` | `'bún bò cay, rẻ'` | `{ tagIds: [], toCreate: [] }` |
    | `['date']` | `[]` | `'datenight'` | `{ tagIds: [], toCreate: [] }` |
    | `['', '   ', '#']` | `[]` | `'x'` | `{ tagIds: [], toCreate: [] }` |
    | 7 names all in the note | `[]` | note with all 7 | `toCreate.length === 5` |
- [ ] **Step 2: Run — FAIL** (`pnpm --filter @angiday/shared test -- tag-names maps-url`)
- [ ] **Step 3: Implement** — `stripMapsUrls` reuses the module's `MAPS_URL_IN_TEXT` with the `g` flag (a new `RegExp` from its source) so it can never disagree with `extractMapsUrl`.
- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit** — `feat(shared): add note stripping and tag name matching`

---

### Task 3: Place fields and tags repository (shared + db)

**Concept brief (Vietnamese, before coding):** unique index `{ groupId, normalized }` + `updateOne(..., { upsert: true })` là cách chống race khi 2 worker cùng tạo một tag; lỗi `E11000` khi upsert đồng thời thì đọc lại là đủ.

**Files:**
- Modify: `packages/shared/src/place.ts`, `packages/shared/src/text/search-text.ts` (+test), `packages/shared/src/index.ts`
- Modify: `packages/db/src/collections.ts`, `packages/db/src/indexes.ts` (+test), `packages/db/src/places.ts` (+test), `packages/db/src/index.ts`
- Create: `packages/db/src/tags.ts`, `packages/db/src/tags.test.ts`

**Interfaces:**
- Consumes: taxonomy schemas (Task 1), `normalizeTagName` (Task 2).
- Produces (shared):
  - `placeSchema` gains `cuisine: z.array(cuisineSchema)`, `dishType: z.array(dishTypeSchema)`, `priceRange: priceRangeSchema.nullable()`, `highlights: z.array(z.string().min(1))`, `tagIds: z.array(objectIdSchema)`.
  - `NewTelegramPlace` adds those five keys.
  - `tagSchema = z.object({ id: objectIdSchema, groupId: objectIdSchema, name: z.string().min(1), normalized: z.string().min(1), createdAt: z.date() })`, `type Tag`.
  - `buildPlaceSearchText(place: { name; address; area; highlights: string[] })` — highlights appended after the area parts. Tag names are **not** in `searchText` (tags are renamable; S4 filters tags by id).
- Produces (db):
  - `TagDoc`, `tagsCollection(db)`; index `{ groupId: 1, normalized: 1 }` named `groupId_normalized_unique`, unique.
  - `listTags(db: Db, groupId: string): Promise<Tag[]>` — sorted by `name`.
  - `ensureTags(db: Db, groupId: string, names: string[]): Promise<Tag[]>` — per name: `updateOne({ groupId, normalized }, { $setOnInsert: { name: cleanTagName(name), createdAt } }, { upsert: true })`, retry once on duplicate-key error; returns the tags for `names` (existing or new) in input order. Empty input → `[]` without a query.
  - `findPlaceByTelegramUpdate(db: Db, groupId: string, updateId: number): Promise<Place | null>`.
  - `upsertPlaceFromTelegram` `$set`s the five new fields (`tagIds` stored as `ObjectId[]`); `toPlace` defaults them for older documents (`[]`, `null`) and converts `tagIds` to hex strings.

- [ ] **Step 1: Write the failing tests**
  - `search-text.test.ts`: S2's expectation + `highlights: ['bún bò cay']` → ends with `' bun bo cay'`.
  - `tags.test.ts`: `ensureTags(db, g, ['Hẹn hò'])` then `ensureTags(db, g, ['#hen_ho', 'đi nhậu'])` → 2 docs; second call returns `[sameIdAsFirst, newId]`; `name` stays `'Hẹn hò'`. `'creates one tag under concurrent calls'` — `Promise.all` of 5 × `ensureTags(db, g, ['hẹn hò'])` → one doc, all results share its id. Group scoping: same name in group B is a separate doc; `listTags(db, A)` never returns B's.
  - `indexes.test.ts`: the tags index exists and is unique.
  - `places.test.ts`: `newPlace()` gains `cuisine: ['vietnamese'], dishType: ['noodle_soup'], priceRange: 'under_50k', highlights: ['bún bò'], tagIds: [tagId]` → returned place has them; `searchText` contains `'bun bo'`. `'reads a place saved before S3'` — `insertOne` an S2-shaped doc → `listPlaces` returns `cuisine: []`, `dishType: []`, `priceRange: null`, `highlights: []`, `tagIds: []`. `findPlaceByTelegramUpdate` finds by `(groupId, updateId)` and returns `null` for the other group.
- [ ] **Step 2: Run — FAIL** (`pnpm --filter @angiday/shared test`, `pnpm --filter @angiday/db test`)
- [ ] **Step 3: Implement.** `PlaceDoc`: the five new fields optional (comment: "absent on places saved before S3"), `tagIds?: ObjectId[]`. The worker's `upsertPlaceFromTelegram` call breaks typecheck until Task 6 — as in S2, pass empty values as a stop-gap if the commit must be green, and note it.
- [ ] **Step 4: Run — PASS**, then `pnpm check`
- [ ] **Step 5: Commit** — `feat(shared,db): add classification fields and tag registry`

---

### Task 4: `packages/ai` — model, prompt, extraction with re-prompt

**Concept brief (Vietnamese, before coding):** structured output (Gemini nhận JSON schema sinh từ zod), vì sao vẫn phải validate bằng zod, vòng re-prompt kèm lỗi validation; `MockLanguageModelV4` để test không gọi mạng; khác biệt giữa lỗi output (re-prompt) và lỗi transport (ném ra, để SQS retry).

**Files:**
- Modify: `packages/ai/package.json`, `packages/ai/tsconfig.json`, `packages/ai/src/index.ts`
- Create: `packages/ai/src/models.ts`, `packages/ai/src/extract/prompt.ts`, `packages/ai/src/extract/clean-extraction.ts`, `packages/ai/src/extract/extract-place-details.ts`, `packages/ai/src/extract/extract-place-details.test.ts`

**Interfaces:**
- Consumes: `placeExtractionSchema`, `PlaceExtraction`, label records, caps (Task 1), `cleanTagName`, `normalizeTagName` (Task 2), `normalizeForSearch`.
- Produces:

```ts
// models.ts — the only file naming a provider or model id
export const DEFAULT_MODEL_IDS = { extract: '<id confirmed in Task 0>' } as const;
export interface AiConfig { apiKey: string; extractModelId?: string }
export function getModel(purpose: 'extract', config: AiConfig): LanguageModel; // createGoogle({ apiKey })(modelId)

// prompt.ts
export interface ExtractionInput {
  note: string;                                   // stripMapsUrls(job.text)
  place: { name: string; address: string | null; areaLabel: string | null };
  existingTagNames: string[];
}
export function buildExtractionPrompt(input: ExtractionInput): { system: string; prompt: string };

// clean-extraction.ts
export function cleanExtraction(raw: PlaceExtraction): PlaceExtraction;

// extract-place-details.ts
export interface ExtractionResult { details: PlaceExtraction; attempts: number; inputTokens: number; outputTokens: number }
export class ExtractionFailedError extends Error { readonly attempts: number }
export function extractPlaceDetails(
  input: ExtractionInput,
  options: { model: LanguageModel; abortSignal?: AbortSignal; maxAttempts?: number /* default 3 */ },
): Promise<ExtractionResult>;
```

Prompt content (system, English instructions; Vietnamese data): the task; every enum key with its Vietnamese label and one-line meaning; ADR-0012 rules (specific dishes go to `highlights`, never invent enum values, use `other` when nothing fits, `priceRange` per person from the note — an explicit amount maps to its range, a vague word ("rẻ", "mắc") to the best range for that kind of food, no cue → `null`); highlights only from the note or the place name; tags: reuse an existing tag name exactly when it fits, propose a new tag only for a phrase the user wrote, never a dish name or a cuisine; output must follow the schema. The user prompt lists note, name, address, area label and existing tags; an empty note is stated as "(no note)".

`cleanExtraction`: dedupe enum arrays (keep order); drop `other` when another value is present; highlights: trim, collapse whitespace, drop empty and > `MAX_HIGHLIGHT_LENGTH`, dedupe by `normalizeForSearch`, keep `MAX_HIGHLIGHTS`; tags: `cleanTagName`, drop empty and > `MAX_TAG_NAME_LENGTH`, dedupe by `normalizeTagName`, keep `MAX_TAGS_PER_PLACE`.

Re-prompt loop: call `generateText({ model, system, messages, output: Output.object({ schema: placeExtractionSchema }), maxRetries: 0, abortSignal })`. On `NoObjectGeneratedError`: if attempts remain, append `{ role: 'assistant', content: error.text ?? '' }` and a user message `Your previous answer did not match the schema: <cause message>. Reply again with only the corrected JSON object.`, then retry; otherwise throw `ExtractionFailedError` (with `cause`). Any other error (e.g. `APICallError` for 429) propagates immediately. Token counts are summed across attempts (`usage.inputTokens`/`outputTokens`, `undefined` → 0).

- [ ] **Step 1: Install** — `pnpm --filter @angiday/ai add ai @ai-sdk/google zod@catalog: @angiday/shared@workspace:*` and `pnpm --filter @angiday/ai add -D vitest@catalog: tsx`; `package.json` gets `"test": "vitest run"`; `tsconfig.json` `include: ["src", "scripts"]`. (Needs network: run outside the sandbox.)
- [ ] **Step 2: Write the failing tests** (`extract-place-details.test.ts`; a helper builds a `MockLanguageModelV4` whose `doGenerate` returns queued texts, with the usage shape from the AI SDK testing docs)
  - `'returns the parsed details on the first valid answer'` — one valid JSON → `attempts: 1`, details equal the input after cleaning, token counts from the mock usage.
  - `'re-prompts with the validation error and succeeds'` — first `{"cuisine":["italian"],…}`, then valid → `attempts: 2`; the second `doGenerate` call's prompt contains an assistant message with the first text and a user message containing `did not match the schema`.
  - `'gives up after 3 invalid answers'` — three invalid → rejects with `ExtractionFailedError`, `attempts: 3`, `doGenerate` called 3 times.
  - `'does not re-prompt on a transport error'` — `doGenerate` throws `new APICallError({ message: 'Too Many Requests', statusCode: 429, url: 'x', requestBodyValues: {}, isRetryable: true })` → rejects with that error; called once.
  - `'passes the abort signal through'` — `abortSignal` reaches `doGenerate`'s options.
  - `cleanExtraction` table: `cuisine ['vietnamese','vietnamese','other']` → `['vietnamese']`; `['other']` stays; highlights `[' bún bò  cay ', '', 'Bún bò cay', 'x'.repeat(61)]` → `['bún bò cay']`; 8 tags → 5; tags `['#hẹn_hò', 'Hẹn hò']` → `['hẹn hò']`.
  - `buildExtractionPrompt`: system contains every cuisine/dish/price key; prompt contains the note, name, area label and each existing tag; empty note → `(no note)`.
- [ ] **Step 3: Run — FAIL** (`pnpm --filter @angiday/ai test`)
- [ ] **Step 4: Implement**; export `getModel`, `DEFAULT_MODEL_IDS`, `extractPlaceDetails`, `ExtractionFailedError`, types from `src/index.ts`.
- [ ] **Step 5: Run — PASS**, then `pnpm check` (turbo now runs `ai`'s tests)
- [ ] **Step 6: Commit** — `feat(ai): add Gemini extraction with schema re-prompt` (body: exact `ai` / `@ai-sdk/google` versions)

---

### Task 5: Eval script and real Gemini fixtures

**Files:**
- Create: `packages/ai/scripts/eval-extract.ts`, `packages/ai/src/extract/fixtures.test.ts`, `packages/ai/src/extract/fixtures/gemini-<sample-id>.json` (written by the script)
- Modify: `packages/ai/package.json` (`"eval:extract": "tsx --env-file=../../.env scripts/eval-extract.ts"`), root `package.json` (`"eval:extract": "pnpm --filter @angiday/ai run eval:extract"`)
- Commit: `packages/ai/eval/extract-samples.json` (Task 0)

**Interfaces:**
- Consumes: `extractPlaceDetails`, `getModel` (Task 4), `stripMapsUrls`, `matchTags` (Task 2).
- Fixture file shape: `{ sampleId, modelId, capturedAt, input: ExtractionInput, rawText: string, details: PlaceExtraction }` — `rawText` is the model's text from the first attempt, verbatim; `details` is what `extractPlaceDetails` returned.

Script behaviour: reads `GOOGLE_GENERATIVE_AI_API_KEY` and optional `GEMINI_EXTRACT_MODEL` via `loadAppEnv`; for each sample builds `ExtractionInput` (`note = stripMapsUrls(text)`), runs `extractPlaceDetails` sequentially with a delay of `ceil(60 / RPM)` seconds from Task 0 (constant in the script); runs `matchTags` against `existingTags` (fake ids); prints one row per sample: id, attempts, each `expect` field ✓/✗ with actual values, tokens; then a summary `N/M fields matched`. `--save-fixtures` writes a fixture file for each sample that succeeded on the first attempt (a sample that needed a re-prompt is reported, not saved; capture `rawText` with a thin `wrapLanguageModel` middleware or the `NoObjectGeneratedError`/result `text`, whichever the SDK exposes; record which in a comment). `--only <id>` runs one sample. Exits 0 even with mismatches (it measures, it doesn't gate).

- [ ] **Step 1: Implement the script** (no unit test: it is a manual tool, ADR-0015). Check it compiles: `pnpm --filter @angiday/ai typecheck`.
- [ ] **Step 2: Owner run** — from the repo root on the owner's machine: `pnpm eval:extract --save-fixtures`. Paste the printed table into the chat (it has no secrets). If more than a quarter of the `expect` fields miss, adjust the prompt (Task 4's `prompt.ts`) and re-run; note each iteration in the commit body.
- [ ] **Step 3: Write `fixtures.test.ts`** — `it.each` over `fixtures/gemini-*.json`: a mock model returning `rawText` → `extractPlaceDetails(fixture.input, { model })` resolves with `attempts: 1` and `details` deep-equal to `fixture.details`. This pins that real Gemini text parses as-is and that later changes to `cleanExtraction` are noticed.
- [ ] **Step 4: Run — PASS** (`pnpm --filter @angiday/ai test`)
- [ ] **Step 5: Commit** — `feat(ai): add extraction eval and real Gemini fixtures` (stage the samples, the script, the fixture files and the test)

---

### Task 6: Worker pipeline, reply, infra, deploy

**Concept brief (Vietnamese, before coding):** Gemini free tier có giới hạn RPM/RPD; vì sao `maxRetries: 0` và để SQS redelivery (visibility timeout 360 s) làm retry ngoài; vì sao tăng worker timeout lên 60 s; key Gemini đi qua SSM như các secret khác.

**Files:**
- Create: `services/ingest/src/worker/format-reply.ts`, `services/ingest/src/worker/format-reply.test.ts`
- Modify: `services/ingest/package.json` (+ `@angiday/ai: workspace:*`), `services/ingest/src/worker/process-ingest-job.ts` (+test), `services/ingest/src/worker/handler.ts`
- Modify: `packages/shared/src/app-env.ts` (+test), `.env.example`
- Modify: `infra/lib/config.ts`, `infra/lib/ingest-stack.ts`, `infra/lib/ingest-stack.test.ts`

**Interfaces:**
- Consumes: everything above; `ExtractionInput`, `ExtractionResult` (Task 4).
- Produces:
  - `formatSavedReply(place: Pick<Place, 'name' | 'area' | 'cuisine' | 'dishType' | 'priceRange' | 'highlights'>, tagNames: string[]): string` — lines, empty ones omitted:
    1. `Đã lưu: <name>` + (`' — ' + areaLabel` when `formatAreaLabel` is not null)
    2. `formatClassificationLine(place)`
    3. `Món nổi bật: ` + highlights joined `', '`
    4. `Tag: ` + tag names joined `', '`
  - `ProcessIngestJobDeps` gains `extractPlaceDetails: (input: ExtractionInput) => Promise<ExtractionResult>`; `replySaved` is removed (callers use `formatSavedReply`).
  - `appEnvShape.GEMINI_EXTRACT_MODEL = z.string().min(1).optional()`.
  - `infra/lib/config.ts`: `SSM_PARAMS.GOOGLE_GENERATIVE_AI_API_KEY = { name: '/angiday/gemini-api-key', secure: true }`; `WORKER_TIMEOUT_SECONDS = 60`; `EXTRACTION_TIMEOUT_MS = 25_000` lives in `handler.ts`.

Pipeline (after claim):
1. `existing = findPlaceByTelegramUpdate(...)`; if `existing?.ingestStatus === 'saved'` → `logger.info('Place already saved; replying again', { groupId, placeId })`, reply `formatSavedReply(existing, names of existing.tagIds found in listTags)`, `markTelegramUpdateDone`, return `'saved'`.
2. Resolve + parse (unchanged; unreadable → S1 reply).
3. Reverse geocode + area (unchanged).
4. `tags = listTags(db, groupId)`; `extraction = deps.extractPlaceDetails({ note: stripMapsUrls(job.text), place: { name, address, areaLabel: formatAreaLabel(area) }, existingTagNames: tags.map(t => t.name) })` — a rejection propagates (job throws, SQS retries).
5. `{ tagIds, toCreate } = matchTags({ proposed: extraction.details.tags, existing: tags, note })`; `created = ensureTags(db, groupId, toCreate)`; final ids = `tagIds` then created ids, deduped.
6. Upsert with all fields → reply `formatSavedReply(place, tag names in final-id order)` → `markTelegramUpdateDone` → `logger.info('Place saved', { groupId, placeId, llmAttempts, inputTokens, outputTokens, tagsCreated: created.length })`.

- [ ] **Step 1: Write the failing tests**
  - `format-reply.test.ts`: full place → `'Đã lưu: Bún Bò Huế Thiện Tâm — Q2 · Phường Cát Lái\nViệt · Món nước · < 50k\nMón nổi bật: bún bò cay\nTag: hẹn hò'`; no area, no classification, no highlights, no tags → `'Đã lưu: X'`.
  - `process-ingest-job.test.ts` — `deps()` gains `extractPlaceDetails` defaulting to `{ details: { cuisine: ['vietnamese'], dishType: ['noodle_soup'], priceRange: 'under_50k', highlights: ['bún bò cay'], tags: ['hẹn hò'] }, attempts: 1, inputTokens: 100, outputTokens: 20 }`; default job text `'bún bò cay, rẻ, hợp hẹn hò https://maps.app.goo.gl/AbC123xyz'`:
    - `'extracts, creates the user-written tag and replies with the summary'` — doc has the classification fields, `tagIds` = id of a new tag `'hẹn hò'`; `extractPlaceDetails` called with `note: 'bún bò cay, rẻ, hợp hẹn hò'`, `place.areaLabel: 'Q1 · Phường Tân Định'`; reply = `formatSavedReply(...)` with `['hẹn hò']`.
    - `'reuses an existing tag and drops tags the user did not write'` — pre-create `'Hẹn hò'`; stub tags `['hen ho', 'giá rẻ']` → one tag id (the existing one), no new tag doc.
    - `'passes existing tag names to the extractor'`.
    - `'throws and saves nothing when extraction fails'` — stub rejects with `new Error('429')` → `processIngestJob` rejects; no place doc for the update; `sendMessage` not called; `telegram_updates` not `done`.
    - `'a retry after a saved place replies from the database'` — run once with `sendMessage` rejecting the first call (job throws), then again: second run calls neither `reverseGeocode` nor `extractPlaceDetails`, the stored address is unchanged, and the second reply equals the first one's text.
    - Existing unreadable-link test: `extractPlaceDetails` not called.
  - `app-env.test.ts`: `GEMINI_EXTRACT_MODEL` absent → `undefined`; `''` throws.
  - `ingest-stack.test.ts`: worker env has `GOOGLE_GENERATIVE_AI_API_KEY_PARAM: '/angiday/gemini-api-key'`, the webhook's does not; worker `Timeout: 60`; queue `VisibilityTimeout: 360`.
- [ ] **Step 2: Run — FAIL** (`pnpm --filter @angiday/ingest test`, `pnpm --filter @angiday/shared test -- app-env`, `pnpm --filter @angiday/infra test`)
- [ ] **Step 3: Implement.** `handler.ts`: `loadLambdaEnv([... , 'GOOGLE_GENERATIVE_AI_API_KEY'])`, `loadAppEnv(process.env, ['NOMINATIM_BASE_URL', 'GEMINI_EXTRACT_MODEL'])`; `model = getModel('extract', { apiKey, extractModelId })` once in `getDeps`; `extractPlaceDetails: (input) => extractPlaceDetails(input, { model, abortSignal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS) })`. `.env.example`: commented `# GEMINI_EXTRACT_MODEL=` under the Gemini key, "optional; defaults to the id in packages/ai/src/models.ts".
- [ ] **Step 4: Run — PASS**, then `pnpm check` and `pnpm --filter @angiday/infra cdk synth`
- [ ] **Step 5: Commit** — `feat(ingest): extract cuisine, dish type, price and tags with Gemini`
- [ ] **Step 6: Deploy (owner).** Owner runs `aws login --profile angiday`, then `pnpm --filter @angiday/infra cdk diff --profile angiday` (expect: worker code, timeout 30 → 60, one new env var + an SSM read grant for `/angiday/gemini-api-key`, queue visibility 180 → 360; nothing else) → `pnpm --filter @angiday/infra cdk deploy --profile angiday`.
- [ ] **Step 7: Demo in Telegram.** Owner posts the Bún Bò Huế Thiện Tâm link with `bún bò cay, rẻ, hợp hẹn hò` in "Lưu quán". Expected reply shape (LLM-dependent values):
  ```
  Đã lưu: Bún Bò Huế Thiện Tâm — Q2 · Phường Cát Lái
  Việt · Món nước · < 50k
  Món nổi bật: bún bò cay
  Tag: hẹn hò
  ```
  Then post a second link with `hen ho` → reply reuses `hẹn hò` (no second tag). No reply within ~10 s → CloudWatch Logs Insights for the worker, filter by `updateId`, read `Job failed; SQS will retry`.

---

### Task 7: Web card — classification, highlights, tags

**Files:** Modify `apps/web/app/page.tsx`

**Interfaces:** Consumes `listTags` (Task 3), `formatClassificationLine` (Task 1), `Place.highlights`, `Place.tagIds`.

- [ ] **Step 1: Implement.** Load `listPlaces` and `listTags` in parallel; build an id → name map; under each card's area/address lines add the classification line (when not null), `Món nổi bật: …` (when any) and `Tag: …` (names of ids found in the map; dangling ids skipped — ADR-0006). No client components, no styling (S4 designs the card).
- [ ] **Step 2: Verify** — `pnpm --filter @angiday/web lint typecheck` and `pnpm --filter @angiday/web build`; owner runs `pnpm --filter @angiday/web dev` and checks at `http://localhost:3000` that the Task 6 place shows its classification, highlights and tag, and S1/S2 places still render.
- [ ] **Step 3: Commit** — `feat(web): show cuisine, dish type, price, highlights and tags`

---

### Task 8: Backfill S1/S2 places

**Files:**
- Modify: `packages/db/src/places.ts`, `packages/db/src/places.test.ts`, `packages/db/src/index.ts`
- Create: `services/ingest/scripts/backfill-places.ts`
- Modify: `services/ingest/package.json` (`"backfill:places": "tsx --env-file=../../.env scripts/backfill-places.ts"`), root `package.json` alias

**Interfaces:**
- Produces: `backfillPlaceDefaults(db: Db, groupId: string, options: { findLegacyDistrict: (lat: number, lng: number) => LegacyDistrict | null; dryRun?: boolean }): Promise<{ scanned: number; updated: number }>` — for each place of the group missing any of `mapsFeatureId, address, area, searchText, cuisine, dishType, priceRange, highlights, tagIds`: `$set` only the missing ones (`null` / `[]`; `area = { city: null, ward: null, legacyDistrict: findLegacyDistrict(lat, lng) }`), and `searchText` recomputed from the merged document. Never overwrites a field that exists. The district lookup is injected so `packages/db` never imports the polygon data.

- [ ] **Step 1: Write the failing tests** — insert an S1-shaped doc (no S2/S3 fields, location in Q1) and a complete S3 doc → `updated: 1`; the S1 doc now has `area.legacyDistrict: 'q1'`, `searchText` from its name, empty arrays; the complete doc is byte-for-byte unchanged (`updatedAt` too); `dryRun: true` returns the counts and writes nothing; another group's doc is untouched.
- [ ] **Step 2: Run — FAIL**, **Step 3: Implement**, **Step 4: Run — PASS** (`pnpm --filter @angiday/db test`)
- [ ] **Step 5: Script** — `pnpm backfill:places [--dry-run]` reads `MONGODB_URI`, `GROUP_ID`; passes `findLegacyDistrict` from `@angiday/shared/legacy-district`; prints `Database`, `scanned`, `updated`. No Nominatim call (the owner's machine cannot reach it; address/ward stay `null` for S1 places).
- [ ] **Step 6: Commit** — `feat(db): add backfill for places saved before S2/S3`
- [ ] **Step 7: Owner run** — `pnpm backfill:places --dry-run`, check the counts, then `pnpm backfill:places`. Optional: delete the S1 test places in Atlas and re-share them so they get address and classification.

---

### Task 10: Already-saved places (added 2026-10-31, owner request; run before Task 9)

**Why:** the Task 6 demo showed the same link sent twice would be saved twice ([ADR-0019](../../adr/0019-duplicate-places-by-feature-id-then-name-and-distance.md)). Review Focus addition: a link to a place that is already saved must neither create a place nor call Nominatim or Gemini.

**Files:** Modify `packages/db/src/places.ts` (+test), `indexes.ts` (+test), `index.ts`; `services/ingest/src/worker/format-reply.ts` (+test), `process-ingest-job.ts` (+test).

**Interfaces:**
- Produces (db): `findDuplicatePlace(db: Db, groupId: string, candidate: { mapsFeatureId: string | null; name: string; lat: number; lng: number }): Promise<Place | null>` — saved places of the group only; feature id first; then equal `normalizeForSearch(name)` within `DUPLICATE_RADIUS_METERS = 50` (`$geoWithin` / `$centerSphere`, radius ÷ 6378100). Index `{ groupId: 1, mapsFeatureId: 1 }` named `groupId_mapsFeatureId` (not unique).
- Produces (ingest): `formatAlreadySavedReply(place: Pick<Place, 'name' | 'area'>): string` → `Quán này đã được lưu trước đó: <name>` + `' — ' + areaLabel` when there is one; `ProcessOutcome` gains `'already_saved'`.
- Pipeline: after the link is parsed and before reverse geocoding, `findDuplicatePlace`; if found → reply `formatAlreadySavedReply`, `markTelegramUpdateDone`, return `'already_saved'` (no geocode, no LLM, no save).

- [ ] **Step 1: failing tests** — db: by feature id (different name and place); not across groups; ignores `needs_info`; name + distance (case/accent-insensitive, ~20 m) finds it; same name 500 m away → null; other name at the same spot → null; no match → null; index exists. Worker: second job (new update id, same link) → `'already_saved'`, one place, reply starts with `Quán này đã được lưu trước đó: Phở Hòa`, `reverseGeocode` and `extractPlaceDetails` not called; a retry of the *first* update still replies from the database (unchanged). The worker test file starts clearing `places` before each test (all tests share one Maps link).
- [ ] **Step 2: run — FAIL**, **Step 3: implement**, **Step 4: run — PASS and `pnpm check`**
- [ ] **Step 5: commit** — `feat: reply that a place is already saved instead of saving it twice`
- [ ] **Step 6 (owner, after deploy):** send the same link twice → the second time the bot answers with "Quán này đã được lưu trước đó: …" and the place list still shows one card.

---

### Task 9: Verify and finish the slice

**Files:** `docs/progress.md`, `docs/architecture.md`, `docs/plans/phase-1-ingest-and-list.md`, `CLAUDE.md`, `.env.example`

- [ ] **Step 1:** `superpowers:verification-before-completion` — `pnpm check` green; Task 6 Step 7, Task 7 Step 2 and Task 8 Step 7 done (owner confirms).
- [ ] **Step 2: Docs.**
  - `progress.md`: tick S3; session-log line (deviations above, eval score from Task 5, model id, S2 minors fixed: retry overwrite, S1 backfill); Now/Next → S4.
  - `architecture.md`: F1 sequence — "insert place (processing)" step removed (we write once, after extraction), add "place already saved → reply from DB"; Error handling row for LLM: transport errors → SQS, schema errors → re-prompt ×2 then throw; `places` index list unchanged (`{ groupId, tagIds }` stays "later", S4 adds it with the query).
  - Phase plan S3 bullets: `generateObject` → `generateText` + `Output.object`; backfill added.
  - `CLAUDE.md`: current phase → "S3 done; next: slice S4"; test-workspace list gains `ai`; command `pnpm eval:extract`.
- [ ] **Step 3:** `superpowers:finishing-a-development-branch` (ask before commit / push / PR).
