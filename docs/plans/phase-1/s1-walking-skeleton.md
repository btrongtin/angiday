# S1 — Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development (the owner chooses — see [CLAUDE.md](../../../CLAUDE.md) → "Workflow per slice") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post a Google Maps link in the Telegram group → the bot replies "Đã lưu: <name>" → the name appears on the web list after login.

**Architecture:** Telegram calls a public Lambda Function URL (webhook). The webhook Lambda checks the secret header, routes the update with a pure function from `@angiday/shared`, and puts a job on SQS. The worker Lambda (SQS event source, batch size 1, partial batch failures, DLQ after 3 tries) resolves the short link, parses name + coordinates from the URL, upserts the place through `@angiday/db` (idempotent per Telegram `update_id`) and replies with `sendMessage`. The Next.js app logs in with one set of credentials from env, signs a session cookie, and lists the group's saved places from MongoDB. Secrets come from SSM on AWS and from env vars on Vercel.

**Tech Stack:** Node 24, pnpm workspaces + Turborepo, TypeScript 6.0, zod 4, Vitest 5, MongoDB Node driver 7 + `mongodb-memory-server-core` 11, Powertools for AWS Lambda (TypeScript) 2.x (Logger, Parameters), AWS SDK v3 (SQS, SSM), AWS CDK 2.273 (`NodejsFunction` + esbuild), Next.js 16.4 / React 19.3, `jose` 6.

