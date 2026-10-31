# ADR-0020: Gemini Flash Lite as the extraction model

- **Status:** Accepted
- **Date:** 2026-10-31
- **Partially supersedes:** [ADR-0009](0009-gemini-via-ai-sdk.md) (its throughput assumption of ~15 RPM / ~1,500 RPD for "Flash"; the decision to use Gemini through the AI SDK and `getModel()` stands)

## Context

ADR-0009 assumed the free Flash tier allows about 1,500 requests per day. When S3 was built, AI Studio showed (this project, 2026-10-31):

| Model | RPM | RPD |
|---|---|---|
| Gemini 3.6 / 3.8 Flash | 5 | 20 |
| Gemini 3.1 / 3.5 Flash Lite | 15 | 500 |

`gemini-3.5-flash` was an alias that counted against the 3.6 Flash quota and has since been dropped from the table. The 20 requests per day were used up by a few evaluation runs. Measured on the three real samples in `packages/ai/eval/extract-samples.json` (all fields matched on both):

| | Flash (3.5 → 3.6) | Flash Lite 3.5 |
|---|---|---|
| Output tokens per place | 250–1,030, of which 85–95 % reasoning | 35–80, no reasoning |
| Latency | 5–9 s, "high demand" and timeout errors seen | about 1–2 s |

Extraction is easy: a short note plus the place name in, a small JSON object out.

## Options

1. **Flash** (non-lite) with a low `thinkingLevel`. Better headroom on difficulty, but 20 requests per day is not enough for daily use.
2. **Flash Lite.** 500 requests per day, fast, no reasoning cost; possibly weaker on hard Vietnamese phrasing.
3. **Another provider or enabling billing** (ADR-0009 option 2/3). Not needed at this volume.

## Decision

Option 2: `DEFAULT_MODEL_IDS.extract = 'gemini-3.5-flash-lite'` in `packages/ai/src/models.ts`, overridable with the optional env var `GEMINI_EXTRACT_MODEL`. Google renames and drops model ids often, so the id is configuration, not logic. `extractPlaceDetails` keeps a `thinkingLevel` option for models that reason; the worker does not use it.

## Consequences

- One request per saved place (plus re-prompts, which are rare); duplicate links cost nothing because the already-saved check runs first ([ADR-0019](0019-duplicate-places-by-feature-id-then-name-and-distance.md)). About 500 places per day fit the free tier.
- When the quota or the model is unavailable the job throws and SQS retries; after three receives the message goes to the dead-letter queue and the place is lost until a redrive. A "save without classification" fallback and the failure notice belong to S6.
- Prompt quality was checked on three real messages only; the eval samples should grow (progress.md → Backlog).
- Prompts and fixtures were captured with this model; changing `GEMINI_EXTRACT_MODEL` means re-running `pnpm eval:extract` and re-capturing fixtures.
