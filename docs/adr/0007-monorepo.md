# ADR-0007: Monorepo

- **Status:** Accepted
- **Date:** 2026-10-07

## Context
The system has several deployables (Next.js app, Lambdas, CDK, later NestJS) that share zod schemas and DB access code. Most development is agent-assisted across many sessions, and the project is reviewed as a portfolio piece.

## Options
1. **Multiple repos.** Clear boundaries, but shared code needs publishing/versioning, and cross-cutting changes span several PRs.
2. **Monorepo with workspace packages.**

## Decision
Use a single monorepo:

```
apps/web  services/ingest  infra  packages/shared  packages/db  (later) apps/api
```

## Consequences
- One context for agents and reviewers; a change to a schema and all its consumers lands in one commit.
- Shared packages are consumed directly via workspaces, with no publishing.
- Workspace tooling and per-package builds must be set up (tool choice is still open, e.g. pnpm workspaces ± Turborepo).
- Lambda bundling must include workspace packages (e.g. esbuild via CDK `NodejsFunction`).