**Spec:** [Phase 1 plan → S1](../phase-1-ingest-and-list.md#s1--walking-skeleton-link--name-saved--bot-reply--web-list--14h) and its "Plan-level technical choices" table; [architecture.md](../../architecture.md) (F1, ingest routing, data model); ADRs [0002](../../adr/0002-group-as-tenant.md) (groupId), [0004](../../adr/0004-hybrid-aws-ingest-nextjs-web.md), [0005](../../adr/0005-api-in-nextjs-nestjs-later.md) (thin handlers), [0014](../../adr/0014-pnpm-turborepo-jit-packages.md) (JIT packages), [0015](../../adr/0015-testing-and-observability-baseline.md) (testing/observability), [0016](../../adr/0016-place-details-from-url-and-nominatim.md) (URL parsing). S0 carry-overs: [progress.md](../../progress.md) session log 2026-10-16.

## Global Constraints

- Node **24**; Lambda runtime `nodejs24.x`, **ARM64**; region **`ap-southeast-1`**.
- TypeScript `~6.0.3`, ESLint 9, zod 4, Vitest 5 — all through the pnpm `catalog:`. New third-party deps are added with `pnpm --filter <pkg> add <name>` so pnpm picks a version allowed by `minimumReleaseAge`. If pnpm refuses a version for being too new, take the newest allowed one; do **not** add `minimumReleaseAgeExclude` entries without asking the owner.
- Internal packages stay JIT (`exports` → `./src/*.ts`, no build step). A new internal dependency means: `"workspace:*"` in `package.json` **and**, for `apps/web`, an entry in `transpilePackages`.
- **Every repository function takes `groupId`** (string, 24-hex ObjectId) and every query filters on it. The only exceptions are the two functions that *find or create* the group from a Telegram chat id (`findGroupByTelegramChatId`, `upsertGroupByTelegramChatId`); their doc comments say why.
- Handlers stay thin: parse input → call a function from `packages/*` or a use-case module → format output. Lambda entry files (`handler.ts`) only wire real dependencies.
- Tests never touch the network, AWS, Telegram or a real LLM. HTTP clients take an injected `fetch` (see Review note in Task 5). MongoDB tests use `mongodb-memory-server-core` (it downloads a `mongod` binary once; that download is the only network use and is cached).
- Secrets: SSM SecureString on AWS (`/angiday/*`, names in `infra/lib/config.ts`), Vercel env vars for web, `.env` / `apps/web/.env.local` locally. **Never read `.env` or `.env.local`**, never print a secret, never ask for a secret value in chat. Error messages and logs must not contain secret values (the bot token is part of every Telegram API URL).
- Env var names: `.env.example` lists every human-provided variable and `packages/shared/src/app-env.ts` validates it. The web login names are fixed by the owner: `WEB_LOGIN_USERNAME`, `WEB_LOGIN_PASSWORD`, `SESSION_SECRET`, `GROUP_ID`. CDK-set variables (`QUEUE_URL`, `<NAME>_PARAM`, `POWERTOOLS_*`) are not in `.env.example`; a comment there points to the CDK stack.
- User-facing bot and web text is Vietnamese; code, comments, docs, commits in English.
- AWS calls need a live session: before any command that talks to AWS (`cdk deploy`, `cdk diff`, `aws logs`), ask the owner to run `aws login --profile angiday`. `cdk synth` and the tests do not need AWS credentials.
- Before each new AWS concept (SQS/DLQ, partial batch failures, Lambda Function URL, IAM least privilege, SSM SecureString + Powertools Parameters, `NodejsFunction` bundling), explain it to the owner briefly **in Vietnamese** before writing the code. Each task lists the concepts under "Concept brief".
- Git: work on branch `s1-walking-skeleton`. **Never** `git add -A` / `git add .` (a real `.env` exists in the repo root; the owner commits `apps/web/AGENTS.md` and other files outside the plan). Stage explicit paths. Ask the owner before every commit; push / PR only through `superpowers:finishing-a-development-branch` with the owner's approval.

## Review Focus

1. **Real share links vary** — iOS (`?g_st=ic`) and Android share links, links inside a photo caption, links hidden behind a `text_link` entity, links followed by `)` or `.`, and resolved URLs that have a pin (`!3d…!4d…`) but no `@lat,lng`. Expected: the place is saved with the right coordinates; a link with no coordinates gets the "chưa đọc được" reply, never a crash. Pinned in Task 2 (fixtures, incl. the owner's real links) and Task 3 (`findMapsUrlInMessage`).
2. **Vietnamese names in URLs** — `+` for spaces, percent-encoded UTF-8, decomposed (NFD) accents, a literal `+` encoded as `%2B`. Expected: `"Phở Hòa"` in NFC, exactly as a person would type it. Pinned in Task 2.
3. **Telegram / SQS deliver the same update twice, or the worker dies half-way** — expected: one place, at most one "Đã lưu" per successful run, and a retry after a crash between "place saved" and "reply sent" still replies without creating a second place. Pinned in Task 7 (`processIngestJob` duplicate + crash-retry tests) on top of the unique indexes from Task 4.
4. **A failed cold start poisons the container** — if SSM or Mongo fails once at cold start, a cached rejected promise would fail every later invocation of that warm container. Expected: the next invocation retries the load. Pinned in Task 5 (`memoizeAsync` test).
5. **Forum topics** — the group has Topics enabled. Expected: the bot replies in the same topic as the user's message (and in General when the message is in General); a reply-thread id in a non-forum chat must not be sent as `message_thread_id`. Pinned in Task 3 (`routeUpdate` thread tests) and Task 7 (reply arguments).

---

## How this slice is split

S1 is ~14h, so it is cut into four parts. Each part ends green (`pnpm check`) and is a safe place to stop a session; note the stop point in the session log's "Left open" column.

| Part | Tasks | What works at the end | ~h |
|---|---|---|---|
| A — Pure logic | 0–4 | Env names, Maps URL parser, Telegram routing, `packages/db` repositories — all unit/integration-tested, no AWS | 4.5 |
| B — Lambda code | 5–7 | Webhook + worker handlers tested end to end against an in-memory Mongo and fake Telegram | 3.5 |
| C — Infra + first deploy | 8–10 | Stack deployed; posting a link in Telegram saves the place and the bot replies | 3.5 |
| D — Web | 11–13 | Login + list on Vercel; slice verified, docs updated | 2.5 |

## File map

```
.env.example                                   + web login vars; note on CDK-set vars
package.json                                   + seed:group, set-webhook root scripts
turbo.json                                     + globalPassThroughEnv MONGOMS_DOWNLOAD_DIR
.github/workflows/ci.yml                        + cache for the mongod test binary

packages/shared/src/
  app-env.ts (+test)                           web vars; loadAppEnv(source, keys?) subset loading
  ids.ts                                       objectIdSchema
  maps-url.ts (+test, maps-url.fixtures.ts)    extractMapsUrl, isGoogleMapsHost, parseMapsPlaceUrl
  telegram-update.ts                           zod schema for the Update fields we use
  ingest-job.ts                                zod schema of the SQS message body
  route-update.ts (+test)                      findMapsUrlInMessage, routeUpdate
  place.ts                                     Place / Group schemas, statuses, GeoJSON point
  index.ts                                     re-exports

packages/db/
  vitest.config.mts
  src/client.ts                                getMongoClient (cached on globalThis), getDb
  src/collections.ts                           doc types, collection getters, toObjectId
  src/indexes.ts (+test)                       ensureIndexes
  src/groups.ts (+test)                        upsertGroupByTelegramChatId, findGroupByTelegramChatId
  src/places.ts (+test)                        upsertPlaceFromTelegram, listPlaces
  src/telegram-updates.ts (+test)              claimTelegramUpdate, markTelegramUpdateDone
  src/testing/memory-mongo.ts                  startMemoryMongo() for tests (subpath @angiday/db/testing)
  src/index.ts

services/ingest/
  vitest.config.mts
  src/lib/log.ts                               Log / KeyedLog interfaces, errorFields
  src/lib/memoize-async.ts (+test)             cold-start loader that forgets failures
  src/lib/lambda-env.ts (+test)                loadLambdaEnv: <NAME>_PARAM → SSM → loadAppEnv
  src/telegram/api.ts (+test)                  createTelegramApi(token, fetch): sendMessage, setWebhook, getWebhookInfo
  src/maps/resolve-maps-link.ts (+test)        manual redirects, max 5 hops, Google hosts only
  src/webhook/create-webhook-handler.ts (+test)
  src/webhook/handler.ts                       Lambda entry (wiring only)
  src/worker/process-ingest-job.ts (+test)     the F1 use case for S1
  src/worker/create-worker-handler.ts (+test)
  src/worker/handler.ts                        Lambda entry (wiring only)
  src/test/fixtures.ts                         makeUpdate / makeJob / createTestLog
  scripts/seed-group.ts                        pnpm seed:group
  scripts/set-webhook.ts                       pnpm set-webhook
  src/workspace-wiring.test.ts                 DELETE (S0 temporary)

infra/
  lib/config.ts                                + SSM_PARAMS, WORKER_TIMEOUT_SECONDS
  lib/ingest-stack.ts                          queues, two NodejsFunctions, Function URL, grants, outputs
  lib/ingest-stack.test.ts                     assertions; S0 override removed

apps/web/
  next.config.ts                               transpilePackages + @angiday/db
  vercel.json                                  region sin1 (next to Atlas Singapore)
  lib/env.ts                                   getWebEnv()
  lib/auth.ts (+test)                          credentialsMatch, create/verifySessionToken
  lib/session.ts                               requireSession, startSession, endSession
  app/login/page.tsx, app/login/actions.ts
  app/page.tsx                                 place list
```

---

## Part A — Pure logic

### Task 0: Branch, commit the plan, owner inputs

**Files:** none (git + owner actions)

**Interfaces:**
- Consumes: S0 merged on `main`.
- Produces: branch `s1-walking-skeleton`; 3–5 real Maps share links for Task 2; `.env` / `apps/web/.env.local` filled by the owner.

- [ ] **Step 1: Update main and branch**

```bash
git switch main
git pull
git switch -c s1-walking-skeleton
git status --short
```

Expected: only `?? docs/plans/phase-1/s1-walking-skeleton.md` (plus any owner files such as `apps/web/AGENTS.md`, which you leave alone).

- [ ] **Step 2: Commit the plan (ask the owner first)**

```bash
git add docs/plans/phase-1/s1-walking-skeleton.md
git commit -m "docs: add S1 walking skeleton plan"
```

- [ ] **Step 3: Owner checklist (can run in parallel with Tasks 1–4)**

Give the owner this list and wait only where a later task needs the item:

- [ ] Share **3–5 real Google Maps links** in chat (needed by Task 2 Step 1): from the phone app's "Share" button, at least one from iOS and one from Android if possible, plus one desktop `google.com/maps/place/...` URL. Links are not secrets.
- [ ] Add to the root `.env` (needed by Task 9): `WEB_LOGIN_USERNAME`, `WEB_LOGIN_PASSWORD` (≥ 12 chars), `SESSION_SECRET` (`openssl rand -hex 32`). `GROUP_ID` comes from `pnpm seed:group` in Task 10. Check that `MONGODB_URI` ends with `/angiday?...` (the driver uses the database in the URI) and that `TELEGRAM_WEBHOOK_SECRET` has the **same value** as SSM `/angiday/telegram-webhook-secret`.
- [ ] Create `apps/web/.env.local` (needed by Task 11; Next.js reads env files from `apps/web`, not the repo root) with `MONGODB_URI`, `WEB_LOGIN_USERNAME`, `WEB_LOGIN_PASSWORD`, `SESSION_SECRET`, `GROUP_ID`. It is git-ignored by `.env.*`.

---

### Task 1: Env names for S1 + subset loading

**Files:**
- Create: `packages/shared/src/ids.ts`
- Modify: `packages/shared/src/app-env.ts`, `packages/shared/src/app-env.test.ts`, `packages/shared/src/index.ts`, `.env.example`

**Interfaces:**
- Consumes: `parseEnv(shape, source)` from `packages/shared/src/env.ts` (S0).
- Produces:
  - `objectIdSchema: z.ZodString` (24 hex chars).
  - `appEnvShape` with 4 new keys: `WEB_LOGIN_USERNAME`, `WEB_LOGIN_PASSWORD`, `SESSION_SECRET`, `GROUP_ID`.
  - `type AppEnvKey = keyof typeof appEnvShape`.
  - `loadAppEnv(source): AppEnv` (unchanged) and new overload `loadAppEnv<K extends AppEnvKey>(source, keys: readonly K[]): Pick<AppEnv, K>` — validates only the listed keys. Every runtime (webhook, worker, scripts, web) loads only what it needs.

- [ ] **Step 1: Write the failing tests**

Replace `packages/shared/src/app-env.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { loadAppEnv } from './app-env';

const valid = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/angiday',
  TELEGRAM_BOT_TOKEN: '123456:abc',
  TELEGRAM_WEBHOOK_SECRET: 'deadbeef',
  TELEGRAM_ALLOWED_CHAT_IDS: '-1001234567890, -1009876543210',
  GOOGLE_GENERATIVE_AI_API_KEY: 'key',
  WEB_LOGIN_USERNAME: 'admin',
  WEB_LOGIN_PASSWORD: 'a-long-password',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  GROUP_ID: '65f1c2a4b3d2e1f001234567',
};

describe('loadAppEnv', () => {
  it('parses the variables listed in .env.example', () => {
    const env = loadAppEnv(valid);

    expect(env.MONGODB_URI).toBe(valid.MONGODB_URI);
    expect(env.TELEGRAM_ALLOWED_CHAT_IDS).toEqual([-1001234567890, -1009876543210]);
    expect(env.GROUP_ID).toBe(valid.GROUP_ID);
  });

  it('names every missing variable in one error', () => {
    expect(() => loadAppEnv({})).toThrowError(
      /MONGODB_URI[\s\S]*TELEGRAM_BOT_TOKEN[\s\S]*TELEGRAM_WEBHOOK_SECRET[\s\S]*TELEGRAM_ALLOWED_CHAT_IDS[\s\S]*GOOGLE_GENERATIVE_AI_API_KEY[\s\S]*WEB_LOGIN_USERNAME[\s\S]*WEB_LOGIN_PASSWORD[\s\S]*SESSION_SECRET[\s\S]*GROUP_ID/,
    );
  });

  it('rejects a chat id list that is not numeric and does not echo the value', () => {
    const bad = { ...valid, TELEGRAM_ALLOWED_CHAT_IDS: 'my-group' };

    expect(() => loadAppEnv(bad)).toThrowError(/TELEGRAM_ALLOWED_CHAT_IDS/);
    expect(() => loadAppEnv(bad)).not.toThrowError(/my-group/);
  });

  it('rejects an empty chat id list (an empty allowlist would silently drop every message)', () => {
    expect(() => loadAppEnv({ ...valid, TELEGRAM_ALLOWED_CHAT_IDS: ' , ' })).toThrowError(/TELEGRAM_ALLOWED_CHAT_IDS/);
  });

  it('rejects a short session secret and a GROUP_ID that is not an ObjectId', () => {
    expect(() => loadAppEnv({ ...valid, SESSION_SECRET: 'short' })).toThrowError(/SESSION_SECRET/);
    expect(() => loadAppEnv({ ...valid, GROUP_ID: 'my-group' })).toThrowError(/GROUP_ID/);
  });

  describe('with a list of keys', () => {
    it('validates and returns only those keys', () => {
      const env = loadAppEnv(
        { TELEGRAM_WEBHOOK_SECRET: 'deadbeef', TELEGRAM_ALLOWED_CHAT_IDS: '-100123' },
        ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS'],
      );

      expect(env).toEqual({ TELEGRAM_WEBHOOK_SECRET: 'deadbeef', TELEGRAM_ALLOWED_CHAT_IDS: [-100123] });
    });

    it('still fails on a missing listed key', () => {
      expect(() => loadAppEnv({}, ['MONGODB_URI'])).toThrowError(/MONGODB_URI/);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @angiday/shared test`
Expected: FAIL — the "parses" test throws (unknown keys are fine, but `GROUP_ID` is `undefined`), the missing-variable regex does not find `WEB_LOGIN_USERNAME`, the subset test fails on the 2-argument call.

- [ ] **Step 3: Implement**

`packages/shared/src/ids.ts`:

```ts
import { z } from 'zod';

/** A MongoDB ObjectId as a 24-character hex string: the id format at every package boundary. */
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'must be a 24-character hex ObjectId');
```

`packages/shared/src/app-env.ts` (full file):

```ts
import { z } from 'zod';
import { parseEnv } from './env';
import { objectIdSchema } from './ids';

type EnvSource = Record<string, string | undefined>;

/** Comma-separated Telegram chat ids ("-1001234567890,-1009876543210") → number[]; at least one id. */
const chatIdList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  )
  .pipe(z.array(z.string().regex(/^-?\d+$/, 'must be a comma-separated list of numeric chat ids')).min(1))
  .transform((ids) => ids.map(Number));

/**
 * Every environment variable the app reads; names match `.env.example`.
 * Values live in `.env` locally, SSM Parameter Store on AWS and Vercel env vars for the web app
 * (see CLAUDE.md → Secrets). Never put a value in this file.
 */
export const appEnvShape = {
  MONGODB_URI: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_ALLOWED_CHAT_IDS: chatIdList,
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  WEB_LOGIN_USERNAME: z.string().min(1),
  WEB_LOGIN_PASSWORD: z.string().min(12, 'must be at least 12 characters'),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters (openssl rand -hex 32)'),
  GROUP_ID: objectIdSchema,
} satisfies z.ZodRawShape;

export type AppEnv = z.infer<z.ZodObject<typeof appEnvShape>>;
export type AppEnvKey = keyof typeof appEnvShape;

/**
 * Call once at startup. Without `keys` every variable is required; with `keys` only those are
 * validated and returned, so each runtime asks for exactly what it uses:
 * `loadAppEnv(process.env, ['MONGODB_URI', 'GROUP_ID'])`. Throws if a variable is missing or invalid.
 */
export function loadAppEnv(source: EnvSource): AppEnv;
export function loadAppEnv<K extends AppEnvKey>(source: EnvSource, keys: readonly K[]): Pick<AppEnv, K>;
export function loadAppEnv(source: EnvSource, keys?: readonly AppEnvKey[]): Partial<AppEnv> {
  if (!keys) return parseEnv(appEnvShape, source);
  const shape = Object.fromEntries(keys.map((key) => [key, appEnvShape[key]])) as z.ZodRawShape;
  return parseEnv(shape, source) as Partial<AppEnv>;
}
```

`packages/shared/src/index.ts`:

```ts
export { appEnvShape, loadAppEnv, type AppEnv, type AppEnvKey } from './app-env';
export { parseEnv } from './env';
export { objectIdSchema } from './ids';
```

`.env.example` — replace the whole "Proposed for S1" block at the end with:

```dotenv
# --- Web app (Vercel; locally in apps/web/.env.local because Next.js reads env files from apps/web) ---
# One login for the group (Phase 1 plan → Web auth). Password: at least 12 characters.
WEB_LOGIN_USERNAME=
WEB_LOGIN_PASSWORD=
# Signs the session cookie: `openssl rand -hex 32`. Changing it logs everyone out.
SESSION_SECRET=
# The group's ObjectId (24 hex chars), printed by `pnpm seed:group`.
GROUP_ID=

# --- Set by CDK on the Lambdas, never in .env (see infra/lib/ingest-stack.ts) ---
# QUEUE_URL, POWERTOOLS_SERVICE_NAME, and <NAME>_PARAM = the SSM parameter name holding <NAME>.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @angiday/shared test`
Expected: PASS (all `app-env` and `env` tests).

- [ ] **Step 5: Full check, then commit (ask the owner first)**

Run: `pnpm check` — expected green (web still only imports nothing from shared at runtime).

```bash
git add packages/shared/src/ids.ts packages/shared/src/app-env.ts packages/shared/src/app-env.test.ts packages/shared/src/index.ts .env.example
git commit -m "feat(shared): add web login env vars and per-runtime env subsets"
```

---

### Task 2: Maps URL parser (name + coordinates) with real fixtures

Pulled forward from S2: coordinates prefer the pin (`!3d…!4d…`) and fall back to the viewport (`@lat,lng`), because phone share links often resolve to URLs without `@`. The feature id and `needs_info` stay in S2.

**Files:**
- Create: `packages/shared/src/maps-url.ts`, `packages/shared/src/maps-url.fixtures.ts`, `packages/shared/src/maps-url.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isGoogleMapsHost(hostname: string): boolean` — used by the redirect resolver (Task 5) to refuse non-Google hops.
  - `extractMapsUrl(text: string): string | null` — first Maps URL in free text, trailing punctuation stripped.
  - `interface ParsedMapsPlace { name: string; lat: number; lng: number }`
  - `parseMapsPlaceUrl(url: string): ParsedMapsPlace | null` — for a *resolved* `/maps/place/...` URL.

- [ ] **Step 1: Capture the owner's real links as fixtures**

For each link from Task 0 Step 3, follow redirects without a browser (this is what the worker will see):

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' 'https://maps.app.goo.gl/XXXX'
```

Repeat on the printed `redirect_url` until the status is not `3xx` (usually one hop). Record the final URL. Open it in a browser to read the place name and pin coordinates for `expected`.

If a final URL is **not** a `/maps/place/` URL with coordinates (for example `/maps?q=...&ftid=...` or a consent page), add it to `unparseableUrlFixtures` and **tell the owner**: that share format cannot be saved until S2's `needs_info` flow, and if it is the common case it affects ADR-0016.

- [ ] **Step 2: Write the fixtures file**

`packages/shared/src/maps-url.fixtures.ts` (the first entries are built from the documented URL format; append the owner's real ones under the marked comment):

```ts
import type { ParsedMapsPlace } from './maps-url';

export interface PlaceUrlFixture {
  label: string;
  url: string;
  expected: ParsedMapsPlace;
}

/** Resolved Google Maps place URLs and what the parser must read from them. */
export const placeUrlFixtures: PlaceUrlFixture[] = [
  {
    label: 'desktop place URL with viewport and pin (pin wins)',
    url: 'https://www.google.com/maps/place/Ph%E1%BB%9F+H%C3%B2a+Pasteur/@10.7895162,106.6880276,17z/data=!3m1!4b1!4m6!3m5!1s0x31752f2c8b0b8d0f:0x6f6b1f0b3a1c9e2d!8m2!3d10.7895109!4d106.6906025!16s%2Fg%2F1tgf4q1d?entry=ttu',
    expected: { name: 'Phở Hòa Pasteur', lat: 10.7895109, lng: 106.6906025 },
  },
  {
    label: 'mobile share URL without @viewport, pin only',
    url: 'https://www.google.com/maps/place/B%C3%BAn+b%C3%B2+Hu%E1%BA%BF+O+Ph%C6%B0%E1%BB%A3ng/data=!4m6!3m5!1s0x31752f3a1b2c3d4e:0x1a2b3c4d5e6f7a8b!8m2!3d10.776543!4d106.700123!16s%2Fg%2F11abc?utm_source=mstt_1&entry=gps',
    expected: { name: 'Bún bò Huế O Phượng', lat: 10.776543, lng: 106.700123 },
  },
  {
    label: 'viewport only',
    url: 'https://www.google.com/maps/place/C%C6%A1m+T%E1%BA%A5m+Ba+Ghi%E1%BB%81n/@10.79,106.68,17z',
    expected: { name: 'Cơm Tấm Ba Ghiền', lat: 10.79, lng: 106.68 },
  },
  {
    label: 'decomposed (NFD) accents are normalized to NFC',
    url: 'https://www.google.com/maps/place/Pho%CC%9B%CC%89+Ho%CC%80a/@10.79,106.69,17z',
    expected: { name: 'Phở Hòa', lat: 10.79, lng: 106.69 },
  },
  {
    label: 'a literal plus sign is encoded as %2B',
    url: 'https://www.google.com/maps/place/Coffee+%2B+Tea/@10.8,106.7,17z',
    expected: { name: 'Coffee + Tea', lat: 10.8, lng: 106.7 },
  },
  // Real links shared by the owner (Task 2 Step 1): resolved with `curl -s -o /dev/null -w '%{redirect_url}'`,
  // one hop each. Pin and viewport differ slightly in all three — proof the "prefer pin" rule matters.
  {
    label: 'owner: TÔ GHẸ - HỦ TIẾU GHẸ Tân Định',
    url: 'https://www.google.com/maps/place/T%C3%94+GH%E1%BA%B8+-+H%E1%BB%A6+TI%E1%BA%BEU+GH%E1%BA%B8+T%C3%A2n+%C4%90%E1%BB%8Bnh/@10.7917545,106.6926015,17z/data=!3m1!4b1!4m6!3m5!1s0x317529006656f9ef:0xe1f83b4b1284b797!8m2!3d10.7917492!4d106.6951764!16s%2Fg%2F11ntmp232g!18m1!1e1?entry=tts',
    expected: { name: 'TÔ GHẸ - HỦ TIẾU GHẸ Tân Định', lat: 10.7917492, lng: 106.6951764 },
  },
  {
    label: 'owner: Bún riêu Út Nhỏ - CN5',
    url: 'https://www.google.com/maps/place/B%C3%BAn+ri%C3%AAu+%C3%9At+Nh%E1%BB%8F+-+CN5/@10.7866645,106.7665907,17z/data=!3m1!4b1!4m6!3m5!1s0x317527003688e4af:0x8ad9b8dc409ab37e!8m2!3d10.7866592!4d106.7691656!16s%2Fg%2F11x673crm_!18m1!1e1?entry=tts',
    expected: { name: 'Bún riêu Út Nhỏ - CN5', lat: 10.7866592, lng: 106.7691656 },
  },
  {
    label: 'owner: Bún Bò Huế Thiện Tâm',
    url: 'https://www.google.com/maps/place/B%C3%BAn+B%C3%B2+Hu%E1%BA%BF+Thi%E1%BB%87n+T%C3%A2m/@10.7813854,106.7671822,16.25z/data=!4m6!3m5!1s0x317525aeb993110b:0x4b7f6044688f0e1e!8m2!3d10.7788544!4d106.7605133!16s%2Fg%2F11t6wrr7pk!18m1!1e1?entry=tts',
    expected: { name: 'Bún Bò Huế Thiện Tâm', lat: 10.7788544, lng: 106.7605133 },
  },
];

/** URLs that must NOT parse into a place. */
export const unparseableUrlFixtures: { label: string; url: string }[] = [
  { label: 'query URL without coordinates', url: 'https://www.google.com/maps?q=B%C3%A1nh+m%C3%AC+Hu%E1%BB%B3nh+Hoa&ftid=0x31752f:0x1234' },
  { label: 'search URL', url: 'https://www.google.com/maps/search/b%C3%BAn+b%C3%B2/@10.77,106.70,15z' },
  { label: 'non-Google host', url: 'https://evil.example.com/maps/place/X/@10.7,106.7,17z' },
  { label: 'latitude out of range', url: 'https://www.google.com/maps/place/X/@99.1,106.7,17z' },
  { label: 'not a URL', url: 'maps place X' },
  { label: 'broken percent-encoding in the name', url: 'https://www.google.com/maps/place/%E1%BB/@10.7,106.7,17z' },
];
```

- [ ] **Step 3: Write the failing tests**

`packages/shared/src/maps-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractMapsUrl, isGoogleMapsHost, parseMapsPlaceUrl } from './maps-url';
import { placeUrlFixtures, unparseableUrlFixtures } from './maps-url.fixtures';

describe('parseMapsPlaceUrl', () => {
  it.each(placeUrlFixtures)('$label', ({ url, expected }) => {
    expect(parseMapsPlaceUrl(url)).toEqual(expected);
  });

  it.each(unparseableUrlFixtures)('returns null: $label', ({ url }) => {
    expect(parseMapsPlaceUrl(url)).toBeNull();
  });

  it('returns names in NFC so they match what people type', () => {
    const name = parseMapsPlaceUrl(placeUrlFixtures[3]!.url)?.name;

    expect(name).toBe(name?.normalize('NFC'));
  });
});

describe('extractMapsUrl', () => {
  it.each([
    ['iOS short link with g_st', 'quán này ngon nè https://maps.app.goo.gl/AbC123xyz?g_st=ic', 'https://maps.app.goo.gl/AbC123xyz?g_st=ic'],
    ['Android short link', 'https://maps.app.goo.gl/q1W2e3R4t5Y6u7I8o', 'https://maps.app.goo.gl/q1W2e3R4t5Y6u7I8o'],
    ['trailing punctuation', '(xem https://maps.app.goo.gl/AbC123).', 'https://maps.app.goo.gl/AbC123'],
    ['long desktop URL', 'https://www.google.com/maps/place/X/@10.7,106.7,17z rất ngon', 'https://www.google.com/maps/place/X/@10.7,106.7,17z'],
    ['google.com.vn', 'https://www.google.com.vn/maps/place/X/@10.7,106.7,17z', 'https://www.google.com.vn/maps/place/X/@10.7,106.7,17z'],
    ['first of two links', 'https://maps.app.goo.gl/First https://maps.app.goo.gl/Second', 'https://maps.app.goo.gl/First'],
  ])('%s', (_label, text, expected) => {
    expect(extractMapsUrl(text)).toBe(expected);
  });

  it.each([
    ['no link', 'bún bò cô Ba quận 3'],
    ['non-Maps Google link', 'https://www.google.com/search?q=bun+bo'],
    ['other site', 'https://www.foody.vn/ho-chi-minh/bun-bo'],
  ])('returns null: %s', (_label, text) => {
    expect(extractMapsUrl(text)).toBeNull();
  });
});

describe('isGoogleMapsHost', () => {
  it.each(['maps.app.goo.gl', 'goo.gl', 'google.com', 'www.google.com', 'maps.google.com', 'www.google.com.vn'])('accepts %s', (host) => {
    expect(isGoogleMapsHost(host)).toBe(true);
  });

  it.each(['google.com.evil.example', 'evilgoogle.com', 'consent.google.com', 'example.com'])('rejects %s', (host) => {
    expect(isGoogleMapsHost(host)).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm --filter @angiday/shared test`
Expected: FAIL — `Cannot find module './maps-url'` / failed to resolve import.

- [ ] **Step 5: Implement**

`packages/shared/src/maps-url.ts`:

```ts
/** Hosts a Google Maps link can live on: share short links and the long www/maps.google forms. */
const GOOGLE_MAPS_HOST = /^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.|maps\.)?google\.com(?:\.vn)?)$/i;

/** A Maps URL inside free text: short links, goo.gl/maps, google.com[.vn]/maps…, maps.google.com[.vn]/… */
const MAPS_URL_IN_TEXT =
  /https?:\/\/(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(?:www\.)?google\.com(?:\.vn)?\/maps|maps\.google\.com(?:\.vn)?\/)[^\s<>"']*/i;
const TRAILING_PUNCTUATION = /[).,!?;:\]]+$/;

const PLACE_PATH = /^\/maps\/place\/([^/]+)/;
/** Pin coordinates inside the `data=` segment: `!3d<lat>!4d<lng>`. */
const PIN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
/** Viewport centre: `/@<lat>,<lng>,<zoom>z`. Less precise than the pin. */
const VIEWPORT = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

export interface ParsedMapsPlace {
  name: string;
  lat: number;
  lng: number;
}

export function isGoogleMapsHost(hostname: string): boolean {
  return GOOGLE_MAPS_HOST.test(hostname);
}

/** First Google Maps URL in `text`, or null. Trailing `).,!?;:]` (sentence punctuation) is dropped. */
export function extractMapsUrl(text: string): string | null {
  const match = MAPS_URL_IN_TEXT.exec(text);
  return match ? match[0].replace(TRAILING_PUNCTUATION, '') : null;
}

/**
 * Name and coordinates from a resolved `/maps/place/<name>/…` URL (ADR-0016). Prefers the pin
 * (`!3d…!4d…`) over the viewport (`@lat,lng`). Returns null for anything else; never throws.
 */
export function parseMapsPlaceUrl(url: string): ParsedMapsPlace | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!isGoogleMapsHost(parsed.hostname)) return null;

  const nameSegment = PLACE_PATH.exec(parsed.pathname)?.[1];
  const name = nameSegment === undefined ? null : decodePlaceName(nameSegment);
  if (name === null) return null;

  const coordinates = PIN.exec(parsed.pathname) ?? VIEWPORT.exec(parsed.pathname);
  if (!coordinates) return null;
  const lat = Number(coordinates[1]);
  const lng = Number(coordinates[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { name, lat, lng };
}

/** `Ph%E1%BB%9F+H%C3%B2a` → `Phở Hòa` (NFC). `+` is a space; a real plus arrives as `%2B`. */
function decodePlaceName(segment: string): string | null {
  try {
    const name = decodeURIComponent(segment.replace(/\+/g, ' ')).normalize('NFC').trim();
    return name === '' ? null : name;
  } catch {
    return null;
  }
}
```

Append to `packages/shared/src/index.ts`:

```ts
export { extractMapsUrl, isGoogleMapsHost, parseMapsPlaceUrl, type ParsedMapsPlace } from './maps-url';
```

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm --filter @angiday/shared test`
Expected: PASS, including every owner fixture. If an owner fixture fails, fix the parser, not the fixture (the fixture is what Google really sends).

- [ ] **Step 7: Commit (ask the owner first)**

```bash
git add packages/shared/src/maps-url.ts packages/shared/src/maps-url.fixtures.ts packages/shared/src/maps-url.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): parse place name and coordinates from Google Maps URLs"
```

---

### Task 3: Telegram update schema, ingest job, routing

**Files:**
- Create: `packages/shared/src/telegram-update.ts`, `packages/shared/src/ingest-job.ts`, `packages/shared/src/route-update.ts`, `packages/shared/src/route-update.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `extractMapsUrl` (Task 2).
- Produces:
  - `telegramUpdateSchema`, `type TelegramUpdate`, `type TelegramMessage` — only the fields we read; unknown fields are stripped.
  - `ingestJobSchema`, `type IngestJob = { route: 'maps_link'; updateId: number; chatId: number; messageId: number; threadId?: number; userId?: number; text: string; mapsUrl: string }` — the SQS message body, shared by webhook and worker. S5 turns it into a discriminated union on `route`.
  - `findMapsUrlInMessage(message: TelegramMessage): string | null`
  - `type DropReason = 'no_message' | 'unknown_chat' | 'from_bot' | 'no_maps_link'`
  - `type RouteDecision = { kind: 'enqueue'; job: IngestJob } | { kind: 'drop'; reason: DropReason }`
  - `routeUpdate(update: TelegramUpdate, allowedChatIds: readonly number[]): RouteDecision`

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/route-update.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findMapsUrlInMessage, routeUpdate } from './route-update';
import type { TelegramMessage, TelegramUpdate } from './telegram-update';

const CHAT_ID = -1001234567890;
const LINK = 'https://maps.app.goo.gl/AbC123xyz';

function message(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 42,
    from: { id: 111, is_bot: false },
    chat: { id: CHAT_ID, type: 'supergroup' },
    text: `ngon nè ${LINK}`,
    ...overrides,
  };
}

function update(msg: TelegramMessage = message()): TelegramUpdate {
  return { update_id: 9001, message: msg };
}

describe('routeUpdate', () => {
  it('enqueues a Maps link from an allowed chat', () => {
    expect(routeUpdate(update(), [CHAT_ID])).toEqual({
      kind: 'enqueue',
      job: {
        route: 'maps_link',
        updateId: 9001,
        chatId: CHAT_ID,
        messageId: 42,
        userId: 111,
        text: `ngon nè ${LINK}`,
        mapsUrl: LINK,
      },
    });
  });

  it.each([
    ['no message (e.g. edited_message only)', { update_id: 9001 }, 'no_message'],
    ['unknown chat', update(message({ chat: { id: -100999, type: 'supergroup' } })), 'unknown_chat'],
    ['message from a bot', update(message({ from: { id: 7, is_bot: true } })), 'from_bot'],
    ['no Maps link', update(message({ text: 'ăn gì đây' })), 'no_maps_link'],
  ] as const)('drops: %s', (_label, input, reason) => {
    expect(routeUpdate(input, [CHAT_ID])).toEqual({ kind: 'drop', reason });
  });

  it('keeps the topic id for a forum topic message', () => {
    const decision = routeUpdate(update(message({ message_thread_id: 77, is_topic_message: true })), [CHAT_ID]);

    expect(decision.kind === 'enqueue' && decision.job.threadId).toBe(77);
  });

  it('ignores a reply-thread id outside forum topics (sending it would fail)', () => {
    const decision = routeUpdate(update(message({ message_thread_id: 41 })), [CHAT_ID]);

    expect(decision.kind === 'enqueue' && decision.job.threadId).toBeUndefined();
  });

  it('uses the caption when the message is a photo', () => {
    const decision = routeUpdate(update(message({ text: undefined, caption: LINK })), [CHAT_ID]);

    expect(decision).toMatchObject({ kind: 'enqueue', job: { mapsUrl: LINK, text: LINK } });
  });
});

describe('findMapsUrlInMessage', () => {
  it('finds a link hidden behind a text_link entity', () => {
    const msg = message({
      text: 'quán này',
      entities: [{ type: 'text_link', offset: 0, length: 8, url: LINK }],
    });

    expect(findMapsUrlInMessage(msg)).toBe(LINK);
  });

  it('returns null when nothing links to Maps', () => {
    const msg = message({
      text: 'xem đây',
      entities: [{ type: 'text_link', offset: 0, length: 7, url: 'https://example.com' }],
    });

    expect(findMapsUrlInMessage(msg)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @angiday/shared test`
Expected: FAIL — cannot resolve `./route-update` / `./telegram-update`.

- [ ] **Step 3: Implement**

`packages/shared/src/telegram-update.ts`:

```ts
import { z } from 'zod';

const messageEntitySchema = z.object({
  type: z.string(),
  offset: z.number().int(),
  length: z.number().int(),
  url: z.string().optional(),
});

/** The subset of a Telegram `Message` that ingest reads. Unknown fields are stripped. */
export const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  message_thread_id: z.number().int().optional(),
  is_topic_message: z.boolean().optional(),
  from: z.object({ id: z.number().int(), is_bot: z.boolean() }).optional(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  text: z.string().optional(),
  caption: z.string().optional(),
  entities: z.array(messageEntitySchema).optional(),
  caption_entities: z.array(messageEntitySchema).optional(),
});

/** Telegram `Update`. The webhook is registered with `allowed_updates: ["message"]`. */
export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: telegramMessageSchema.optional(),
});

export type TelegramMessage = z.infer<typeof telegramMessageSchema>;
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
```

`packages/shared/src/ingest-job.ts`:

```ts
import { z } from 'zod';

/** Body of an SQS message from the webhook to the worker. `updateId` is the correlation id in logs. */
export const ingestJobSchema = z.object({
  route: z.literal('maps_link'),
  updateId: z.number().int(),
  chatId: z.number().int(),
  messageId: z.number().int(),
  /** Forum topic to reply in; absent for General and for chats without topics. */
  threadId: z.number().int().optional(),
  userId: z.number().int().optional(),
  /** The user's text or caption: later slices use it as hints for the LLM. */
  text: z.string(),
  mapsUrl: z.url(),
});

export type IngestJob = z.infer<typeof ingestJobSchema>;
```

`packages/shared/src/route-update.ts`:

```ts
import type { IngestJob } from './ingest-job';
import { extractMapsUrl } from './maps-url';
import type { TelegramMessage, TelegramUpdate } from './telegram-update';

export type DropReason = 'no_message' | 'unknown_chat' | 'from_bot' | 'no_maps_link';
export type RouteDecision = { kind: 'enqueue'; job: IngestJob } | { kind: 'drop'; reason: DropReason };

/** First Google Maps URL in the text/caption, including links hidden behind `text_link` entities. */
export function findMapsUrlInMessage(message: TelegramMessage): string | null {
  const parts = [
    { text: message.text, entities: message.entities },
    { text: message.caption, entities: message.caption_entities },
  ];
  for (const { text, entities } of parts) {
    for (const entity of entities ?? []) {
      if (entity.type === 'text_link' && entity.url) {
        const url = extractMapsUrl(entity.url);
        if (url) return url;
      }
    }
    if (text) {
      const url = extractMapsUrl(text);
      if (url) return url;
    }
  }
  return null;
}

/**
 * Decide cheaply what enters the queue (architecture.md → Ingest routing). S1 handles only
 * "message with a Maps link"; `/add`, replies and chat routes arrive in S5 and Phase 2.
 */
export function routeUpdate(update: TelegramUpdate, allowedChatIds: readonly number[]): RouteDecision {
  const message = update.message;
  if (!message) return { kind: 'drop', reason: 'no_message' };
  if (!allowedChatIds.includes(message.chat.id)) return { kind: 'drop', reason: 'unknown_chat' };
  if (message.from?.is_bot) return { kind: 'drop', reason: 'from_bot' };

  const mapsUrl = findMapsUrlInMessage(message);
  if (!mapsUrl) return { kind: 'drop', reason: 'no_maps_link' };

  return {
    kind: 'enqueue',
    job: {
      route: 'maps_link',
      updateId: update.update_id,
      chatId: message.chat.id,
      messageId: message.message_id,
      // message_thread_id also marks reply threads in non-forum chats; only forum topics take it back.
      threadId: message.is_topic_message ? message.message_thread_id : undefined,
      userId: message.from?.id,
      text: message.text ?? message.caption ?? '',
      mapsUrl,
    },
  };
}
```

The first test uses `toEqual`, which treats `threadId: undefined` as absent — keep it that way.

Append to `packages/shared/src/index.ts`:

```ts
export { ingestJobSchema, type IngestJob } from './ingest-job';
export { findMapsUrlInMessage, routeUpdate, type DropReason, type RouteDecision } from './route-update';
export { telegramUpdateSchema, type TelegramMessage, type TelegramUpdate } from './telegram-update';
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @angiday/shared test`
Expected: PASS.

- [ ] **Step 5: Commit (ask the owner first)**

```bash
git add packages/shared/src/telegram-update.ts packages/shared/src/ingest-job.ts packages/shared/src/route-update.ts packages/shared/src/route-update.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): route Telegram updates with Maps links into ingest jobs"
```

---

### Task 4: `packages/db` — client, schemas, repositories, indexes

**Concept brief (Vietnamese, before coding):** MongoDB connection reuse — why one `MongoClient` per Lambda container / per Next.js server (cached on `globalThis`) instead of one per request (Atlas M0 has ~500 connections); unique index as the real guarantee for idempotency; TTL index; `mongodb-memory-server` runs a real `mongod` locally for tests.

**Files:**
- Create: `packages/shared/src/place.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/db/vitest.config.mts`, `packages/db/src/{client,collections,indexes,groups,places,telegram-updates}.ts`, `packages/db/src/testing/memory-mongo.ts`
- Test: `packages/db/src/{indexes,groups,places,telegram-updates}.test.ts`
- Modify: `packages/db/package.json`, `packages/db/src/index.ts`, `turbo.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `objectIdSchema` (Task 1).
- Produces (from `@angiday/shared`):
  - `ingestStatusSchema` (`'processing' | 'needs_info' | 'saved' | 'failed'`), `visitStatusSchema` (`'want_to_try' | 'visited'`)
  - `geoPointSchema` → `{ type: 'Point'; coordinates: [lng, lat] }` (GeoJSON order, ready for a later `2dsphere` index)
  - `placeSchema` / `type Place = { id; groupId; name; mapsUrl; location; ingestStatus; visitStatus; source: { telegramChatId; telegramMessageId; telegramUpdateId; telegramUserId? }; createdAt; updatedAt }`
  - `type NewTelegramPlace = Pick<Place, 'name' | 'mapsUrl' | 'location' | 'source'>`
  - `groupSchema` / `type Group = { id; name; telegramChatId; createdAt }`
- Produces (from `@angiday/db`):
  - `getMongoClient(uri: string): Promise<MongoClient>`, `getDb(uri: string): Promise<Db>`, `type Db`
  - `ensureIndexes(db: Db): Promise<void>`
  - `upsertGroupByTelegramChatId(db, { telegramChatId: number; name: string }): Promise<Group>`
  - `findGroupByTelegramChatId(db, telegramChatId: number): Promise<Group | null>`
  - `upsertPlaceFromTelegram(db, groupId: string, input: NewTelegramPlace): Promise<Place>` — idempotent per `(groupId, source.telegramUpdateId)`, sets `ingestStatus: 'saved'`, `visitStatus: 'want_to_try'` on insert.
  - `listPlaces(db, groupId: string, options?: { limit?: number }): Promise<Place[]>` — `saved` only, newest first, default limit 100.
  - `claimTelegramUpdate(db, groupId: string, updateId: number): Promise<'new' | 'retry' | 'done'>`, `markTelegramUpdateDone(db, groupId: string, updateId: number): Promise<void>`
  - `@angiday/db/testing`: `startMemoryMongo(): Promise<{ db: Db; stop(): Promise<void> }>` (indexes already created).

- [ ] **Step 1: Add dependencies and test setup**

```bash
pnpm --filter @angiday/db add mongodb "@angiday/shared@workspace:*"
pnpm --filter @angiday/db add -D mongodb-memory-server-core vitest@catalog:
```

Use `mongodb-memory-server-core`, not `mongodb-memory-server`: the latter downloads `mongod` in a postinstall script, which pnpm blocks (`allowBuilds`) and which would also run on every Vercel install.

Edit `packages/db/package.json`: add the test script and the testing subpath so `exports` reads:

```json
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/memory-mongo.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
```

`packages/db/vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The first run downloads a mongod binary (~100 MB) into the cache; later runs start it in ~1s.
    hookTimeout: 120_000,
  },
});
```

`packages/db/tsconfig.json`: change `"include": ["src"]` to `"include": ["src", "vitest.config.mts"]`.

`turbo.json`: add at the top level (Turbo's strict env mode hides unknown env vars from tasks):

```json
  "globalPassThroughEnv": ["MONGOMS_DOWNLOAD_DIR"],
