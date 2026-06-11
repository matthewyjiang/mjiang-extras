# Design

## Theme

Refined editorial-technical registry. The page reads like a beautifully
typeset reference manual for a package catalogue: an elegant serif sets the
display voice, monospace carries every technical identifier, and structure
comes from hairline rules and generous whitespace rather than boxes, shadows,
or color. Low visual noise, high typographic conviction. Light and dark are
both first-class via `prefers-color-scheme`. A single quiet accent appears only
on interaction and selection.

## Color

OKLCH throughout, near-monochrome. The accent never decorates.

### Light

| Role | Token | Value |
| --- | --- | --- |
| Paper | `--bg` | `oklch(0.985 0.0015 250)` |
| Surface | `--surface` | `oklch(1 0 0)` |
| Sunk surface | `--surface-2` | `oklch(0.974 0.0025 255)` |
| Ink | `--ink` | `oklch(0.2 0.008 265)` |
| Ink secondary | `--ink-2` | `oklch(0.34 0.008 265)` |
| Muted | `--muted` | `oklch(0.5 0.007 265)` |
| Faint (index, least emphasis) | `--faint` | `oklch(0.62 0.006 265)` |
| Hairline | `--line` | `oklch(0.905 0.003 265)` |
| Strong line | `--line-2` | `oklch(0.82 0.004 265)` |
| Accent | `--accent` | `oklch(0.52 0.12 40)` |
| Accent text/links | `--accent-2` | `oklch(0.45 0.12 38)` |
| Accent tint (selection) | `--accent-tint` | `oklch(0.967 0.013 45)` |
| Code surface | `--code-bg` | `oklch(0.205 0.01 265)` |
| Code ink | `--code-ink` | `oklch(0.92 0.008 250)` |

### Dark

Re-declared under `@media (prefers-color-scheme: dark)`: paper `oklch(0.155 …)`,
surface `oklch(0.188 …)`, ink `oklch(0.94 …)`, accent lifts to
`oklch(0.74 0.1 52)`. Primary button and brand mark invert to a light fill.
Body text ≥4.5:1; large text and accents ≥3:1.

## Typography

A three-role system, paired on a strong contrast axis (serif × sans × mono):

- **Display — Instrument Serif** (`--serif`): hero `h1`
  `clamp(2.6rem, 5.5vw, 4rem)` and section `h2`. Elegant, editorial, single
  weight. Letter-spacing 0 (serif needs no tightening).
- **UI & prose — Inter** (`--sans`): nav, labels, buttons, hero text, meta
  labels, section sub-headings. Weights 400/500/600.
- **Technical — JetBrains Mono** (`--mono`): every identifier and datum —
  package names, versions, commands, checksums, file paths, dependency chips,
  stat values, the wordmark, and the numbered index. `tabular-nums` everywhere
  for column alignment.

Fonts load via Google Fonts with `preconnect` + `display=swap`. Base body
`0.9375rem` / 1.6. Fixed product-register scale; the hero `h1` and section
`h2` are the only fluid types.

## Components

- **Numbered index:** the package list is a printed-catalogue index — each row
  is `NN · name · one-line description · version·arch·size`, divided by
  hairlines, no boxes. Hover = sunk surface; selected = accent tint with the
  index and name in accent (no side-stripe).
- **Stats band:** four label/value columns in a single rule-topped/bottomed
  band, values in mono — not floating cards.
- **Detail panel:** the one framed surface (hairline, `--r-lg`, sticky). Meta
  renders as a ruled two-column definition list; deps as quiet mono chips;
  install command and files in ink terminal blocks.
- **Buttons:** 44px, `--r-sm`. Primary = ink fill; ghost = transparent with a
  strong hairline. Copy buttons are small mono ghosts.
- **Inputs:** 42px, strong hairline, accent border + 3px ring on focus.
- **Toast:** ink pill, bottom-right, fade + 6px rise.

## Layout

- Container `min(1080px, 100% - 48px)`, centered; footer rule closes the page.
- Hero: 2-col (`1.05fr / 0.95fr`) → single column under 900px.
- Browser: master-detail (`0.82fr / 1.18fr`) → stacked under 900px, panel
  un-sticks.
- Radii cap at 14px (`--r-lg`); no over-rounding, no decorative shadows.
- Semantic z-index scale (`--z-sticky`, `--z-toast`).

## Motion

State-only, 170ms `cubic-bezier(0.22, 1, 0.36, 1)`. Hover, focus, selection,
toast — no page-load choreography. Full `prefers-reduced-motion: reduce` path.
