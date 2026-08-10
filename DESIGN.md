# Design

Warm, airy, photo-forward — soft rounded white cards on a cream ground, with
an editorial layer on top: a serif display face for names, monospace for every
number, and small typographic details that make it feel considered rather than
templated. Approachable at a glance; the typography carries the point of view.

## Type system — the core rule

Three voices, split by **who produced the text**. Never mix them up.

| Voice | Face | Used for |
| --- | --- | --- |
| **Display** | Fraunces, weight 600–700 (`font-display`, applied to `h1–h3` globally) | Proper names and headlines: restaurant names, dish names as titles, screen titles, the wordmark |
| **Machine** | Spline Sans Mono (`font-mono`, loaded as `--font-spline-mono`) | Every number and machine-generated value, no exceptions: prices, percentages, vote counts, rating counts, distances, times, timestamps, usernames/handles, record numbers (`SPOT №005`), and all small uppercase section labels |
| **Human** | System sans (`font-sans`, no webfont) | Body copy, captions, buttons, post text — anything a person wrote in prose |

- Section labels use the shared `.mono-label` class (11px, uppercase,
  `tracking-[0.18em]`, weight 500) — `THE HITS`, `FULL MENU`, `YOUR VERDICT`,
  and the global nav's destinations (`FEED`, `DISCOVER`). The nav is the one
  place the class dresses something a person navigates rather than a heading:
  it is chrome, not a machine value, and it wears the label voice because the
  nav reads as the page's index. Note the class lives **unlayered** in
  `globals.css`, so it outranks Tailwind's layered `font-*` utilities — a
  weight set alongside it is silently discarded, which is why nav state is
  carried by colour and the bullet rather than by going semibold.
- Mono numbers always set `tabular-nums`.
- One deliberate exception: in the feed card's bottom row and map-bubble meta,
  a dish name is a compact *reference* to a record, and sets in **mono**, not
  Fraunces. As a *title* (dish sheet, hits grid would-be headings) the name
  behaves normally.
- Vote arrows are the text glyphs `▲` (voted) / `△` (not yet), set in mono —
  never an icon-library arrow.

## Color

Tokens live in `src/app/globals.css` (`:root` + the retuned `zinc` ramp).

| Token | Value | Role |
| --- | --- | --- |
| `--background` | `#F7F4EC` | Page ground (warm cream). Flat — nothing painted over it |
| card surface | `#FFFFFF` | All cards |
| `--foreground` / `zinc-900` | `#232019` | Primary text (near-black warm) |
| `zinc-400` | `#A79E8D` | Muted decorative text (large sizes only) |
| `zinc-500` | `#7E7261` | Muted *readable* text **on white**: the darkest step of the muted hue that clears 4.5:1 there (4.5:1 exactly). On the cream ground it is only 4.28:1 and fails — see the row below |
| `--pm-grey-text` | `#665C4E` | Muted readable text **on cream** (5.96:1). Small type sitting on `--background` rather than on a card uses this, not `zinc-500`. The header nav is the case that forced the distinction |
| `--pm-orange` | `#C9591F` | The accent: fills, selected states, and **bold/large** numerals (4.26:1 — large text only) |
| `--pm-orange-text` | `#A8481A` | The accent's small-text voice (5.8:1); orange type at body sizes |
| `--pm-grey-tint` | `#EDE8DC` | Neutral chip/pill tan, quiet input fills |
| `--pm-tone-1/2/3` | `#EEE5D2` / `#E6DCC6` / `#EFE8DA` | Warm tone blocks standing in for missing photos |

**One accent.** Orange appears only on: recommendation percentages / vote
counts (data), the selected state of pills and tabs, and the primary action.
Cream text on orange fills is `#F7F4EC`, not white — that pairing is 3.87:1,
which carries at 14px medium and above and must never be asked to hold a
label-sized line. If a screen has more than about three orange elements beyond
the per-card data numbers, remove some.

Semantic colors stay tiny: emerald dot = open/up, `red-700` = destructive or
"let you down". Avatars use the muted warm `AVATAR_PALETTE` in
`src/lib/format.ts`.

## Shape

- Cards: `rounded-2xl` (16px), white, **no borders, no shadows, no gradients**.
  Grouping happens by white-on-cream, never by outline. Section labels sit on
  the cream; the cards under them are the grouping.
- Chips, tabs, buttons: fully rounded pills (`rounded-full`).
  Selected = `bg-pm-orange text-[#F7F4EC]`; unselected = `bg-pm-grey-tint
  text-pm-grey-text`. The global nav is the one exception and takes no fill at
  all — see rank 1 below.
