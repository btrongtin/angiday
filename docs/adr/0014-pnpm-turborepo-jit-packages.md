# ADR-0014: pnpm workspaces + Turborepo, Just-in-Time internal packages

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
ADR-0007 chose a monorepo but left the tooling open. Deployables: `apps/web` (Vercel), `services/ingest` (Lambda via CDK), `infra` (CDK); shared code in `packages/shared`, `packages/db`, `packages/ai`. Later: `apps/api` (NestJS).

Lambdas are bundled by esbuild (CDK `NodejsFunction`) and Next.js can transpile workspace packages (`transpilePackages`), so shared packages do not need their own build step.

## Options
1. **pnpm workspaces only.**
   - Pros: least config.
   - Cons: no task caching; Vercel cannot tell whether a commit affects the web app.
2. **pnpm workspaces + Turborepo.**
   - Pros: task graph and content-hash caching for lint/typecheck/test; native Vercel support (remote cache, `turbo-ignore` to skip unaffected deploys); common in the Next.js ecosystem.
   - Cons: one more tool and a small `turbo.json`.
3. **Nx.**
   - Pros: powerful, generators, NestJS plugins.
   - Cons: heavy and opinionated for ~6 packages.

## Decision
Option 2.

- pnpm workspaces; internal deps use `workspace:*`; package scope `@angiday/*`.
- Turborepo tasks: `lint`, `typecheck`, `test`, `build` (`build` depends on `^build`).
- Internal packages are **Just-in-Time**: they export TypeScript source (no build step). Consumers compile them: Next.js via `transpilePackages`, Lambdas via esbuild in `NodejsFunction`.
- One shared base `tsconfig` for the repo.
- Vercel project uses `turbo-ignore` so commits that don't touch `apps/web` or its dependencies skip the web deploy.

## Consequences
- Fast local and CI runs thanks to caching; no ordering problems between package builds.
- Internal packages cannot be published to npm as-is (not needed).
- Every package must avoid runtime features one consumer can't bundle (e.g. Next.js-only APIs in `packages/*`).
- NestJS (`apps/api`) can join later as another workspace app without changing the tooling.
