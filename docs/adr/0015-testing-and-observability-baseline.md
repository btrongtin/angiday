# ADR-0015: Testing and observability baseline

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
The riskiest parts of the system are parsing external input (Maps URLs, Telegram updates), non-deterministic LLM output, and an async pipeline (webhook → SQS → worker) where failures are invisible to users unless we surface them. Two users, solo developer, free tiers: the baseline must be cheap to run and maintain.

## Options
1. **Minimal:** unit tests + `console.log`. Fast to set up; async failures are hard to trace.
2. **Middle baseline** (below): unit + integration + mocked externals, structured logs with a correlation id, a few metrics and alarms.
3. **Full:** add Playwright e2e in CI, X-Ray tracing, Sentry, LLM evals in CI. Too much for the scale; evals in CI burn free-tier quota.

## Decision
Option 2.

**Testing**
- **Vitest** everywhere.
- **Unit (most tests):** Maps URL parser (real URL fixtures), Vietnamese normalization, area alias table, point-in-polygon, ingest routing, tag name → id mapping, zod schemas.
- **Integration:** repositories against a real `mongod` via `mongodb-memory-server` (indexes, `groupId` scoping, `searchPlaces`).
- **External HTTP** (Telegram, Places): **MSW** in Node.
- **LLM logic** (zod-error retry, tool loop): AI SDK mock model; never call a real model in CI.
- **Prompt quality:** `pnpm eval:extract` runs 15–20 real sample messages against the real model; run manually when prompts change, not in CI.
- **Infra:** CDK `Template` assertions (queue has DLQ, alarms exist, Lambda permissions).
- **Web:** Testing Library for key components (filters). One Playwright smoke test (login → list → filter) in Phase 2.
- **CI:** GitHub Actions runs `turbo lint typecheck test` on every PR. Vercel deploys web from git. CDK deploys manually in Phase 1 (GitHub Actions + OIDC to AWS is backlog).

**Observability**
- **Powertools for AWS Lambda (TypeScript)** Logger: JSON logs; every line carries `updateId` (correlation id), `groupId`, `route`.
- Powertools Metrics (EMF): `PlaceSaved`, `PlaceFailed`, `LlmRetry`, `LlmTokens`, `Llm429`.
- Alarms → SNS → email: DLQ has messages; worker `Errors > 0` over 5 minutes.
- CloudWatch log retention: 14 days.
- Web: Vercel's built-in logs (Sentry is backlog).
- In-product: admin filter for `ingestStatus = failed | needs_info`.
- No X-Ray in Phase 1.

## Consequences
- CI is deterministic and free (no real LLM or API calls).
- One `updateId` filter in CloudWatch Logs Insights shows a message's full path.
- Prompt regressions are caught only when someone runs the eval; acceptable at this scale.
- X-Ray, Sentry, Playwright in CI and automated CDK deploys can be added later without changing code structure.
