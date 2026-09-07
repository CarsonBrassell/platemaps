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
