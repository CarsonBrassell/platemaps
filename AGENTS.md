<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design system — binding rules

The full system lives in [DESIGN.md](DESIGN.md). The short version every UI change must honor:

- **Type by authorship:** Fraunces 600-700 for proper names and screen titles; monospace (Spline Sans Mono, `font-mono`) for EVERY number and machine value — prices, percentages, counts, times, usernames, and small uppercase section labels (`.mono-label`); system sans for prose. Never mix these up.
- **Cream ground `#F7F4EC`, white cards:** `rounded-2xl`, no borders, no shadows, no gradients. Grouping is white-on-cream, never an outline.
- **Pills everywhere, but ranked:** chips, tabs, buttons are `rounded-full`. Global header nav = orange-selected pills in an oval tan track, unselected pills growing slightly on hover; screen tabs = plain text with an orange underline on the active tab (never pills); local switches/filters (map source, leaderboard window) = segmented tan track with a white selected segment. Three different controls must never wear the same clothes.
- **One accent:** orange only on percentages/vote counts, selected states, and the primary action. Small orange text uses `--pm-orange-text` (`#A8481A`) for contrast; `--pm-orange` is for fills and bold/large numerals only.
- **Missing photos** get a warm tone block (`--pm-tone-*`) at the right aspect ratio — never a gray box or icon placeholder.
- **Map** is preserved exactly as it was before the redesign: the neo-noir night style (`NEO_NOIR_STYLE`), glowing beacon pins, and dark chrome — a confirmed exception to the cream world. Do not restyle it.
- Keep the accessibility floor: `min-h-11` targets, orange `focus-visible` rings, ≥4.5:1 body-text contrast, `prefers-reduced-motion` honored.
