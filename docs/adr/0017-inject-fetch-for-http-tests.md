# ADR-0017: Inject `fetch` for HTTP tests instead of MSW

- **Status:** Accepted
- **Date:** 2026-10-16
- **Partially supersedes:** [ADR-0015](0015-testing-and-observability-baseline.md) (its "External HTTP: MSW in Node" line)

## Context

ADR-0015 named MSW (Mock Service Worker) as the standard for testing code that calls external HTTP services (Telegram, Nominatim later). S1 needed to test two such call sites: the Telegram Bot API client (`services/ingest/src/telegram/api.ts`) and the Maps short-link redirect resolver (`services/ingest/src/maps/resolve-maps-link.ts`, which must assert it uses `redirect: 'manual'` and refuses non-Google hosts).

## Options

1. **MSW**, as ADR-0015 says: intercepts `fetch` at the network layer; tests write request handlers per URL pattern.
   - Pros: consistent with the rest of the codebase's plan; realistic interception.
   - Cons: another dependency; handlers are a layer removed from the call site, making it harder to assert low-level `fetch` options like `redirect: 'manual'` or that a given hostname was never called.
2. **Inject `fetch` as a parameter** (`createTelegramApi(token, fetchFn)`, `resolveMapsLink(url, { fetchFn })`), defaulting to the global `fetch`; tests pass a `vi.fn()` that returns canned `Response` objects.
   - Pros: no new dependency; tests assert directly on the call (`fetchFn.mock.calls[0][1].redirect`), which matters for the redirect resolver's security property (never follows a redirect off Google hosts); simpler to reason about for two small, self-contained clients.
   - Cons: only works for code that already takes its HTTP client as a dependency; a third-party library that calls `fetch` internally (or uses `axios`/`got`) would still need MSW.

## Decision

Option 2 for `services/ingest`'s Telegram client and Maps link resolver. Both already needed dependency injection anyway (the production entry files construct the real `fetch`-backed client; tests construct a fake one), so this added no new pattern to the codebase.

MSW remains the default for any future external HTTP call that does **not** own its own thin client wrapper, or that uses a library that calls `fetch` (or another transport) internally without exposing it as a parameter — for example, if `packages/ai`'s Nominatim client (S2) is built as a bare function rather than a small injectable client, or if a future dependency's SDK is used directly.

## Consequences

- `createTelegramApi` and `resolveMapsLink` both take an optional `fetchFn` parameter; this is now the established shape for any new small HTTP client in `services/ingest`.
- No MSW dependency was added in S1. It gets added in whichever later slice (S2's Nominatim client, most likely) actually needs it.
- A reader following ADR-0015 to "use MSW" for ingest's Telegram/Maps tests will not find it there; this ADR is the pointer to why.
