# AnGiDay

Restaurant saving & search for a small group (2 people for now). Users share Google Maps links into a Telegram group; a bot extracts structured place data with an LLM and stores it. A web app lets them browse/filter places and ask an AI chatbot.

**Current phase:** Phase 1 — ingest + list (S2 done; next: slice S3). Plan: [docs/plans/phase-1-ingest-and-list.md](docs/plans/phase-1-ingest-and-list.md). See [docs/progress.md](docs/progress.md) → "Now / Next".

## Docs map

| File | What it holds |
|---|---|
| [docs/progress.md](docs/progress.md) | Now/Next, phase checklists, session log. **Read first every session.** |
| [docs/architecture.md](docs/architecture.md) | Modules, how they interact, data flows, data model intent |
| [docs/adr/](docs/adr/README.md) | Architecture Decision Records (why we chose X) |
| `docs/plans/` | Detailed implementation plans per phase/feature |
| [README.md](README.md) | Public-facing overview for portfolio readers |

## Repo layout (planned — monorepo)

```
apps/web          Next.js: UI + Route Handlers (API lives here for now)
services/ingest   AWS Lambdas: Telegram webhook (ingest) + worker
infra/            AWS CDK
packages/shared   zod schemas, taxonomy enums, Vietnamese text normalization
packages/ai       AI SDK model config (getModel), prompts, extraction
packages/db       Mongo client + repositories (used by web and worker)
apps/api          (later) NestJS — API migrates here
```

## Commands

Tooling: pnpm workspaces + Turborepo, Just-in-Time internal packages ([ADR-0014](docs/adr/0014-pnpm-turborepo-jit-packages.md)). Node 24, pnpm via `packageManager`.

```bash
pnpm install                                  # install all workspaces
pnpm check                                    # turbo lint + typecheck + test (what CI runs)
pnpm --filter @angiday/<name> test            # one workspace that has tests (shared, db, ingest, infra, web)
pnpm --filter @angiday/web dev                # web on http://localhost:3000
pnpm --filter @angiday/infra cdk synth        # CDK template → infra/cdk.out
```

Version pins: TypeScript `~6.0` (typescript-eslint peer), ESLint 9 (eslint-config-next plugins). Shared tool versions live in the `catalog` of `pnpm-workspace.yaml`.

## Conventions

- **Language:** code, comments, docs, ADRs, commit messages in **English**. Chat with the owner in **Vietnamese**.
- **Multi-tenancy:** every query and every repository function takes `groupId`. No unscoped reads.
- **Thin handlers:** Route Handlers / Lambda handlers only parse input, call `packages/*`, and format output. Business logic lives in packages (this keeps the future NestJS migration cheap — see ADR-0005).
- **Schemas:** zod in `packages/shared` is the single source of truth. Docs link to schemas; they never copy field lists.
- **Secrets:** SSM Parameter Store (AWS) / Vercel env vars. Never commit secrets or `.env` files.
- **LLM output:** always validate with zod; never trust ids produced by the LLM (see ADR-0006).

## Keeping docs current

1. Task finished → tick it in `docs/progress.md` and add a line to the session log.
2. New architectural decision, or a change to an old one → new ADR (never edit an accepted ADR's decision; supersede it). Update `docs/architecture.md` if diagrams/flows change.
3. Before starting a phase → write its plan in `docs/plans/`.
4. Keep this file short; put detail in `docs/` and link to it.

## Workflow per slice

Phases are split into vertical slices (S0, S1, …) in the phase plan. When the owner says "check progress.md and continue":

1. **Find the work:** read `docs/progress.md` → first unticked slice of the current phase → its section in the phase plan (`docs/plans/phase-N-*.md`).
2. **Skip brainstorming** when accepted ADRs + the phase plan already cover the slice. Brainstorm only for a genuinely new decision, and record it as a new ADR.
3. **No slice plan yet** → write one with `superpowers:writing-plans`, saved to `docs/plans/phase-N/sN-<name>.md` (not `docs/superpowers/`). Then stop for the owner's review; no code in the same turn.
4. **Slice plan approved** → branch `sN-<name>`, ask user to ether execute with `superpowers:executing-plans` or `/superpowers:subagent-driven-development`. Resume from the first unticked step if the plan is partly done. Before each new backend/AWS concept, explain it briefly in Vietnamese.
5. **Owner-only steps** (accounts, console clicks, secrets) → give a checklist and wait. Never ask for secret values in chat. Local setup notes: `locals/setup-guideline.md`.
6. **Finish the slice:** `superpowers:verification-before-completion` (lint/typecheck/test green, the slice's demo works) → tick the slice in `progress.md` + session-log line → update `architecture.md`/ADRs if anything changed → `superpowers:finishing-a-development-branch` (ask before commit/push/PR).
7. A slice may span several sessions; note where you stopped in the session log's "Left open" column.

## Glossary (Vietnamese → code)

| Vietnamese | Code |
|---|---|
| quán | `place` |
| ẩm thực (Việt, Hoa, Hàn…) | `cuisine` |
| kiểu món (chiên, nước, nướng…) | `dishType` |
| món nổi bật | `highlights` |
| tầm giá | `priceRange` |
| quận (cũ, trước 2025) | `area.legacyDistrict` (see ADR-0013) |
| phường (mới) / thành phố | `area.ward` / `area.city` |
| muốn thử / đã ăn | `visitStatus`: `want_to_try` / `visited` |
| nhóm | `group` (tenant) |
