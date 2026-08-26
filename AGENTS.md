<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design system — binding rules

The full system lives in [DESIGN.md](DESIGN.md). The short version every UI change must honor:

- **Type by authorship:** Fraunces 600-700 for proper names and screen titles; monospace (Spline Sans Mono, `font-mono`) for EVERY number and machine value — prices, percentages, counts, times, usernames, and small uppercase section labels (`.mono-label`); system sans for prose. Never mix these up.
- **Cream ground `#F7F4EC`, white cards:** `rounded-2xl`, no borders, no shadows, no gradients. Grouping is white-on-cream, never an outline.
- **Pills everywhere, but ranked:** chips, tabs, buttons are `rounded-full`. Global header nav = no track and no fill — `.mono-label` destinations on the bare cream, current page in `--pm-orange-text` behind a 5px orange bullet, and one orange "Post a plate" pill holding the middle; screen tabs = plain text with an orange underline on the active tab (never pills); local switches/filters (leaderboard window) = segmented tan track with a white selected segment. Three different controls must never wear the same clothes — the one sanctioned exception is the map's Discover/Friends switch, which takes the screen-tab treatment because no track survives on the night tiles (see DESIGN.md).
- **The nav breakpoint is one switch in three files:** header row `xl:flex`, `MobileNav` `xl:hidden`, and the bottom-padding media query in `globals.css` — change one, change all three. The header row fits `xl` with 21px to spare; anything added there has to earn it.
- **Muted small text: `zinc-500` on white, `--pm-grey-text` on cream.** `zinc-500` only clears 4.5:1 against a card; on the `#F7F4EC` ground it is 4.28:1 and fails.
- **One accent:** orange only on percentages/vote counts, selected states, and the primary action. Small orange text uses `--pm-orange-text` (`#A8481A`) for contrast; `--pm-orange` is for fills and bold/large numerals only.
- **Votes are arrows**: `VoteArrowUpIcon`/`VoteArrowDownIcon`, outline at rest, filled for the direction you pressed, one size in both states. Every vote surface uses the same pair — feed card, phone card, comments, map bubble (hand-inlined, same `d`). The mark is **one closed path**, which is what makes the size invariant hold; the retired `▲`/`△` text glyphs could not (two characters, two fallback fonts, so the arrow grew on click) and that, not the arrow shape, was the bug. `ThumbsUpIcon` survives only where a count of approvals is being *reported* rather than cast — the dish sheet's yes-count and the activity badge. The leaderboard's rank-change arrows are not votes and keep their glyphs.
- **Missing photos** get a warm tone block (`--pm-tone-*`) at the right aspect ratio — never a gray box or icon placeholder.
- **Map** keeps the neo-noir night style (`NEO_NOIR_STYLE`) and dark chrome — a confirmed exception to the cream world; do not restyle it. Restaurant pins are an unclustered WebGL circle layer — every restaurant is its own glowing ember at every zoom, blurred and tiny when zoomed out (dense blocks clump only because the real dots crowd, like city lights from a plane) and crisp up close. There is deliberately no clustering and no numbered counters, and never per-restaurant DOM markers — DOM pins are what made the map lag.
- Keep the accessibility floor: `min-h-11` targets, orange `focus-visible` rings, ≥4.5:1 body-text contrast, `prefers-reduced-motion` honored.


# Shared tree: leave it bootable, and know how it lies to you

More than one agent works in this repo at a time, in the same working tree.
Two habits keep that from costing somebody else their session.

**Run `npx tsc --noEmit` before you stop** — not before you commit, before you
*stop*. A type error anywhere makes the check useless for everyone, because
the next person cannot tell their errors from yours. If you cannot finish a
refactor, revert the half that does not compile rather than parking it.

**Turbopack caches compile errors past the fix.** This one is worth knowing
because it wastes an hour and looks like somebody else broke your code. A bad
import — say a symbol that got renamed — makes the dev server return **500 on
every route in the app**, not just the file that imported it. Fixing the file
does not clear it. Touching the file does not clear it. The error is held in
`hot-reloader-turbopack`, and only a full dev-server restart clears it. So
when every route is 500 and the code on disk looks fine, the code on disk
probably *is* fine: read the actual error body
(`curl -s localhost:3000/ | grep -o '"message":"[^"]*'`), check whether the
symbol it names still exists, and restart before you go hunting.

Finally, do not park large uncommitted edits in shared files — `globals.css`,
`AGENTS.md`, `DESIGN.md` — across sessions. It shifts every line number under
everyone else's work and makes conflicts certain.