```

`.github/workflows/ci.yml`: add a job-level `env` and a cache step before `pnpm install`:

```yaml
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      MONGOMS_DOWNLOAD_DIR: /home/runner/.cache/mongodb-binaries
    steps:
      - uses: actions/checkout@v7

      # mongod binary for mongodb-memory-server (packages/db, services/ingest tests).
      - uses: actions/cache@v4
        with:
          path: /home/runner/.cache/mongodb-binaries
          key: mongodb-binaries-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: mongodb-binaries-${{ runner.os }}-
```

(keep the existing steps after it unchanged).

- [ ] **Step 2: Shared place/group schemas**

`packages/shared/src/place.ts`:

```ts
import { z } from 'zod';
import { objectIdSchema } from './ids';

/** Pipeline state (architecture.md → Data model). */
export const ingestStatusSchema = z.enum(['processing', 'needs_info', 'saved', 'failed']);
/** User state, independent of the pipeline. */
export const visitStatusSchema = z.enum(['want_to_try', 'visited']);

/** GeoJSON point: coordinates are [lng, lat] (ready for a 2dsphere index later). */
export const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

/** Where a place came from; `telegramUpdateId` makes saving idempotent. */
export const telegramSourceSchema = z.object({
  telegramChatId: z.number().int(),
  telegramMessageId: z.number().int(),
  telegramUpdateId: z.number().int(),
  telegramUserId: z.number().int().optional(),
});

export const placeSchema = z.object({
  id: objectIdSchema,
  groupId: objectIdSchema,
  name: z.string().min(1),
  /** The resolved (long) Google Maps URL. */
  mapsUrl: z.url(),
  location: geoPointSchema,
  ingestStatus: ingestStatusSchema,
  visitStatus: visitStatusSchema,
  source: telegramSourceSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const groupSchema = z.object({
  id: objectIdSchema,
  name: z.string().min(1),
  telegramChatId: z.number().int(),
  createdAt: z.date(),
});

export type IngestStatus = z.infer<typeof ingestStatusSchema>;
export type VisitStatus = z.infer<typeof visitStatusSchema>;
export type GeoPoint = z.infer<typeof geoPointSchema>;
export type Place = z.infer<typeof placeSchema>;
export type NewTelegramPlace = Pick<Place, 'name' | 'mapsUrl' | 'location' | 'source'>;
export type Group = z.infer<typeof groupSchema>;
```

Append to `packages/shared/src/index.ts`:

```ts
export {
  geoPointSchema,
  groupSchema,
  ingestStatusSchema,
  placeSchema,
  telegramSourceSchema,
  visitStatusSchema,
  type GeoPoint,
  type Group,
  type IngestStatus,
  type NewTelegramPlace,
  type Place,
  type VisitStatus,
} from './place';
```

- [ ] **Step 3: Client, collections, indexes, test helper**

`packages/db/src/client.ts`:

```ts
import { type Db, MongoClient } from 'mongodb';

// One client per process: Lambda containers and the Next.js server reuse it across requests
// (Phase 1 plan → Mongo connection). Cached on globalThis so Next dev hot reload doesn't leak clients.
const cache = globalThis as typeof globalThis & { __angidayMongoClients?: Map<string, Promise<MongoClient>> };

export function getMongoClient(uri: string): Promise<MongoClient> {
  const clients = (cache.__angidayMongoClients ??= new Map());
  let client = clients.get(uri);
  if (!client) {
    client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5_000 }).connect();
    // Forget a failed connect so the next call retries instead of reusing the rejection.
    client.catch(() => clients.delete(uri));
    clients.set(uri, client);
  }
  return client;
}

/** The database named in the URI path (`…mongodb.net/angiday?…`). */
export async function getDb(uri: string): Promise<Db> {
  return (await getMongoClient(uri)).db();
}
```

`packages/db/src/collections.ts`:

```ts
import type { Group, Place } from '@angiday/shared';
import { type Db, ObjectId } from 'mongodb';

export type GroupDoc = Omit<Group, 'id'> & { _id: ObjectId };
export type PlaceDoc = Omit<Place, 'id' | 'groupId'> & { _id: ObjectId; groupId: ObjectId };
export interface TelegramUpdateDoc {
  groupId: ObjectId;
  updateId: number;
  status: 'processing' | 'done';
  createdAt: Date;
  doneAt?: Date;
}

