# Presence plan: every open San Diego restaurant on the site (2026-09-04)

Test that triggered this: 10 random restaurants from ChatGPT, 7 on the site.
The 3 misses were NOT permit-pipeline gaps: Lucy Ethiopian (in DB, menu
extracted, never enriched so it fails the listing gate), Mama's Bakery
(permit imported, Google lookup failed, permit-only hold), El Borrego (closed
Dec 2025, correctly absent but should carry a hold). Coverage and *presence*
are different problems. This plan is about presence.

## Where the unlisted rows are (live, listed=false: 1,585)

| have Google place id | 1,154 |
| have rating | 11 |
| have photo | 23 |
| pass the gate today | 0 |
| came from a permit | 1,147 |
| already have a menu | 523 |

So ~1,150 restaurants are on ice for one reason: nobody ran enrich-places on
them. Held rows: chain 1,481 (intended), permit-only 404, closed 353, dup 107.

## Phases

**1. Enrich what we already have (this week, Calvin runs, ~$0-5)**
enrich-places on the 1,154 unlisted rows with a place id, then publish-check.
Place Details 1k free/mo (Enterprise SKU, $20/1k after), Photo 1k free/mo
($7/1k after). Run 1,000 now, the rest Oct 1, or pay ~$4 to finish now.
Expected: listed 4,611 -> ~5,700. Lucy Ethiopian goes live here.

**2. Permit queue (Calvin runs, free)**
resolve-places --class restaurant (260 new) -> import-deh --apply -> enrich
-> publish-check. Then --class other (1,165: cafes yes, markets no) in Oct.
Expected: +250 now, +400 in Oct. The Duke goes live here.

**3. Second-chance lookups (Oct, free)**
431 unlisted rows with no place id + 404 permit-only holds = 835 Text Search
calls using address + permit owner name as fallbacks (resolve-places retry
mode, needs a small change). Mama's Bakery goes live here. Expected: ~+400.

**4. Closure audit (Oct, free)**
600 live rows with no permit + 300 unverified: Place Details businessStatus
only (cheap field mask). Hold the CLOSED ones, El Borrego included. Keeps the
random test honest: a closed place on the site is also a miss.

**5. Make it stay fixed (build once, ~2 days of agent work)**
- Monthly permit refetch with a diff: new permits auto-queued, lapsed
  permits flagged for a status check. verify-coverage --refetch already
  exists; add the diff and a cron.
- Search-miss log on the site: every search with zero results is stored;
  weekly, the logged names go through Text Search and import. This is the
  only thing that catches off-permit places like The Other Side and
  openings newer than the county export.
- Random-sample audit, monthly: 100 random active restaurant permits + 50
  names from an outside list, measure presence, target >= 97%.
- Listing gate: photo should not block listing (the design system already
  has the tone block for missing photos) and review_count = 0 should not
  block a new opening. Decision for Calvin; it lifts ~100 rows immediately.

## Expected presence on a random test

| after | listed | random-10 expectation |
|---|---|---|
| today | 4,611 | 7/10 |
| phase 1 | ~5,700 | 8-9/10 |
| phases 2-4 | ~6,300-6,600 | 9.5/10 |
| phase 5 running | steady | misses only for places open < 1 month or off-permit, and those self-heal weekly |

Total cost: $0 spread over Sep/Oct, or ~$40 to do everything this month.
Menus are a separate track (probe/THROUGHPUT.md); a listed restaurant with
no menu still counts as "on the site" for this test.

## Batch 2 (2026-09-04): 10 names, 3 findable, 5 actually present

| name | truth | leak |
|---|---|---|
| Caribbean Taste, Formoosa, Café Madeleine | on site | none |
| Antojitos Tenampa | on site as "Antojitos Te" (truncated) | name quality — fixed the row |
| MJ's Yogurt Time & Deli | on site as "MJ's Fusion Deli" (Google's a.k.a.) | **no alias search** |
| Trieu Chau | permit queued, never resolved | phase 2 |
| Taste of Denmark | permit swallowed by the live "Creme De La Crepe" row at the same address | **matcher rule 1 — fixed, +660 permits queued** |
| Juan Jasper Kitchen & Wine | permitted as "Sepulveda Meats and Provisions", Retail Market with Deli, other-class | phase 2 other-class run + alias search |
| The Hidden Gazebo Eatery | Microenterprise Home Kitchen permit (203 active) | out of scope by design — **Calvin decides** |
| Sizzling Pot King | closed; Zhang Liang Malatang is listed at that address | correct absence |

