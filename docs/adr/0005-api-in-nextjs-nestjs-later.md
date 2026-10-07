# ADR-0005: API in Next.js now, NestJS later

- **Status:** Accepted
- **Date:** 2026-10-07

## Context
The owner wants to learn NestJS, but the short-term priority is shipping a working AI chatbot for the CV. The API surface is small (~8 endpoints: places, tags, chat, login).

## Options
1. **Separate NestJS API now.** Modular architecture, DI, guards/pipes, and a good CV keyword. But it needs its own hosting, CORS, and cross-domain auth, and it delays the chatbot.
2. **Next.js Route Handlers / Server Actions now, NestJS later.** One app, one deploy, simple cookie auth.

## Decision
Build the API inside Next.js for now. Migrate to NestJS (`apps/api`) later.

## Consequences
- Route Handlers must stay thin: parse input → call `packages/*` → format output. Business logic (search, tag mapping, persistence) lives in `packages/db` / `packages/shared`.
- Because of that, the migration means writing Nest controllers that call the same packages, not rewriting logic.
- Server Components can call `searchPlaces()` directly; once Nest exists, these become HTTP calls.
- NestJS hosting is deferred to the migration.
