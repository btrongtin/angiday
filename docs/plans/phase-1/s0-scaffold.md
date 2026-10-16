# S0 — Scaffold & Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the owner follows along to learn; use subagents only if asked — see [CLAUDE.md](../../../CLAUDE.md) → "Workflow per slice"). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An empty but fully wired monorepo where `pnpm turbo run lint typecheck test` passes locally and in GitHub Actions, plus all external accounts ready for S1.

**Architecture:** pnpm workspaces + Turborepo. Internal packages are Just-in-Time: their `exports` point at TypeScript source and consumers compile them (Next.js `transpilePackages`, esbuild for Lambdas, Vitest for tests). Each workspace owns its `lint` / `typecheck` / `test` scripts; Turbo runs them with caching, using a `transit` task so a change in a dependency invalidates its dependents' cache.

**Tech Stack:** Node 24, pnpm 12.11.2 (catalogs), Turborepo 2.11, TypeScript 6.0, ESLint 9 (flat config) + typescript-eslint 8, Vitest 5, Next.js 16.4 / React 19.3, AWS CDK 2 (`aws-cdk-lib` 2.273, CLI 2.1145), tsx, GitHub Actions.

**Spec:** [Phase 1 plan → S0](../phase-1-ingest-and-list.md#s0--scaffold--accounts--6h), [ADR-0014](../../adr/0014-pnpm-turborepo-jit-packages.md) (tooling), [ADR-0015](../../adr/0015-testing-and-observability-baseline.md) (testing/CI). Account steps: `locals/setup-guideline.md` (owner's local notes, gitignored).

## Global Constraints

- Node **24** (`.nvmrc` = `24`, root `engines.node` = `>=24`). pnpm pinned via root `"packageManager": "pnpm@12.11.2"`.
- TypeScript **`~6.0.3`**, not 7.x: `typescript-eslint@8.71` has peer `typescript >=4.8.4 <6.1.0`.
- ESLint **`^9.39.5`**, not 10.x: `eslint-config-next@16.4.1` pulls `eslint-plugin-react@7.37`, `eslint-plugin-import@2.32`, `eslint-plugin-jsx-a11y@6.10`, whose peers stop at ESLint 9.
- Shared dev-tool versions (`typescript`, `eslint`, `vitest`, `@types/node`) live once in the pnpm **catalog** in `pnpm-workspace.yaml`; packages reference them as `"catalog:"`.
- Package scope `@angiday/*`; internal deps use `"workspace:*"`; internal packages export `./src/index.ts` and have **no build step** (ADR-0014).
- AWS region `ap-southeast-1` everywhere.
- Tests never touch the network, a real LLM, or AWS (ADR-0015).
- Code, comments, docs, commit messages in English. Before each new backend/AWS concept (Turborepo caching, CDK app/stack/synth, CI), explain it briefly to the owner in Vietnamese.
- **Never** `git add -A` or `git add .`: a real `.env` exists in the repo root. Stage explicit paths only.
- Work on branch `s0-scaffold`. Commit at the end of each task after showing the owner the diff; push / PR only through `superpowers:finishing-a-development-branch` with the owner's approval.

## Review Focus

1. **A gate that cannot fail** — a lint/typecheck/test setup that matches zero files passes vacuously. Expect each gate to go red on a deliberate error. Pinned in Task 1 Step 9.
2. **Stale Turbo cache across packages** — editing `packages/shared` must re-run dependents' `typecheck`/`test`, not replay a cached green. Pinned in Task 2 Step 7.
3. **CI install differs from local** — a stale lockfile or a build script blocked by pnpm's `strictDepBuilds` passes on the owner's machine but fails in CI. Pinned in Task 5 Steps 3–4.
4. **Secrets slipping into git** — `.env`, `apps/web/.env.local`, `cdk.out/` must stay ignored while `.env.example` stays committable. Pinned in Task 5 Step 2.
5. **JIT package not compiled by a real consumer** — `tsc` can pass while `next build` fails on raw TypeScript from `node_modules`. Pinned in Task 4 Step 7.

---

## File map

```
.nvmrc                          Node version for local + CI
package.json                    root: turbo scripts, root dev tools for the shared ESLint config
pnpm-workspace.yaml             workspace globs, catalog, allowBuilds
turbo.json                      task graph (transit / lint / typecheck / test / build)
tsconfig.base.json              one base tsconfig for every workspace
eslint.config.mjs               base flat config (all workspaces except apps/web)
.gitignore                      + next-env.d.ts, *.tsbuildinfo
.github/workflows/ci.yml        install → turbo lint typecheck test

packages/shared/                @angiday/shared — JIT; wiring export + test (S1 replaces with real schemas)
packages/db/                    @angiday/db — JIT, empty (S1 adds Mongo client + repositories)
packages/ai/                    @angiday/ai — JIT, empty (S3 adds getModel + extraction)
services/ingest/                @angiday/ingest — wiring test only (S1 adds webhook + worker handlers)
infra/                          @angiday/infra — CDK app with an empty IngestStack + test
apps/web/                       @angiday/web — minimal Next.js App Router page
```

---

### Task 0: Branch and owner-only account setup

**Files:** none (git + owner actions)

**Interfaces:**
- Consumes: nothing.
- Produces: branch `s0-scaffold`; accounts and SSM parameters needed from S1 on.

- [x] **Step 1: Create the branch**

```bash
git switch -c s0-scaffold
git status --short
```

Expected: ` M CLAUDE.md` (the owner's "Workflow per slice" section) and `?? docs/plans/phase-1/`. Nothing else.

- [x] **Step 2: Commit the plan and the workflow section (ask the owner first)**

```bash
git add CLAUDE.md docs/plans/phase-1/s0-scaffold.md
git commit -m "docs: add slice workflow and S0 scaffold plan"
```

- [x] **Step 3: Hand the owner the account checklist and wait**

Owner-only (never paste secret values in chat). Follow `locals/setup-guideline.md` sections 0–6. These can run in parallel with Tasks 1–5; the slice is done only when both are.

- [x] Node 24, pnpm, AWS CLI ≥ 2.32 installed
- [x] AWS: root MFA, Zero-spend budget + $5 budget, Free Tier alerts
- [x] AWS: IAM user `tin-admin` with MFA; `aws sts get-caller-identity --profile angiday` ends in `user/tin-admin`
- [x] CDK bootstrap: stack `CDKToolkit` is `CREATE_COMPLETE` in `ap-southeast-1`
- [x] MongoDB Atlas M0 in Singapore, DB user, network `0.0.0.0/0`, connection string saved
- [x] Telegram bot: privacy **disabled**, commands set; supergroup with Topics on; chat id (`-100…`) taken **after** enabling Topics
- [x] Webhook secret generated (`openssl rand -hex 32`)
- [x] Gemini API key in a project **without** billing
- [x] Vercel account linked to GitHub (project import happens in S1)
- [x] SSM: 5 parameters under `/angiday/` (`aws ssm get-parameters-by-path --path /angiday --profile angiday --region ap-southeast-1` lists 5 names)

Expected: the owner confirms each box. Record any box left open in the session log's "Left open" column.

---

### Task 1: Root tooling + `@angiday/shared` (first package with a test)

Before starting, explain in Vietnamese: pnpm workspaces vs. catalog, what Turborepo caches and why the `transit` task exists, and what "Just-in-Time package" means.

**Files:**
- Create: `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`
- Modify: `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `@angiday/shared` exporting `SHARED_PACKAGE: '@angiday/shared'` (S0 wiring only; S1 replaces it with real schemas and deletes the wiring tests). Root scripts `pnpm lint | typecheck | test | check`. Base config files every later task extends: `tsconfig.base.json`, `eslint.config.mjs`.

- [x] **Step 1: Write root config files**

`.nvmrc`:

```
24
```

`package.json`:

```json
{
  "name": "angiday",
  "private": true,
  "packageManager": "pnpm@12.11.2",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "check": "turbo run lint typecheck test"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.5",
    "eslint": "catalog:",
    "globals": "^17.13.0",
    "turbo": "^2.11.8",
    "typescript": "catalog:",
    "typescript-eslint": "^8.71.2"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - services/*
  - packages/*
  - infra

catalog:
  '@types/node': ^24.19.2
  eslint: ^9.39.5
  typescript: ~6.0.3
  vitest: ^5.0.5

# pnpm 11+ fails install on dependency build scripts that are not listed here.
allowBuilds:
  esbuild: true
  sharp: true
  unrs-resolver: true
```

`turbo.json`:

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "globalDependencies": ["tsconfig.base.json", "eslint.config.mjs"],
  "tasks": {
    "transit": {
      "dependsOn": ["^transit"]
    },
    "lint": {
      "dependsOn": ["transit"]
    },
    "typecheck": {
      "dependsOn": ["transit"]
    },
    "test": {
      "dependsOn": ["transit"]
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "cdk.out/**"]
    }
  }
}
```

`tsconfig.base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  }
}
```

`eslint.config.mjs`:

```js
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Base config for every workspace except apps/web (it has its own Next.js config).
export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/cdk.out/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/next-env.d.ts',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
]);
```

Append to `.gitignore` under `# Build output`:

```
next-env.d.ts
*.tsbuildinfo
```

- [x] **Step 2: Write `@angiday/shared` package files (no source yet)**

`packages/shared/package.json`:

```json
{
  "name": "@angiday/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/shared/tsconfig.json` (no `node` types: this package also runs in the browser):

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [x] **Step 3: Install**

```bash
pnpm install
```

Expected: completes and writes `pnpm-lock.yaml`. If it fails with `ERR_PNPM_IGNORED_BUILDS`, read the listed package names, add each to `allowBuilds` in `pnpm-workspace.yaml` (`true` only for packages that need a native binary step, e.g. `esbuild`; `false` otherwise), tell the owner which ones and why, and re-run.

- [x] **Step 4: Write the failing test**

`packages/shared/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE } from './index';

// S0 wiring check: proves Vitest runs TypeScript source in a JIT package.
// Delete in S1 once real schemas are exported.
describe('@angiday/shared', () => {
  it('exports its package name', () => {
    expect(SHARED_PACKAGE).toBe('@angiday/shared');
  });
});
```

- [x] **Step 5: Run it to verify it fails**

```bash
pnpm --filter @angiday/shared test
```

Expected: FAIL — cannot resolve `./index` (file does not exist).

- [x] **Step 6: Write the minimal implementation**

`packages/shared/src/index.ts`:

```ts
// S0 wiring export. S1 replaces it with zod schemas (Place, Tag, …).
export const SHARED_PACKAGE = '@angiday/shared';
```

- [x] **Step 7: Run it to verify it passes**

```bash
pnpm --filter @angiday/shared test
```

Expected: PASS, 1 test.

- [x] **Step 8: Run the full gate through Turbo**

```bash
pnpm check
```

Expected: `@angiday/shared:lint`, `:typecheck`, `:test` all succeed; summary `3 successful, 3 total`. Run it again: `FULL TURBO` (all cache hits).

- [x] **Step 9: Prove each gate can fail (Review Focus 1)**

Temporarily append to `packages/shared/src/index.ts`:

```ts
const unused: number = 'not a number';
```

Run `pnpm check`. Expected: `@angiday/shared:lint` fails (`no-unused-vars`) and `@angiday/shared:typecheck` fails (`TS2322`). Remove the line.

Temporarily change the assertion in `index.test.ts` to `.toBe('wrong')`, run `pnpm --filter @angiday/shared test`. Expected: FAIL. Revert it.

Run `pnpm check`. Expected: green again.

- [x] **Step 10: Commit**

```bash
git add .nvmrc package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json eslint.config.mjs .gitignore packages/shared
git status --short
git commit -m "chore: scaffold pnpm + turbo workspace with @angiday/shared"
```

Before committing, `git status --short` must show no `.env` and no `node_modules`.

---

### Task 2: `@angiday/db`, `@angiday/ai`, `@angiday/ingest` skeletons

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/index.ts`
- Create: `packages/ai/package.json`, `packages/ai/tsconfig.json`, `packages/ai/src/index.ts`
- Create: `services/ingest/package.json`, `services/ingest/tsconfig.json`
- Test: `services/ingest/src/workspace-wiring.test.ts`

**Interfaces:**
- Consumes: `SHARED_PACKAGE` from `@angiday/shared` (Task 1).
- Produces: workspaces `@angiday/db`, `@angiday/ai`, `@angiday/ingest` with `lint` + `typecheck` (+ `test` for ingest). No runtime exports yet.

- [x] **Step 1: Write `@angiday/db`**

`packages/db/package.json`:

```json
{
  "name": "@angiday/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src"]
}
```

`packages/db/src/index.ts`:

```ts
// Mongo client and repositories arrive in S1.
export {};
```

- [x] **Step 2: Write `@angiday/ai`**

`packages/ai/package.json`:

```json
{
  "name": "@angiday/ai",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:"
  }
}
```

`packages/ai/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src"]
}
```

`packages/ai/src/index.ts`:

```ts
// getModel() and extraction arrive in S3.
export {};
```

- [x] **Step 3: Write `@angiday/ingest` package files**

`services/ingest/package.json`:

```json
{
  "name": "@angiday/ingest",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@angiday/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`services/ingest/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [x] **Step 4: Write the cross-package wiring test**

`services/ingest/src/workspace-wiring.test.ts`:

```ts
import { SHARED_PACKAGE } from '@angiday/shared';
import { describe, expect, it } from 'vitest';

// S0 wiring check: a service imports a JIT package by name through pnpm workspaces.
// Delete in S1 once handlers import real code from @angiday/shared.
describe('workspace wiring', () => {
  it('resolves @angiday/shared from TypeScript source', () => {
    expect(SHARED_PACKAGE).toBe('@angiday/shared');
  });
});
```

- [x] **Step 5: Run it before linking to verify it fails**

```bash
pnpm --filter @angiday/ingest test
```

Expected: FAIL — `vitest` not found or `Failed to resolve import "@angiday/shared"` (the workspace is not installed yet).

- [x] **Step 6: Install and run the gate**

```bash
pnpm install
pnpm check
```

Expected: install links the three new workspaces; `pnpm check` runs lint+typecheck for db, ai, ingest, shared and test for shared, ingest; all succeed.

- [x] **Step 7: Prove the Turbo cache follows dependencies (Review Focus 2)**

```bash
pnpm check
```

Expected: `FULL TURBO`. Now add a comment line `// cache probe` at the end of `packages/shared/src/index.ts` and run:

```bash
pnpm turbo run typecheck test --filter=@angiday/ingest
```

Expected: `@angiday/ingest:typecheck` and `@angiday/ingest:test` show `cache miss, executing`. Remove the comment line, run `pnpm check`, expect green.

If they show `cache hit, replaying logs` instead, the `transit` task in `turbo.json` is wrong — fix it before moving on.

- [x] **Step 8: Commit**

```bash
git add packages/db packages/ai services/ingest pnpm-lock.yaml
git status --short
git commit -m "chore: add db, ai and ingest workspace skeletons"
```

---

### Task 3: `@angiday/infra` — CDK app with an empty `IngestStack`

Before starting, explain in Vietnamese: CDK App → Stack → Construct, what `cdk synth` produces (a CloudFormation template in `cdk.out/`), and why no AWS credentials are needed to synth or test.

**Files:**
- Create: `infra/package.json`, `infra/tsconfig.json`, `infra/cdk.json`, `infra/bin/angiday.ts`, `infra/lib/config.ts`, `infra/lib/ingest-stack.ts`
- Test: `infra/lib/ingest-stack.test.ts`

**Interfaces:**
- Consumes: root `tsconfig.base.json`, `eslint.config.mjs` (Task 1).
- Produces: `AWS_REGION = 'ap-southeast-1'` from `infra/lib/config.ts`; `class IngestStack extends Stack` from `infra/lib/ingest-stack.ts` (S1 adds the Lambdas, SQS, DLQ, SSM reads here); CDK app entry `infra/bin/angiday.ts` creating stack id `AngidayIngest`; script `pnpm --filter @angiday/infra cdk <cmd>`.

- [x] **Step 1: Write package files**

`infra/package.json` (no `"type": "module"`: CDK libraries are CommonJS, and tsx runs the app as CommonJS without ESM interop issues):

```json
{
  "name": "@angiday/infra",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "cdk": "cdk"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.273.0",
    "constructs": "^10.8.1"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "aws-cdk": "^2.1145.0",
    "eslint": "catalog:",
    "tsx": "^4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`infra/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["bin", "lib"]
}
```

- [x] **Step 2: Write `cdk.json` with the current feature flags**

Generate a throwaway CDK project in the scratchpad (outside the repo) to copy its recommended feature flags:

```bash
mkdir -p "$SCRATCH/cdk-flags" && cd "$SCRATCH/cdk-flags"
pnpm dlx aws-cdk@2.1145.0 init app --language typescript --generate-only
```

(`$SCRATCH` = the session scratchpad directory.) Open the generated `cdk.json` and copy its whole `"context"` object. Create `infra/cdk.json`:

```json
{
  "app": "tsx bin/angiday.ts",
  "output": "cdk.out",
  "context": {}
}
```

and replace `{}` with the copied `"context"` object verbatim. Do not copy its `"app"` or `"watch"` keys.

- [x] **Step 3: Install**

```bash
pnpm install
```

Expected: `aws-cdk-lib`, `constructs`, `aws-cdk`, `tsx` installed for `@angiday/infra`. Handle `ERR_PNPM_IGNORED_BUILDS` as in Task 1 Step 3.

- [x] **Step 4: Write the failing test**

`infra/lib/ingest-stack.test.ts`:

```ts
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AWS_REGION } from './config';
import { IngestStack } from './ingest-stack';

describe('IngestStack', () => {
  it('synthesizes in the Singapore region', () => {
    const app = new App();
    const stack = new IngestStack(app, 'TestIngest', { env: { region: AWS_REGION } });

    expect(stack.region).toBe('ap-southeast-1');
    expect(() => Template.fromStack(stack)).not.toThrow();
  });
});
```

- [x] **Step 5: Run it to verify it fails**

```bash
pnpm --filter @angiday/infra test
```

Expected: FAIL — cannot resolve `./config` / `./ingest-stack`.

- [x] **Step 6: Write the minimal implementation**

`infra/lib/config.ts`:

```ts
// Closest AWS region to Vietnam (Phase 1 plan → plan-level technical choices).
export const AWS_REGION = 'ap-southeast-1';
```

`infra/lib/ingest-stack.ts`:

```ts
import { Stack } from 'aws-cdk-lib';

// Ingest pipeline: webhook Lambda (Function URL), SQS + DLQ, worker Lambda. Resources arrive in S1.
export class IngestStack extends Stack {}
```

`infra/bin/angiday.ts`:

```ts
import { App } from 'aws-cdk-lib';
import { AWS_REGION } from '../lib/config';
import { IngestStack } from '../lib/ingest-stack';

const app = new App();

new IngestStack(app, 'AngidayIngest', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: AWS_REGION },
});
```

- [x] **Step 7: Run it to verify it passes**

```bash
pnpm --filter @angiday/infra test
```

Expected: PASS, 1 test.

- [x] **Step 8: Synthesize locally**

```bash
pnpm --filter @angiday/infra cdk synth
```

Expected: prints a YAML template for `AngidayIngest` (only CDK metadata / bootstrap-version entries) and writes `infra/cdk.out/`. No AWS credentials needed. Then:

```bash
git status --short infra
```

Expected: `infra/cdk.out/` does **not** appear (ignored).

- [x] **Step 9: Run the gate**

```bash
pnpm check
```

Expected: all tasks succeed, including `@angiday/infra:lint`, `:typecheck`, `:test`.

- [x] **Step 10: Commit**

```bash
git add infra pnpm-lock.yaml
git status --short
git commit -m "chore: add CDK app with empty IngestStack"
```

---

### Task 4: `@angiday/web` — minimal Next.js app

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/eslint.config.mjs`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `SHARED_PACKAGE` from `@angiday/shared` (Task 1).
- Produces: workspace `@angiday/web` with `dev`, `build`, `start`, `lint`, `typecheck`; `next.config.ts` with `transpilePackages` (S1 adds `@angiday/db`, later `@angiday/ai`). No `test` script yet (Testing Library arrives in S4).

- [x] **Step 1: Write package files**

`apps/web/package.json`:

```json
{
  "name": "@angiday/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "next typegen && tsc --noEmit"
  },
  "dependencies": {
    "@angiday/shared": "workspace:*",
    "next": "16.4.1",
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "eslint": "catalog:",
    "eslint-config-next": "16.4.1",
    "typescript": "catalog:"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2023"],
    "jsx": "react-jsx",
    "types": ["node"],
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Internal packages export TypeScript source; Next compiles them (ADR-0014).
  transpilePackages: ['@angiday/shared'],
};

export default nextConfig;
```

`apps/web/eslint.config.mjs` (own config: Next's presets already include typescript-eslint, so it does not extend the root config):

```js
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
```

- [x] **Step 2: Write the app**

`apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AnGiDay',
  description: 'Quán đã lưu của nhóm',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/app/page.tsx` (the import is the JIT wiring check; S1 replaces this page with the place list):

```tsx
import { SHARED_PACKAGE } from '@angiday/shared';

export default function HomePage() {
  return (
    <main>
      <h1>AnGiDay</h1>
      <p>Scaffold OK ({SHARED_PACKAGE})</p>
    </main>
  );
}
```

- [x] **Step 3: Install**

```bash
pnpm install
```

Expected: Next, React, eslint-config-next installed. Handle `ERR_PNPM_IGNORED_BUILDS` as in Task 1 Step 3 (`sharp` and `unrs-resolver` are pre-approved).

- [x] **Step 4: Typecheck**

```bash
pnpm --filter @angiday/web typecheck
```

Expected: `next typegen` writes `next-env.d.ts` and `.next/types`, then `tsc` exits 0.

- [x] **Step 5: Lint**

```bash
pnpm --filter @angiday/web lint
```

Expected: exit 0, no warnings.

- [x] **Step 6: Run the dev server and look at the page**

```bash
pnpm --filter @angiday/web dev
```

Open http://localhost:3000. Expected: heading "AnGiDay" and "Scaffold OK (@angiday/shared)". Stop the server.

- [x] **Step 7: Production build compiles the JIT package (Review Focus 5)**

```bash
pnpm --filter @angiday/web build
```

Expected: build succeeds and lists route `/`. If Next rewrites `apps/web/tsconfig.json` (e.g. adds `allowJs`, `incremental` or `include` entries), keep its changes and re-run Steps 4–5.

Then temporarily remove `'@angiday/shared'` from `transpilePackages` and build again. Record whether the build fails; restore the line either way. (Next 16 may compile workspace TypeScript without it; we keep it because ADR-0014 relies on it and Lambdas/other consumers do not share Next's defaults.)

- [x] **Step 8: Run the gate**

```bash
pnpm check
```

Expected: all tasks succeed, including `@angiday/web:lint` and `@angiday/web:typecheck`.

- [x] **Step 9: Commit**

```bash
git add apps/web pnpm-lock.yaml
git status --short
git commit -m "chore: add minimal Next.js web app"
```

`git status --short` before committing must not list `apps/web/.next/` or `apps/web/next-env.d.ts`.

---

### Task 5: GitHub Actions CI + ignore rules

Before starting, explain in Vietnamese: what a GitHub Actions workflow/job/step is, why CI uses `--frozen-lockfile`, and that CI never needs secrets in S0.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root `pnpm check` (Task 1), `.nvmrc`, `packageManager`.
- Produces: workflow `CI`, job `check`, running on every PR and on pushes to `main`.

- [x] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      # Reads the pnpm version from package.json "packageManager".
      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm check
```

- [x] **Step 2: Verify ignore rules (Review Focus 4)**

```bash
git check-ignore -v .env apps/web/.env.local services/ingest/.env.production infra/cdk.out/manifest.json apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo
```

Expected: every path printed with the `.gitignore` rule that matches it.

```bash
git check-ignore .env.example; echo "exit=$?"
```

Expected: no path printed, `exit=1` (`.env.example` stays committable).

- [x] **Step 3: Simulate the CI install locally (Review Focus 3)**

```bash
pnpm install --frozen-lockfile
```

Expected: `Lockfile is up to date`, no `ERR_PNPM_OUTDATED_LOCKFILE`, no `ERR_PNPM_IGNORED_BUILDS`.

- [x] **Step 4: Simulate a cold CI run**

```bash
pnpm turbo run lint typecheck test --force
```

Expected: every task executes (no cache) and succeeds. This is what CI runs on a fresh machine.

- [x] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run turbo lint typecheck test on PRs"
```

---

### Task 6: Docs, verification, finish

**Files:**
- Modify: `CLAUDE.md` (section "Commands")
- Modify: `docs/progress.md` (Now/Next, S0 tick, session log)

**Interfaces:**
- Consumes: everything above.
- Produces: documented commands; S0 ticked.

- [x] **Step 1: Fill in CLAUDE.md → Commands**

Replace the line `_TBD once the monorepo is scaffolded._ Tooling: pnpm workspaces + Turborepo, Just-in-Time internal packages ([ADR-0014](docs/adr/0014-pnpm-turborepo-jit-packages.md)).` with:

````markdown
Tooling: pnpm workspaces + Turborepo, Just-in-Time internal packages ([ADR-0014](docs/adr/0014-pnpm-turborepo-jit-packages.md)). Node 24, pnpm via `packageManager`.

```bash
pnpm install                                  # install all workspaces
pnpm check                                    # turbo lint + typecheck + test (what CI runs)
pnpm --filter @angiday/<name> test            # one workspace (shared, db, ai, ingest, infra, web)
pnpm --filter @angiday/web dev                # web on http://localhost:3000
pnpm --filter @angiday/infra cdk synth        # CDK template → infra/cdk.out
```

Version pins: TypeScript `~6.0` (typescript-eslint peer), ESLint 9 (eslint-config-next plugins). Shared tool versions live in the `catalog` of `pnpm-workspace.yaml`.
````

- [x] **Step 2: Verification (REQUIRED SUB-SKILL: superpowers:verification-before-completion)**

```bash
pnpm install --frozen-lockfile
pnpm turbo run lint typecheck test --force
```

Expected: both succeed; paste the Turbo summary line for the owner.

- [x] **Step 3: Update progress.md**

In `docs/progress.md`:
- Tick `- [x] S0 — Scaffold & accounts (~6h)` only if Task 0's account checklist is complete and CI is green (Step 5); otherwise leave it and note what is open.
- Now/Next → **Now:** Phase 1 S0 done. **Next:** S1 — walking skeleton (write its slice plan first).
- Session log row: `| <date> | S0: pnpm + Turborepo monorepo (shared, db, ai, ingest, infra, web), base tsconfig/ESLint/Vitest, CDK app with empty IngestStack, minimal Next.js app, GitHub Actions CI | <open account items, or —> |`

- [x] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/progress.md
git commit -m "docs: document commands and record S0 progress"
```

- [x] **Step 5: Finish the branch (REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch)**

Ask the owner before pushing. After approval:

```bash
git push -u origin s0-scaffold
```

Open a PR to `main`. Expected: the `CI / check` job turns green on the PR — this is the S0 demo. If it fails, fix on the branch (systematic-debugging) before merging; do not merge red.

---

## Execution notes (2026-10-15/16)

Deviations from the steps above, so the next reader does not re-derive them.

- **pnpm `minimumReleaseAgeExclude`:** pnpm 12 added entries to `pnpm-workspace.yaml` for packages released very recently (vitest, next, react…). Kept.
- **`infra/vitest.config.mts`** (not in the plan): `testTimeout` 30s. The CDK synth test timed out at the 5s default when the full gate ran cold in parallel. `.mts` because `infra` is CommonJS (no `"type": "module"`).
- **`infra/lib/ingest-stack.test.ts`** builds the `App` with the `context` from `infra/cdk.json`, so it synthesizes with the same feature flags as `cdk synth`. It overrides `@aws-cdk/core:validateAgainstDefaultRules` to `false` because the empty S0 stack fails it. **Remove that override in S1** when the stack gets its first resource.
- **`apps/web/AGENTS.md`** is generated by `next dev` (Next 16.4). It is not part of this plan; the owner commits it separately.
- **Task 4 has no unit test:** it is scaffolding; its gates are typecheck, lint, `next build` and the dev page returning 200.
- **Closed 2026-10-16:** the owner finished the accounts checklist (Task 0 Step 3) and pushed, got a green CI run and merged PR #3 (Task 6 Step 5). The account items were confirmed by the owner, not re-verified by Claude.