export const groupsCollection = (db: Db) => db.collection<GroupDoc>('groups');
export const placesCollection = (db: Db) => db.collection<PlaceDoc>('places');
export const telegramUpdatesCollection = (db: Db) => db.collection<TelegramUpdateDoc>('telegram_updates');

/** groupId strings cross package boundaries; Mongo stores ObjectIds. Throws on a malformed id. */
export function toObjectId(id: string): ObjectId {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new Error('Invalid id: expected a 24-character hex ObjectId');
  return new ObjectId(id);
}
```

`packages/db/src/indexes.ts`:

```ts
import type { Db } from 'mongodb';
import { groupsCollection, placesCollection, telegramUpdatesCollection } from './collections';

/** Telegram stops redelivering an update after ~24h; a week of history is plenty for idempotency. */
export const TELEGRAM_UPDATE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Idempotent: safe to run on every seed and in every test. */
export async function ensureIndexes(db: Db): Promise<void> {
  await groupsCollection(db).createIndex({ telegramChatId: 1 }, { name: 'telegramChatId_unique', unique: true });
  await placesCollection(db).createIndexes([
    { key: { groupId: 1, createdAt: -1 }, name: 'groupId_createdAt' },
    {
      key: { groupId: 1, 'source.telegramUpdateId': 1 },
      name: 'groupId_telegramUpdateId_unique',
      unique: true,
      partialFilterExpression: { 'source.telegramUpdateId': { $exists: true } },
    },
  ]);
  await telegramUpdatesCollection(db).createIndexes([
    { key: { groupId: 1, updateId: 1 }, name: 'groupId_updateId_unique', unique: true },
    { key: { createdAt: 1 }, name: 'createdAt_ttl', expireAfterSeconds: TELEGRAM_UPDATE_TTL_SECONDS },
  ]);
}
```

`packages/db/src/testing/memory-mongo.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { ensureIndexes } from '../indexes';

/** A real mongod for integration tests (ADR-0015). One per test file; each call gets a fresh database. */
export async function startMemoryMongo(): Promise<{ db: Db; stop: () => Promise<void> }> {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  const db = client.db(`test_${randomUUID().slice(0, 8)}`);
  await ensureIndexes(db);
  return {
    db,
    stop: async () => {
      await client.close();
      await server.stop();
    },
  };
}
```

- [ ] **Step 4: Write the failing repository tests**

`packages/db/src/groups.test.ts`:

```ts
import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findGroupByTelegramChatId, upsertGroupByTelegramChatId } from './groups';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

