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
- One deliberate exception: in the feed card's mono byline and map-bubble
  meta, a dish or restaurant name is a compact *reference* to a record, and
  sets in **mono**, not Fraunces. As a *title* (dish sheet, the feed card's
  headline, hits grid would-be headings) the name behaves normally.
- Votes are **thumbs** (`ThumbsUpIcon` / `ThumbsDownIcon` in
  `src/components/icons.tsx`), outline at rest and filled for the direction
  this viewer pressed, in one size that never changes. They replaced the text
  glyphs `▲`/`△`, which were mandated here for a long time and had to go: the
  two characters come out of different fallback fonts at different optical
  sizes, so the arrow visibly grew on click. Down is the up path rotated 180°,
  never a second drawing. The same mark serves plate votes, comment votes, the
  map bubble's pair (hand-inlined as SVG there, since the bubble is an HTML
  string) and the "someone upvoted you" activity badge — one gesture, one mark.
  The leaderboard's rank-change arrows are **not** votes and keep their `▲`/`▽`
  glyphs.

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
  3. *Local switches and filters* (leaderboard window): a segmented control —
     tan `bg-pm-grey-tint p-1` track, selected segment white with ink text,
     mono labels. **The map's Discover/Friends switch is the exception**: it
     floats on the night tiles, where any track reads as a box on a picture, so
     it wears the rank-2 treatment instead — bare mono labels with the halo
     MapSearch uses, selected one underlined in orange. See the comment at its
     call site in `src/app/feed/page.tsx`.
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
- Pins are GPU paint, not DOM: one GeoJSON source (`PIN_SOURCE` in
  `RestaurantMap.tsx`) feeding WebGL circle layers — every restaurant is its
  own glowing ember at every zoom, sized and warmed (`#d98a5f` → `#ffb07a`)
  by its best post score, closed spots cooled to small grey embers with no
  glow. There is deliberately **no clustering**: zoomed out the lights go
  tiny and vague, and dense blocks clump only because the real dots crowd —
  the city-lights-from-a-plane read. Hover flickers on the neon name
  (`.map-name-tip`, one shared element placed by the map's hover events; the
  same voice as `.map-neon-sign` above each bubble). The look stays the
  night-city language — do not restyle it to the cream system, and do not go
  back to per-restaurant DOM markers: that is what made the map lag as the
  corpus grew. **Every orange light on the map is a PlateMaps restaurant** —
  there is no OSM eatery layer under the pins, because a generic POI dot
  reads as a pin that doesn't glow and can't be opened.
- Under the dots, and only there, a **district aura** (`restaurant-aura`, a
  heatmap over the same source) pools warm `#e8875a` light where the real
  restaurants crowd — Gaslamp, Little Italy, North Park. It is an *area*
  glow, never a ring, a hard edge or a coloured polygon, and quiet blocks
  fade to literally nothing rather than a faint film. A uniform wash over the
  whole city is the failure mode; see the tuning comment on the layer before
  touching intensity, radius or the ramp, since the three only work together.
  **The aura eases off as you pull back, but never disappears.** It reads at
  full strength from z13 in; below that `heatmap-intensity` ramps down so
  everything merely busy drops under the ramp's dead band and recedes into
  plain night, while `heatmap-opacity` eases only slightly (0.75 at z9). The
  two do different jobs and must not be conflated: **intensity picks which
  districts survive, opacity sets how strongly they read.** A restaurant-heavy
  core is meant to keep an obvious pool even at the county view — dimming it
  to a faint smudge is as wrong as the uniform wash. It is a fade, not a
  `minzoom` cutoff, and it must arrive at full strength by exactly z13: the
  near view is signed off and the low-zoom end is the only part in play.
- Comment bubbles are warm near-white cards with a hairline edge, floating
  under the restaurant's own neon sign (`.map-neon-sign`) and tethered to
  their pin by a straight leader line — the sign names the place, so the card
  never has to. At rest the card is **exactly two rows**, because a bubble is
  read at a glance over a moving map and a third row is one more thing to
  parse before you can pan again:
  - **Row 1, the verdict:** the subject hard left, its score hard right
    (`justify-content: space-between`). The subject is the dish when there is
    one and the comment's own words when there isn't. A real dish keeps its
    Fraunces reference treatment (`.map-dish-link`) but is set in **ink
    `#2b211c`, not orange** — the row gets exactly one coloured value and it
    is the score, since two accents an em apart read as two things competing
    rather than as a plate and its verdict; the face and the hover underline
    carry the "you can go here" signal the colour used to. The score is mono
    and never truncates or wraps while the subject ellipses away in front of
    it: the number is the whole reason the bubble is on the map, and pinning
    it to the same edge in every bubble lets a screenful be read straight
    down as a column. A percent wears the composer meter's heat
    (`heatColorForPercent`, the same temperature `.pct-heat` uses). Rows
    written before the star review was retired show `★ 4/5` in
    `--pm-orange-text` — a read path for old data, never produced now.
  - **Row 2, the byline:** mono, muted, `@HANDLE · 2H · ▲ 34 ▼ · 💬 3` —
    handle first, the same order and shape as the feed's ledger card, with the
    reaction as the row's one accent. All of it is machine-made, so all of it
    is mono. The vote pair and the reply count keep **one shape on every
    bubble** so the row never reflows depending on who authored what — but
    only a bubble backed by a real post renders them as buttons. Seeded map
    chatter has nothing to vote on or reply to, so its arrows and reply count
    are plain muted glyphs: a control that looks live and does nothing is
    worse than an obviously static one.

  The comment's prose is the one thing a human typed, and it is still in the
  DOM — hidden at rest in `.map-bubble-prose` and revealed on hover **or
  keyboard focus** (`:focus-within`, since the dish and the vote chips are
  focusable and a pointer must never be the only way to reach text). Nothing
  a poster wrote is ever dropped from the markup to make the card fit.

  **Expanding grows the card upward, and that is load-bearing.** The wrapper
  is locked to the resting height and the box is absolutely positioned against
  its bottom edge, so revealing the prose pushes the card up into empty map
  instead of down. While the box grew downward it dragged the wrapper's bottom
  with it, and the leader — pinned to `top: 100%` — slid off its restaurant
  every time the cursor landed on a bubble. The bottom edge is the leader's
  origin; it must not move.
