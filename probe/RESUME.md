# Resume pack

Read this and nothing else when a session starts or continues after
compaction. It is kept under 2K tokens on purpose. RUNBOOK, STATE, CONTEXT,
TRIAGE and FINDINGS are for humans and for `grep`; do not read them whole.

## Numbers

Run `npm run db:stats` (2 seconds, read-only) instead of trusting anything
written here. Last run 2026-09-05 03:45:

```
restaurants  total 14,078  held 5,143  live 8,935  listed 8,935   (2026-09-05 19:10 PT; deep discovery pass +95 gmap, 74 listed)
menus        with_menu 5,231 (60% of live)  listed_with_menu 4,037 (52% of listed)
todo         queue 4,309  not_found 697  listed_without_menu 3,711
dishes       385,165
by_source    osm 5,019  sweep 3,804  deh 3,790  gmap 789  yelp 675
```

`npm run db:stats -- --json` also writes `probe/stats.json` for scripts and
agent briefs to read. "Listed" is the only number a visitor experiences.

## Since 2026-09-05 (newest decisions, read these)

- **Search dimming is a COLOUR change now, not an alpha one (2026-09-07,
  uncommitted).** Calvin: running a search then zooming out left the unmatched
  field looking undimmed. It was alpha-only (`0.45` at z9 falling to `0.22` at
  z16), and three things cancelled it at low zoom: overlapping dots composite
  to `1-(1-a)^N`, so ~9k restaurants blurred to 3-4px saturate after about five
  and land back on the full ember colour; the aura is hidden for the whole of a
  search, darkening the ground and *raising* each ember contrast; and losing
  glow/inner leaves a hard-edged dot that reads as more present. `DIM_COLOR`
  (`#6b4a3a`, a cooled ember in the accent hue family, deliberately not a
  second grey so it stays clear of `closed` and its `#4b525e`) is now the first
  branch of `restaurant-dots` `circle-color`, tested before `closed` in both
  colour and opacity; `DOT_OPACITY` is a flat `case` (dim 0.7, closed 0.5, else
  0.95) with no zoom ramp. A crowd of dim embers now converges on the dim
  colour instead of on the accent. Verified by screenshot at z10.5 and z9 with
  `ramen` searched. Any future zoom ramp here must repeat the whole `case` at
  each stop: `["zoom"]` is only legal as a top-level `interpolate` input, and
  nesting it inside a `case` branch makes MapLibre reject the property and fall
  back to 1.0, which shipped once as a map that dimmed nothing.

- **Friends' Table shows everyone's rank, not kitchen stations (2026-09-07,
  uncommitted).** Calvin asked for "Head chef" etc. to go from the phone
  leaderboard and for every row to show its rank instead. `RankChip` in
  `PhoneFriendsLeaderboard.tsx` now prints `rankFor(points).title` (Newcomer
  … Institution, `lib/ranks.ts`) on every row, tan on all of them; the `№`
  still carries the podium. `lib/stations.ts` survives only for the web
  `LeaderboardRow`, which nothing imports. Comments in `ranks.ts` and both
  profile pages updated to say the rank now shows in three places. Verified
  by screenshot on a throwaway `/m` page, since deleted. Note: the dev server
  intermittently 500s the whole `/m` tree on another session's in-flight
  suggest work (`hrefForSuggestion` missing from untracked `useSuggest.ts`).

- **Overlays swipe away; the comments header clears the notch (2026-09-07,
  pushed as e363f2e).** In the app the comments screen's back arrow, title and
  count sat behind the status bar: `Dialog`'s `screen` panel is
  `fixed inset-0`, so it is not in `.pm-phone-content` and never got that
  scroller's `env(safe-area-inset-top)`. Its header now carries
  `pt-[max(0.75rem,env(safe-area-inset-top))]` itself — inert in a browser,
  where the inset is 0. Same file gained swipe-to-dismiss for every variant:
  `screen` goes right, sheets and modals go down, touch only, with the
  nearest scroller on that axis deciding who owns the drag. That guard has
  to check computed `overflow` first — `truncate` is `overflow: hidden` and
  reports scrollWidth > clientWidth like a real scroller, so without it the
  dialog's own title swallowed every swipe and nothing moved.
  `PhoneSwipeBack` (new, mounted in `PhoneShell`) adds the same gesture for
  pushed /m routes from the left 28px, standing down while any
  `[role="dialog"]` is open. Its depth counter lives in `history.state`
  (`__pmDepth`, merged so the App Router keeps its key): a ref cannot tell a
  back from a push and climbs by one every round trip until the root screen
  thinks it is deep and swipes the user out of the app.
  Both gestures use **native `touchmove` listeners registered
  `{ passive: false }`**, and that is not a detail: React registers its own
  `touchmove` passively, so a handler written as a JSX prop cannot call
  `preventDefault`. The first version shipped on pointer events and never
  prevented anything, so the WebView started scrolling the moment a thumb
  drifted off-axis and cancelled the swipe with it — every arced swipe died.
  The axis is now decided on the first move carrying 4px (the browser settles
  scroll-vs-not on the first move it keeps, so a decision made after a clean
  10px arrives too late to act on), it is refused outright when `e.cancelable`
  is already false, and a cancel snaps back rather than dismissing.