describe('groups', () => {
  it('upsert is idempotent per Telegram chat id', async () => {
    const first = await upsertGroupByTelegramChatId(db, { telegramChatId: -1001, name: 'Nhà mình' });
    const second = await upsertGroupByTelegramChatId(db, { telegramChatId: -1001, name: 'Other name' });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Nhà mình');
    expect(first.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('finds a group by chat id, or null', async () => {
    const group = await upsertGroupByTelegramChatId(db, { telegramChatId: -1002, name: 'G2' });

    expect(await findGroupByTelegramChatId(db, -1002)).toEqual(group);
    expect(await findGroupByTelegramChatId(db, -1999)).toBeNull();
  });
});
```

`packages/db/src/places.test.ts`:

```ts
import type { NewTelegramPlace } from '@angiday/shared';
import { type Db, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placesCollection } from './collections';
import { listPlaces, upsertPlaceFromTelegram } from './places';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

const groupA = new ObjectId().toHexString();
const groupB = new ObjectId().toHexString();

function newPlace(updateId: number, name = `Quán ${updateId}`): NewTelegramPlace {
  return {
    name,
    mapsUrl: `https://www.google.com/maps/place/Q${updateId}/@10.7,106.7,17z`,
    location: { type: 'Point', coordinates: [106.7, 10.7] },
    source: { telegramChatId: -1001, telegramMessageId: updateId, telegramUpdateId: updateId, telegramUserId: 111 },
  };
}

describe('upsertPlaceFromTelegram', () => {
  it('saves a place with default statuses', async () => {
    const place = await upsertPlaceFromTelegram(db, groupA, newPlace(1, 'Phở Hòa'));

    expect(place).toMatchObject({ groupId: groupA, name: 'Phở Hòa', ingestStatus: 'saved', visitStatus: 'want_to_try' });
    expect(place.id).toMatch(/^[0-9a-f]{24}$/);
    expect(place.createdAt).toBeInstanceOf(Date);
  });

  it('is idempotent per (groupId, Telegram update id)', async () => {
    const first = await upsertPlaceFromTelegram(db, groupA, newPlace(2));
    const second = await upsertPlaceFromTelegram(db, groupA, newPlace(2));

    expect(second.id).toBe(first.id);
    expect(await placesCollection(db).countDocuments({ 'source.telegramUpdateId': 2 })).toBe(1);
  });

  it('rejects a malformed groupId', async () => {
    await expect(upsertPlaceFromTelegram(db, 'not-an-id', newPlace(3))).rejects.toThrow(/ObjectId/);
  });
});

describe('listPlaces', () => {
  it('returns only the group’s saved places, newest first', async () => {
    const older = await upsertPlaceFromTelegram(db, groupB, newPlace(10));
    const newer = await upsertPlaceFromTelegram(db, groupB, newPlace(11));
    await placesCollection(db).updateOne({ 'source.telegramUpdateId': 11 }, { $set: { createdAt: new Date(Date.now() + 1000) } });
    await upsertPlaceFromTelegram(db, groupA, newPlace(12));
    await placesCollection(db).insertOne({
      ...newPlace(13),
      _id: new ObjectId(),
      groupId: new ObjectId(groupB),
      ingestStatus: 'needs_info',
      visitStatus: 'want_to_try',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const places = await listPlaces(db, groupB);

    expect(places.map((p) => p.id)).toEqual([newer.id, older.id]);
  });

  it('applies the limit', async () => {
    expect(await listPlaces(db, groupB, { limit: 1 })).toHaveLength(1);
  });
});
```

`packages/db/src/telegram-updates.test.ts`:

```ts
import { type Db, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTelegramUpdate, markTelegramUpdateDone } from './telegram-updates';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

const groupId = new ObjectId().toHexString();

describe('telegram update idempotency', () => {
  it('new → retry while processing → done after marking', async () => {
    expect(await claimTelegramUpdate(db, groupId, 500)).toBe('new');
    expect(await claimTelegramUpdate(db, groupId, 500)).toBe('retry');

    await markTelegramUpdateDone(db, groupId, 500);

    expect(await claimTelegramUpdate(db, groupId, 500)).toBe('done');
  });

  it('two concurrent claims of a new update never both see "new"', async () => {
    const results = await Promise.all([claimTelegramUpdate(db, groupId, 501), claimTelegramUpdate(db, groupId, 501)]);

    expect(results.filter((r) => r === 'new')).toHaveLength(1);
  });
});
```

`packages/db/src/indexes.test.ts`:

```ts
import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { groupsCollection } from './collections';
import { ensureIndexes } from './indexes';
import { startMemoryMongo } from './testing/memory-mongo';

let db: Db;
let stop: () => Promise<void>;
beforeAll(async () => ({ db, stop } = await startMemoryMongo()));
afterAll(() => stop());

describe('ensureIndexes', () => {
  it('can run twice', async () => {
    await expect(ensureIndexes(db)).resolves.toBeUndefined();
  });

  it('enforces one group per Telegram chat', async () => {
    const doc = { name: 'G', telegramChatId: -1001, createdAt: new Date() };
    await groupsCollection(db).insertOne({ ...doc } as never);

    await expect(groupsCollection(db).insertOne({ ...doc } as never)).rejects.toThrow(/E11000/);
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `pnpm --filter @angiday/db test`
Expected: FAIL — cannot resolve `./groups`, `./places`, `./telegram-updates` (first run also downloads `mongod`; that may take a minute).

- [ ] **Step 6: Implement the repositories**

`packages/db/src/groups.ts`:

```ts
import type { Group } from '@angiday/shared';
import type { Db } from 'mongodb';
import { type GroupDoc, groupsCollection } from './collections';

function toGroup({ _id, ...rest }: GroupDoc): Group {
  return { ...rest, id: _id.toHexString() };
}

/**
 * Create the group for a Telegram chat, or return the existing one (used by `pnpm seed:group`).
 * Takes no groupId on purpose: it is how a group comes to exist (ADR-0002).
 */
export async function upsertGroupByTelegramChatId(
  db: Db,
  input: { telegramChatId: number; name: string },
): Promise<Group> {
  const doc = await groupsCollection(db).findOneAndUpdate(
    { telegramChatId: input.telegramChatId },
    { $setOnInsert: { telegramChatId: input.telegramChatId, name: input.name, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );
  if (!doc) throw new Error('Group upsert returned no document');
  return toGroup(doc);
}

/**
 * Resolve the tenant of an incoming Telegram chat. The one read that cannot take a groupId:
 * it is how the worker finds the groupId (ADR-0002).
 */
export async function findGroupByTelegramChatId(db: Db, telegramChatId: number): Promise<Group | null> {
  const doc = await groupsCollection(db).findOne({ telegramChatId });
  return doc ? toGroup(doc) : null;
}
```

`packages/db/src/places.ts`:

```ts
import type { NewTelegramPlace, Place } from '@angiday/shared';
import type { Db } from 'mongodb';
import { type PlaceDoc, placesCollection, toObjectId } from './collections';

function toPlace({ _id, groupId, ...rest }: PlaceDoc): Place {
  return { ...rest, id: _id.toHexString(), groupId: groupId.toHexString() };
}

/**
 * Save a place from a Telegram message. Idempotent per (groupId, source.telegramUpdateId): a retried
 * SQS message updates the same document instead of creating a duplicate.
 */
export async function upsertPlaceFromTelegram(db: Db, groupId: string, input: NewTelegramPlace): Promise<Place> {
  const groupObjectId = toObjectId(groupId);
  const now = new Date();
  const doc = await placesCollection(db).findOneAndUpdate(
    { groupId: groupObjectId, 'source.telegramUpdateId': input.source.telegramUpdateId },
    {
      $set: { name: input.name, mapsUrl: input.mapsUrl, location: input.location, ingestStatus: 'saved', updatedAt: now },
      $setOnInsert: { groupId: groupObjectId, visitStatus: 'want_to_try', source: input.source, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!doc) throw new Error('Place upsert returned no document');
  return toPlace(doc);
}

/** The group's saved places, newest first. `needs_info` / `failed` stay hidden (architecture.md → F2). */
export async function listPlaces(db: Db, groupId: string, options: { limit?: number } = {}): Promise<Place[]> {
  const docs = await placesCollection(db)
    .find({ groupId: toObjectId(groupId), ingestStatus: 'saved' })
    .sort({ createdAt: -1, _id: -1 })
    .limit(options.limit ?? 100)
    .toArray();
  return docs.map(toPlace);
}
```

`packages/db/src/telegram-updates.ts`:

```ts
import type { Db } from 'mongodb';
import { telegramUpdatesCollection, toObjectId } from './collections';

/**
 * Record that we started an update. `new` = first time; `retry` = seen before but never finished
 * (a crash or an SQS redelivery — process it again); `done` = finished, skip it (Phase 1 plan → Idempotency).
 */
export async function claimTelegramUpdate(db: Db, groupId: string, updateId: number): Promise<'new' | 'retry' | 'done'> {
  const groupObjectId = toObjectId(groupId);
  const before = await telegramUpdatesCollection(db).findOneAndUpdate(
    { groupId: groupObjectId, updateId },
    { $setOnInsert: { groupId: groupObjectId, updateId, status: 'processing', createdAt: new Date() } },
    { upsert: true, returnDocument: 'before' },
  );
  if (!before) return 'new';
  return before.status === 'done' ? 'done' : 'retry';
}

export async function markTelegramUpdateDone(db: Db, groupId: string, updateId: number): Promise<void> {
  await telegramUpdatesCollection(db).updateOne(
    { groupId: toObjectId(groupId), updateId },
    { $set: { status: 'done', doneAt: new Date() } },
  );
}
```

If the concurrent-claim test is flaky with an `E11000` error: MongoDB retries a duplicate-key upsert automatically only when the filter matches the unique index fields exactly (`groupId`, `updateId` — it does). If it still throws, catch `MongoServerError` code `11000` in `claimTelegramUpdate` and return `'retry'`; keep the test.

`packages/db/src/index.ts`:

```ts
export type { Db } from 'mongodb';
export { getDb, getMongoClient } from './client';
export { findGroupByTelegramChatId, upsertGroupByTelegramChatId } from './groups';
export { ensureIndexes, TELEGRAM_UPDATE_TTL_SECONDS } from './indexes';
export { listPlaces, upsertPlaceFromTelegram } from './places';
export { claimTelegramUpdate, markTelegramUpdateDone } from './telegram-updates';
```

- [ ] **Step 7: Run to verify they pass**

Run: `pnpm --filter @angiday/db test`
Expected: PASS (4 files).

- [ ] **Step 8: Full check, then commit (ask the owner first)**

Run: `pnpm check` — expected green.

```bash
git add packages/shared/src/place.ts packages/shared/src/index.ts packages/db turbo.json .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "feat(db): add Mongo client, groups/places/telegram_updates repositories and indexes"
```

**Part A done.** Good stopping point; note it in the session log if the session ends here.

---

## Part B — Lambda code

### Task 5: Lambda adapters — logging, cold-start config from SSM, Telegram API, link resolver

**Concept brief (Vietnamese, before coding):** SSM Parameter Store SecureString (encrypted with the AWS-managed KMS key `aws/ssm`; the Lambda only gets the parameter **name** in its env and reads the value at cold start, so secrets never appear in the CloudFormation template or the console); Powertools Parameters `getParametersByName`; Lambda cold start vs. warm invocation and why config is loaded once per container; why redirects are followed manually (limit hops, refuse non-Google hosts = no SSRF).

**Review note:** ADR-0015 names MSW for external HTTP in tests. This plan injects `fetch` instead (`createTelegramApi(token, fetchFn)`, `resolveMapsLink(url, { fetchFn })`): it is simpler, needs no extra dependency, and lets the resolver tests assert `redirect: 'manual'` directly. If the owner agrees, Task 13 records it; if not, swap the fakes for MSW handlers — the production code does not change.

**Files:**
- Modify: `services/ingest/package.json`, `services/ingest/tsconfig.json`
- Create: `services/ingest/vitest.config.mts`
- Create: `services/ingest/src/lib/log.ts`, `services/ingest/src/lib/memoize-async.ts`, `services/ingest/src/lib/lambda-env.ts`, `services/ingest/src/telegram/api.ts`, `services/ingest/src/maps/resolve-maps-link.ts`, `services/ingest/src/test/fixtures.ts`
- Test: `services/ingest/src/lib/memoize-async.test.ts`, `services/ingest/src/lib/lambda-env.test.ts`, `services/ingest/src/telegram/api.test.ts`, `services/ingest/src/maps/resolve-maps-link.test.ts`

**Interfaces:**
- Consumes: `loadAppEnv`, `AppEnv`, `AppEnvKey`, `isGoogleMapsHost` (`@angiday/shared`).
- Produces:
  - `interface Log { info(message: string, extra?: Record<string, unknown>): void; warn(...): void; error(...): void }`, `interface KeyedLog extends Log { appendKeys(keys: Record<string, unknown>): void; removeKeys(keys: string[]): void }`, `errorFields(error: unknown): Record<string, unknown>`
  - `memoizeAsync<T>(load: () => Promise<T>): () => Promise<T>`
  - `loadLambdaEnv<K extends AppEnvKey>(keys: readonly K[], env: Record<string, string | undefined>, fetchParameters?: (names: string[]) => Promise<Record<string, string>>): Promise<Pick<AppEnv, K>>` — reads env `<KEY>_PARAM` for each key.
  - `createTelegramApi(token: string, fetchFn?: typeof fetch): TelegramApi` with `sendMessage({ chatId, text, replyToMessageId?, threadId? }): Promise<{ messageId: number }>`, `setWebhook({ url, secretToken, allowedUpdates, dropPendingUpdates? }): Promise<void>`, `getWebhookInfo(): Promise<WebhookInfo>`; `class TelegramApiError`.
  - `resolveMapsLink(url: string, options?: { fetchFn?: typeof fetch; maxHops?: number; timeoutMs?: number }): Promise<string | null>` — null when the chain leaves Google hosts or exceeds `maxHops` (default 5); throws on network error or HTTP 5xx (so SQS retries).
  - Test helpers in `src/test/fixtures.ts`: `createTestLog(): KeyedLog & { [k]: Mock }`, `makeUpdate(overrides?)`, `makeJob(overrides?)`, `TEST_CHAT_ID`.

- [ ] **Step 1: Dependencies and config**

```bash
pnpm --filter @angiday/ingest add "@angiday/db@workspace:*" @aws-lambda-powertools/logger @aws-lambda-powertools/parameters @aws-sdk/client-ssm @aws-sdk/client-sqs
pnpm --filter @angiday/ingest add -D @types/aws-lambda tsx
```

`services/ingest/vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Worker tests start mongodb-memory-server; the first run downloads mongod.
    hookTimeout: 120_000,
  },
});
```

`services/ingest/tsconfig.json`: `"include": ["src", "scripts", "vitest.config.mts"]`.

- [ ] **Step 2: Logging helpers and test fixtures (no tests of their own)**

`services/ingest/src/lib/log.ts`:

```ts
/** What our code needs from a logger. Powertools `Logger` satisfies it; tests pass `createTestLog()`. */
export interface Log {
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

/** A logger whose persistent keys (updateId, route) are added per SQS record and removed after it. */
export interface KeyedLog extends Log {
  appendKeys(keys: Record<string, unknown>): void;
  removeKeys(keys: string[]): void;
}

/** Errors as plain fields, so they survive JSON logging. */
export function errorFields(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
    : { errorMessage: String(error) };
}
```

`services/ingest/src/test/fixtures.ts`:

```ts
import type { IngestJob, TelegramMessage, TelegramUpdate } from '@angiday/shared';
import { vi } from 'vitest';
import type { KeyedLog } from '../lib/log';

export const TEST_CHAT_ID = -1001234567890;
export const TEST_SHORT_LINK = 'https://maps.app.goo.gl/AbC123xyz';
export const TEST_PLACE_URL =
  'https://www.google.com/maps/place/Ph%E1%BB%9F+H%C3%B2a/@10.7895162,106.6880276,17z/data=!3m1!4b1!4m6!3m5!1s0x1:0x2!8m2!3d10.7895109!4d106.6906025';

export function createTestLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), appendKeys: vi.fn(), removeKeys: vi.fn() } satisfies KeyedLog;
}

export function makeUpdate(message: Partial<TelegramMessage> = {}, updateId = 9001): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: 42,
      from: { id: 111, is_bot: false },
      chat: { id: TEST_CHAT_ID, type: 'supergroup' },
      text: `ngon nè ${TEST_SHORT_LINK}`,
      ...message,
    },
  };
}

export function makeJob(overrides: Partial<IngestJob> = {}): IngestJob {
  return {
    route: 'maps_link',
    updateId: 9001,
    chatId: TEST_CHAT_ID,
    messageId: 42,
    userId: 111,
    text: `ngon nè ${TEST_SHORT_LINK}`,
    mapsUrl: TEST_SHORT_LINK,
    ...overrides,
  };
}
```

- [ ] **Step 3: Write the failing tests**

`services/ingest/src/lib/memoize-async.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { memoizeAsync } from './memoize-async';

describe('memoizeAsync', () => {
  it('loads once and shares the result', async () => {
    const load = vi.fn().mockResolvedValue('config');
    const get = memoizeAsync(load);

    expect(await Promise.all([get(), get()])).toEqual(['config', 'config']);
    expect(await get()).toBe('config');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load so the next invocation retries (no poisoned warm container)', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('SSM throttled')).mockResolvedValueOnce('config');
    const get = memoizeAsync(load);

    await expect(get()).rejects.toThrow('SSM throttled');
    expect(await get()).toBe('config');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
```

`services/ingest/src/lib/lambda-env.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { loadLambdaEnv } from './lambda-env';

describe('loadLambdaEnv', () => {
  const env = {
    TELEGRAM_WEBHOOK_SECRET_PARAM: '/angiday/telegram-webhook-secret',
    TELEGRAM_ALLOWED_CHAT_IDS_PARAM: '/angiday/allowed-chat-ids',
  };

  it('reads each <KEY>_PARAM from SSM and validates the values', async () => {
    const fetchParameters = vi.fn().mockResolvedValue({
      '/angiday/telegram-webhook-secret': 'deadbeef',
      '/angiday/allowed-chat-ids': '-100123,-100456',
    });

    const result = await loadLambdaEnv(['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS'], env, fetchParameters);

    expect(fetchParameters).toHaveBeenCalledWith(['/angiday/telegram-webhook-secret', '/angiday/allowed-chat-ids']);
    expect(result).toEqual({ TELEGRAM_WEBHOOK_SECRET: 'deadbeef', TELEGRAM_ALLOWED_CHAT_IDS: [-100123, -100456] });
  });

  it('fails clearly when CDK did not set a parameter name', async () => {
    await expect(loadLambdaEnv(['MONGODB_URI'], env, vi.fn())).rejects.toThrow('MONGODB_URI_PARAM is not set');
  });

  it('fails validation without echoing the secret value', async () => {
    const fetchParameters = vi.fn().mockResolvedValue({ '/angiday/allowed-chat-ids': 'secret-garbage' });

    const load = loadLambdaEnv(['TELEGRAM_ALLOWED_CHAT_IDS'], env, fetchParameters);

    await expect(load).rejects.toThrow(/TELEGRAM_ALLOWED_CHAT_IDS/);
    await expect(load).rejects.not.toThrow(/secret-garbage/);
  });
});
```

`services/ingest/src/telegram/api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTelegramApi, TelegramApiError } from './api';

const TOKEN = '123456:SECRET-TOKEN';

function fakeFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));
}

describe('createTelegramApi', () => {
  it('sendMessage posts JSON with reply and topic parameters', async () => {
    const fetchFn = fakeFetch({ ok: true, result: { message_id: 555 } });
    const api = createTelegramApi(TOKEN, fetchFn);

    const result = await api.sendMessage({ chatId: -100123, text: 'Đã lưu: Phở Hòa', replyToMessageId: 42, threadId: 77 });

    expect(result).toEqual({ messageId: 555 });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: -100123,
      text: 'Đã lưu: Phở Hòa',
      message_thread_id: 77,
      reply_parameters: { message_id: 42, allow_sending_without_reply: true },
      link_preview_options: { is_disabled: true },
    });
  });

  it('omits message_thread_id when there is no topic', async () => {
    const fetchFn = fakeFetch({ ok: true, result: { message_id: 1 } });

    await createTelegramApi(TOKEN, fetchFn).sendMessage({ chatId: -100123, text: 'x' });

    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body))).not.toHaveProperty('message_thread_id');
  });

  it('throws TelegramApiError on ok:false without leaking the token', async () => {
    const api = createTelegramApi(TOKEN, fakeFetch({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, 400));

    const call = api.sendMessage({ chatId: 1, text: 'x' });

    await expect(call).rejects.toBeInstanceOf(TelegramApiError);
    await expect(call).rejects.toThrow('sendMessage failed (400): Bad Request: chat not found');
  });

  it('redacts the token from network errors', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError(`fetch failed for /bot${TOKEN}/sendMessage`));

    const call = createTelegramApi(TOKEN, fetchFn).sendMessage({ chatId: 1, text: 'x' });

    await expect(call).rejects.toThrow(TelegramApiError);
    await expect(call).rejects.not.toThrow(/SECRET-TOKEN/);
  });

  it('setWebhook sends secret_token and allowed_updates', async () => {
    const fetchFn = fakeFetch({ ok: true, result: true });

    await createTelegramApi(TOKEN, fetchFn).setWebhook({
      url: 'https://abc.lambda-url.ap-southeast-1.on.aws/',
      secretToken: 'deadbeef',
      allowedUpdates: ['message'],
      dropPendingUpdates: true,
    });

    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body))).toEqual({
      url: 'https://abc.lambda-url.ap-southeast-1.on.aws/',
      secret_token: 'deadbeef',
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
  });
});
```

`services/ingest/src/maps/resolve-maps-link.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { TEST_PLACE_URL, TEST_SHORT_LINK } from '../test/fixtures';
import { resolveMapsLink } from './resolve-maps-link';

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

/** Fake fetch: a map from URL to the response it returns. */
function fakeFetch(routes: Record<string, Response>) {
  return vi.fn<typeof fetch>(async (input) => routes[String(input)] ?? new Response('not found', { status: 404 }));
}

describe('resolveMapsLink', () => {
  it('follows a short link to the place URL with manual redirects', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: redirect(TEST_PLACE_URL) });

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).toBe(TEST_PLACE_URL);
    expect(fetchFn.mock.calls[0]![1]?.redirect).toBe('manual');
  });

  it('follows relative Location headers and several hops', async () => {
    const fetchFn = fakeFetch({
      [TEST_SHORT_LINK]: redirect('https://www.google.com/maps?share=1'),
      'https://www.google.com/maps?share=1': redirect(new URL(TEST_PLACE_URL).pathname, 301),
    });

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).toBe(TEST_PLACE_URL.replace(/\?.*$/, ''));
  });

  it('returns a long place URL without any request', async () => {
    const fetchFn = fakeFetch({});

    expect(await resolveMapsLink(TEST_PLACE_URL, { fetchFn })).toBe(TEST_PLACE_URL);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses to follow a redirect to a non-Google host', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: redirect('http://169.254.169.254/latest/meta-data') });

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxHops (redirect loop)', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: redirect(TEST_SHORT_LINK) });
    fetchFn.mockImplementation(async () => redirect(TEST_SHORT_LINK));

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn, maxHops: 3 })).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('returns the last URL when Google answers 200 with a non-place page', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: new Response('<html>consent</html>', { status: 200 }) });

    expect(await resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).toBe(TEST_SHORT_LINK);
  });

  it('throws on HTTP 5xx so SQS retries', async () => {
    const fetchFn = fakeFetch({ [TEST_SHORT_LINK]: new Response('oops', { status: 503 }) });

    await expect(resolveMapsLink(TEST_SHORT_LINK, { fetchFn })).rejects.toThrow('HTTP 503');
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm --filter @angiday/ingest test`
Expected: FAIL — cannot resolve `./memoize-async`, `./lambda-env`, `./api`, `./resolve-maps-link`.

- [ ] **Step 5: Implement**

`services/ingest/src/lib/memoize-async.ts`:

```ts
/**
 * Load something once per Lambda container (config, DB client) and share the promise.
 * A rejected load is forgotten, so one failed cold start doesn't fail every later invocation.
 */
export function memoizeAsync<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
```

`services/ingest/src/lib/lambda-env.ts`:

```ts
import { getParametersByName } from '@aws-lambda-powertools/parameters/ssm';
import { type AppEnv, type AppEnvKey, loadAppEnv } from '@angiday/shared';

type FetchParameters = (names: string[]) => Promise<Record<string, string>>;

/** SSM GetParameters with decryption (SecureString); throws if any name is missing. */
const fetchFromSsm: FetchParameters = async (names) =>
  (await getParametersByName(
    Object.fromEntries(names.map((name) => [name, {}])),
    { decrypt: true },
  )) as Record<string, string>;

/**
 * Lambda env holds only SSM parameter *names* (`<KEY>_PARAM`, set by CDK); the values are read here
 * at cold start and validated with the app env schema. Wrap the call in `memoizeAsync`.
 */
export async function loadLambdaEnv<K extends AppEnvKey>(
  keys: readonly K[],
  env: Record<string, string | undefined>,
  fetchParameters: FetchParameters = fetchFromSsm,
): Promise<Pick<AppEnv, K>> {
  const names = keys.map((key) => {
    const name = env[`${key}_PARAM`];
    if (!name) throw new Error(`${key}_PARAM is not set`);
    return [key, name] as const;
  });
  const values = await fetchParameters(names.map(([, name]) => name));
  return loadAppEnv(Object.fromEntries(names.map(([key, name]) => [key, values[name]])), keys);
}
```

`services/ingest/src/telegram/api.ts`:

```ts
export interface SendMessageInput {
  chatId: number;
  text: string;
  replyToMessageId?: number;
  /** Forum topic id; omit for General / chats without topics. */
  threadId?: number;
}

export interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
}

export interface TelegramApi {
  sendMessage(input: SendMessageInput): Promise<{ messageId: number }>;
  setWebhook(input: { url: string; secretToken: string; allowedUpdates: string[]; dropPendingUpdates?: boolean }): Promise<void>;
  getWebhookInfo(): Promise<WebhookInfo>;
}

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number | undefined,
    description: string,
  ) {
    super(`Telegram ${method} failed${errorCode === undefined ? '' : ` (${errorCode})`}: ${description}`);
    this.name = 'TelegramApiError';
  }
}

interface TelegramResponse<T> {
  ok?: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

/** Minimal Bot API client. The token is part of every URL, so errors are built here and never carry it. */
export function createTelegramApi(token: string, fetchFn: typeof fetch = fetch): TelegramApi {
  const redact = (text: string) => text.replaceAll(token, '<token>');

  async function call<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new TelegramApiError(method, undefined, redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error)));
    }
    const json = (await response.json().catch(() => null)) as TelegramResponse<T> | null;
    if (!json?.ok) {
      throw new TelegramApiError(method, json?.error_code ?? response.status, redact(json?.description ?? 'unexpected response'));
    }
    return json.result as T;
  }

  return {
    async sendMessage({ chatId, text, replyToMessageId, threadId }) {
      const message = await call<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text,
        message_thread_id: threadId,
        reply_parameters:
          replyToMessageId === undefined ? undefined : { message_id: replyToMessageId, allow_sending_without_reply: true },
        link_preview_options: { is_disabled: true },
      });
      return { messageId: message.message_id };
    },
    async setWebhook({ url, secretToken, allowedUpdates, dropPendingUpdates = false }) {
      await call<boolean>('setWebhook', {
        url,
        secret_token: secretToken,
        allowed_updates: allowedUpdates,
        drop_pending_updates: dropPendingUpdates,
      });
    },
    getWebhookInfo: () => call<WebhookInfo>('getWebhookInfo'),
  };
}
```

`services/ingest/src/maps/resolve-maps-link.ts`:

```ts
import { isGoogleMapsHost } from '@angiday/shared';

export interface ResolveMapsLinkOptions {
  fetchFn?: typeof fetch;
  maxHops?: number;
  timeoutMs?: number;
}

/**
 * Follow a shared Maps link (`maps.app.goo.gl/…`) to its long `/maps/place/…` URL, one redirect at a
 * time (ADR-0016). Every hop must stay on a Google Maps host, so a crafted link can't make the worker
 * call arbitrary URLs. Returns the last URL reached (the parser decides if it is usable), or null when
 * the chain leaves Google or exceeds `maxHops`. Network errors and 5xx throw so SQS retries.
 */
export async function resolveMapsLink(
  url: string,
  { fetchFn = fetch, maxHops = 5, timeoutMs = 5_000 }: ResolveMapsLinkOptions = {},
): Promise<string | null> {
  let current = url;
  for (let hop = 0; ; hop++) {
    const parsed = URL.parse(current);
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !isGoogleMapsHost(parsed.hostname)) {
      return null;
    }
    if (parsed.pathname.startsWith('/maps/place/')) return current;
    if (hop === maxHops) return null;

    const response = await fetchFn(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    await response.body?.cancel();
    if (response.status >= 500) throw new Error(`Maps link resolution failed: HTTP ${response.status}`);

    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return current;
    current = new URL(location, current).toString();
  }
}
```

(`URL.parse` is available in Node 24 and returns null instead of throwing.)

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm --filter @angiday/ingest test`
Expected: PASS (the S0 wiring test still passes too; it is removed in Task 6).

If `tsc` rejects Powertools' `Logger` as a `KeyedLog` later (Task 6/7), widen the interface parameter types to match Powertools' signatures rather than casting at call sites.

- [ ] **Step 7: Commit (ask the owner first)**

```bash
git add services/ingest/package.json services/ingest/tsconfig.json services/ingest/vitest.config.mts services/ingest/src/lib services/ingest/src/telegram services/ingest/src/maps services/ingest/src/test pnpm-lock.yaml
git commit -m "feat(ingest): add SSM env loader, Telegram client and Maps link resolver"
```

---

### Task 6: Webhook handler

**Concept brief (Vietnamese, before coding):** Lambda Function URL (a public HTTPS endpoint on the Lambda itself, no API Gateway; auth `NONE` because Telegram can't sign with IAM — we authenticate with Telegram's `X-Telegram-Bot-Api-Secret-Token` header instead); Function URL event shape (lower-cased headers, maybe base64 body); why the webhook answers 200 for anything it drops (Telegram retries non-2xx for up to 24h) but 500 when the queue write fails (we *want* that retry); SQS `SendMessage`.

**Files:**
- Create: `services/ingest/src/webhook/create-webhook-handler.ts`, `services/ingest/src/webhook/handler.ts`
- Test: `services/ingest/src/webhook/create-webhook-handler.test.ts`
- Delete: `services/ingest/src/workspace-wiring.test.ts` (S0 carry-over 3: the handler test now imports real code from `@angiday/shared`)

**Interfaces:**
- Consumes: `routeUpdate`, `telegramUpdateSchema`, `IngestJob` (`@angiday/shared`); `Log`, `errorFields`, `memoizeAsync`, `loadLambdaEnv` (Task 5).
- Produces:
  - `interface WebhookConfig { TELEGRAM_WEBHOOK_SECRET: string; TELEGRAM_ALLOWED_CHAT_IDS: number[] }`
  - `createWebhookHandler(deps: { getConfig: () => Promise<WebhookConfig>; enqueue: (job: IngestJob) => Promise<void>; logger: Log }): (event: LambdaFunctionURLEvent) => Promise<LambdaFunctionURLResult>`
  - Lambda entry `services/ingest/src/webhook/handler.ts` exporting `handler`; env: `QUEUE_URL`, `TELEGRAM_WEBHOOK_SECRET_PARAM`, `TELEGRAM_ALLOWED_CHAT_IDS_PARAM`, `POWERTOOLS_SERVICE_NAME` (Task 8 sets them).

- [ ] **Step 1: Write the failing tests**

`services/ingest/src/webhook/create-webhook-handler.test.ts`:

```ts
import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createTestLog, makeJob, makeUpdate, TEST_CHAT_ID } from '../test/fixtures';
import { createWebhookHandler } from './create-webhook-handler';

const SECRET = 'deadbeef';

function event(body: unknown, headers: Record<string, string> = { 'x-telegram-bot-api-secret-token': SECRET }) {
  return { headers, body: typeof body === 'string' ? body : JSON.stringify(body), isBase64Encoded: false } as unknown as LambdaFunctionURLEvent;
}

function setup(enqueue = vi.fn().mockResolvedValue(undefined)) {
  const logger = createTestLog();
  const handler = createWebhookHandler({
    getConfig: async () => ({ TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_ALLOWED_CHAT_IDS: [TEST_CHAT_ID] }),
    enqueue,
    logger,
  });
  return { handler, enqueue, logger };
}

describe('webhook handler', () => {
  it('enqueues a Maps link from the allowed chat and answers 200', async () => {
    const { handler, enqueue } = setup();

    const result = await handler(event(makeUpdate()));

    expect(result.statusCode).toBe(200);
    expect(enqueue).toHaveBeenCalledWith(makeJob());
  });

  it.each([
    ['missing', {}],
    ['wrong', { 'x-telegram-bot-api-secret-token': 'nope' }],
  ])('rejects a %s secret header with 401 and enqueues nothing', async (_label, headers) => {
    const { handler, enqueue } = setup();

    const result = await handler(event(makeUpdate(), headers));

    expect(result.statusCode).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ['a message from another chat', makeUpdate({ chat: { id: -100999, type: 'supergroup' } })],
    ['a message without a Maps link', makeUpdate({ text: 'ăn gì đây' })],
    ['a body that is not JSON', 'not json'],
    ['a body that is not an Update', { hello: 'world' }],
  ])('drops %s with 200 (Telegram must not retry it)', async (_label, body) => {
    const { handler, enqueue } = setup();

    const result = await handler(event(body));

    expect(result.statusCode).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('decodes a base64 body', async () => {
    const { handler, enqueue } = setup();
    const base64 = {
      ...event(makeUpdate()),
      body: Buffer.from(JSON.stringify(makeUpdate())).toString('base64'),
      isBase64Encoded: true,
    } as LambdaFunctionURLEvent;

    await handler(base64);

    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('answers 500 when the queue write fails, so Telegram retries', async () => {
    const { handler, logger } = setup(vi.fn().mockRejectedValue(new Error('SQS down')));

    const result = await handler(event(makeUpdate()));

    expect(result.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs the updateId and route as correlation fields', async () => {
    const { handler, logger } = setup();

    await handler(event(makeUpdate()));

    expect(logger.info).toHaveBeenCalledWith('Routed update', expect.objectContaining({ updateId: 9001, route: 'maps_link' }));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @angiday/ingest test`
Expected: FAIL — cannot resolve `./create-webhook-handler`.

- [ ] **Step 3: Implement**

`services/ingest/src/webhook/create-webhook-handler.ts`:

```ts
import { createHash, timingSafeEqual } from 'node:crypto';
import { type IngestJob, routeUpdate, type TelegramUpdate, telegramUpdateSchema } from '@angiday/shared';
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';
import { errorFields, type Log } from '../lib/log';

export interface WebhookConfig {
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_CHAT_IDS: number[];
}

export interface WebhookDeps {
  getConfig: () => Promise<WebhookConfig>;
  enqueue: (job: IngestJob) => Promise<void>;
  logger: Log;
}

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/** Constant-time comparison; hashing first makes the lengths equal. */
function secretMatches(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function parseUpdate(event: LambdaFunctionURLEvent): TelegramUpdate | null {
  if (!event.body) return null;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    const result = telegramUpdateSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Telegram webhook (architecture.md → F1, first hop): verify the secret, route, enqueue, ack fast.
 * Anything we drop gets 200 so Telegram doesn't retry it; only a failed enqueue returns 500.
 */
export function createWebhookHandler({ getConfig, enqueue, logger }: WebhookDeps) {
  return async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> => {
    try {
      const config = await getConfig();
      if (!secretMatches(event.headers[SECRET_HEADER], config.TELEGRAM_WEBHOOK_SECRET)) {
        logger.warn('Rejected webhook call: bad secret header');
        return { statusCode: 401 };
      }

      const update = parseUpdate(event);
      if (!update) {
        logger.warn('Dropped webhook body: not a Telegram update');
        return { statusCode: 200 };
      }

      const decision = routeUpdate(update, config.TELEGRAM_ALLOWED_CHAT_IDS);
      logger.info('Routed update', {
        updateId: update.update_id,
        chatId: update.message?.chat.id,
        route: decision.kind === 'enqueue' ? decision.job.route : 'drop',
        dropReason: decision.kind === 'drop' ? decision.reason : undefined,
      });
      if (decision.kind === 'enqueue') await enqueue(decision.job);
      return { statusCode: 200 };
    } catch (error) {
      logger.error('Webhook failed; Telegram will retry', errorFields(error));
      return { statusCode: 500 };
    }
  };
}
```

`services/ingest/src/webhook/handler.ts`:

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { loadLambdaEnv } from '../lib/lambda-env';
import { memoizeAsync } from '../lib/memoize-async';
import { createWebhookHandler } from './create-webhook-handler';

// Lambda entry: wiring only. Created once per container and reused by warm invocations.
const logger = new Logger(); // service name from POWERTOOLS_SERVICE_NAME
const sqs = new SQSClient({});

export const handler = createWebhookHandler({
  logger,
  getConfig: memoizeAsync(() => loadLambdaEnv(['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS'], process.env)),
  enqueue: async (job) => {
    const queueUrl = process.env.QUEUE_URL;
    if (!queueUrl) throw new Error('QUEUE_URL is not set');
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) }));
  },
});
```

Delete the S0 wiring test:

```bash
git rm services/ingest/src/workspace-wiring.test.ts
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @angiday/ingest test && pnpm --filter @angiday/ingest typecheck`
Expected: PASS; typecheck green (this is where `Logger` must satisfy `Log`).

- [ ] **Step 5: Commit (ask the owner first)**

```bash
git add services/ingest/src/webhook
git commit -m "feat(ingest): add Telegram webhook handler; drop the S0 wiring test"
```

---

### Task 7: Worker — process a job, SQS handler

**Concept brief (Vietnamese, before coding):** SQS standard queue = at-least-once delivery (duplicates happen → idempotency); visibility timeout; event source mapping with `batchSize: 1` and `ReportBatchItemFailures` (return the ids of failed records; only those are retried); `maxReceiveCount: 3` → DLQ. Why "unknown group" and "unreadable link" are *not* failures (a retry can't fix them) while a network error is.

**Files:**
- Create: `services/ingest/src/worker/process-ingest-job.ts`, `services/ingest/src/worker/create-worker-handler.ts`, `services/ingest/src/worker/handler.ts`
- Test: `services/ingest/src/worker/process-ingest-job.test.ts`, `services/ingest/src/worker/create-worker-handler.test.ts`

**Interfaces:**
- Consumes: `parseMapsPlaceUrl`, `ingestJobSchema`, `IngestJob` (`@angiday/shared`); `findGroupByTelegramChatId`, `claimTelegramUpdate`, `markTelegramUpdateDone`, `upsertPlaceFromTelegram`, `getDb`, `Db` (`@angiday/db`); `startMemoryMongo` (`@angiday/db/testing`); `TelegramApi`, `resolveMapsLink`, `loadLambdaEnv`, `memoizeAsync`, `Log`, `KeyedLog` (Task 5).
- Produces:
  - `type ProcessOutcome = 'saved' | 'unparsed' | 'duplicate' | 'unknown_group'`
  - `interface ProcessIngestJobDeps { db: Db; telegram: Pick<TelegramApi, 'sendMessage'>; resolveMapsLink: (url: string) => Promise<string | null>; logger: Log }`
  - `processIngestJob(job: IngestJob, deps: ProcessIngestJobDeps): Promise<ProcessOutcome>`
  - `replySaved(name: string): string` (`"Đã lưu: <name>"`), `REPLY_UNREADABLE_LINK: string`
  - `createWorkerHandler(deps: { processJob: (job: IngestJob) => Promise<ProcessOutcome>; logger: KeyedLog }): (event: SQSEvent) => Promise<SQSBatchResponse>`
  - Lambda entry `services/ingest/src/worker/handler.ts` exporting `handler`; env: `MONGODB_URI_PARAM`, `TELEGRAM_BOT_TOKEN_PARAM`, `POWERTOOLS_SERVICE_NAME`.

- [ ] **Step 1: Write the failing tests**

`services/ingest/src/worker/process-ingest-job.test.ts`:

```ts
import { type Db, upsertGroupByTelegramChatId } from '@angiday/db';
import { startMemoryMongo } from '@angiday/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestLog, makeJob, TEST_CHAT_ID, TEST_PLACE_URL } from '../test/fixtures';
import { processIngestJob, REPLY_UNREADABLE_LINK, replySaved } from './process-ingest-job';

let db: Db;
let stop: () => Promise<void>;
let groupId: string;
beforeAll(async () => {
  ({ db, stop } = await startMemoryMongo());
  groupId = (await upsertGroupByTelegramChatId(db, { telegramChatId: TEST_CHAT_ID, name: 'Test' })).id;
});
afterAll(() => stop());

let nextUpdateId = 1;
let sendMessage: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sendMessage = vi.fn().mockResolvedValue({ messageId: 999 });
});

function deps(overrides: { resolveMapsLink?: (url: string) => Promise<string | null> } = {}) {
  return {
    db,
    telegram: { sendMessage },
    resolveMapsLink: overrides.resolveMapsLink ?? (async () => TEST_PLACE_URL),
    logger: createTestLog(),
  };
}

const places = () => db.collection('places');

describe('processIngestJob', () => {
  it('saves the place and replies in the same topic', async () => {
    const job = makeJob({ updateId: nextUpdateId++, threadId: 77 });

    expect(await processIngestJob(job, deps())).toBe('saved');

    const saved = await places().findOne({ 'source.telegramUpdateId': job.updateId });
    expect(saved).toMatchObject({
      name: 'Phở Hòa',
      mapsUrl: TEST_PLACE_URL,
      location: { type: 'Point', coordinates: [106.6906025, 10.7895109] },
      ingestStatus: 'saved',
    });
    expect(saved?.groupId.toHexString()).toBe(groupId);
    expect(sendMessage).toHaveBeenCalledWith({ chatId: TEST_CHAT_ID, text: replySaved('Phở Hòa'), replyToMessageId: 42, threadId: 77 });
  });

  it('skips an update that already finished: one place, one reply', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });

    await processIngestJob(job, deps());
    const second = await processIngestJob(job, deps());

    expect(second).toBe('duplicate');
    expect(await places().countDocuments({ 'source.telegramUpdateId': job.updateId })).toBe(1);
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('a retry after a crash between saving and replying still replies, without a second place', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });
    sendMessage.mockRejectedValueOnce(new Error('Telegram timeout'));

    await expect(processIngestJob(job, deps())).rejects.toThrow('Telegram timeout');
    expect(await processIngestJob(job, deps())).toBe('saved');

    expect(await places().countDocuments({ 'source.telegramUpdateId': job.updateId })).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('replies "chưa đọc được" and saves nothing when the link has no place', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });

    const outcome = await processIngestJob(job, deps({ resolveMapsLink: async () => 'https://www.google.com/maps?q=x' }));

    expect(outcome).toBe('unparsed');
    expect(await places().countDocuments({ 'source.telegramUpdateId': job.updateId })).toBe(0);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text: REPLY_UNREADABLE_LINK }));
    expect(await processIngestJob(job, deps())).toBe('duplicate');
  });

  it('treats a resolver refusal (non-Google redirect) as unreadable', async () => {
    const outcome = await processIngestJob(makeJob({ updateId: nextUpdateId++ }), deps({ resolveMapsLink: async () => null }));

    expect(outcome).toBe('unparsed');
  });

  it('does nothing for a chat with no group (seed missing) and does not throw', async () => {
    const outcome = await processIngestJob(makeJob({ updateId: nextUpdateId++, chatId: -100777 }), deps());

    expect(outcome).toBe('unknown_group');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('lets a resolver network error propagate so SQS retries', async () => {
    const job = makeJob({ updateId: nextUpdateId++ });

    await expect(
      processIngestJob(job, deps({ resolveMapsLink: async () => Promise.reject(new Error('ECONNRESET')) })),
    ).rejects.toThrow('ECONNRESET');
  });
});
```

`services/ingest/src/worker/create-worker-handler.test.ts`:

```ts
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createTestLog, makeJob } from '../test/fixtures';
import { createWorkerHandler } from './create-worker-handler';

function record(messageId: string, body: unknown): SQSRecord {
  return {
    messageId,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    attributes: { ApproximateReceiveCount: '1' },
  } as unknown as SQSRecord;
}

describe('worker handler', () => {
  it('reports no failures when the job succeeds', async () => {
    const processJob = vi.fn().mockResolvedValue('saved');
    const handler = createWorkerHandler({ processJob, logger: createTestLog() });

    const result = await handler({ Records: [record('m1', makeJob())] } as SQSEvent);

    expect(result).toEqual({ batchItemFailures: [] });
    expect(processJob).toHaveBeenCalledWith(makeJob());
  });

  it('reports the failed record so only it is retried', async () => {
    const processJob = vi.fn().mockResolvedValueOnce('saved').mockRejectedValueOnce(new Error('boom'));
    const handler = createWorkerHandler({ processJob, logger: createTestLog() });

    const result = await handler({ Records: [record('ok', makeJob()), record('bad', makeJob({ updateId: 2 }))] } as SQSEvent);

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'bad' }] });
  });

  it('fails a malformed body (goes to the DLQ after retries, where we can see it)', async () => {
    const processJob = vi.fn();
    const handler = createWorkerHandler({ processJob, logger: createTestLog() });

    const result = await handler({ Records: [record('junk', { route: 'nope' })] } as SQSEvent);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'junk' }]);
    expect(processJob).not.toHaveBeenCalled();
  });

  it('adds updateId/route to every log line of the record and removes them afterwards', async () => {
    const logger = createTestLog();
    const handler = createWorkerHandler({ processJob: vi.fn().mockResolvedValue('saved'), logger });

    await handler({ Records: [record('m1', makeJob())] } as SQSEvent);

    expect(logger.appendKeys).toHaveBeenCalledWith({ updateId: 9001, route: 'maps_link' });
    expect(logger.removeKeys).toHaveBeenCalledWith(['updateId', 'route']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @angiday/ingest test`
Expected: FAIL — cannot resolve `./process-ingest-job`, `./create-worker-handler`.

- [ ] **Step 3: Implement**

`services/ingest/src/worker/process-ingest-job.ts`:

```ts
import {
  claimTelegramUpdate,
  type Db,
  findGroupByTelegramChatId,
  markTelegramUpdateDone,
  upsertPlaceFromTelegram,
} from '@angiday/db';
import { type IngestJob, parseMapsPlaceUrl } from '@angiday/shared';
import type { Log } from '../lib/log';
import type { TelegramApi } from '../telegram/api';

export type ProcessOutcome = 'saved' | 'unparsed' | 'duplicate' | 'unknown_group';

export interface ProcessIngestJobDeps {
  db: Db;
  telegram: Pick<TelegramApi, 'sendMessage'>;
  resolveMapsLink: (url: string) => Promise<string | null>;
  logger: Log;
}

export const replySaved = (name: string) => `Đã lưu: ${name}`;
export const REPLY_UNREADABLE_LINK =
  'Mình chưa đọc được link Google Maps này. Bạn thử bấm "Chia sẻ" trong app Google Maps rồi gửi lại link nhé.';

/**
 * F1 for S1: resolve the link, parse name + coordinates, save, reply. Safe to run twice for the same
 * update: `telegram_updates` skips finished updates and the place upsert is keyed by the update id.
 * Throws on transient errors (network, Telegram, Mongo) so SQS retries; returns for outcomes a retry can't change.
 */
export async function processIngestJob(job: IngestJob, deps: ProcessIngestJobDeps): Promise<ProcessOutcome> {
  const { db, telegram, logger } = deps;

  const group = await findGroupByTelegramChatId(db, job.chatId);
  if (!group) {
    logger.error('No group for this chat; run `pnpm seed:group`', { chatId: job.chatId });
    return 'unknown_group';
  }
  const groupId = group.id;

  if ((await claimTelegramUpdate(db, groupId, job.updateId)) === 'done') {
    logger.info('Update already processed; skipped', { groupId });
    return 'duplicate';
  }

  const reply = (text: string) =>
    telegram.sendMessage({ chatId: job.chatId, text, replyToMessageId: job.messageId, threadId: job.threadId });

  const resolvedUrl = await deps.resolveMapsLink(job.mapsUrl);
  const parsed = resolvedUrl === null ? null : parseMapsPlaceUrl(resolvedUrl);
  if (resolvedUrl === null || parsed === null) {
    logger.warn('Maps link could not be read', { groupId, mapsUrl: job.mapsUrl, resolvedUrl });
    await reply(REPLY_UNREADABLE_LINK);
    await markTelegramUpdateDone(db, groupId, job.updateId);
    return 'unparsed';
  }

  const place = await upsertPlaceFromTelegram(db, groupId, {
    name: parsed.name,
    mapsUrl: resolvedUrl,
    location: { type: 'Point', coordinates: [parsed.lng, parsed.lat] },
    source: {
      telegramChatId: job.chatId,
      telegramMessageId: job.messageId,
      telegramUpdateId: job.updateId,
      telegramUserId: job.userId,
    },
  });
  await reply(replySaved(place.name));
  await markTelegramUpdateDone(db, groupId, job.updateId);
  logger.info('Place saved', { groupId, placeId: place.id });
  return 'saved';
}
```

`services/ingest/src/worker/create-worker-handler.ts`:

```ts
import { type IngestJob, ingestJobSchema } from '@angiday/shared';
import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { errorFields, type KeyedLog } from '../lib/log';
import type { ProcessOutcome } from './process-ingest-job';

export interface WorkerDeps {
  processJob: (job: IngestJob) => Promise<ProcessOutcome>;
  logger: KeyedLog;
}

const RECORD_KEYS = ['updateId', 'route'];

/**
 * SQS → worker with partial batch failures: a thrown record is reported in `batchItemFailures`, so only it
 * goes back to the queue (and to the DLQ after maxReceiveCount). The stack uses batchSize 1 anyway.
 */
export function createWorkerHandler({ processJob, logger }: WorkerDeps) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = [];
    for (const record of event.Records) {
      const receiveCount = Number(record.attributes.ApproximateReceiveCount);
      try {
        const job = ingestJobSchema.parse(JSON.parse(record.body));
        logger.appendKeys({ updateId: job.updateId, route: job.route });
        const outcome = await processJob(job);
        logger.info('Job processed', { outcome, receiveCount });
      } catch (error) {
        logger.error('Job failed; SQS will retry', { messageId: record.messageId, receiveCount, ...errorFields(error) });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      } finally {
        logger.removeKeys(RECORD_KEYS);
      }
    }
    return { batchItemFailures };
  };
}
```

`services/ingest/src/worker/handler.ts`:

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import { getDb } from '@angiday/db';
import { loadLambdaEnv } from '../lib/lambda-env';
import { memoizeAsync } from '../lib/memoize-async';
import { resolveMapsLink } from '../maps/resolve-maps-link';
import { createTelegramApi } from '../telegram/api';
import { createWorkerHandler } from './create-worker-handler';
import { type ProcessIngestJobDeps, processIngestJob } from './process-ingest-job';

// Lambda entry: wiring only. Config and the Mongo client load once per container.
const logger = new Logger(); // service name from POWERTOOLS_SERVICE_NAME

const getDeps = memoizeAsync(async (): Promise<ProcessIngestJobDeps> => {
  const env = await loadLambdaEnv(['MONGODB_URI', 'TELEGRAM_BOT_TOKEN'], process.env);
  return {
    db: await getDb(env.MONGODB_URI),
    telegram: createTelegramApi(env.TELEGRAM_BOT_TOKEN),
    resolveMapsLink: (url) => resolveMapsLink(url),
    logger,
  };
});

export const handler = createWorkerHandler({
  logger,
  processJob: async (job) => processIngestJob(job, await getDeps()),
});
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @angiday/ingest test && pnpm check`
Expected: PASS; full check green.

- [ ] **Step 5: Commit (ask the owner first)**

```bash
git add services/ingest/src/worker
git commit -m "feat(ingest): add worker that saves the place and replies in Telegram"
```

**Part B done.** Good stopping point.

---

## Part C — Infra, scripts, first deploy

### Task 8: CDK stack — queues, Lambdas, Function URL, least-privilege grants

**Concept brief (Vietnamese, before coding):** SQS + DLQ in CDK (`deadLetterQueue: { queue, maxReceiveCount }`, visibility timeout = 6 × worker timeout per AWS guidance); `NodejsFunction` bundling (CDK runs esbuild locally, follows the pnpm symlinks into `packages/*/src/*.ts` and inlines them — that's why JIT packages work on Lambda; `@aws-sdk/*` is left out because the runtime ships it; without a local esbuild CDK falls back to Docker); IAM least privilege (`grantRead` on exactly the SSM parameters each function uses, `grantSendMessages` only for the webhook; the event source grants the worker its receive/delete); Function URL + its resource policy; CloudFormation outputs.

**Files:**
- Modify: `infra/package.json`, `infra/lib/config.ts`, `infra/lib/ingest-stack.ts`, `infra/lib/ingest-stack.test.ts`

**Interfaces:**
- Consumes: Lambda entries `services/ingest/src/webhook/handler.ts`, `services/ingest/src/worker/handler.ts` and their env contracts (Tasks 6, 7). SSM parameters created by the owner in S0 (`locals/setup-guideline.md` §6).
- Produces:
  - `SSM_PARAMS` (`infra/lib/config.ts`): env key → SSM name for `MONGODB_URI`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_IDS`; `WORKER_TIMEOUT_SECONDS = 30`.
  - Stack outputs: `WebhookUrl`, `WebhookFunctionName`, `WorkerFunctionName`, `DeadLetterQueueName` (used by Task 10).

- [ ] **Step 1: Dependencies**

```bash
pnpm --filter @angiday/infra add -D esbuild "@angiday/ingest@workspace:*"
```

`esbuild` lets `NodejsFunction` bundle locally (no Docker). `@angiday/ingest` as a dev dependency makes Turbo re-run infra's tests when the Lambda code changes (the `transit` task follows workspace dependencies).

- [ ] **Step 2: Config**

`infra/lib/config.ts`:

```ts
// Closest AWS region to Vietnam (Phase 1 plan → plan-level technical choices).
export const AWS_REGION = 'ap-southeast-1';

/**
 * SSM parameters created once by the owner (locals/setup-guideline.md §6). Keys are the app env names
 * (packages/shared/src/app-env.ts); each Lambda gets `<KEY>_PARAM=<name>` and reads the value at cold start.
 */
export const SSM_PARAMS = {
  MONGODB_URI: { name: '/angiday/mongodb-uri', secure: true },
  TELEGRAM_BOT_TOKEN: { name: '/angiday/telegram-bot-token', secure: true },
  TELEGRAM_WEBHOOK_SECRET: { name: '/angiday/telegram-webhook-secret', secure: true },
  TELEGRAM_ALLOWED_CHAT_IDS: { name: '/angiday/allowed-chat-ids', secure: false },
} as const;

export type SsmParamKey = keyof typeof SSM_PARAMS;

export const WORKER_TIMEOUT_SECONDS = 30;
```

- [ ] **Step 3: Write the failing tests**

`infra/lib/ingest-stack.test.ts` (full file; the S0 `validateAgainstDefaultRules` override is gone — S0 carry-over 1):

```ts
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import cdkJson from '../cdk.json';
import { AWS_REGION } from './config';
import { IngestStack } from './ingest-stack';

let template: Template;

beforeAll(() => {
  // Same feature flags as `cdk synth`. Bundles both Lambdas with esbuild (a few seconds).
  const app = new App({ context: cdkJson.context });
  const stack = new IngestStack(app, 'TestIngest', { env: { region: AWS_REGION } });
  expect(stack.region).toBe('ap-southeast-1');
  template = Template.fromStack(stack);
});

/** IAM policy documents as JSON strings, for "contains / does not contain" checks. */
function policies(): string[] {
  return Object.values(template.findResources('AWS::IAM::Policy')).map((policy) => JSON.stringify(policy));
}

describe('IngestStack', () => {
  it('has a queue with a DLQ after 3 receives and visibility = 6 × worker timeout', () => {
    template.resourceCountIs('AWS::SQS::Queue', 2);
    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 180,
      RedrivePolicy: { deadLetterTargetArn: Match.anyValue(), maxReceiveCount: 3 },
    });
  });

  it('runs both Lambdas on Node 24, ARM64', () => {
    const functions = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'nodejs24.x', Architectures: ['arm64'] },
    });
    expect(Object.keys(functions)).toHaveLength(2);
  });

  it('subscribes the worker with batch size 1 and partial batch failures', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
  });

  it('exposes the webhook through a public Function URL', () => {
    template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'NONE' });
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunctionUrl',
      Principal: '*',
      FunctionUrlAuthType: 'NONE',
    });
  });

  it('passes SSM parameter names, never values, to the Lambdas', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          TELEGRAM_WEBHOOK_SECRET_PARAM: '/angiday/telegram-webhook-secret',
          TELEGRAM_ALLOWED_CHAT_IDS_PARAM: '/angiday/allowed-chat-ids',
          QUEUE_URL: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          MONGODB_URI_PARAM: '/angiday/mongodb-uri',
          TELEGRAM_BOT_TOKEN_PARAM: '/angiday/telegram-bot-token',
        }),
      },
    });
  });

  it('grants each Lambda only what it uses (least privilege)', () => {
    const webhookPolicy = policies().find((p) => p.includes('sqs:SendMessage'));
    const workerPolicy = policies().find((p) => p.includes('/angiday/mongodb-uri'));

    expect(webhookPolicy).toBeDefined();
    expect(webhookPolicy).toContain('/angiday/telegram-webhook-secret');
    expect(webhookPolicy).not.toContain('/angiday/mongodb-uri');
    expect(webhookPolicy).not.toContain('/angiday/telegram-bot-token');

    expect(workerPolicy).toBeDefined();
    expect(workerPolicy).toContain('/angiday/telegram-bot-token');
    expect(workerPolicy).not.toContain('sqs:SendMessage');
    expect(workerPolicy).not.toContain('/angiday/telegram-webhook-secret');
  });

  it('outputs what the deploy steps need', () => {
    for (const output of ['WebhookUrl', 'WebhookFunctionName', 'WorkerFunctionName', 'DeadLetterQueueName']) {
      template.hasOutput(output, {});
    }
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm --filter @angiday/infra test`
Expected: FAIL — the empty stack has no queues/functions. (If it instead fails on `validateAgainstDefaultRules` with an empty template, that is the expected S0 behaviour and also counts as "red".)

- [ ] **Step 5: Implement**

`infra/lib/ingest-stack.ts`:

```ts
import * as path from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Architecture, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { type IStringParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { SSM_PARAMS, type SsmParamKey, WORKER_TIMEOUT_SECONDS } from './config';

const REPO_ROOT = path.resolve(__dirname, '../..');
const INGEST_SRC = path.join(REPO_ROOT, 'services/ingest/src');

// Optional peer modules the MongoDB driver loads only when a feature needs them (we use none).
const MONGODB_OPTIONAL_MODULES = [
  'kerberos',
  '@mongodb-js/zstd',
  'snappy',
  'mongodb-client-encryption',
  'gcp-metadata',
  'socks',
  'aws4',
];

const commonProps: Partial<NodejsFunctionProps> = {
  runtime: Runtime.NODEJS_24_X,
  architecture: Architecture.ARM_64,
  projectRoot: REPO_ROOT,
  depsLockFilePath: path.join(REPO_ROOT, 'pnpm-lock.yaml'),
  bundling: {
    target: 'node24',
    sourceMap: true,
    // The Lambda runtime ships the AWS SDK v3; everything else (incl. @angiday/*) is inlined by esbuild.
    externalModules: ['@aws-sdk/*', '@smithy/*', ...MONGODB_OPTIONAL_MODULES],
  },
};

/** Ingest pipeline (architecture.md → F1): webhook Lambda (Function URL) → SQS (+ DLQ) → worker Lambda. */
export class IngestStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const params = Object.fromEntries(
      (Object.keys(SSM_PARAMS) as SsmParamKey[]).map((key) => {
        const { name, secure } = SSM_PARAMS[key];
        const param = secure
          ? StringParameter.fromSecureStringParameterAttributes(this, `Param${key}`, { parameterName: name })
          : StringParameter.fromStringParameterName(this, `Param${key}`, name);
        return [key, param];
      }),
    ) as Record<SsmParamKey, IStringParameter>;

    /** Env vars + read grants for exactly the parameters a function needs. */
    const useParams = (fn: NodejsFunction, keys: SsmParamKey[]) => {
      for (const key of keys) {
        fn.addEnvironment(`${key}_PARAM`, SSM_PARAMS[key].name);
        params[key].grantRead(fn);
      }
    };

    const deadLetterQueue = new Queue(this, 'IngestDlq', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    const queue = new Queue(this, 'IngestQueue', {
      // AWS guidance for Lambda event sources: at least 6 × the function timeout.
      visibilityTimeout: Duration.seconds(6 * WORKER_TIMEOUT_SECONDS),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 3 },
      enforceSSL: true,
    });

    const webhook = new NodejsFunction(this, 'WebhookFunction', {
      ...commonProps,
      entry: path.join(INGEST_SRC, 'webhook/handler.ts'),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        POWERTOOLS_SERVICE_NAME: 'ingest-webhook',
        QUEUE_URL: queue.queueUrl,
      },
    });
    useParams(webhook, ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS']);
    queue.grantSendMessages(webhook);
    // Public on purpose: Telegram can't sign with IAM; the handler checks Telegram's secret header.
    const webhookUrl = webhook.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

    const worker = new NodejsFunction(this, 'WorkerFunction', {
      ...commonProps,
      entry: path.join(INGEST_SRC, 'worker/handler.ts'),
      memorySize: 512,
      timeout: Duration.seconds(WORKER_TIMEOUT_SECONDS),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        POWERTOOLS_SERVICE_NAME: 'ingest-worker',
      },
    });
    useParams(worker, ['MONGODB_URI', 'TELEGRAM_BOT_TOKEN']);
    worker.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 1,
        reportBatchItemFailures: true,
        // At most 2 concurrent workers: plenty for 2 people and gentle on Atlas M0 connections.
        maxConcurrency: 2,
      }),
    );

    new CfnOutput(this, 'WebhookUrl', { value: webhookUrl.url });
    new CfnOutput(this, 'WebhookFunctionName', { value: webhook.functionName });
    new CfnOutput(this, 'WorkerFunctionName', { value: worker.functionName });
    new CfnOutput(this, 'DeadLetterQueueName', { value: deadLetterQueue.queueName });
  }
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm --filter @angiday/infra test`
Expected: PASS. Troubleshooting:
- `spawnSync docker ENOENT` → CDK did not find esbuild; check `pnpm --filter @angiday/infra exec esbuild --version` prints a version.
- A failure from `@aws-cdk/core:validateAgainstDefaultRules` naming a rule → **stop and show the owner the rule**; do not re-add the override silently.
- `__dirname is not defined` in the test → Vitest is running `infra/lib` as ESM; replace `__dirname` with `path.dirname(fileURLToPath(import.meta.url))` only if `tsx bin/angiday.ts` (CJS) still works, otherwise pass the repo root in as a constructor prop from `bin/angiday.ts` and the test.
- `Runtime.NODEJS_24_X` missing → `aws-cdk-lib` is too old; upgrade it with `pnpm --filter @angiday/infra add aws-cdk-lib@latest`.

- [ ] **Step 7: Verify the bundles inline the workspace packages (S0 carry-over 5)**

```bash
pnpm --filter @angiday/infra cdk synth --quiet
for f in infra/cdk.out/asset.*/index.js; do echo "== $f ($(wc -c < "$f") bytes)"; grep -oE 'require\("[^"]+"\)' "$f" | sort -u; done
```

Expected for both bundles: **no** `require("@angiday/...")` and no `require("zod")` / `require("mongodb")` (they are inlined); only Node built-ins (`node:crypto`, `buffer`, …), `@aws-sdk/*` / `@smithy/*`, and the MongoDB optional modules from `MONGODB_OPTIONAL_MODULES`. Bundle sizes in the low MB at most.

- [ ] **Step 8: Full check, then commit (ask the owner first)**

Run: `pnpm check` — expected green.

```bash
git add infra/package.json infra/lib/config.ts infra/lib/ingest-stack.ts infra/lib/ingest-stack.test.ts pnpm-lock.yaml
git commit -m "feat(infra): add ingest queue, DLQ, webhook and worker Lambdas"
```

---

### Task 9: Scripts — `seed:group` and `set-webhook`

**Files:**
- Create: `services/ingest/scripts/seed-group.ts`, `services/ingest/scripts/set-webhook.ts`
- Modify: `services/ingest/package.json`, root `package.json`

**Interfaces:**
- Consumes: `loadAppEnv` (`@angiday/shared`); `getMongoClient`, `ensureIndexes`, `upsertGroupByTelegramChatId` (`@angiday/db`); `createTelegramApi` (Task 5).
- Produces: `pnpm seed:group [--name <text>] [--chat-id <id>]` → prints `GROUP_ID=<hex>`; `pnpm set-webhook --url <WebhookUrl>` → registers the webhook and prints `getWebhookInfo` (no secrets). Both read the root `.env` via `tsx --env-file`.

- [ ] **Step 1: Write the scripts**

`services/ingest/scripts/seed-group.ts`:

```ts
// Create (or find) the group for the Telegram chat and make sure all indexes exist.
// Usage: pnpm seed:group [--name "Nhà mình"] [--chat-id -100…]  (reads the root .env)
import { parseArgs } from 'node:util';
import { ensureIndexes, getMongoClient, upsertGroupByTelegramChatId } from '@angiday/db';
import { loadAppEnv } from '@angiday/shared';

const { values } = parseArgs({ options: { name: { type: 'string' }, 'chat-id': { type: 'string' } } });
const env = loadAppEnv(process.env, ['MONGODB_URI', 'TELEGRAM_ALLOWED_CHAT_IDS']);

const chatId = values['chat-id'] === undefined ? env.TELEGRAM_ALLOWED_CHAT_IDS[0] : Number(values['chat-id']);
if (chatId === undefined || !env.TELEGRAM_ALLOWED_CHAT_IDS.includes(chatId)) {
  throw new Error('--chat-id must be one of TELEGRAM_ALLOWED_CHAT_IDS');
}

const client = await getMongoClient(env.MONGODB_URI);
try {
  const db = client.db();
  await ensureIndexes(db);
  const group = await upsertGroupByTelegramChatId(db, { telegramChatId: chatId, name: values.name ?? 'AnGiDay' });
  console.log(`Database: ${db.databaseName}`);
  console.log(`Group "${group.name}" for chat ${group.telegramChatId}`);
  console.log(`GROUP_ID=${group.id}   ← put this in .env, apps/web/.env.local and Vercel`);
} finally {
  await client.close();
}
```

`services/ingest/scripts/set-webhook.ts`:

```ts
// Point the bot's webhook at the deployed Function URL, with the secret header and message updates only.
// Usage: pnpm set-webhook --url https://….lambda-url.ap-southeast-1.on.aws/  (reads the root .env)
import { parseArgs } from 'node:util';
import { loadAppEnv } from '@angiday/shared';
import { createTelegramApi } from '../src/telegram/api';

const { values } = parseArgs({ options: { url: { type: 'string' } } });
if (!values.url?.startsWith('https://')) {
  throw new Error('Pass --url <WebhookUrl> (the output of `cdk deploy`)');
}

const env = loadAppEnv(process.env, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET']);
const telegram = createTelegramApi(env.TELEGRAM_BOT_TOKEN);

await telegram.setWebhook({
  url: values.url,
  secretToken: env.TELEGRAM_WEBHOOK_SECRET,
  allowedUpdates: ['message'],
  dropPendingUpdates: true,
});
const info = await telegram.getWebhookInfo();
console.log({
  url: info.url,
  allowed_updates: info.allowed_updates,
  pending_update_count: info.pending_update_count,
  last_error_message: info.last_error_message ?? null,
});
```

`services/ingest/package.json` scripts — add:

```json
    "seed:group": "tsx --env-file=../../.env scripts/seed-group.ts",
    "set-webhook": "tsx --env-file=../../.env scripts/set-webhook.ts"
```

Root `package.json` scripts — add:

```json
    "seed:group": "pnpm --filter @angiday/ingest run seed:group",
    "set-webhook": "pnpm --filter @angiday/ingest run set-webhook"
```

- [ ] **Step 2: Verify they compile and fail safely without input**

Run: `pnpm --filter @angiday/ingest typecheck && pnpm --filter @angiday/ingest lint`
Expected: green.

Run: `pnpm set-webhook`
Expected: exits with `Pass --url <WebhookUrl> …` before touching the network or printing anything from `.env`.

- [ ] **Step 3: Commit (ask the owner first)**

```bash
git add services/ingest/scripts services/ingest/package.json package.json
git commit -m "feat(ingest): add seed:group and set-webhook scripts"
```

---

### Task 10: Deploy and demo in Telegram (owner runs the AWS/secret steps)

**Files:** none (runs commands; Claude never reads `.env`).

**Interfaces:**
- Consumes: Tasks 8–9; SSM parameters from S0; owner's `.env`.
- Produces: deployed `AngidayIngest` stack, webhook registered, a group document with its `GROUP_ID`.

- [ ] **Step 1: Ask the owner to log in to AWS**

Owner runs: `aws login --profile angiday`, then `aws sts get-caller-identity --profile angiday` (ends in `user/tin-admin`).

- [ ] **Step 2: Diff, then deploy (owner approves the IAM changes)**

```bash
pnpm --filter @angiday/infra cdk diff --profile angiday
pnpm --filter @angiday/infra cdk deploy --profile angiday
```

Walk the owner through the IAM/security-change table CDK prints before they answer `y`. Record the outputs `WebhookUrl`, `WebhookFunctionName`, `WorkerFunctionName`, `DeadLetterQueueName`.

- [ ] **Step 3: Smoke-test the Function URL**

```bash
curl -i -X POST "<WebhookUrl>" -H 'content-type: application/json' -d '{}'
```

Expected: `HTTP/1.1 401` (the function ran and rejected the missing secret).
If it is `403 Forbidden` with `AccessDeniedException`, the URL's resource policy is incomplete (AWS now also requires `lambda:InvokeFunction` for public Function URLs). Fix in `ingest-stack.ts`, add an assertion for it to the test, redeploy. Check the property name against the installed `aws-cdk-lib` (`CfnPermissionProps`) first:

```ts
import { CfnPermission } from 'aws-cdk-lib/aws-lambda';
// after addFunctionUrl:
new CfnPermission(this, 'WebhookInvokeViaUrl', {
  action: 'lambda:InvokeFunction',
  functionName: webhook.functionName,
  principal: '*',
  invokedViaFunctionUrl: true,
});
```

- [ ] **Step 4: Seed the group (owner, reads `.env`)**

```bash
pnpm seed:group --name "Nhà mình"
```

Expected: `Database: angiday` and `GROUP_ID=<24 hex>`. If the database name is `test`, `MONGODB_URI` lacks `/angiday` — owner fixes `.env` (and SSM `/angiday/mongodb-uri`, then redeploy is not needed; the next cold start reads it). Owner puts `GROUP_ID` into `.env` and `apps/web/.env.local`.

- [ ] **Step 5: Register the webhook**

```bash
pnpm set-webhook --url "<WebhookUrl>"
```

Expected: `url` equals the Function URL, `allowed_updates: ['message']`, `pending_update_count: 0`, `last_error_message: null`.

- [ ] **Step 6: Demo**

Owner posts one of the Task 0 Maps links in the group (in a topic and once in General). Expected within a few seconds: a reply "Đã lưu: <name>" in the same topic. Posting a non-Maps message: no reply.

Check the logs (owner runs, or Claude with the owner's session):

```bash
aws logs tail /aws/lambda/<WebhookFunctionName> --since 10m --profile angiday --region ap-southeast-1
aws logs tail /aws/lambda/<WorkerFunctionName> --since 10m --profile angiday --region ap-southeast-1
```

Expected: JSON lines; webhook `Routed update` with `updateId` and `route: maps_link`; worker `Job processed` with the same `updateId` and `outcome: saved`. No secret values anywhere in the output.

If the worker logs `outcome: unparsed` for a link that parsed locally, AWS sees a different redirect than `curl` did (e.g. a consent page). Log line `Maps link could not be read` carries `resolvedUrl`: add it to `unparseableUrlFixtures`, show the owner, and decide together (this is the Phase 1 risk "Google serves the Lambda a consent page").

- [ ] **Step 7: Note the state**

DLQ empty: `aws sqs get-queue-attributes --queue-url $(aws sqs get-queue-url --queue-name <DeadLetterQueueName> --query QueueUrl --output text --profile angiday --region ap-southeast-1) --attribute-names ApproximateNumberOfMessages --profile angiday --region ap-southeast-1` → `0`.

**Part C done.** Good stopping point (the bot works; web comes next).

---

## Part D — Web

### Task 11: Web login + place list

**Files:**
- Modify: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/app/page.tsx`
- Create: `apps/web/vercel.json`, `apps/web/lib/env.ts`, `apps/web/lib/auth.ts`, `apps/web/lib/session.ts`, `apps/web/app/login/page.tsx`, `apps/web/app/login/actions.ts`
- Test: `apps/web/lib/auth.test.ts`

**Interfaces:**
- Consumes: `loadAppEnv` (`@angiday/shared`); `getDb`, `listPlaces` (`@angiday/db`).
- Produces:
  - `getWebEnv(): Pick<AppEnv, 'MONGODB_URI' | 'WEB_LOGIN_USERNAME' | 'WEB_LOGIN_PASSWORD' | 'SESSION_SECRET' | 'GROUP_ID'>` (lazy; never at build time)
  - `credentialsMatch(given: Credentials, expected: Credentials): boolean`, `createSessionToken(username: string, secret: string, now?: Date): Promise<string>`, `verifySessionToken(token: string | undefined, secret: string): Promise<boolean>`, `SESSION_COOKIE`, `SESSION_MAX_AGE_SECONDS`
  - `requireSession(): Promise<void>` (redirects to `/login`), `startSession(username)`, `endSession()`
  - Server Actions `login(formData)`, `logout()`

- [ ] **Step 1: Dependencies and config (S0 carry-over 2)**

```bash
pnpm --filter @angiday/web add "@angiday/db@workspace:*" jose server-only
pnpm --filter @angiday/web add -D vitest@catalog:
```

`apps/web/package.json` scripts — add `"test": "vitest run"`.

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Internal packages export TypeScript source; Next compiles them (ADR-0014).
  transpilePackages: ['@angiday/shared', '@angiday/db'],
};

export default nextConfig;
```

`apps/web/vercel.json` (functions next to Atlas in Singapore instead of the default US region):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"]
}
```

- [ ] **Step 2: Write the failing tests**

`apps/web/lib/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSessionToken, credentialsMatch, SESSION_MAX_AGE_SECONDS, verifySessionToken } from './auth';

const SECRET = '0123456789abcdef0123456789abcdef';
const expected = { username: 'admin', password: 'a-long-password' };

describe('credentialsMatch', () => {
  it('accepts the configured credentials', () => {
    expect(credentialsMatch({ username: 'admin', password: 'a-long-password' }, expected)).toBe(true);
  });

  it.each([
    ['wrong username', { username: 'Admin', password: 'a-long-password' }],
    ['wrong password', { username: 'admin', password: 'a-long-passwor' }],
    ['empty input', { username: '', password: '' }],
  ])('rejects %s', (_label, given) => {
    expect(credentialsMatch(given, expected)).toBe(false);
  });
});

describe('session token', () => {
  it('round-trips', async () => {
    const token = await createSessionToken('admin', SECRET);

    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await createSessionToken('admin', SECRET);

    expect(await verifySessionToken(token, 'f'.repeat(32))).toBe(false);
  });

  it('rejects an expired token', async () => {
    const issued = new Date(Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000);
    const token = await createSessionToken('admin', SECRET, issued);

    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });

  it.each([undefined, '', 'garbage', 'a.b.c'])('rejects %j', async (token) => {
    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @angiday/web test`
Expected: FAIL — cannot resolve `./auth`.

- [ ] **Step 4: Implement auth and session**

`apps/web/lib/auth.ts` (pure; no `server-only` so Vitest can import it):

```ts
import { createHash, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'angiday_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface Credentials {
  username: string;
  password: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();
const key = (secret: string) => new TextEncoder().encode(secret);

/** Constant-time; both fields are always compared so timing doesn't reveal which one was wrong. */
export function credentialsMatch(given: Credentials, expected: Credentials): boolean {
  const usernameOk = timingSafeEqual(sha256(given.username), sha256(expected.username));
  const passwordOk = timingSafeEqual(sha256(given.password), sha256(expected.password));
  return usernameOk && passwordOk;
}

/** HS256 JWT for the session cookie (Phase 1 plan → Web auth). */
export async function createSessionToken(username: string, secret: string, now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_MAX_AGE_SECONDS)
    .sign(key(secret));
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}
```

`apps/web/lib/env.ts`:

```ts
import 'server-only';
import { loadAppEnv } from '@angiday/shared';

const WEB_ENV_KEYS = ['MONGODB_URI', 'WEB_LOGIN_USERNAME', 'WEB_LOGIN_PASSWORD', 'SESSION_SECRET', 'GROUP_ID'] as const;

let cached: ReturnType<typeof load> | undefined;
const load = () => loadAppEnv(process.env, WEB_ENV_KEYS);

/** Read lazily at request time, so `next build` (CI) needs no env vars. */
export function getWebEnv() {
  return (cached ??= load());
}
```

`apps/web/lib/session.ts`:

```ts
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, verifySessionToken } from './auth';
import { getWebEnv } from './env';

/** Call at the top of every protected page / action. */
export async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, getWebEnv().SESSION_SECRET))) redirect('/login');
}

