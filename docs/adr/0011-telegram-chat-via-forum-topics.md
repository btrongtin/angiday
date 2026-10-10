# ADR-0011: AI chat in Telegram via forum topics

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
The owners mostly use their phones. Opening the web app to ask "hotpot near LIM Tower?" is inconvenient, so the AI chat should also work inside Telegram. The web chat stays (it is the portfolio showcase).

Telegram options:
- **Group/supergroup**: everyone can post; the bot sees messages (privacy mode off).
- **Topics (forum mode)**: a supergroup split into threads; each message carries `message_thread_id`.
- **Channel**: one-way broadcast; not suitable for back-and-forth chat.
- **Private chat with the bot**: answers are not shared with the other person.

## Options
1. **One group, `/ask` command** for questions, replies to the bot for follow-ups.
   - Pros: no Telegram setup.
   - Cons: `/ask` on every question; saved links and Q&A mixed; replies to the bot become ambiguous (link follow-up vs chat follow-up).
2. **One group with two topics: "Save places" and "Ask the bot"**, routed by `message_thread_id`; `/ask` kept as a fallback anywhere.
   - Pros: natural chat in the ask topic; clean separation; still one chat id, so still one tenant (ADR-0002 unchanged).
   - Cons: topic ids must be registered; routing gets one more dimension.
3. **Two groups (or a channel + a group).**
   - Cons: one tenant mapped to several chats; channels can't chat. No advantage over option 2.

## Decision
Option 2.

- Topic registration: an admin sends `/setup save` or `/setup ask` inside a topic; the group stores that `message_thread_id`.
- Routing (extends ADR-0008):

| Where | Message | Route |
|---|---|---|
| Save topic (or no topics registered) | Rules from ADR-0008 | F1 / F2 / drop |
| Ask topic | Any text from a human | Chat (F7) |
| Anywhere | `/ask <question>` | Chat (F7) |
| Anywhere | `/setup save\|ask` | Register topic |

- The chat "core" (system prompt, `search_places` tool, tool loop) lives in `packages/ai`. Two thin adapters:
  - **Web:** Route Handler with `streamText`, streamed UI.
  - **Telegram:** worker with `generateText`, `sendChatAction: typing`, then one reply with place list + inline URL buttons to Google Maps.
- Conversation memory for Telegram: last N turns per `(groupId, threadId)` in a `chat_turns` collection with a TTL.
- Phase 2 builds both channels, **Telegram first**.

## Consequences
- Adding a channel means writing an adapter, not new business logic; this also keeps the NestJS migration cheap (ADR-0005).
- Telegram has no token streaming; long answers arrive after a short "typing…" pause.
- Telegram chat and web chat share the Gemini free-tier quota.
- Example queries like "near LIM Tower" need geocoding + a `2dsphere` query; whether this moves from backlog into Phase 2 is decided when writing the Phase 2 plan.
- Telegram Mini App (open the web app inside Telegram, auth via signed `initData`) is a stretch goal.
