# ADR-0006: Per-group tag registry referenced by id

- **Status:** Accepted
- **Date:** 2026-10-07

## Context
Users want to group places into things like "date night", "cheap" or "near home". Tags are set both by users and by the LLM during extraction. Free-form tags fragment over time ("hẹn hò" vs "hen ho"), and renaming must be easy.

## Options
1. **Free-form tag strings on each place.** Simple, but renaming touches every place and spelling variants pile up.
2. **Fixed tag list in code.** Clean, but adding a tag needs a deploy.
3. **Per-group tag registry; places store `tagIds`.** The LLM is given the existing tags and asked to reuse them.
4. **Separate collections model (many-to-many with metadata).** More than we need for now.

## Decision
Option 3:
- `tags` collection: `{ groupId, name, normalized }`, unique on `{ groupId, normalized }`.
- Places store `tagIds`.
- The LLM returns tag **names**; code maps them to ids by normalized match. The LLM never produces ids.
- A new tag is created only when the user explicitly wrote it in the message.

## Consequences
- Renaming a tag is a single update.
- Deleting a tag leaves dangling ids on places; these are ignored on read (lazy cleanup).
- Reads join tag names in application code (one extra query per group, which is cheap).
- If collections later need metadata (description, cover, ordering), they can be added alongside tags.
- Cuisine and dish type are **not** tags: they are fixed enums so filters stay exact.