- **Search is ranked and has a dropdown, web + phone (2026-09-07,
  uncommitted).** Calvin's report: a restaurant with one letter wrong returned
  nothing, and "a bunch of random shit came up". Both halves are now built —
  `probe/SEARCH-PLAN.md` is the full record, read its `## Status` section, not
  this bullet. The dropdown is **one row per reading, never a list of names** —
  Calvin rejected per-name rows twice, then spelled the shape out: "one
  selection for dishes, one selection for restaurants and one selection for food
  or whatever", each carrying its count. The rules that must survive any later
  edit: **a name match outranks every cuisine and dish match, misspelled or
  not** (`TIER` in `lib/textMatch.ts`, floor `SIMILAR_ENOUGH = 0.65`, calibrated
  against 4,016 generated typos — do not raise it by feel); **the count on a row
  is the size of the page that row opens**, which is why `lib/suggest.ts` counts
  with one pass of the grid's own `relevanceFor` filed by `scopeOf` rather than
  a pass per reading (a per-reading count offered 140 over a page of 150);
  **corrections are all-or-nothing across the rows** (a reading with no literal
  hit drops off the moment any other reading has one — `literal` decides
  visibility only, never the printed number); **picking a
  cuisine/neighbourhood/dish row drops `?q=`**, because ANDing a misspelling
  against the right filter is what produced the empty grids; and
  **`lib/suggestTypes.ts` imports nothing**, so client components can hold the
  wire types without dragging the Neon driver into the browser bundle.
  A row that names one thing goes somewhere better than a search —
  `/restaurant/167` for Cannonball, `?cuisine=Thai` for Thai — everything else
  goes to the scoped search `?q=…&in=<scope>` (`SCOPE_PARAM`, read straight off
  the relevance score, so scoping cannot disagree with ranking).
  `promote()` now leaves a term alone when it is exactly a restaurant's name —
  one place in the corpus, `Pizza` in University Heights, which was otherwise
  unreachable by name. Still to do: **B4** (dish precision) and **B5** (SQL
  parity in `searchRestaurants`), both optional and neither blocking.

