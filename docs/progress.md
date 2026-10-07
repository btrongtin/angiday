# Progress

High-level task checklist. Implementation steps live in `docs/plans/`, not here.

## Now / Next

- **Now:** Phase 0 — resolving open questions before writing the Phase 1 plan.
- **Next:** decide LLM provider, Maps API, text-only message handling, and taxonomy; then write `docs/plans/phase-1-ingest-and-list.md`.

## Phase 0 — Planning & setup

- [x] Project brief and initial decisions
- [x] Docs skeleton (CLAUDE.md, README, progress, architecture, ADRs)
- [ ] Resolve open questions (see [architecture.md → Open questions](architecture.md#open-questions))
  - [ ] LLM provider (Bedrock / Gemini / other)
  - [ ] Maps API (Google / Goong)
  - [ ] Text-only message handling (ask for link vs auto-search)
  - [ ] Cuisine & dish-type taxonomy
  - [ ] Monorepo tooling (e.g. pnpm workspaces, Turborepo)
- [ ] `git init` + first commit
- [ ] Accounts: AWS IAM user (no root), budget alert, MongoDB Atlas M0, Telegram bot (BotFather, privacy mode off), Vercel
- [ ] Write Phase 1 plan

## Phase 1 — Ingest + list/filter (end-to-end, no chat)

Goal: share a Maps link in Telegram → place appears in the web list.

**Infra**
- [ ] CDK stack: ingest Lambda, worker Lambda, SQS + DLQ, SSM params
- [ ] DLQ alarm

**Shared / DB**
- [ ] zod schemas: Place, Tag, PlaceFilters
- [ ] Vietnamese text normalization
- [ ] Repositories: groups, places, tags (all `groupId`-scoped) + indexes

**Ingest + Telegram bot**
- [ ] Webhook: verify secret token, allowlist group chat, enqueue, ack 200
- [ ] Worker: idempotency by `update_id`
- [ ] Worker: resolve Maps short link → place details
- [ ] Worker: LLM extraction + zod validation + retry on bad output
- [ ] Worker: tag name → id mapping
- [ ] Bot reply: confirm saved
- [ ] Bot ask-back flow (`needs_info` + reply-to-message)
- [ ] Failure path: mark `failed`, notify group

**Web**
- [ ] Hardcoded admin login
- [ ] Place list with cards + Maps links
- [ ] Filters: cuisine, dish type, district, price, tags, visit status, free text
- [ ] Tag management: rename, delete, assign

## Phase 2 — AI chat

- [ ] `/api/chat` with streaming + tool `search_places`
- [ ] Chat UI: streamed text, place cards, tool-running states
- [ ] Multi-turn context
- [ ] LLM 429 handling (retry with backoff)

## Backlog (later / stretch)

- [ ] Visit status & ratings via Telegram inline buttons
- [ ] "Near me" (geolocation + `2dsphere`)
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
