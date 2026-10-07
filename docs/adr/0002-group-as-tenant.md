# ADR-0002: Group as the tenant

- **Status:** Accepted
- **Date:** 2026-10-07

## Context
Two people share one list of places. Later the app may be opened to other people, each with their own lists. Data must be separated per owner from day one, or adding that later means migrating every record.

## Options
1. **No tenancy.** Simplest, but going public later requires a migration.
2. **User as tenant.** Wrong fit: a place added by one partner wouldn't belong to the other.
3. **Group (workspace) as tenant.** Users are members of a group; a Telegram chat is linked to one group; all data carries `groupId`.

## Decision
Use the group as the tenant. Every document and every repository function is scoped by `groupId`.

## Consequences
- MVP has 1 group, 2 Telegram members and 1 hardcoded web admin. No sign-up flow yet.
- Going public later only adds sign-up and membership management; existing data doesn't change.
- Every query must include `groupId`. This is enforced by repository signatures and indexes that start with `groupId`.
- Messages from Telegram chats not linked to a group are dropped at ingest.