- **Phone feed bar is pinned in two tiers, with the refresh gap between them
  (2026-09-07, committed 91b2add / e25b8ba / abf8c5c / c69963b / f0837b0).**
  `PhoneStickyBar` takes a `pinned` prop plus two optional slots —
  `gap` (opens *between* the tiers, sized by `--pm-pull`) and `lower` (the
  second tier, measured by the same ResizeObserver as the first). `PhoneFeedScreen`
  passes the tab row as `children`, `PhonePullToRefresh` as `gap` and the
  sort-switch/search row as `lower`. Discover (/m) is unchanged.

  The middle state went back and forth. All three rows pinned as one block
  (abf8c5c) cost 90pt of a ~640pt screen permanently; the split (c69963b) put
  the sort switch and search in the ordinary flow, which made them reachable
  only from the very top — you scrolled home to change the sort, which is the
  round trip the sticky bar exists to remove. Two tiers is the resolution:
  a quick upward scroll brings the whole header back at once, and at rest the
  gap opening between them means the tab row stays welded to the top while
  New/Trending and search travel down with the cards and the dial arrives in
  front of them. The spacer grows by the pull as well
  (`calc(${height + lowerHeight}px + var(--pm-pull, 0px))`), so the cards
  never shear away from the bar mid-drag. The lower tier uses `pt-0.5`, not
  `mt-0.5`: it is measured with `offsetHeight`, which excludes margins.

  Pinned still hides on the way down and returns on the way up, off the same
  `settle` as the sticky build — there is no pinned early return any more. It
  hides to `-frameHeight` and **not** `-height`: the fixed box wears the inset
  as padding (below), so it only clears the screen once it has travelled its
  content plus the inset, and `height` parked it an inset short with the
  bottom of the tabs showing under the clock. The offset animates through
  `top`, never a transform.

  **Pinned is `position: fixed`, not sticky, and that is not a style choice.**
  Sticky held `top: 0` correctly in a desktop browser and drifted a few points
  up and down on the phone through every scroll ("it still shifts up and down a
  tad bit"): sticky is recomputed against the scrollport each frame, and this
  scroller has a non-passive `touchmove` listener plus a `scroll` listener, so
  while a finger is down WebKit scrolls from the main thread and the offset
  lands a frame late. The fixed build leaves the flow, drops a measured spacer
  in its place, and carries `padding-top: env(safe-area-inset-top)` itself —
  the one place the "never add the inset to `top`" rule in that file's header is
  reversed, because fixed pins above the scroller's padding rather than below
  it. That padding replaces the separate slab. Do not put the feed bar back on
  sticky.

  `PhonePullToRefresh` stopped being a `position: fixed` dial over the list —
  it is now an in-flow block mounted directly under the bar whose *height* is
  the pull (`.phone-refresh` in phone.css: `position: relative;
  height: var(--pm-pull); overflow: hidden; align-items: flex-end`), so the drag
  opens a real gap, the cards below move and the dial slides down out from
  behind the tab row. Still a height and never a transform — a transformed
  ancestor would re-anchor every `position: fixed` overlay in the app for the
  length of the drag.

  The pull is **published on the scroller** as `--pm-pull`, not kept in the
  gap element's own style, because the bar's spacer has to read the same
  number; lifting `pull` into `PhoneFeedScreen` state instead would re-render
  the whole card list on every drag frame. `--pm-pull-ease` travels with it:
  a custom property does not transition, a `calc()` height driven by one does,
  and the spacer cannot see the `data-phase` attribute that switches the gap's
  own transition off — so the duration is carried as a second var. 0s while a
  finger is setting the number (a transition there is lag between the drag and
  the cards), 0.22s for every move the component makes on its own: the snap
  back from a cancelled pull, the drop to REST, and the close. Without it the
  cards jumped home in one frame while the dial was still winding shut.

  It also arms **mid-touch**: reading down the feed and dragging back up is one
  continuous downward drag that reaches the top with the finger still moving,
  and arming only on `touchstart` refused that whole touch, so scrolling home
  got the platform's bare bounce and no wheel. The touch is tracked wherever it
  starts and `startY` is rewritten every frame the scroller is still moving, so
  the pull is measured from where the finger was when the list ran out.
  `.pm-phone-content` went `overscroll-behavior: contain` → `none` for the same
  reason: a drag that reaches the top mid-touch cannot cancel the rubber-band
  (WebKit commits on a touch's opening moves), so bounce and gap would have run
  together and the list would have travelled twice as far.

  There is deliberately **no second threshold** for a pull inherited from a
  scroll. One existed for a day — PICKUP, 28pt of extra travel to arm
  (cbdf2c6) — on the theory that a finger arriving at the end of the list is
  still wandering as it slows and would twitch the gap open and shut at SLOP.
  It was removed in c69963b: "if you start scrolled down and scroll up it
  smoothly transition to the loading animation and not stop at the top" — and
  stopping at the top is exactly what it did, the list running out and nothing
  happening until you had dragged another 28pt. Do not add it back. What holds
  the twitch down instead is a dip back over the baseline **re-baselining**
  rather than ending the touch (so a wobble never accumulates and a deliberate
  drag still pays SLOP in one motion), plus a guard against re-rendering a pull
  value that has not changed.

- **Map bubbles ~15% larger; downvote arrow fixed (2026-09-07, uncommitted).**
  `arrowGlyph` in RestaurantMap.tsx rotated the downvote with `transform` on
  the outer `<svg>`, which browsers ignore, so both arrows pointed up; it now
  rotates an inner `<g>`. Calvin rejected enlarging the vote pair alone (it
  outgrew the row), so the whole bubble went up a step instead: 12→14px
  headline, 10→11.5px meta row, 11→13px arrows, padding 7/13, with the
  measured row heights and estimateMetaWidth/estimateBubbleWidth per-char
  advances scaled to match. Verified in Chrome on /feed → Map feed.

- **Sunny Side Solana (id 7197) has demo dish percents (2026-09-06).** For Ed to
  see what a restaurant page looks like with THE HITS filled in, eight of its
  105 dishes got hand-set `dishes.yes_votes`/`no_votes` (the read-only
  fallback tally `dishStats` renders when no dish-rated posts exist): Short
  Rib Hash 94, Chilaquiles 91, Short Rib benedict 89, Nutella Banana Pancakes
  88, My Way or Hwy 101 86, Strawberry Dream French Toast 84, Solana Omelet
  81, Country Fried Steak & Eggs 78 (ids 7197-4/6/30/17/1/19/24/5). Phone
  shows seven (`PhoneDetailScreen` caps at 7), web shows eight. These are the
  only non-zero vote rows in the corpus; zero them out to undo.

- **Tour step 6 "nothing appears" fixed (2026-09-06).** A real tap on a step's
  control advances in the capture phase, and Chrome flushes React between the
  phases of a user-initiated click, so the next StepMark was already listening
  when the same tap bubbled and folded it into the "TOUR 6 / 12" badge on
  arrival. `StepMark`'s outside-click listener now ignores events stamped
  before it was armed (`e.timeStamp <= armedAt`). Scripted `el.click()` never
  showed it (no microtask checkpoint mid-dispatch) - test tours with real
  taps. Same day: `POST /api/account/settings {tourSeen}` is two-way
  (`setTourSeen(userId, seen)` in db.ts) and Calvin's `users.tour_seen` was
  reset to false so the tour opens on his localhost without `?tour=1`.

- **Tour walked end to end as a first-timer, rough edges fixed (2026-09-05).**
  `CoachTour.tsx`: the "Have a scroll" step no longer blocks scrolling (it was
  a pane over `.pm-phone-content`; now a capture-phase click swallow, so cards
  and nav are inert but the feed scrolls). A move whose control is off-screen
  scrolls it into view — sticky rows scroll the phone scroller to the top so
  the hidden `PhoneStickyBar` comes back. A move whose control is not on this
  page marks the Feed nav with "Tap Feed to get back" (`home: "feed"` on the
  map/feedtab/restaurant steps); if nothing at all is found for 2.5s the
  caption says so and offers Next. Captions are clamped to the viewport. The
  mark remounts per step *and* page, so a badge folded by a nav tap unfolds on
  the screen it opened. `?tour=1` is latched once per mount (it used to be
  re-read every render and closed itself on the first navigation for anyone
  with the latch set) and always starts at step 1. Chrome on this PC is signed
  in with `tourSeen: true`, so `?tour=1` is the only way to see it here.
  Signed-out Friends/Profile steps land on the sign-in walls — copy unchanged.
  Verifying in a background Chrome tab: rAF and scroll events are paused, so
  take a 0.1-scale screenshot to pump frames before reading layout.
- **The first-run tour no longer needs a login (2026-09-05).** `useCoachTour`
  in `src/components/tour/CoachTour.tsx` used to require an account, so a
  signed-out visitor — the most first-run person there is — never saw it, and
  it could not be looked at on localhost without signing in. The latch now has
  two halves: `account.tourSeen` when signed in, `localStorage["pm-tour-seen"]`
  when not, and `finish()` writes the local one always so signing out does not
  re-offer it. `?tour=1` on any URL replays it past both latches — that is how
  to see it, e.g. `localhost:3000/m/feed?tour=1`. `open` is derived during
  render, not latched by an effect; the two eslint react-hooks rules here
  (`set-state-in-effect`, `refs`) reject both of the obvious alternatives.
  Typecheck and eslint clean, verified running signed-out on `/m`.

- **What killed the Serper credits (forensics 2026-09-05 16:00 PT):** NOT menu
  extraction. Between 13:38 and 13:52 the second-query-word lever was run three
  times back to back — `--query cafe` (1,117 cells), `--query bar` (1,111),
  `--query bakery` (died at 66) — roughly 2,300 credits in fourteen minutes, on
  top of the 1,118-cell "restaurants" grid and the 88-cell deep pass. Yield: 217
  new rows, **95 of them bars, breweries, lounges or nightclubs** (39 typed
  "brewery", 22 "bar", 7 "cocktail_bar"). Those rows then clogged the extraction
  queue and are the direct reason waves w8 and w8b returned almost nothing — the
  agents kept filing "no food menu, hold candidate". **Before running another
  query word, decide whether bars belong on a dish map at all.** The lever costs
  ~1,100 credits per word and this run spent them on venues with no food.
- **SERPER CREDITS EXHAUSTED 2026-09-05 ~13:50 PT** (serper.mjs returns 400 "Not enough
  credits"). The "cafe" discovery pass died after 66 cells (probe/discover-0905b.log,
  1,057 credit errors); w8-03/w8-04 agents could not search, every no-website row
  filed blocked (0 permanent). Do NOT spawn agents on no-website rows until Calvin
  tops up at serper.dev; the router/browser night loop does not need Serper and
  keeps running. Resume: re-run `discover-serper.mjs --fetch --query cafe` (state
  file resumes free), then cut-wave.mjs --prefix w8b.
- **Neighborhoods recomputed 2026-09-05 14:35 PT.** 5,104 listed rows carried a ZONE
  name ("North County Inland") instead of a sub-area, so neighborhood chips
  undercounted (Pauma Valley showed 1 of 12). `fix-neighborhoods.mjs --apply`
  run to convergence (it writes in passes; run until "0 would change"). Snapshot:
  `probe/snapshots/neighborhood-20260905T142340.json`. ~200 listed rows keep a
  zone name on purpose: >5 mi from any sub-area point (Borrego, Campo, Julian
  outskirts) — add points to `src/data/regions.ts` to fix. Held 9967 "Pauma
  Indian Reservation" and 11828 "Valley Center High School Cafe" (not public).
  Out-of-county sweep hold (2,683 rows) IS applied now. Any importer that
  inserts rows must run fix-neighborhoods afterwards or chips undercount again.
  Duplicate suspect: Jilberto's Taco Shop 9513 and 5874, two CA-76 addresses.
- **Cuisine backfill from menus (2026-09-05 ~20:20 PT).** Coverage before:
  1,267 listed rows had no cuisine (raw label "Restaurant"/null). Two passes:
  (1) `src/data/cuisines.ts` ALIASES/UNSET extended with ~60 Google place
  types (`korean_barbecue_restaurant`, `poke_bar`, `chocolate_shop`...) and
  `backfill-cuisine.mjs --apply` filled 322 rows. (2) NEW
  `scripts/infer-cuisine.mjs`: scores name + menu sections + dish names
  against a per-cuisine lexicon (name 6, generic venue word "Grill/Kitchen/
  Cafe/Bar" 3, section 2, dish 1/0.4); decides at score >= 8 with a menu or
  >= 3 on a bare name, and >= 2x the runner-up. `--no-llm --apply` wrote 844
  rows (490 listed). Snapshot of the touched rows:
  `probe/snapshots/cuisine-null-2026-09-05T20-16-50.json`; decision log with
  evidence: `probe/cuisine-inferred-2026-09-05T20-16-50.json`. After: 610
  listed rows still null (1,035 total), 334 of them WITH a menu the keywords
  could not settle ("Ketch Grill & Taps", "Le Bambou") and ~275 bare names
  ("Americana Restaurant", "The Meltdown"). Stage 2 (LLM) was **never run** —
  no ANTHROPIC_API_KEY, and Calvin said do it by hand instead.
- **Manual cuisine pass (2026-09-06 ~02:30 PT).** `probe/cuisine-todo.mjs`
  dumped the 1,046 blank rows into `probe/cuisine-todo/batch-01..10.txt` —
  listed rows first, menu-richest first, each line `<id> | <name> |
  <cuisine_raw> | [top 8 sections] 14 dishes spread through the menu`. I read
  batches 01-06 (every listed row) and hand-wrote verdicts to
  `probe/cuisine-todo/done-01..06.txt` as `<id> <Cuisine>`, skipping anything
  a menu or name could not settle (mess halls, food courts, "The Buffet",
  merch-only menus). NEW `scripts/apply-cuisine-decisions.mjs` reads every
  done-NN.txt, rejects a cuisine outside `CUISINES`, rejects conflicting
  verdicts, snapshots, then fills ONLY rows still blank. 485 rows written;
  snapshot `probe/snapshots/cuisine-manual-2026-09-06T02-31-55.json`.
  **After: 160 listed rows still blank (561 total), down from 621/1,046.**
  Those 160 are the deliberate skips — genuinely unclassifiable names. To go
  further, work `batch-07..10.txt` (unlisted rows only) the same way.
  `normalize-cuisines.mjs` now KEEPS an existing cuisine when the raw label
  maps to nothing, so a re-normalize does not wipe inferred rows.
  `probe/cuisine-coverage.mjs` re-measures. Rows only ever go null -> value;
  cuisine_raw/cuisine_tags untouched.
- **Map search is a filter (2026-09-05).** Typing in the feed map's field lights
  every match and dims everything else: `dim` embers lose glow/inner/ring and
  drop to 0.45 -> 0.22 alpha by zoom; `lit` matches get a hotter halo, wear the
  ring at any score. **The district aura (`restaurant-aura` heatmap) is
  HIDDEN for the whole of a search** (`setAuraVisible` in RestaurantMap,
  2026-09-05 late): Calvin's call — a searched map is dim embers plus lit
  matches on dark ground, no pools. An earlier version instead re-weighted
  the aura toward the matches (2.2x); that was wrong and is gone. Same pass
  fixed `restaurant-dots` `circle-opacity`, which nested a zoom ramp inside a
  `case` — MapLibre rejected the whole property and unmatched dots stayed at
  full brightness. The field calls `/api/restaurants?q=&fields=map`, a slim
  uncapped hit list (limit 2,500) — the default `?q=` cap of 60 was dimming
  real matches. Aura/opacity fix uncommitted; typecheck and eslint clean,
  verified on screen in Chrome.
- **Discovery deep pass done 2026-09-05 19:10 PT.** `discover-serper.mjs` now
  (a) only walks cells inside the county bbox (the sweep import had added
  1,351 out-of-county cells that would have burned credits), (b) has
  `--deep [--limit N]`: for every cell that came back full (20+ places in
  its square or 18+ first seen there) it fetches pages 2-3 at 16z plus the
  four quarter-cell centres at 17z; state in `data/serper-deep.json`,
  re-run is free, (c) skips not-public places (military galleys and base
  exchanges, campus/clinic cafeterias, VFW, beach clubs, park concessions,
  tour operators, delivery services, corporate offices) via NOT_PUBLIC_*
  regexes in `report()`. Result: 1,117 cells + 88 deepened, 857 credits,
  7,722 places seen, 95 imported (gmap now 789), 21 held as chains
  ("it's just wings" added to `data/excluded-chains.json` — a Chili's ghost
  brand), 74 listed (8,861 -> 8,935). Casino restaurants (Sycuan, Barona,
  Harrah's, Valley View) and food trucks were kept on purpose.
  Snapshot: `probe/snapshots/listed-hold-20260905-pre-import.json`. Log:
  `probe/discover-0905.log`. Backup of the pre-patch script:
  `scripts/discover-serper.mjs.bak` (delete once trusted).
  Next discovery lever, not yet asked for: a second query word per cell
  ("food", "cafe", "bar") — "restaurants" misses places Google types as
  cafe/bakery/bar; ~1,100 credits per word.
- The 789 gmap rows have no photo and no hours (photo/hours scripts are Yelp,
  forbidden). They list anyway; the site guards on null.
- **Bash-tool heredoc trap:** a JS template literal containing two
  backslashes then `b` reaches the file as a BACKSPACE byte (0x08) when the
  script is piped through the Bash tool's heredoc, exactly like the perl
  case below. Build word boundaries as `(^|[^a-z0-9])word([^a-z0-9]|$)` or
  use the Edit tool. `grep -nP "" file` finds the damage.

- **A rating is no longer required to be listed.** Calvin: "as long as there
  is a restaurant it should be on the site." `publish-check.mjs` gate is now
  `hold_reason IS NULL AND lat/lng present`. Do not put the rating back.
- **Search ignores apostrophes** on both server (`searchRestaurants` in
  `src/lib/db.ts`) and client (`foldSearchText` in `src/lib/discoverFilters.ts`).
  "clems station" must find "Clem's Station". Keep both in step.
- **Google Maps discovery exists:** `scripts/discover-serper.mjs`
  (`--fetch`, `--report`, `--import [--dry]`), imported 694 `gmap:` rows,
  re-running is safe. After an import: `exclude-chains.mjs --apply` then
  `publish-check.mjs`. Gap: ~20 places/call, so dense cells (downtown, North
  Park, Convoy, Hillcrest) only partly seen — a page-2/3 pass would close it.
- The 694 gmap rows have no menus and are not in the w5 batches; cut them into
  a later wave. 194 of them have no cuisine (Google typed them "Restaurant").
- `serper.mjs` **is allowed** for agents and the coordinator. Google Places
  and Yelp API scripts stay forbidden.
- **2,711 live rows are outside San Diego County and are LISTED** (2,707
  `sweep` + 4 `osm`). Not held yet — needs Calvin's yes. Pending UPDATE (snapshot
  `id, listed, hold_reason` first): `hold_reason='outside_county' WHERE
  hold_reason IS NULL AND (lat/lng outside bbox 32.534-33.44 / -117.6..-116.08
  OR address ~* 'tijuana|tecate|rosarito|ensenada|baja|m[eé]xico')`. In a neon
  sql`` template, `\s`/`\d` lose their backslash — use `[[:space:]]`/`[0-9]`.
  `cut-batches.mjs`/`cut-wave.mjs` already apply this rule so agents stop
  getting them; ~1,100 sweep rows are in-county.
- **Corpus grew by ~2,800 `sweep` rows on 2026-09-05** (979 -> 3,803), listed,
  no menus — cut them into a later wave with the 694 gmap rows.
- Restaurant pages are `/restaurant/<id>`; there is no slug column.
- Still open, not acted on: holding the ~1,000 unverified rows (785 DEH
  permit-only + 220 OSM pins) with a "not yet verified" reason. Calvin has
  not said yes.

## Which terminal am I

- **Ask terminal:** questions, numbers, decisions. Never spawn agents here.
  Answer with `db:stats` or a `grep`, then the user runs `/clear`.
- **Wave terminal:** runs extraction. Do not answer questions here beyond a
  one-line progress figure; every round trip here re-sends the whole context.

## The loop (wave terminal only) — Cost plan 2026-09-08 (see RUNBOOK)

```
# 1. router pass first, zero tokens — catches with-website AND (new) no-website
#    rows via one serper.mjs-style search per row. Cache is fine.
node --env-file=.env.local scripts/route-menus.mjs --concurrency 4   # background it

# 2. cut a wave ONLY from rows the router attempted and failed on
node --env-file=.env.local scripts/cut-wave.mjs --size 20 --count 20 --prefix <name>
# writes menus/wip/<name>-NN.json, each an OBJECT: { tier, tried, restaurants }
# tier "haiku" = every row already has a website/platform the router found;
# "sonnet" = at least one row needs fresh discovery. Spawn on the tier's model.

# 3. spawn agents, brief = probe/AGENT-BRIEF-LITE.md (NOT AGENT-BRIEF.md), one
#    batch each, model per the batch's own "tier" field.

# 4. on each completion, one script does check-shape -> screen -> copy ->
#    check-shape -> refuse-if-mismatched -> load -> log, and prints ONE line:
./scripts/process-result.sh menus/wip/result-<name>-NN.json
```

`probe/AGENT-BRIEF.md` (26KB) is retired for spawned agents — replaced by
`probe/AGENT-BRIEF-LITE.md` (under 8KB): same standing rules, plus a hard
budget (6 tool calls/restaurant, 60/batch, block after 2 dead ends) and an
instruction to read each row's `router`/`tried` note before searching from
scratch. `cut-batches.mjs` still exists for the raw (never-routed) queue;
`cut-wave.mjs` is only for router leftovers. Blocked-row skip in `cut-wave.mjs`
defaults to 30 days (was 24h in `cut-batches.mjs`) — a router/agent block is a
real finding, not worth re-discovering the next morning.

- Wave state 2026-09-05 (late): w5, w6-01..w6k-09 complete. Router pass 2026-09-05 loaded
  25 menus (coverage 6,675/13,983). w7 cut 2026-09-05 through cut-wave.mjs (4 batches of 20,
  from 729 router-failed rows). w7-02, w7-04 done (3 found/40, ~110K tok and ~25 calls per batch). w7-01 done (0 found). w7b-01 done (1 found). w7-03 done (1 found). w7b-02 done (0 found). Calvin said "keep extracting" 2026-09-05 14:45 PT: SPAWNING RESUMED. w8-01..04 done 2026-09-05 15:15 PT: 7 found/80 (~440K tok), Serper dead the whole wave. In flight: none. w8b-01..04 cut 15:20 PT with the NEW `cut-wave.mjs --with-website` flag (only rows an agent can work without a search; 506 such rows available) and spawned on HAIKU — all four batches tier haiku. This is the right shape to keep running while Serper is dead. Brief addition for next spawn: never cat .env.local (w8-02 agent leaked DB creds into its transcript; consider rotating the Neon password). Two night-run loops are running in parallel (iter 18 and iter 24 both browsering the same notes file) — harmless but doubled work, kill one when convenient. the night-run scheduled task keeps the zero-token router+browser tiers cycling. Headless browser pass over router-20260905-184549 notes done: 35 menus loaded, coverage 6,726/14,078. Old w6k-10..20 batch files are superseded; do not spawn them.
  share-chain-menus last ran 2026-09-07 (late, see probe/share-chain.log).
- Four agents max. On each completion: screen, copy, load, spawn a replacement
  in the same turn. Never end a turn with zero agents running unless the queue
  is 0 or Calvin says stop.
- Read every report: `not_found` is permanent and only for confirmed closed /
  replaced / not a food business. "No prices published" (theme park, zoo,
  stadium, campus, airport), "no web presence", "likely closed" are `blocked`.
  Withdraw wrong ones: `node menus/wip/withdraw-many.mjs <file> <ids>`.
  To pull a `found` entry (wrong city, MXN prices) REMOVE it with that
  script; blanking its `dishes` loads as a permanent `not_found`.
- Agents sometimes write `verdict: "blocked"` instead of the `blocked` key; the loader
  then records permanent not_found (w6f-15 did this to 7 rows on 2026-09-07,
  reversed by deleting the menu_lookups rows). check-shape.mjs catches it.
- Agents sometimes write `restaurantId` as a number; the loader now coerces
  to string (it used to report "no such restaurant" and refuse the file).
- `load-menus.mjs` refuses the whole file on a name mismatch. Fix the name in
  the ready file, or if the DB has an obvious typo, one UPDATE with WHERE id.
  Check in-flight work with `ls menus/wip/result-*.json`; a `.screen.lock`
  directory means another session is screening — wait for it.
- Every few hours: `node --env-file=.env.local scripts/share-chain-menus.mjs`
  (background it, takes >3 min).
- Salvaging a dead agent, batch cutting rules, brief wording: `grep -n` the
  RUNBOOK section header (§3, §6, §7) and read only that section.

## Rules that must not break

- Never commit to git. Never run a Google Places or Yelp script. Never print
  secrets (mask `.env.local` values).
- Never DELETE from `restaurants`; set `hold_reason`. Before any bulk UPDATE,
  dump `id, listed, hold_reason` to `probe/` first and refuse any statement
  without WHERE. `publish-check.mjs` is a bulk UPDATE: snapshot first.
- Never load `quarantine.json`. Never screen twice between copy and load.
- Agents get `probe/AGENT-BRIEF.md` (and PLAYBOOK), never `FINDINGS.md` whole.
- Subagents run on Sonnet. Calvin oversees; agents do the work.
- Ad-hoc DB queries go in a file inside the repo (`probe/q.mjs`), run with
  `node --env-file=.env.local`, then delete. `restaurants.id` is TEXT: cast
  `::text` when joining `dishes.restaurant_id` / `menu_lookups.restaurant_id`.
- Screenshots go through Claude-in-Chrome, once at the end. Verify with curl
  or `read_page` while iterating. Dev server is usually already on :3000.
- Keep answers short: number first, no tables of caveats.
- Editing files from Bash: never put `\b` in a perl replacement (it becomes a
  backspace byte and the regex silently matches nothing). Use a node splice
  or the Edit tool.

## Where things live

- `probe/TOKEN-PLAN.md` — why this file exists and what it saved.
- `probe/STATE.md` — narrative snapshot, open items needing Calvin. Grep it.
- `probe/RUNBOOK.md` — full procedure. Grep it by section.
- `scripts/discover-serper.mjs` — Google Maps discovery; `data/serper-*.json`
  is its state; `probe/discover-venue-skips.txt` is what its filter dropped.
- `scripts/night-run.sh` — unattended router and browser tiers.
- Scheduled task `platemaps-menu-wave` — restarts waves every 2 hours while
  the app is open.

## 2026-09-05 — distance on search (uncommitted, web + phone)
- Discover search (`?q=`) now asks for the visitor's position (prompt on the
  search, silent if already granted), prints the live distance on every card
  and orders results nearest-first, except when a neighbourhood filter is on.
  Server-side rule: `orderResults` / `withDistance` in `src/lib/discover.ts`;
  `milesAway` marks a live value (phone card only prints those).
- Phone results moved into `src/components/mobile/PhoneDiscoverResults.tsx`
  (client) so `/m` can re-answer against coordinates like `DiscoverBrowser`.
- Fixed a pre-existing crash: `POST /api/restaurants/discover` JSON turned the
  facet-count Maps into `{}` (`counts.get is not a function`). Round-trip now
  goes through `src/lib/discoverWire.ts` (`toWire` / `fromWire`).
- Verified in Chrome with a mocked position; localhost geolocation is *denied*
  in Calvin's Chrome, so a real check needs that site permission reset.

## 2026-09-06 - the browser has never opened 1,326 of the gap rows

`browser-menus.mjs:781` admits only notes whose outcome is `needs-browser` or
`gated`. Rows the router marked **`no-platform`** are dropped - and that is
**1,326 of the 2,143 listed gap rows that have a website**, 60% of everything
addressable. There is no guard behind it: the script reads `website` straight
out of `restaurants` and never uses the router's platform at all. The filter is
just narrower than the tool behind it.

Two rows pulled out of that class by hand the same day both filed clean on the
first open - **F Street Cafe** (12 prices printed on its own homepage) and
**Docent Brewing** (28 items behind a harmless age gate). 40 dishes, zero
tokens, from rows the pipeline had written off.

Running now: `probe/mk-noplatform-feed.mjs` builds a feed of those rows with the
outcome relabelled `needs-browser` - no edit to shared code, so nothing changes
under another agent's run. Pass is on `menus/wip/noplatform-mtq7u547.notes.json`
writing `menus/wip/browser-20260906-194137.json`, with an absorb loop behind it.

**Use `--no-chains-first` on this feed.** Only 93 of the 1,326 rows share a name
with another row; chains-first front-loads ten gated Crumbl Cookies before it
reaches a single independent. Notes-file order is review_count DESC, which is
what you want.

### The vision question is answered: don't buy it yet

`probe/classify-gap.mjs` on 200 random gap rows, scaled to the 2,214 with a
website: no-prices-anywhere 45.5% (~1,007), fetch-failed 24.5% (~542),
few-prices 14.5% (~321), image-menu-likely 10% (~221), prices-present 3.5%
(~77), pdf-menu 2% (~44). **A vision sweep addresses only pdf + image = ~265
rows at $75-200.** Nearly half the gap is restaurants that never published
prices at all - confirmed by eye at C Level, Tita's Kitchenette and Junction Bar
& Grill, each with a full menu and no numbers on it. No pipeline reaches those.

Caveat found while checking: `prices-present` is **inflated**. Junction Bar &
Grill landed in it on upcharges alone ("additional toppings $3", "upgrade fries
$4") with not one item price on the page. The bucket needs a rule that discounts
dollar figures inside upgrade/add prose before that 3.5% is trusted.

### Chrome manual extraction

`menus/wip/chrome-manual.notes.json` carries the by-hand outcomes. Filed: Bronx
Pizza (16), F Street Cafe (12), Docent Brewing (28). Not filed: C Level, Tita's
Kitchenette, Junction Bar & Grill (all no prices published), El Charro
(`elcharro.site` is the squatted-domain class - its stored website should be
nulled), Soda & Swine (both locations temporarily closed).

**Peterson's Donut Corner (id 7827) is quarantined, not lost.** 199 items with
prices at `menutoeat.com`, which is deliberately on screen-menus.mjs's tier-5
UNTRUSTED list. Left quarantined - it needs corroboration from a second source,
not an exemption. Worth the effort: 3,661 reviews, 56 clean dishes ready in
`menus/wip/result-chrome-02.json`.

## 2026-09-06 - the never-browsed class is measured, and it is thin

The supervisor (`scripts/noplatform-supervisor.sh`) has now put a real browser
on 400 of the rows `browser-menus.mjs:781` had been silently skipping. Outcome
mix over those 400:

    261  needs-browser   opened, rendered, still no priced menu
     90  fetch-failed    site dead, parked, or refusing the client
     28  gated
     12  gate-personal
      7  filed           <- 1.75%
      2  wrong-branch

**7 menus per 400 rows.** The earlier 11% projection came from the
`needs-browser` class and does not transfer: the router marked these rows
`no-platform` because there usually is no platform, and behind that there is
usually no published price either. F Street Cafe and Docent Brewing were real,
but they were the good end of the distribution, not the middle of it.

412 rows remain in the backlog; at this rate they are worth ~7 more menus.
Zero tokens, so it is still worth finishing - but this lever is nearly spent
and it does not move listed coverage much (5,764 -> 5,768 so far, 63.8%).

What this says about the $50 Serper question: the gap is not mostly a discovery
problem. 90 of 400 sites could not even be fetched and 261 rendered fine with
no prices on them. Finding a website for a restaurant that never published
prices buys nothing. Treat 100-150 menus as the optimistic end and sample 100
rows before committing the rest of the credits.

### Correction: `fetch-failed` was mostly our own resolver

The 1.75% number above stands, but the reason I gave for it does not. I told
Calvin "90 of 400 sites could not even be fetched" and used it as evidence the
gap is intrinsically hard. It is not evidence of anything about those sites.

Classifying every `fetch-failed` note by its Chromium error code gave 441 listed
gap rows as `ERR_NAME_NOT_RESOLVED`. A plain `dns.lookup` on the 40 highest-review
"dead" domains resolved **38 of them** - mamakats.com, rubios.com, sammyspizza.com,
jimbos.com, parakeetcafe.com. Several browser passes were running at once
(supervisor + absorb loop + 20 orphaned Chromium processes from the hung run) and
Chromium's resolver collapsed under it.

`probe/mk-retry-feed.mjs` now resolves every host in Node before feeding it back,
so "dead domain" means something. Of 567 fetch-failed gap rows, **524 resolve**
and 43 genuinely do not (`probe/genuinely-unresolvable.json`).

Two rules follow:

  1. **Run one browser pass at a time.** Concurrency here does not buy speed, it
     manufactures false negatives that look like data.
  2. **Never classify a network error as a fact about the site** without
     re-testing it on a quiet connection.

`scripts/retry-supervisor.sh` runs the 524 in 11 chunks of 50, same hard-timeout
shape as the no-platform supervisor, feed sliced up front by `probe/split-feed.mjs`.

### Retry result: access was the problem, prices are the problem, 0 menus

All 524 DNS-verified rows retried, 11 chunks, no chunk hit the cap.

    357  needs-browser   opened, rendered, no priced menu
    114  fetch-failed    still failed even single-threaded
     24  gated
     10  gate-personal
      8  filed
      7  screened-out
      4  wrong-branch

**410 of 524 (78%) reached the site this time** - rows that had all previously
been written off as fetch-failed. The resolver diagnosis was correct and the fix
worked. The remaining 114 are slow or genuinely unreliable hosts, not resolver
noise.

**Menus loaded: 0.** All 8 filed rows were quarantined as partial captures.

This is the cleanest possible answer to the question the whole pass was asking.
It is not an access problem. We now reach these sites and they do not publish
prices. Every free lever on the website-having gap is spent:

  - never-browsed class: 815 rows -> 15 filed (1.8%)
  - fetch-failed retry:  524 rows ->  8 filed, 0 loaded

Listed coverage 5,769 / 9,043 = 63.8%, unmoved by the retry.

**Recommendation on the $50 of Serper credits: don't.** Serper buys websites.
This pass proves a website is not what is missing.

### Open decision for Calvin: the 8-dish floor is holding real menus

Seven rows were quarantined as "likely a partial capture" purely for being small:

    Burgeon Beer Company  4      Noodles        5
    Camp Coffee Company   5      Merenda        7
    Mama Made Thai        5      Sushi Heights  7
    Veggyjess             6

A coffee shop with five drinks has a complete menu, not a truncated one. The
floor (`MIN_DISHES`, default 5 in browser-menus, 8 in the screener) was written
to catch scrapes that stopped early, and it does - but at the small end it
cannot tell "stopped early" from "that is the whole menu". Not changed: lowering
it puts thin menus on live restaurant pages, which is Calvin's call, not mine.

## 2026-09-07 - the supervisors were killing Calvin's browser, not Playwright's

`taskkill /F /IM chrome.exe` in both supervisors did exactly the opposite of
what it was written to do.

  - It killed **Calvin's Chrome** - tabs, sessions, and the Claude-in-Chrome
    extension - 29 times across the two runs on 2026-09-06.
  - It **never killed a single Playwright process.** Headless Playwright runs
    `chrome-headless-shell.exe` out of `%LOCALAPPDATA%\ms-playwright`, not
    `chrome.exe`. Proof: after both runs "cleaned up", 6 ms-playwright
    processes were still alive on the box and 0 of Calvin's Chrome were.

`scripts/kill-playwright.ps1` replaces it and filters on the executable PATH
(`*ms-playwright*`) rather than the image name, which is what makes it safe -
every Playwright browser lives under that directory and no user-installed
Chrome does, while a `--headed` run's real `chrome.exe` still matches because
it launches from there too. Verified: matched and killed the 6 orphans, left
user Chrome untouched, exit 0. Both supervisors now call it.

**Rule: never kill by image name on this box.** Match the path.

### Not a bug: the busyness labels are dead data

651 listed rows carry `status_label` wait copy ("Filling up", "No wait", "Busy
right now", "Seated quickly") and I first reported this as PRODUCT.md's retired
wait-time copy leaking onto the live site. It is not. `rowToRestaurant`
(src/lib/db.ts:2668) maps it onto the full `Restaurant` type and **no component
renders it** - nothing under src/app, src/components or src/lib reads
`statusLabel`. Visitors do not see it.

Worth removing eventually, because a field sitting on the type is an invitation
to render it again, but it is cruft and not a live violation. Not touched.

### Cannonball is fine (asked 2026-09-07)

Row 167, Mission Beach, 4,943 reviews, 30 priced dishes, listed, no hold.
`/restaurant/167` returns 200 with dishes rendering, it is in `/api/restaurants`
and matches `/?q=cannonball`. Nothing was wrong with it.

### Discover search: fuzzy matching and ranking shipped (2026-09-07)

Calvin's report — a restaurant with one letter wrong returned nothing while
"a bunch of random shit came up" — is fixed. `?q=kairoa brewng` now returns
Kairoa Brewing Company first; it used to return nothing.

The plan and the measurements are in **`probe/SEARCH-PLAN.md`**; read its
`## Status` section first. Step 1 of 7 is done. What is left, in order: dish
precision (B4), the `?dish=` dimension (A2), the suggest endpoint (A3), the
typeahead dropdown with spell-corrected rows (A4/A5), narrowing `promote()`
(A6), SQL parity in `searchRestaurants` (B5).

Two probes, both read-only:

```bash
npx tsx --env-file=.env.local probe/search-check.mts "kairoa brewng"
npx tsx --env-file=.env.local probe/typo-calibrate.mts --sample=600
```

The second is the one that decides `SIMILAR_ENOUGH` in `src/lib/textMatch.ts`
(0.65). **Re-run it rather than nudging that number by feel** — the sweep says
accuracy is flat below 0.65 and falls above it, and the corpus is 9,043 listed
names, not the 8,935 this file used to say.