New levers added to the plan:

- **Alias search (build, ~1 day).** 475 of 3,175 matched rows carry a permit
  legal name that shares almost nothing with our display name (Sombrero vs
  SOMBRERO MEXICAN FOOD, Anthony's Fish Grotto vs ANTHONYS). Store the
  permit legal name, Google's "a.k.a.", and prior names as `aliases[]` and
  search over them. Without this, present restaurants still fail the test.
- **Matcher rule 1 now needs one shared name word** for live rows too
  (done). Queue is 3,367: 1,282 resolved, **2,085 new** (720 restaurant-class,
  1,365 other-class). Ceiling on phase 2 moves up by ~660 permits; other-class
  clearly matters (Juan Jasper is in it).
- **Name quality pass.** 4 truncated names found against Google names, 25
  listed names end in a two-letter fragment or are under five characters.
  Cheap SQL review.
- **MEHKO decision.** 203 active home-kitchen permits. Including them costs
  203 Text Search calls and a `home kitchen` badge.

Updated commands for Calvin:
```
node --env-file=.env.local scripts/resolve-places.mjs --class restaurant --max-calls 460
node --env-file=.env.local scripts/import-deh.mjs --apply
# Oct 1:
node --env-file=.env.local scripts/resolve-places.mjs --class restaurant
node --env-file=.env.local scripts/resolve-places.mjs --class other
```

## Scorecard: will the 20 test names be on the site once the plan has run?

| # | name | after the plan | via |
|---|---|---|---|
| 1 | Sang Dao | yes | already |
| 2 | Chon Ju Jip | yes | already |
| 3 | Yakitori Taisho | yes | already (alias search makes the name findable) |
| 4 | Thanh Tinh Chay | yes | already |
| 5 | El Borrego | no, closed Dec 2025 | correct |
| 6 | Lucy Ethiopian | yes | phase 1 enrichment |
| 7 | Wa Dining Okan | yes | already |
| 8 | Mama's Bakery & Deli | probably | phase 3 retry by address; not certain |
| 9 | Flama Llama | yes | already |
| 10 | Matoi | yes | already |
| 11 | The Hidden Gazebo Eatery | **no** | home-kitchen permit, out of scope until Calvin says otherwise |
| 12 | Juan Jasper Kitchen & Wine | **no** | permit is under the butcher's name; Google will resolve it to the butcher |
| 13 | Trieu Chau | yes | phase 2 |
| 14 | Antojitos Tenampa | yes | already (name fixed) |
| 15 | Caribbean Taste | yes | already |
| 16 | MJ's Yogurt Time & Deli | yes | already (alias search) |
| 17 | Sizzling Pot King | no, closed | correct |
| 18 | Taste of Denmark | yes | phase 2, after the rule-1 fix |
| 19 | Formoosa | yes | already |
| 20 | Café Madeleine | yes | already |
| — | The Other Side Bar and Grill | **no** | no county permit under its name |

Open restaurants: 18. Plan as written: 15 yes, 1 probable, 2 no. Plus The
Other Side: 3 no. Verdict: **the plan does not reach the objective**, because
it has a single source (county permits) and 2 of 18 real restaurants are
invisible to it (permit under another legal name, or no permit record).

### Phase 2b: second source, a Google category sweep (adds to the plan)

Text Search by neighbourhood and category: "restaurants in Golden Hill San
Diego", "cafes in ...", "bars with food in ...", for ~120 neighbourhoods and
cities x 8 categories x up to 3 pages = ~2,900 calls, 5,000 free per month.
Every place id not already in `restaurants` is imported and enriched. This
catches Juan Jasper, The Other Side, and every place whose permit is filed
under an owner or landlord name. Expected: +300 to +600 restaurants the permit
file cannot see. Cost $0 (October's free tier), ~1 day to write the script.

With 2b and the MEHKO decision, all 18 open names pass. Home kitchens are 203
permits; recommendation: include them with a badge, they are exactly the
long tail a "full coverage" claim needs.

## Batch 3 scorecard (2026-09-04)

| name | after the plan | via |
|---|---|---|
| Ali's Chicken & Waffles, Duff's Doggz, So Saap, Nate's Garden Grill, Fathom Bistro | yes | already listed |
| Pete's Smoked BBQ & Burgers | yes | already listed as "Pete's BBQ", 977 Main St Ramona; permit is the country store's |
| Rincon Azteca | yes | phase 1 (76 dishes extracted, never enriched) |
| Hannegan's House Beer Co. & Creamery | yes | phase 2 other-class (Low Risk Food Facility permit) |
| Deb's Cookie Jar | **only with phase 2b** | permit type "Miscellaneous Food Facility" (483 permits: Staples, GNC, liquor stores, and a few real bakeries and airport restaurants); not in any queue |
| Angkorian Pikestaff | no, closed both locations | correct |

9 open, 9 pass with phase 2b, 8 without. Two lessons:

- Four of the six already-listed ones (Ali's, Duff's, So Saap, Nate's) have
  **no county permit under their own name**. The 600 "live rows with no
  permit" are mostly real restaurants; the phase 4 closure audit must hold on
  Google businessStatus only, never on "no permit".
- Optional 2c: push the 483 Miscellaneous-type permits through resolve-places
  and let Google's primaryType decide (483 calls, free in Oct). Cheaper than
  relying on the sweep for the bakery-in-a-shop cases.

## Integration schedule and cost (2026-09-04)

Split of labour: Calvin runs every script that calls Google; Sonnet agents
build the five new pieces; nothing is committed without Calvin.

### Google call budget

| work | calls | SKU | free/mo |
|---|---|---|---|
| phase 2 permit queue (720 restaurant + 1,365 other) | 2,085 | Text Search | 5,000 |
| phase 2b category sweep | ~2,900 | Text Search | " |
| phase 2c misc-type permits | 483 | Text Search | " |
| MEHKO home kitchens (if yes) | 203 | Text Search | " |
| phase 3 retries (431 no-place-id + 404 permit-only) | 835 | Text Search | " |
| **Text Search total** | **~6,500** | | 460 left in Sep, 5,000 Oct, 5,000 Nov |
| phase 1 enrichment (unlisted rows with place id) | 1,154 | Place Details + Photo | 1,000 each |
| enrichment of everything phases 2-3 import (~60% of calls) | ~2,000 | Place Details + Photo | " |
| **enrichment total** | **~3,100 each** | $20/1k details, $7/1k photo over free | |
| phase 4 closure audit (businessStatus field only) | 900 | Place Details, minimal mask | free |

Cost: **$0 spread over Sep-Nov**. Everything in October: ~1,500 Text Search
over ($53) + ~2,100 details over ($42) + photos ($15) = **~$110**.

### Build items (Sonnet agents, ~5 agent-days, no API cost on the plan)

| item | days | unblocks |
|---|---|---|
| alias search: `aliases[]` from permit legal names + Google a.k.a. + prior names, search over them | 1 | MJ's, Pete's, Sombrero-type misses |
| category sweep script (Text Search by area x category, dedupe by place id, import) | 1 | Juan Jasper, The Other Side, Deb's |
| resolve-places retry mode (address + owner-name fallbacks) | 0.5 | Mama's Bakery |
| closure audit script (businessStatus only, never "no permit") | 0.5 | El Borrego |
| permit refetch diff + monthly cron; search-miss log + weekly resolve | 1.5 | stays fixed |
| name-quality pass (25 fragments), listing-gate decision (photo, review_count=0) | 0.5 | ~100 rows |

### Week by week

**Week 1 (Sep 4-11).** Calvin: enrich-places on the 1,154, publish-check,
resolve-places --class restaurant --max-calls 460, import-deh --apply.
Agents: alias search, sweep script, retry mode, closure audit. Calvin
decides: MEHKO yes/no, misc-type yes/no, listing gate. Listed: ~5,900.

**Oct 1-7.** Calvin: rest of restaurant class + other class (1,625), sweep
(2,900), import, enrich 1,000, closure audit. Listed: ~6,500.

**Nov 1-7.** Calvin: retries (835), misc (483), MEHKO (203), enrich the
remainder. Cron and search-miss log live. Listed: ~6,800-7,000, with every
open restaurant either listed or in a weekly self-healing loop.

Menus are the separate track in probe/COVERAGE-PLAN.md (Job B, ~$1,500-2,300
over ~4 weeks with the tier plan); ~2,000 more restaurants to extract.

### Decision 2026-09-04: no home kitchens
Calvin: MEHKO permits (203) stay out. Actual restaurants only. The Hidden
Gazebo Eatery is an accepted miss. Drop the MEHKO row from the budget
(-203 Text Search, about -$7); 3-week total ~$263.

### Decision 2026-09-04: no photos, Serper for presence
Calvin: photos are not needed. `publish-check.mjs` no longer requires
`photo`; `RestaurantPhoto` renders the tone block. Presence runs on Serper
(`resolve-places.mjs --via serper`, brief in probe/SERPER-BRIEF.md): about
9,400 credits, one $50 pack, no Google calls at all. Cost detail in
probe/CHEAPER.md. The Pro-mask enrich mode exists if photos are ever wanted.

## Run 2026-09-04: Serper resolve, both classes

Calvin bought the 50,000-credit Serper pack and authorised the run. All
3,367 queue permits are now in `data/deh-resolved.json` (1,291 answered from
the Google cache, the rest from Serper `/maps`; a /maps call is 3 credits).

- listed: 4,611 -> 5,432 of 9,442 (photo gate removed, 878 new rows
  imported with Serper rating/review_count/website, ~1,366 existing rows
  stamped with permit ids)
- imported rows still unlisted: 137, all `rating IS NULL` (Serper returned
  no rating, or fewer than MIN_REVIEWS=20 reviews and import-deh floored it)
  -> decision pending: lower the floor or list unrated rows last
- unmatched: 469 (Serper) + 199 (Google) + 2 unmatched-no-id -> retry with
  address/owner fallback, then Census geocode + hold_reason
- not-food residual is mostly grocery/convenience/hotel/liquor/gas; the 65
  hotels have not been checked for hotel restaurants
- bug found and fixed: Serper `type` is an English label, not Google's
  snake_case, so ~500 restaurants were first filed not-food; the adapter now
  normalises the label and the re-classification ran from cache at $0.
  FOOD_TYPES gained bubble_tea_store, juice_bar, frozen_yogurt_shop,
  creperie, poke_bar, cookie_shop, coffee_stand.
- resolve-places.mjs now merges on write and falls back to the other
  provider's cache, so a sample run can no longer wipe earlier resolutions.

## Run 2026-09-05 (late evening 09-04 local): Serper phases 2-4

Listed 5,430 -> 8,737 of 11,197 so far, credits ~18,000 of 52,500 used
(the ledger undercounts: discover-serper.mjs, run from another session,
logs to data/serper-cells.json, not the ledger; Serper's dashboard is truth).

- scripts/enrich-serper.mjs (new): rating/review_count/website for rows with
  a place id and no rating, placeId-equality match only. 1,367 matched, 17
  no-id-match, ~190 matched but held under the MIN_REVIEWS=20 floor (raw
  values cached; a cache-only pass applies a lower floor at $0).
- resolve-places.mjs matcher: two food-type-gated fallbacks (squashed name at
  the same number; shared word within 10 house numbers on the same street).
  48 more permits imported at $0. Reviewed list: scratchpad/relaxed-matches.txt
  (gone when scratchpad is cleaned).
- scripts/apply-existing.mjs (new): applies data/existing-resolved.json.
  --existing --via serper on 533 rows: 68 place ids gained, 11 duplicates;
  447 unmatched are held chains and seed stubs with no street number, leave.
- scripts/sweep-serper.mjs (new): 276 areas x 14 categories, page 1 =
  3,864 calls (11,600 credits). First 1,000 calls: 4,929 unique places,
  3,684 already ours, 997 new -> 995 imported. Dedupe is by place id only;
  a same-number + first-word heuristic found 5 real duplicates (held) and
  10 false ones (released) - do not reuse that heuristic.
- Another session imported 694 `gmap:` rows via discover-serper.mjs with
  review_count as low as 5; my imports keep the 20 floor. Decision pending.
- Agent accident: `rm -rf scratchpad` deleted ~140 untracked scratch files
  (backups included). Not recoverable from git.
