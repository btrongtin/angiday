# Progress

High-level task checklist. Implementation steps live in `docs/plans/`, not here.

## Now / Next

- **Now:** Phase 1 S2 done ([slice plan](plans/phase-1/s2-place-details-and-area.md)). A saved place carries feature id, street-level address, `area` (`legacyDistrict` + ward + city) and `searchText`; the bot reply and web card show e.g. "Q1 · Phường Tân Định"; confirmed against real AWS + Telegram + web.
- **Next:** Phase 1 S3 — LLM extraction & tags. Vercel deploy for the web app (S1 Task 12) is still open — deferred at the owner's request, not blocking.

## Phase 0 — Planning & setup

- [x] Project brief and initial decisions
- [x] Docs skeleton (CLAUDE.md, README, progress, architecture, ADRs)
- [x] Resolve open questions (see [architecture.md → Open questions](architecture.md#open-questions))
  - [x] LLM provider → Gemini Flash free tier via AI SDK ([ADR-0009](adr/0009-gemini-via-ai-sdk.md))
  - [x] Maps API → Google Places API (New) with quota caps ([ADR-0010](adr/0010-google-places-api.md)), superseded by URL parsing + OSM Nominatim ([ADR-0016](adr/0016-place-details-from-url-and-nominatim.md))
  - [x] Text-only message handling → `/add` + ask for link ([ADR-0008](adr/0008-explicit-add-command-for-text-only.md))
  - [x] AI chat in Telegram → one group, two forum topics ([ADR-0011](adr/0011-telegram-chat-via-forum-topics.md))
  - [x] Cuisine & dish-type taxonomy, price range ([ADR-0012](adr/0012-cuisine-dishtype-price-taxonomy.md))
  - [x] Area after the 2025 admin reform → legacy district from polygons ([ADR-0013](adr/0013-area-legacy-district-from-polygons.md))
  - [x] Monorepo tooling → pnpm workspaces + Turborepo, JIT internal packages ([ADR-0014](adr/0014-pnpm-turborepo-jit-packages.md))
  - [x] Testing strategy & observability → middle baseline ([ADR-0015](adr/0015-testing-and-observability-baseline.md))
- [x] `git init` + first commit
- [x] Write Phase 1 plan
- Accounts setup → moved to Phase 1 S0

## Phase 1 — Ingest + list/filter (end-to-end, no chat)

Goal: share a Maps link in Telegram → place appears in the web list. Plan: [plans/phase-1-ingest-and-list.md](plans/phase-1-ingest-and-list.md) (slices, estimates, cut order).

- [x] S0 — Scaffold & accounts (~6h)
- [x] S1 — Walking skeleton: link → name saved → bot reply → web list (~14h)
- [x] S2 — Place details & area: URL feature id, Nominatim reverse geocoding, geoBoundaries HCMC polygons (ADR-0018), `legacyDistrict`, `searchText` (~8h)
- [ ] S3 — LLM extraction & tags: taxonomy enums, `generateObject` + retry, tag mapping, eval script (~10h)
- [ ] S4 — Web filters incl. area aliases (~10h)
- [ ] S5 — `/add` and ask-back (`needs_info` + reply-to-message) (~6h)
- [ ] S6 — Failure path & observability: `failed` + notice, metrics, alarms → email, admin filter (~6h)
- [ ] S7 — Tag management & visit status (~6h)
- [ ] S8 — Wrap-up: README, docs (~3h)

## Phase 2 — AI chat (Telegram first, then web — ADR-0011)

**Core**
- [ ] Chat core in `packages/ai`: system prompt + tool `search_places` + tool loop
- [ ] LLM 429 handling (retry with backoff)

**Telegram**
- [ ] Forum topics: `/setup save|ask`, routing by `message_thread_id`, `/ask` fallback
- [ ] Telegram chat adapter: typing action, reply with place list + inline Maps buttons
- [ ] Multi-turn context via `chat_turns` (TTL)

**Web**
- [ ] `/api/chat` with streaming (same core)
- [ ] Chat UI: streamed text, place cards, tool-running states

## Backlog (later / stretch)

- [ ] Web: add/edit cuisine & dish-type values (moves enums to a per-group registry; new ADR superseding ADR-0012)
- [ ] Visit status & ratings via Telegram inline buttons
- [ ] `/add` auto-search + inline buttons to pick the place (ADR-0008); needs a search provider other than Nominatim (ADR-0016)
- [ ] "Near me" / "near <landmark>" (geolocation or geocoding + `2dsphere`) — decide in Phase 2 plan whether to pull in
- [ ] Telegram Mini App: open the web app inside Telegram, auth via signed `initData`
- [ ] Merge duplicates by Maps feature id, else name + distance
- [ ] "What should we eat today?" — suggest 2–3 want-to-try places with reasons
- [ ] Review summary on place detail page
- [ ] More inputs: screenshots (vision), Facebook/Threads links (best-effort OG tags)
- [ ] Import Messenger history through the same pipeline (concurrency-limited)
- [ ] AI discovers new places beyond the saved list
- [ ] Migrate API to NestJS
- [ ] Public sign-up (multi-group)

## Session log

| Date | Done | Left open |
|---|---|---|
| 2026-10-07 | Planning: goals revised, 7 ADRs, docs skeleton | Open questions in Phase 0 |
| 2026-10-10 | Resolved all Phase 0 questions (ADR-0008…0015: `/add`, Gemini via AI SDK, Google Places, Telegram chat via topics, taxonomy, area from polygons, pnpm + Turborepo, testing/observability); wrote Phase 1 plan | Function URL vs API Gateway kept as a plan-level choice (promote to ADR if needed) |
| 2026-10-14 | Google Maps billing unavailable in Vietnam (prohibited territory); demo key forbids production use. ADR-0016 supersedes ADR-0010: place details from the Maps URL + Nominatim reverse geocoding; updated architecture, Phase 1 plan | Verify feature id and Nominatim address keys against real fixtures in S2 |
| 2026-10-15 | S0 code: pnpm + Turborepo monorepo (shared, db, ai, ingest, infra, web), base tsconfig/ESLint/Vitest, CDK app with empty IngestStack, minimal Next.js app, GitHub Actions CI; `pnpm check` green locally (cold, 3×) | Owner account checklist (S0 Task 0), push + PR to see CI green, then tick S0 |
| 2026-10-16 | S0 finished: owner set up accounts and the 5 SSM parameters, CI green on GitHub, PR #3 merged. Follow-ups: typed env (`packages/shared`: `parseEnv`, `appEnvShape`, `.env.example`), CI `next build` step + job timeout, `.gitattributes`, removed the temporary `SHARED_PACKAGE` export | Carried into S1: remove the `validateAgainstDefaultRules` override in `infra/lib/ingest-stack.test.ts` once the stack has a resource; add `@angiday/db` to web `transpilePackages` when web imports it; agree the web-login env var names (proposed in `.env.example`); AWS account items were confirmed by the owner, not re-verified by Claude |
| 2026-10-16 | S1 done: web login env vars + per-runtime `loadAppEnv` subsets; Maps URL parser (pin-over-viewport, NFC, real owner fixtures); Telegram update schema + ingest-job routing; `@angiday/db` (client, groups/places/telegram_updates repos, indexes, `mongodb-memory-server-core` tests); ingest Lambda adapters (SSM env loader, Telegram API client, manual-redirect Maps link resolver); webhook + worker Lambda handlers (SQS partial batch failures, idempotent save+reply); CDK `IngestStack` (SQS+DLQ, 2 ARM64 Lambdas, Function URL, least-privilege IAM) deployed to `ap-southeast-1`; `seed:group`/`set-webhook` scripts; web login + place list. Full demo confirmed: real Maps link in the "Lưu quán" topic → bot replied "Đã lưu: …" → place visible on `http://localhost:3000` after login. Fixed along the way: two owner setup mistakes from S0 (SSM `/angiday/allowed-chat-ids` was missing its leading `-`; SSM `/angiday/mongodb-uri` had no database name, so the worker was reading the Atlas driver's default `test` db) — both corrected via `aws ssm put-parameter --overwrite`, values never printed. Also hit and worked around a Node.js v24.13+ Windows regression ([nodejs/node#61448](https://github.com/nodejs/node/issues/61448)) that breaks `mongodb+srv://` SRV DNS lookups locally; the owner's local `.env` now uses the standard (non-SRV) connection string, SSM (used by the Lambdas, which run on Linux) is unaffected. Final whole-branch review (Opus, read-only): 1 Important (fixed — `MONGODB_URI` now requires a database name by schema, so the "test" db mistake can't recur silently), 14 Minor deferred, 8 declined-to-judge items confirmed out of scope. PR #5 merged to `main` by the owner | Vercel deploy (S1 Task 12) deferred at the owner's request — web app only verified locally so far, not yet reachable by the other group member. If Atlas ever rotates the shard hostnames, the owner's local non-SRV `MONGODB_URI` needs a fresh standard connection string from Atlas. Deferred review minors to pick up opportunistically (not blocking any phase): concurrent duplicate delivery can still double-reply (no claim lease); a temporary Google error (429/`/sorry/`) is treated as permanently unreadable; `extractMapsUrl` doesn't strip smart quotes or match links missing `https://`; worker's worst-case latency can approach its 30s timeout; `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_ALLOWED_CHAT_IDS` have no validation against the exact S0 setup mistakes that happened (positive chat id, mismatched secret); `groupId` missing from most worker log lines (ADR-0015 asks for it on every line); web login has no rate limit; a few test gaps (caption `text_link`, `goo.gl/maps/`, resolver 4xx, webhook `getConfig` rejection, infra wildcard-grant assertion); `CLAUDE.md` Now/Next and test-location list are stale |
| 2026-10-23 | S2 slice plan written and approved by the owner ([plans/phase-1/s2-place-details-and-area.md](plans/phase-1/s2-place-details-and-area.md)): geoBoundaries instead of GADM (GADM forbids redistribution; ADR-0018 to be written in Task 0), keys `q2`/`q9`/`thu_duc` kept separate, `needs_info` deferred to S5, injected `fetch` for Nominatim. Real Nominatim fixtures captured by the owner (the local DNS resolves `nominatim.openstreetmap.org` to `127.0.0.1`) and saved, untracked, in `services/ingest/src/geo/fixtures/`; mapping rules in Task 5 fixed against them | Implementation not started: plan + fixtures are untracked on `main`; start at S2 Task 0 (branch, ADR-0018, commit). Execution method: native (`superpowers:executing-plans`) |
| 2026-10-23 | S2 done: Maps URL feature id; `extractMapsUrl` now handles curly quotes/guillemets and links without `https://` (S1 minors) plus look-alike hosts; `normalizeForSearch` + `buildPlaceSearchText`; 24 HCMC legacy districts from geoBoundaries (ADR-0018, GADM dropped for licence) with `findLegacyDistrict` behind the `@angiday/shared/legacy-district` subpath; place schema + repository gain `mapsFeatureId`, `address`, `area`, `searchText` (S1 documents read with defaults); injected-`fetch` Nominatim client that never fails the job, mapping fixed against 6 real responses (street-level address only, no POI name or house number); worker pipeline + `NOMINATIM_BASE_URL` as a plain Lambda env var; web card with address, area label and attribution footer. Deployed with CDK; demo confirmed: TÔ GHẸ link → bot replied "Đã lưu: … — Q1 · Phường Tân Định", web shows area and address. `needs_info` deferred to S5. Nominatim could not be reached from the dev machine (DNS → 127.0.0.1), fixtures were captured by the owner | Whole-branch review (Opus, read-only): 2 fixed (a ward-less/street-less Nominatim hit now logs a warn; `cancel()` on a failed response can no longer make the geocoder throw), rest deferred. Deferred minors: an SQS retry whose second geocode fails overwrites good address/ward with null; S1-era documents have no stored `searchText`/`area` (backfill before S4 queries on them); the Maps-URL look-behind still matches a host inside another URL's path/query (not exploitable); Unicode trailing punctuation (`…`, `。`, `」`, zero-width space) stays in the URL; empty-string Nominatim fields are not filtered; alley names like "Hẻm 34 …" can show a house-like number; worker `maxConcurrency: 2` can exceed Nominatim's 1 req/s; a bad polygon JSON would fail module init for every invocation. PR not yet opened. `ingest` has no zod dependency, so the Nominatim parser validates by hand. Webhook Lambda also redeploys on any `@angiday/shared` change (shared bundle) |
