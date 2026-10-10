# Phase 1 — Ingest + list/filter

**Goal:** share a Google Maps link in the Telegram group → within seconds the bot confirms, and the place shows up in the web app with cuisine, dish type, price, area and tags, filterable.

**Not in this phase:** AI chat (Telegram or web), forum topics / `/setup`, "near <landmark>", editable taxonomy, visit ratings via Telegram buttons, duplicate merging. See [progress.md](../progress.md) → Phase 2 and Backlog.

Decisions this plan builds on: ADR-0001 … ADR-0015 ([index](../adr/README.md)).

## Definition of done

- [ ] A Maps link posted in the group is saved with name, address, coordinates, `place_id`, `area`, cuisine, dish type, price range, highlights and tags; the bot replies with a summary.
- [ ] `/add <text>` without a link triggers the ask-back flow; replying with a link completes it.
- [ ] Failures end as `failed` with a short bot notice; poison messages land in the DLQ and an email alarm fires.
- [ ] Web: login, place list, filters (cuisine, dish type, area incl. "q3"/new ward names, price, tags, visit status, free text), tag management, visit status toggle.
- [ ] CI green (`turbo lint typecheck test`); no real LLM/API calls in CI.
- [ ] README explains the project for portfolio readers; docs and progress up to date.

## Plan-level technical choices

Small choices that don't need their own ADR. If one turns out to matter, promote it to an ADR.

| Topic | Choice | Why |
|---|---|---|
| AWS region | `ap-southeast-1` (Singapore) | Closest to Vietnam |
| Webhook endpoint | **Lambda Function URL** (auth `NONE`) + Telegram `secret_token` header check in code | No API Gateway to configure or pay for; Telegram can't sign requests with IAM anyway |
| Chat allowlist | SSM parameter with allowed chat ids | Ingest stays DB-free and fast |
| Group onboarding | Script `pnpm seed:group` inserts the group (from chat id) | Single group for now; no sign-up flow |
| Webhook registration | Script calling `setWebhook` with `secret_token`, `allowed_updates: ["message"]` | Reproducible |
| SQS → worker | `batchSize: 1`, `reportBatchItemFailures`, `maxReceiveCount: 3` → DLQ, visibility timeout = 6 × worker timeout | AWS guidance; one bad message never blocks others |
| Idempotency | `telegram_updates { updateId, status: processing \| done }`; skip only when `done` | A crash after "processing" must still be retried |
| Secrets | SSM SecureString, read at cold start with caching (Powertools Parameters) | No secrets in env files or code |
| Mongo connection | Client created outside the handler (Lambda) / cached on `globalThis` (Next.js) | Reuse across invocations; avoid connection storms on Atlas M0 |
| Web auth | Credentials in Vercel env → signed httpOnly session cookie; `groupId` from env | Single group in Phase 1 |
| Web data | Server Components call `searchPlaces()`; filters live in URL search params | Shareable URLs, no client state library |
| Lambda runtime | Latest Node.js LTS supported by Lambda, ARM64 | Cheaper, faster cold start |

## Slices

Each slice is **vertical**: it ends with something you can demo end to end and is merged on its own. Write tests in the same slice as the code (see [ADR-0015](../adr/0015-testing-and-observability-baseline.md)).

Estimates assume someone strong in frontend and new to AWS/backend; they include learning time.

### S0 — Scaffold & accounts · ~6h

**Demo:** `pnpm turbo lint typecheck test` passes locally and in GitHub Actions.

- Accounts: AWS IAM user (no root) + budget alert, MongoDB Atlas M0, Telegram bot (BotFather, privacy mode off) + supergroup, Vercel, Gemini API key, Google Cloud project + billing + Places API (New) key restricted to that API with a daily quota cap (~100/day) + budget alert.
- Monorepo: pnpm workspaces, Turborepo, base `tsconfig`, ESLint, Vitest; empty `apps/web`, `services/ingest`, `infra`, `packages/{shared,db,ai}` (JIT packages, ADR-0014).
- GitHub Actions: install → `turbo lint typecheck test`.
- `.gitignore` covers `.env*`, `cdk.out`.

