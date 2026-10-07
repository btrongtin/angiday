# AnGiDay

Restaurant saving & search for a small group (2 people for now). Users share Google Maps links into a Telegram group; a bot extracts structured place data with an LLM and stores it. A web app lets them browse/filter places and ask an AI chatbot.

**Current phase:** Phase 0 — planning & setup. See [docs/progress.md](docs/progress.md) → "Now / Next".

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
packages/db       Mongo client + repositories (used by web and worker)
apps/api          (later) NestJS — API migrates here
```

## Commands

_TBD once the monorepo is scaffolded._

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

## Glossary (Vietnamese → code)

| Vietnamese | Code |
|---|---|
| quán | `place` |
| ẩm thực (Việt, Hoa, Hàn…) | `cuisine` |
| kiểu món (chiên, nước, nướng…) | `dishType` |
| món nổi bật | `highlights` |
| tầm giá | `priceRange` |
| quận / khu vực | `district` |
| muốn thử / đã ăn | `visitStatus`: `want_to_try` / `visited` |
| nhóm | `group` (tenant) |
