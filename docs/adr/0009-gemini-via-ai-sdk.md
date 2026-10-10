# ADR-0009: Gemini (free tier) via the Vercel AI SDK

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
Two LLM workloads:
- **Extraction** (worker Lambda): turn a message + Maps data into a structured place (zod schema).
- **Chat** (Next.js on Vercel): streaming answers with a `search_places` tool.

Volume is tiny (2 users). The project should cost close to nothing. The web side already uses the Vercel AI SDK (ADR-0004), which supports many providers behind one API (`generateObject`, `streamText`).

## Options
1. **Gemini Flash on the free tier for both workloads.**
   - Pros: free; good Vietnamese; one API key works from Vercel and Lambda.
   - Cons: free-tier prompts may be used by Google for training; low RPM limits (~15 RPM / ~1,500 RPD for Flash at the time of writing); no Bedrock on the CV.
2. **Claude on Amazon Bedrock for both.**
   - Pros: Lambda authenticates with an IAM role (no API key); Bedrock on the CV.
   - Cons: costs money after the AWS free-plan credits run out; Vercel needs AWS credentials or OIDC federation.
3. **Bedrock for the worker, Gemini for chat.**
   - Pros: Bedrock without AWS credentials on Vercel.
   - Cons: two providers to tune prompts for and monitor.

## Decision
Option 1: Gemini Flash (free tier) for both workloads, called through the Vercel AI SDK (`@ai-sdk/google`).

No custom provider interface. The AI SDK is the abstraction. A small `packages/ai` module owns:
- `getModel(purpose: 'extract' | 'chat')`, the only place that names a provider or model id (read from config/env);
- the prompts for each purpose.

Extraction uses `generateObject` with the zod schema from `packages/shared`; the existing "re-prompt with the zod error" retry still applies (ADR-0006, architecture → Error handling).

## Consequences
- Running cost for the LLM is zero while usage stays inside the free tier.
- Rate limits are real: 429s must be retried with backoff (worker: SQS redelivery; chat: retry + friendly message).
- Do not send anything private in prompts; restaurant data and short chat questions are acceptable for free-tier terms.
- Switching to Bedrock or another provider is a change in `getModel()` plus credentials, not in business logic. If we switch the worker to Bedrock later, the Lambda gets an IAM role instead of an API key (new ADR).
- The Gemini API key is a secret: SSM Parameter Store for Lambda, Vercel env var for web.