### S1 — Walking skeleton: link → name saved → bot reply → web list · ~14h

The thinnest path through **every** hop. Most AWS learning happens here.

**Demo:** post a Maps link → bot replies "Saved: <name>" → the name appears on the web list after login.

- `infra`: CDK stack with ingest Lambda (Function URL), SQS + DLQ, worker Lambda (SQS event source), SSM parameters, IAM least privilege. CDK assertions test (queue has DLQ, worker subscribed).
- Ingest handler: verify secret header, check chat allowlist, route **Maps link only** (other routes come later), enqueue, return 200. Powertools Logger with `updateId`.
- Worker: idempotency (`telegram_updates`); resolve short link (manual redirects, max ~5 hops); URL parser for name + coordinates (pure function, real URL fixtures); save minimal place (`ingestStatus = saved`); `sendMessage` reply.
- `packages/db`: Mongo client, `groups` and `places` repositories (`groupId` on every function), indexes; integration tests with `mongodb-memory-server`.
- Scripts: `seed:group`, `set-webhook`.
- Web: hardcoded login, place list (name + Maps link). Deploy to Vercel.

### S2 — Place details & area · ~8h

**Demo:** the saved place shows full address, `area` (e.g. "Q3 · Phường Xuân Hòa") and Google types on the web card.

- Places API (New) Text Search, location-biased to parsed coordinates, minimal field mask; fallback to the message text; no match → `needs_info` (bot asks for a better link). MSW tests.
- Area data: download GADM level-2 Vietnam, extract pre-2025 HCMC districts, simplify with `mapshaper`, commit JSON + source/licence note in `packages/shared`.
- Point-in-polygon → `area.legacyDistrict`; `area.ward` / `area.city` from `addressComponents`.
- Vietnamese text normalization → `searchText`.

### S3 — LLM extraction & tags · ~10h

**Demo:** "maps link + bún bò cay, rẻ, hợp hẹn hò" → bot replies with cuisine, dish type, price range, highlights and tags; web card shows them.

- Taxonomy enums with Vietnamese labels in `packages/shared` (ADR-0012).
- `packages/ai`: `getModel('extract')`, extraction prompt, `generateObject` with the zod schema; re-prompt with the zod error (max 2 retries). Tests with the AI SDK mock model.
- Tags: `tags` repository; map LLM tag names → ids by normalized match; create a tag only if the user wrote it (ADR-0006).
- Bot reply format with the extracted fields.
- `pnpm eval:extract`: 15–20 real sample messages, run manually.

### S4 — Web filters · ~10h

**Demo:** filter "Hàn + nướng + Q3 + < 200k", or type "q.3" / "Xuân Hòa" / "bun bo" and get the right places.

- `searchPlaces(groupId, filters)`: enums, area (alias table → `legacyDistrict`, else `searchText`), price, tags, visit status, free text; integration tests per filter.
- Area alias table (`q3`, `q.3`, `quận 3`, `quan 3`, `district 3` → `q3`; `q2`, `q9`, `thủ đức` → `thu_duc`) with unit tests.
- Filter UI bound to URL search params; place cards (cuisine, dish, price, area, tags, Maps link). Testing Library tests for the filter form.
- Default list hides `needs_info` and `failed`.

### S5 — `/add` and ask-back · ~6h

**Demo:** `/add bún bò cô Ba Q3` → bot asks for a link → reply with the link → bot confirms the saved place.

- Ingest routing for `/add`, `/add@bot`, `/add` alone (usage help), replies to bot messages, drop everything else (ADR-0008). Unit tests for the router with fixture updates.
- Worker: create `needs_info` place with the user's text as hints; store the bot prompt `message_id`; on reply, find the place by `reply_to_message.message_id` (scoped by `groupId`), merge, continue from S2's Maps step; reply without a link → ask again.

