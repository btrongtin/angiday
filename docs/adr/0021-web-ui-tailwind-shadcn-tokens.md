# ADR-0021: Web UI with Tailwind v4, shadcn/ui and design tokens

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

The web app has no styling yet. The two users mostly open it from a Telegram link on a phone, want light and dark themes, and the colours and fonts must stay maintainable as the app grows (tag management, chat in Phase 2).

## Options

1. **CSS Modules + CSS variables.** No new dependencies; every control (inputs, checkboxes, selects, badges) is written by hand.
2. **Tailwind v4 + shadcn/ui.** Utility classes and accessible components copied into the repo (we own them); more tooling to pin.
3. **A component library with its own theme (MUI, Mantine).** Fastest to a full UI, but its theme system and bundle size fight the design tokens and the "food notebook" look.

## Decision

Option 2, designed with the Hallmark skill as an **app screen** (a warm "sổ tay ăn uống", mobile first).

- `apps/web/app/tokens.css` is the only place colours and fonts are declared (light in `:root`, dark in `.dark`). Components and other CSS reference tokens only; no literal colour or `font-family` elsewhere.
- shadcn's variables (`--background`, `--primary`, …) are assignments to the Hallmark token names. Hallmark's `--color-accent` / `--color-muted` stay out of Tailwind's `@theme` because they collide with shadcn's names.
- `apps/web/DESIGN.md` is the locked design system; it is updated in the same commit as any token change.
- Themes via `next-themes` (class strategy, default `system`).
- Filter form and place cards are Server Components / plain HTML; filters live in URL search params.

## Consequences

- New dependencies in `apps/web` only (Tailwind, `@tailwindcss/postcss`, `next-themes`, shadcn helpers, Testing Library + happy-dom for tests).
- shadcn components are ours: updates are manual.
- A colour or font change is one edit in `tokens.css` plus a line in `DESIGN.md`.
- Component tests need a DOM environment in `apps/web` (happy-dom, per test file).