export async function startSession(username: string): Promise<void> {
  const token = await createSessionToken(username, getWebEnv().SESSION_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @angiday/web test`
Expected: PASS.

- [ ] **Step 6: Pages and actions**

`apps/web/app/login/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { credentialsMatch } from '@/lib/auth';
import { getWebEnv } from '@/lib/env';
import { endSession, startSession } from '@/lib/session';

export async function login(formData: FormData): Promise<void> {
  const env = getWebEnv();
  const ok = credentialsMatch(
    { username: String(formData.get('username') ?? ''), password: String(formData.get('password') ?? '') },
    { username: env.WEB_LOGIN_USERNAME, password: env.WEB_LOGIN_PASSWORD },
  );
  if (!ok) redirect('/login?error=1');
  await startSession(env.WEB_LOGIN_USERNAME);
  redirect('/');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/login');
}
```

Add the `@/` alias (Next.js reads it from tsconfig) in `apps/web/tsconfig.json` → `compilerOptions`: `"paths": { "@/*": ["./*"] }`.

`apps/web/app/login/page.tsx`:

```tsx
import { login } from './actions';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  return (
    <main>
      <h1>AnGiDay</h1>
      <form action={login}>
        <label>
          Tên đăng nhập
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Mật khẩu
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? <p role="alert">Sai tên đăng nhập hoặc mật khẩu.</p> : null}
        <button type="submit">Đăng nhập</button>
      </form>
    </main>
  );
}
```

(`PageProps<'/login'>` is generated by `next typegen`, which the `typecheck` script already runs.)

`apps/web/app/page.tsx`:

```tsx
import { getDb, listPlaces } from '@angiday/db';
import { getWebEnv } from '@/lib/env';
import { requireSession } from '@/lib/session';
import { logout } from './login/actions';