### S6 — Failure path & observability · ~6h

**Demo:** force an error (e.g. bad Places key) → place marked `failed`, bot posts a short notice, after 3 attempts the message is in the DLQ and an alarm email arrives; Logs Insights query by `updateId` shows the whole path.

- Mark `failed` + bot notice on final failure.
- Powertools Metrics (EMF): `PlaceSaved`, `PlaceFailed`, `LlmRetry`, `LlmTokens`, `Llm429`.
- Alarms → SNS → email: DLQ not empty; worker `Errors > 0` over 5 min. Log retention 14 days.
- Web admin filter: `failed` / `needs_info`.

### S7 — Tag management & visit status · ~6h

**Demo:** rename "hen ho" → "hẹn hò" once and every place updates; delete a tag; mark a place "đã ăn".

- Tag page: list, rename, delete (dangling ids ignored on read), assign/unassign on a place.
- Visit status toggle (`want_to_try` / `visited`) on the place card.
- Route Handlers / Server Actions stay thin; logic in `packages/db`.

### S8 — Wrap-up · ~3h

- README for portfolio readers: what it does, architecture diagram, ADR highlights, demo GIF.
- Update `architecture.md` if anything drifted; tick `progress.md`; session log.

## Totals and pacing

| Slice | Hours |
|---|---|
| S0 Scaffold & accounts | 6 |
| S1 Walking skeleton | 14 |
| S2 Place details & area | 8 |
| S3 LLM extraction & tags | 10 |
| S4 Web filters | 10 |
| S5 `/add` and ask-back | 6 |
| S6 Failure path & observability | 6 |
| S7 Tag management & visit status | 6 |
| S8 Wrap-up | 3 |
| **Sum** | **69** |
| **With ~20% buffer** | **~83** |

At ~10 h/week that is ~8 weeks; at ~15 h/week, ~5–6 weeks.

## Order

S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8.

Why this order: S1 de-risks the unfamiliar part (AWS + Telegram + async pipeline) first. S2–S4 make the data good enough to be useful. S5–S7 are UX and robustness on top of a working core. The DLQ and the Powertools Logger already exist from S1, so the system is never "blind" before S6.

## If we fall behind: cut in this order

| # | Cut | Fallback | Saves |
|---|---|---|---|
| 1 | Tag rename/delete UI (S7) | Tags still shown and filterable; edit later | ~4h |
| 2 | `eval:extract` script (S3) | Check prompts by hand with a few messages | ~2h |
| 3 | Custom metrics (S6) | Keep Logger, DLQ alarm, worker error alarm | ~2h |
| 4 | Stateful ask-back (S5) | `/add` without a link just replies "please send a Maps link" (no `needs_info` state) | ~4h |
| 5 | Free-text and tag filters (S4) | Keep enum, area, price and visit-status filters | ~3h |

**Never cut:** S1 end-to-end path, idempotency, `groupId` scoping, zod validation of LLM output, DLQ + alarm, Places lookup, area derivation.

## Risks

| Risk | Mitigation |
|---|---|
| Google changes the Maps URL format | Fixture tests fail loudly; Text Search fallback on message text |
| Gemini free-tier 429s | SQS retry with backoff; `Llm429` metric shows how often |
| Places API cost surprise | Key restricted to one API, daily quota cap, budget alert |
| AWS learning curve in S1 | S1 is deliberately thin; the estimate includes learning; ask for a concept walkthrough before each new AWS piece |
| Atlas M0 connection limits from Lambda | Reuse the client across invocations; worker concurrency is tiny |
| GADM boundaries differ slightly from what users expect | Accept; users can still search by ward/address text |

## Working rhythm per slice

1. Short branch per slice (`s1-walking-skeleton`, …).
2. Before coding a slice, write its task-level steps (files, tests) in a section at the end of this file or a sibling file.
3. Code + tests, CI green, deploy, demo.
4. Tick `progress.md`, add a session-log line, update docs/ADRs if a decision changed.
