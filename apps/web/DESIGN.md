# Design: AnGiDay web

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule. Decision record: [ADR-0021](../../docs/adr/0021-web-ui-tailwind-shadcn-tokens.md).

## System
- Genre: editorial, built as an app screen (no hero, no marketing sections)
- Shape: a top bar (wordmark, theme toggle, log out), a filter form, a single column of place labels, an attribution footer
- Theme: Solstice (Hallmark deal 1/3, seed `warm-food-notebook-restaurant-5ded·2db69b05·2026-11-01·r0`), dual mode: `long-light` in `:root`, `dusk` in `.dark`
- Axes: light 94 80 / high-contrast serif / warm 24 · posture: restrained
- Signature: the place as a label, an ink-ruled well with a gold hairline inset 6px on a hard paper shadow (`label-well`)

## Tokens
`app/tokens.css` is the source of truth and the only file with colour or font values. The roles:
```css
:root {
  --color-paper, --color-paper-2, --color-paper-3   /* page, raised well, chip/badge fill */
  --color-ink, --color-ink-2, --color-muted          /* headings and rules, reading text, small print */
  --color-rule                                       /* hairlines between regions */
  --color-accent, --color-accent-ink, --color-focus  /* vermilion hue 24: primary action, focus ring, visited badge */
  --color-gold                                       /* rules only, never text or fills */
  --color-error
  --font-display  /* Yeseva One 400: place names, wordmark */
  --font-body     /* Archivo: reading, inputs */
  --font-outlier  /* Archivo Narrow 600: small print, buttons, badges, district and ward */
  --radius-card: 0;  --radius-pill: 999px;  --rule-hair: 1px;  --rule-bar: 2px;  --shadow-card: 6px 6px 0 var(--color-paper-3);
}
```
- Dark (`.dark`) is re-derived, not inverted: paper L 17 to 26, ink L 94, accent L +10 and chroma −0.03, the hue never moves. Contrast checked for every text pair (lowest: 5.15:1, button label on vermilion).
- shadcn variables (`--background`, `--primary`, …) in `app/globals.css` are assignments to these tokens. Hallmark's `--color-accent` and `--color-muted` stay out of `@theme` (they collide with shadcn's names); Tailwind reaches them as `primary`, `muted-foreground`, `border`, `foreground`.
- Fonts load through `next/font` in `app/layout.tsx` into `--font-loaded-display|body|small`, subsets latin, latin-ext, vietnamese.

## Controls
- Primary: vermilion pill, Archivo Narrow 600, 44px high, `--color-accent-ink` text. One filled button per view.
- Secondary: outline or ghost pill, same height.
- Inputs and selects: square, `--color-paper-2` fill, 1px ink border, 44px high. Checkbox chips: square, rule border, ink border and `--color-paper-3` fill when checked.
- Badges: pill, 24px high, Archivo Narrow; secondary for cuisine, dish and price, outline for tags, vermilion for "Đã ăn".

## Motion
- Character: still. Colour changes on hover and focus only; the loading skeleton pulses and stops under `prefers-reduced-motion`.

## Exports
`app/tokens.css` and the shadcn mapping in `app/globals.css`. Tailwind or DTCG exports on request (`references/export-formats.md` in the Hallmark skill).
