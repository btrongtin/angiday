# ADR-0004: Hybrid — AWS for ingest, Next.js for web

- **Status:** Accepted
- **Date:** 2026-10-07

## Context
Two very different workloads:
- **Ingest:** must ack Telegram fast, then do slow, failure-prone work (LLM calls, Maps lookups) with retries and a dead-letter path.
- **Web:** list/filter UI and a streaming AI chat. The owner's strength is Next.js, and the chat UI is the main portfolio showcase.

The goal is "some AWS" on the CV without AWS dominating the timeline.

## Options
1. **All AWS:** SPA on S3 + CloudFront, API Gateway + Lambdas, streaming chat via Lambda Function URL. Maximum AWS exposure, but a large CDK surface and hand-rolled streaming/tool-calling.
2. **All Vercel:** Next.js for everything, background jobs via Inngest/QStash. Fastest to build, but no AWS.
3. **Hybrid:** Telegram → Ingest Lambda → SQS → Worker Lambda (+ DLQ) on AWS via CDK; web + API on Next.js (Vercel) with the Vercel AI SDK for chat.

## Decision
Hybrid (option 3).

## Consequences
- Each workload uses the right tool: a queue gives retries, backoff and a DLQ for ingest; Next.js + AI SDK make streaming chat straightforward.
- The AWS footprint stays small: 2 Lambdas, SQS, DLQ, SSM, an alarm.
- Two deploy targets (AWS + Vercel), connected only through MongoDB.
- Shared code (schemas, DB access) must live in packages usable from both sides (ADR-0007).
