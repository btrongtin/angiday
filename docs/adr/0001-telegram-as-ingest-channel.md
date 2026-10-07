# ADR-0001: Telegram as the ingest channel

- **Status:** Accepted
- **Date:** 2026-10-07

## Context
Today, restaurant posts are forwarded into a Messenger group chat. We want to keep that habit (share → forget) but have a program read every message. Messenger's platform APIs are built for business Pages, not personal group chats, so a bot can't read that group.

## Options
1. **Keep Messenger, add nothing.** No change in habit, but nothing gets automated.
2. **Telegram group + bot.** Free Bot API, webhooks, and bots can read all group messages once privacy mode is off. Sharing works the same way.
3. **Web form / PWA share target.** Full control, but it's a new habit and no longer a shared conversation.

## Decision
Move the group to Telegram and add a bot that receives updates by webhook.

## Consequences
- Both users must switch the group to Telegram.
- Bot privacy mode must be disabled (BotFather `/setprivacy`).
- The webhook must be secured (`secret_token` → `X-Telegram-Bot-Api-Secret-Token`) and must respond fast, because Telegram retries slow or failed deliveries. This is why ingest is async (ADR-0004).
- The bot can reply in-thread, which enables the ask-back flow.
