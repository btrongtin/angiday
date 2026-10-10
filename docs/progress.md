# Progress

High-level task checklist. Implementation steps live in `docs/plans/`, not here.

## Now / Next

- **Now:** Phase 0 done. Phase 1 plan written.
- **Next:** Phase 1 S0 — scaffold the monorepo and create accounts (see the [plan](plans/phase-1-ingest-and-list.md)).

## Phase 0 — Planning & setup

- [x] Project brief and initial decisions
- [x] Docs skeleton (CLAUDE.md, README, progress, architecture, ADRs)
- [x] Resolve open questions (see [architecture.md → Open questions](architecture.md#open-questions))
  - [x] LLM provider → Gemini Flash free tier via AI SDK ([ADR-0009](adr/0009-gemini-via-ai-sdk.md))
  - [x] Maps API → Google Places API (New) with quota caps ([ADR-0010](adr/0010-google-places-api.md))
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

- [ ] S0 — Scaffold & accounts (~6h)
- [ ] S1 — Walking skeleton: link → name saved → bot reply → web list (~14h)
- [ ] S2 — Place details & area: Places Text Search, GADM HCMC polygons, `legacyDistrict`, `searchText` (~8h)
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
- [ ] `/add` auto-search: Places Text Search + inline buttons to pick the place (ADR-0008)
- [ ] "Near me" / "near <landmark>" (geolocation or geocoding + `2dsphere`) — decide in Phase 2 plan whether to pull in
- [ ] Telegram Mini App: open the web app inside Telegram, auth via signed `initData`
- [ ] Merge duplicates by Google `place_id`
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
