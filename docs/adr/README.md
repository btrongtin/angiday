# Architecture Decision Records

One file per decision. An accepted ADR's decision is never edited. To change course, write a new ADR and mark the old one `Superseded by ADR-XXXX`.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-telegram-as-ingest-channel.md) | Telegram as the ingest channel | Accepted |
| [0002](0002-group-as-tenant.md) | Group as the tenant | Accepted |
| [0003](0003-mongodb-over-dynamodb.md) | MongoDB Atlas over DynamoDB | Accepted |
| [0004](0004-hybrid-aws-ingest-nextjs-web.md) | Hybrid: AWS for ingest, Next.js for web | Accepted |
| [0005](0005-api-in-nextjs-nestjs-later.md) | API in Next.js now, NestJS later | Accepted |
| [0006](0006-tag-registry-with-ids.md) | Per-group tag registry referenced by id | Accepted |
| [0007](0007-monorepo.md) | Monorepo | Accepted |
| [0008](0008-explicit-add-command-for-text-only.md) | Explicit `/add` command for text-only messages | Accepted |
| [0009](0009-gemini-via-ai-sdk.md) | Gemini (free tier) via the Vercel AI SDK | Accepted |
| [0010](0010-google-places-api.md) | Google Places API (New) for place details | Superseded by 0016 |
| [0011](0011-telegram-chat-via-forum-topics.md) | AI chat in Telegram via forum topics | Accepted |
| [0012](0012-cuisine-dishtype-price-taxonomy.md) | Cuisine, dish type and price range taxonomy | Accepted |
| [0013](0013-area-legacy-district-from-polygons.md) | Area model — legacy district derived from polygons | Accepted |
| [0014](0014-pnpm-turborepo-jit-packages.md) | pnpm workspaces + Turborepo, Just-in-Time internal packages | Accepted |
| [0015](0015-testing-and-observability-baseline.md) | Testing and observability baseline | Accepted (MSW line partially superseded by 0017) |
| [0016](0016-place-details-from-url-and-nominatim.md) | Place details from the Maps URL + OpenStreetMap reverse geocoding | Accepted |
| [0017](0017-inject-fetch-for-http-tests.md) | Inject `fetch` for HTTP tests instead of MSW | Accepted |
| [0018](0018-district-polygons-from-geoboundaries.md) | District polygons from geoBoundaries instead of GADM | Accepted |

## Template

```markdown
# ADR-NNNN: Title

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD

## Context
What problem or constraint forces a decision?

## Options
1. **Option A**: pros / cons
2. **Option B**: pros / cons

## Decision
What we chose, in one or two sentences.

## Consequences
What becomes easier, what becomes harder, what we accept.
```
