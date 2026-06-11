# Product

## Register

product

## Users

Linux users (primarily Arch) who want to install packages from the personal
`mjiang-extras` repository. They arrive in a task: enable the repo in
`pacman.conf`, find a specific package, inspect its version / dependencies /
files, and copy a `pacman -S` install command. They are command-line fluent and
read monospaced identifiers (package names, versions, checksums, paths) all day.

## Product Purpose

A static, single-page browser for one Arch Linux package repository. It reads
the repo's `.files` database (with a `packages.json` fallback), lists every
package, and surfaces the metadata needed to decide on and perform an install.
Success: a visitor enables the repo and finds what to install without leaving
the page or guessing.

## Brand Personality

Precise, quiet, technical. The voice of good developer documentation and a
sharp CLI tool — not a marketing site. Three words: exact, calm, legible.

## Anti-references

- The warm-cream / glassmorphism / gradient "AI landing page" look (what this
  page was before the redesign).
- Heavy hero-metric SaaS templates and decorative motion.
- Anything that makes a utilitarian package index feel like a product launch.

## Design Principles

1. **The tool disappears into the task.** Earned familiarity over novelty;
   browsing and copying should need no thought.
2. **Monospace is the native voice.** Technical identifiers render in mono
   because that is how the user already reads them.
3. **Accent is a signal, not decoration.** The one brand color marks
   interaction and selection only.
4. **Borders, not chrome.** Separation comes from hairlines and spacing, not
   shadows, blur, or cards-within-cards.
5. **Fast and static.** Zero web fonts, no dependencies, no load choreography.

## Accessibility & Inclusion

Target WCAG 2.1 AA: body text ≥4.5:1, large text ≥3:1, visible focus rings on
every interactive element, full keyboard operability, and a
`prefers-reduced-motion` path. Respect `prefers-color-scheme` for light and dark.