- **Control hierarchy — three ranks, never interchangeable.** Controls that
  share one look read as one menu, so each rank has its own:
  1. *Global nav* — one menu in two bodies, by reach. From `xl` it is the
     header row sitting **directly on the cream — no track, no fill**:
     destinations are `.mono-label` type in `--pm-grey-text`, the current page
     in `--pm-orange-text` behind a 5px `--pm-orange` bullet, hover a tan
     `bg-pm-grey-tint` pill. The compose action holds the middle as the row's
     only filled shape — an orange pill reading "Post a plate".

     **What groups the five slots is spacing, not an edge.** Every gap inside
     the row is 20px between text edges (`px-2.5` on the slots, `mx-2.5` on the
     compose pill); the grid then leaves 80px+ of bare cream between the nav
     and the brand and search either side. Near things group, far things
     separate, nothing is drawn. A 2px tan shelf under the group was tried and
     removed: spanning only the nav, it began and ended in cream and read as a
     stray underline, at ~1.1:1 on the ground it was too faint to look
     deliberate, and grouping by outline is exactly what the Shape section
     rules out. If the row ever needs an edge, give the *whole header* one —
     do not underline the menu alone. Below `xl` the
     same five slots become the fixed bottom bar (`MobileNav`) — icon over an
     11px label, active in `--pm-orange-text`, compose as a 56px orange circle
     in the centre thumb position.

     The two breakpoints are **one switch, and three files hold it**: the
     header row is `xl:flex`, `MobileNav` is `xl:hidden`, and `globals.css`'s
     bottom-padding media query must name the same width — it buys back the
     73px the fixed bar covers, and when it lagged behind, every page lost its
     last rows on tablets. The handoff has moved outward twice, `sm` → `lg` →
     `xl`, each time the row got wider; the named compose button took it from
     364px to 553px, since clawed back to 505px by the tighter slot padding.
     The header wants 1161px for equal side columns, so at `xl` it fits with
     **~119px to spare** — anything added to the header has to earn that space
     or move the switch again. Re-measure when you change it; this number has
     already been wrong twice.
  2. *Screen tabs* (e.g. the feed's Discover / Friends / Map): plain text
     tabs — the active tab is semibold ink with a short orange underline
     bar. Never pills.
  3. *Local switches and filters* (map source toggle, leaderboard window):
     a segmented control — tan `bg-pm-grey-tint p-1` track, selected segment
     white with ink text, mono labels.
- Photo areas: 10–14px radius, inset from the card edge (`m-2/2.5` +
  `rounded-[10px]`/`rounded-xl`) so both radii stay visible.
- Inputs: tan fills (`bg-pm-grey-tint/60`), no borders; focus is the standard
  orange `outline-2` ring.
- Overlays (dropdowns, dialogs) are white cards; a floating menu over a white
  card may carry `ring-1 ring-zinc-200` for separation — that's an overlay
  edge, not a grouping border. No shadows anywhere.
- Bottom sheets (dish sheet) use a **cream** body so the cards inside read as
  cards.

## Photos

Photo-forward: real photography wherever it exists (hero cards, feed media),
always inset and rounded. Where a photo doesn't exist yet, use a flat warm
tone block (`--pm-tone-*`) at the correct aspect ratio — never a gray box,
never an icon placeholder, never "no image" text. Cycle tones by position so
neighbors don't repeat.

## Map

- Tile style is ours: the **neo-noir night style** (`NEO_NOIR_STYLE` in
  `src/lib/mapStyle.ts`) — charcoal base, orange glow pooled under arterials,
  deep harbor water. A confirmed, deliberate exception to the cream world:
  the map is a window into the night city, framed inside a white card. Never
  ship a default tile style.
- Pins are the original beacons: orange rings with a breathing halo, sized
  and glowed by each spot's best post score; closed spots cool to a dim grey
  ember. Hover shows the dark name tooltip. This whole surface is preserved
  as-was — do not restyle it to the cream system.
- Comment bubbles are warm near-white cards with a hairline edge; the dish
  leading a bubble keeps its Fraunces + orange reference treatment
  (`.map-dish-link`), and the meta row is mono.
- Map chrome (zoom controls, attribution) is styled by `.map-fun-tiles` in
  globals.css to match the dark tiles.

## Motion & accessibility

- Motion budget unchanged: ≤300ms, purposeful (sheet-in, like-burst,
  points-float); everything disabled under `prefers-reduced-motion`.
- Floor (do not regress): 44px touch targets (`min-h-11`), visible
  `focus-visible` orange rings everywhere, `aria-pressed`/`aria-current` on
  stateful controls, `role="status"`/`alert` for async feedback, text
  contrast ≥4.5:1 at body sizes (see the two orange voices above).

## Screens (reference implementations)

- **Restaurant page** — `SPOT №xxx` mono label, Fraunces name, tan metadata
  pills, `THE HITS` 2-col dish-card grid (price mono muted left, bold orange
  mono % right), mono footer `RATED BY N LOCALS · SEE FULL MENU →`.
- **Feed** — rank-2 screen tabs (plain text, orange underline on the active
  one — not pills, whatever this line used to say); post card = mono username+timestamp row, sans post
  text, inset photo, bottom row `restaurant · dish` (dish mono) left and
  `▲ 34` orange mono right.
- **Dish sheet** — cream sheet: tone-block photo, Fraunces name,
  `$9.00 · RESTAURANT` mono byline, white score card with 48px orange mono %,
  `YOUR VERDICT` label, full-width verdict pills.
