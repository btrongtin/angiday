# ADR-0012: Cuisine, dish type and price range taxonomy

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
Filters on cuisine, dish type and price must be exact, and the LLM must not invent values. ADR-0006 already separates these fixed classifications from free-form tags. This ADR fixes the values.

## Options
1. **Fixed enums in code** (English keys, Vietnamese labels), validated by zod and passed to the LLM as the output schema.
   - Pros: exact filters; the LLM cannot return an unknown value; typed end to end.
   - Cons: adding a value needs a code change and a deploy.
2. **Per-group registry in the database** (like tags).
   - Pros: editable from the UI.
   - Cons: the LLM schema becomes dynamic; more UI and validation work now.

## Decision
Option 1 for now. All enums live in `packages/shared` with Vietnamese labels.

- `cuisine` (array): `vietnamese`, `chinese`, `japanese`, `korean`, `thai`, `other_asian`, `western`, `vegetarian`, `other`.
- `dishType` (array): `noodle_soup`, `dry_noodle`, `rice`, `hotpot`, `grill`, `fried`, `seafood`, `snack`, `dessert`, `drink`, `other`.
- `priceRange` (single, per person, nullable): `under_50k`, `50k_100k`, `100k_200k`, `200k_500k`, `over_500k`.

Rules:
- Specific dishes ("bún bò", "phở") are not enum values; they go into `highlights` (free text) and are found by free-text search.
- `priceRange`: from the user's message first, otherwise estimated from Google `priceLevel` + context, otherwise `null`.
- Every array has an `other` escape hatch so the LLM is never forced into a wrong value.

## Consequences
- Filters are exact and type-safe from DB to UI.
- New values require a deploy (accepted).
- A later phase will make these values editable on the web. That moves them to a per-group registry and will be recorded in a new ADR superseding this one.