export default async function HomePage() {
  await requireSession();
  const env = getWebEnv();
  const places = await listPlaces(await getDb(env.MONGODB_URI), env.GROUP_ID);

  return (
    <main>
      <h1>AnGiDay</h1>
      {places.length === 0 ? (
        <p>Chưa có quán nào. Gửi link Google Maps vào nhóm Telegram để lưu quán đầu tiên.</p>
      ) : (
        <ul>
          {places.map((place) => (
            <li key={place.id}>
              <a href={place.mapsUrl} target="_blank" rel="noreferrer">
                {place.name}
              </a>
            </li>
          ))}
        </ul>
      )}
      <form action={logout}>
        <button type="submit">Đăng xuất</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Verify locally**

Run: `pnpm check && pnpm turbo run build --filter @angiday/web`
Expected: green; `next build` succeeds **without** env vars (pages are dynamic because they read cookies).

Then the owner runs `pnpm --filter @angiday/web dev` (reads `apps/web/.env.local`) and checks at http://localhost:3000:
- `/` redirects to `/login`; wrong password shows the error; right one shows the list with the place saved in Task 10; the link opens Google Maps; "Đăng xuất" returns to `/login`.

- [ ] **Step 8: Commit (ask the owner first)**

```bash
git add apps/web/package.json apps/web/next.config.ts apps/web/tsconfig.json apps/web/vercel.json apps/web/lib apps/web/app pnpm-lock.yaml
git commit -m "feat(web): add login and saved-places list"
```

(Do not stage `apps/web/AGENTS.md`; the owner commits it.)

---

### Task 12: Deploy web to Vercel and run the full demo (owner-only steps)

**Files:** none.

- [ ] **Step 1: Owner checklist (Vercel dashboard; never paste values in chat)**

- [ ] New Project → import the GitHub repo → **Root Directory** `apps/web` (framework: Next.js; keep "Include files outside the root directory" on).
- [ ] Environment variables (Production + Preview): `MONGODB_URI`, `WEB_LOGIN_USERNAME`, `WEB_LOGIN_PASSWORD`, `SESSION_SECRET`, `GROUP_ID`, and `ENABLE_EXPERIMENTAL_COREPACK=1` (so Vercel uses the pnpm version from `packageManager`).
- [ ] Settings → Node.js Version: 24.x.
- [ ] Deploy (the branch preview is enough before merge; production follows the merge to `main`).

If the install step fails on the pnpm version or `minimumReleaseAge`, send Claude the build log lines (no secrets in them) to diagnose.

- [ ] **Step 2: Full demo (the slice's definition of done)**

Owner posts a **new** Maps link in Telegram → "Đã lưu: <name>" → opens the Vercel URL → login → the new name is at the top of the list.

---

### Task 13: Finish the slice

- [ ] **Step 1: Verification** — run `superpowers:verification-before-completion`: `pnpm check` green (paste the summary), web build green, demo from Task 12 confirmed by the owner.

- [ ] **Step 2: Docs**
  - `docs/progress.md`: tick S1; Now/Next → S2; session-log line (what shipped, anything left open, e.g. fixtures that didn't parse).
  - `docs/architecture.md` → Data model table: `telegram_updates` key indexes → `{ groupId, updateId }` unique, TTL 7 days on `createdAt`; `places` add `{ groupId, source.telegramUpdateId }` unique (partial). Modules table: note that Lambda config arrives as `<NAME>_PARAM` SSM names read at cold start.
  - Testing note: if the owner accepted injected `fetch` instead of MSW (Task 5 review note), write ADR-0017 "Inject fetch for HTTP tests" that supersedes only the MSW line of ADR-0015, and link it from ADR-0015's index entry; otherwise nothing.
  - `locals/setup-guideline.md` §6 note "Tên parameter có thể đổi lại khi viết code S1" — now final: tell the owner `infra/lib/config.ts` is the source of truth (the file is the owner's; let them edit it).

- [ ] **Step 3: Branch** — `superpowers:finishing-a-development-branch`; ask before push / PR.
