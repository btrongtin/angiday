# ADR-0003: MongoDB Atlas over DynamoDB

- **Status:** Accepted
- **Date:** 2026-10-07

## Context
The original brief picked DynamoDB, mainly to learn AWS in depth for backend-leaning interviews. The goal has since shifted: a fullstack portfolio project with an AI chatbot that strengthens a frontend-leaning CV, with a lower learning curve. The data is small (hundreds of places per group) and queried with flexible filter combinations.

## Options
1. **DynamoDB.** Free tier, native to AWS, good interview topic. But access patterns must be designed up front, GSIs can't index list attributes (so tag filters would run in Lambda), and geo queries need hand-rolled geohashing. The learning curve is steep.
2. **MongoDB Atlas (M0 free tier).** Document model close to JSON. Multikey indexes on arrays (`tagIds`), `2dsphere` geo queries, and ad-hoc filters. Familiar to JS developers.
3. **Postgres (e.g. Neon/Supabase).** Strong querying, but tags/arrays and evolving fields fit documents more naturally here, and it adds an ORM/migrations layer.

## Decision
Use MongoDB Atlas (M0).

## Consequences
- Filter queries (cuisine + district + tags + price) are simple and indexable.
- "Near me" later is a `2dsphere` index plus `$near`.
- From Lambda, the `MongoClient` must be created outside the handler and reused across invocations, otherwise cold starts open new connections.
- Less AWS depth on the CV; the remaining AWS footprint is the ingest pipeline (ADR-0004).
- M0 limits (512 MB storage, shared resources) are far above expected usage.
