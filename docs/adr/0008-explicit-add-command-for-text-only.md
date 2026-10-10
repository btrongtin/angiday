# ADR-0008: Explicit `/add` command for text-only messages

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
The bot runs with privacy mode **off** so it can see plain Maps links posted without a command. As a side effect it receives every message in the group, including normal conversation ("what do we eat tonight?").

A message without a Maps link may still be a place someone wants to save ("bún bò cô Ba, Q3"). We need a rule for when such a message enters the pipeline, without spamming the group or paying for an LLM call on every chat line.

## Options
1. **Explicit trigger, then ask for a link.** Text-only messages are processed only when they use `/add`. The bot creates a `needs_info` place and asks for a Maps link; the user replies to the bot's message with the link.
   - Pros: no false positives, no LLM cost for chat, the filter is a cheap check in the ingest Lambda.
   - Cons: users must remember `/add`.
2. **LLM classifies every text message** ("is this about a place?").
   - Pros: feels natural, no command needed.
   - Cons: one LLM call per chat message, wrong guesses lead to unwanted prompts, needs prompt tuning.
3. **Auto-search with the Places API + inline buttons** to pick the right place.
   - Pros: best UX, no link needed.
   - Cons: `callback_query` handling, Places quota, ambiguous or empty results. Can sit on top of option 1's trigger.

## Decision
Option 1. Option 3 goes to the backlog as a stretch goal that reuses the `/add` trigger.

Ingest routing rules (evaluated in the ingest Lambda, before enqueueing):

| Message | Action |
|---|---|
| Contains a Google Maps URL (with or without `/add`) | Enqueue → F1 |
| `/add <text>` (also `/add@<bot_username>`) without a link | Enqueue → create place `needs_info`, bot asks for a link |
| `/add` with no text | Bot replies with usage help |
| Reply to a message sent by this bot | Enqueue → F2 follow-up |
| Anything else | Drop, ack 200 |

The free text next to a link or after `/add` is passed to the LLM as user hints (e.g. "cheap, date night").

Correlation for F2: the place stores the `message_id` of the bot's prompt. A reply's `reply_to_message.message_id` is used to find the pending place (scoped by `groupId`). If the reply still has no link, the bot asks again.

## Consequences
- Normal chat costs nothing beyond a Lambda invocation that returns immediately.
- Privacy mode must stay off; otherwise plain links without `/add` would never reach the bot. If we ever require `/add` for links too, privacy mode can be turned back on.
- The bot needs its own username (`getMe` or config) to recognise `/add@bot` and replies to itself.
- `needs_info` places can pile up if nobody answers. Phase 1 hides them from the default web list; cleanup is deferred.