- Hovering a **bare** ember answers with `.map-name-tip`: the restaurant's name
  in the neon voice plus its **plate score as a bare percent** (`88%`). There is
  one rating scale in the product, so the denominator that used to keep `4.1`
  from being read as a percent has nothing left to disambiguate and is gone with
  the star scale. A restaurant whose plates haven't cleared the plate-score floor
  prints its **name alone** — never the Yelp/Google blend, which is not ours to
  put in the map's voice (see `src/lib/plateScore.ts`).

  Hovering an ember that **already has a bubble** prints nothing new — its
  neon sign is already naming it, and a tip would stack a second copy of the
  same name a few px away and read as two different places. The existing sign
  answers instead: `.is-live`, a brighter burn plus a short flicker. Same
  information, no repetition.
- **Hit targets are a layer of their own** (`restaurant-hit`, fully
  transparent), never the painted dots. MapLibre hit-tests a circle by its
  radius alone — `circle-blur` spreads the glow but not the geometry — so
  binding hover to a painted layer makes the target only as big as the light
  is drawn, which at county zoom is a couple of px and feels broken. The
  invisible layer decouples the two: an ember stays whatever size it should
  LOOK, and the thing you have to hit stays comfortable (14-24px) at every
  zoom. Because a fat target catches several neighbours at once and MapLibre
  returns them in RENDER order rather than by distance, hover and click both
  pick the **nearest** feature to the cursor — otherwise one light answers
  with another's name.
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

- **Three numbers on a restaurant page, and none may be mistakable for another.**
  The plate score is a **percent** — it is the only percent, and it means one
  specific thing (what the plates' ratings average to). Category scores
  (Service, Ambiance, Drinks, Menu variety, Value) are **out of 5**, because a
  category is a judgement about the place rather than a share of anything;
  `aspectOutOfFive` converts them from the model's internal 0-100 and is the only
  place that conversion happens. The sourced rating is **also out of 5**, so both
  fives **always print their denominator** (`4.4/5`) and the category ones always
  sit against their label. Never give a category a percent sign, and never draw
  star glyphs for one — stars are the sourced rating's alone.
- **Of those three, the plate score and the sourced rating must never be
  mistakable for each other.** The plate score (ours) always leads and always wears `--pm-orange`;
  the Yelp/Google blend follows, muted, **always with its `/5`**. That denominator
  is not optional — it is the only thing separating `4.1` from a percent when the
  two sit inches apart. The blend never takes the accent and never appears without
  the plate score's slot being accounted for. Both are gated on
  `SHOW_BLEND_STARS` (`src/lib/ratingDisplay.ts`), which is designed to be flipped
  off; nothing may draw a star outside that flag.
- **Restaurant page** — `SPOT №xxx` mono label, Fraunces name, then the two
  numbers side by side: the **plate score** as a 4xl bold mono percent in
  `--pm-orange`, naming itself in an 11px muted line directly beneath (`average of
  all dish ratings`, then `37 ratings across 6 plates`); and the **blend** as
  fractional-fill stars plus mono `4.3/5` at metadata size, over an 11px
  `sourced from the web · 1,966 reviews`. Tan metadata pills below, then one 11px
  line disclosing that star ratings are sourced from across the web and are not
  PlateMaps ratings, carrying the `Photo via Yelp` credit. **The copy names no
  source** — not Yelp, not Google, not "blend"; that is build detail, and naming
  two companies reads as a partnership the product doesn't have. Both strings live
  in `src/lib/ratingDisplay.ts`. Under the plate-score floor the stars
  carry the block alone and `N plates rated` sits where the percent would be.
  Then `THE HITS` 2-col dish-card grid (price mono muted left, bold orange
  mono % right), mono footer `RATED BY N LOCALS · SEE FULL MENU →`.
- **Grid card / picks strip** — one white pill on the photo holding both: bold
  orange mono percent with its rating count, a `zinc-300` middot, then a **single**
  star glyph and mono `4.1/5` in `zinc-600`. One star, not five — at pill size
  five glyphs plus two numbers is a smudge, and the `/5` names the scale anyway.
  Under the floor the pill holds the stars only, and `No plates rated yet` moves
  to the body row beside the open pill in 11px `zinc-400`.
- **Feed** — rank-2 screen tabs (plain text, orange underline on the active
  one — not pills, whatever this line used to say); ledger post card = the
  subject as the Fraunces headline with its verdict on the same line — dish
  posts a bold mono percent wearing the composer meter's heat gradient
  (`.pct-heat` + `data-heat`, stops shared with `.pct-meter`); pre-retirement
  restaurant rows still render stars + mono `n/5` and never a "restaurant
  review" label (the stars say it); below it a mono byline that opens with the handle —
  `@handle · restaurant · 2h` — carrying no neighbourhood; inset photo only
  when the post has media (photos are friends-tab-scoped, so most Discover
  entries are headline + words), sans post text under the plate, `▲ 34`
  mono in the action row.
- **Dish sheet** — cream sheet: tone-block photo, Fraunces name,
  `$9.00 · RESTAURANT` mono byline, white score card with 48px orange mono %,
  `YOUR VERDICT` label, full-width verdict pills.
