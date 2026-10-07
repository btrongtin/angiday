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
