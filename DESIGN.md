# Design

## Theme

Clean, minimal, technical. A near-achromatic paper/ink surface separated by
hairline borders and whitespace — no shadows-as-decoration, no glassmorphism,
no gradients. A single clay accent marks interaction and selection only.
Monospace carries every technical identifier (package names, versions,
commands, checksums, file paths); the system sans carries prose and UI.
Light and dark are both first-class, driven by `prefers-color-scheme`.

## Color

OKLCH throughout. Accent is used for interactive/selected/focus states only,
never as decoration.

### Light

| Role | Token | Value |
| --- | --- | --- |
| Page background | `--bg` | `oklch(0.985 0.002 250)` |
| Surface | `--surface` | `oklch(1 0 0)` |
| Sunk surface | `--surface-sunk` | `oklch(0.975 0.003 250)` |
| Ink (text) | `--ink` | `oklch(0.24 0.012 260)` |
| Ink soft | `--ink-soft` | `oklch(0.38 0.01 260)` |
| Muted | `--muted` | `oklch(0.52 0.01 260)` |
| Hairline | `--line` | `oklch(0.91 0.004 260)` |
| Strong line | `--line-strong` | `oklch(0.84 0.005 260)` |
| Accent | `--accent` | `oklch(0.56 0.13 44)` |
| Accent strong (text/links) | `--accent-strong` | `oklch(0.48 0.13 42)` |
| Accent tint (selection bg) | `--accent-tint` | `oklch(0.965 0.018 50)` |
| Code surface | `--code-bg` | `oklch(0.22 0.012 260)` |
| Code ink | `--code-ink` | `oklch(0.93 0.01 250)` |
| Success | `--ok` | `oklch(0.5 0.1 150)` |

### Dark

Tokens are re-declared under `@media (prefers-color-scheme: dark)`: bg
`oklch(0.17 …)`, surface `oklch(0.205 …)`, ink `oklch(0.95 …)`, accent lifts to
`oklch(0.74 0.11 52)`. Primary button and brand mark invert to a light fill on
dark text.

All body text meets ≥4.5:1; large text and accents meet ≥3:1.

## Typography

- **Sans (UI + prose):** `system-ui, -apple-system, "Segoe UI", Roboto, …`
- **Mono (identifiers, code, data):** `ui-monospace, "SF Mono", "JetBrains Mono", …`
- No web fonts — zero network cost.
- Fixed rem scale (not fluid), product-register tight ratio. Base body
  `0.9375rem` / line-height 1.6. The hero `h1` is the one fluid exception:
  `clamp(2rem, 4vw, 2.6rem)`, letter-spacing `-0.03em` (within the `-0.04em`
  floor). `h2` 1.35rem, detail `h3` 1.2rem (mono), section `h4` 0.78rem.
- `text-wrap: balance` on headings, `pretty` on hero prose.

## Components

- **Buttons:** 40px tall, `--r-sm` (7px). Primary = ink fill; secondary =
  surface with a strong hairline. Small ghost/copy buttons use `--r-xs`.
- **Inputs:** 40px, strong hairline, accent border + 3px accent ring on focus.
- **Install panel / code:** dark terminal surface (`--code-bg`) with a hairline
  header and a copy button.
- **Stats strip:** one bordered container divided by internal hairlines (not
  four floating cards); values in mono.
- **Package list:** flat rows in one bordered container, divided by hairlines;
  hover = sunk surface, selected = accent tint + accent-colored mono name (no
  side-stripe).
- **Detail panel:** sticky; meta as a hairline-gridded 2-col table; deps as
  mono chips; files in a scrollable terminal block.
- **Pills/chips:** small `--r-xs` mono tags, quiet by default; `.green` for
  architecture.
- **Toast:** ink pill, bottom-right, fades + 6px rise.

## Layout

- Container `min(1080px, 100% - 40px)`, centered.
- Hero: 2-col (`1.1fr / 0.9fr`) → single column under 900px.
- Browser: master-detail (`0.85fr / 1.15fr`) → stacked under 900px, detail
  panel un-sticks.
- Radii: `--r-xs` 5px, `--r-sm` 7px, `--r-md` 10px, `--r-lg` 14px. Cards top
  out at 14px — no over-rounding.
- Semantic z-index scale (`--z-sticky`, `--z-toast`).

## Motion

State-only, 160ms `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out). Hover, focus,
selection, and toast — no page-load choreography. Full
`prefers-reduced-motion: reduce` path collapses transitions and smooth scroll.
