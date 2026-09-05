# Total San Diego coverage — options, cost, timing

Written 2026-09-04 from `npm run db:stats` and a direct query. Re-run both
before acting; the numbers move daily.

## Where the corpus stands

```
restaurants  total 8,564  held 2,368  live 6,196  listed 4,611
menus        listed_with_menu 3,454 (75% of listed)
todo         listed_without_menu 1,157   queue 1,903   not_found 662
```

"Total coverage" is two separate jobs:

**A. Every real restaurant is LISTED** (visible to a visitor). Gap:
- 1,585 live-but-unlisted rows. 1,574 lack rating+review_count, 1,562 lack a
  photo, 699 lack a website, 431 have no `google_place_id`. 522 already have
  a menu and would show it the moment they list.
- 2,368 held rows: 353 Google-confirmed closed (correct), ~1,370 generic
  chains excluded by product policy (Starbucks 204, Subway 156, McDonald's
  102 ...), 647 Census-geocoded county permits with no place id — real
  businesses nobody has looked up yet.
- Everything else in the county is already in the table: OSM enumerated every
  named eating place and the county permit import added the rest.

**B. Every listed restaurant has a MENU.** Gap today: 1,157. After A lands:
1,157 + (1,585 − 522) + some of the 647 permits ≈ **2,200–2,600 restaurants**.

## Job A — list everything real

Only Google can close it: OSM has no rating, Yelp's free tier is gone ($229/mo).
`enrich-places.mjs` and `resolve-places.mjs` already do the work; they are
capped at the free quota by Calvin's rule.

| SKU | needed | free/month | paid |
|---|---|---|---|
| Place Details Enterprise | ~2,230 (1,585 + 647) | 1,000 | $20/1k → ~$25 |
| Place Photo | ~2,200 | 1,000 | $7/1k → ~$8 |
| Text Search (to get ids) | ~1,080 (431 + 647) | 5,000 (4,540 used this month) | $35/1k → ~$38 |

- **Free path:** raise `--max-calls` to the monthly cap each month → ~3 months.
- **Paid path:** ~$70 total, one afternoon of script time.
- **Worth checking first:** whether the Details field mask actually needs an
  Enterprise field. Rating, review count, photo names, website and hours are
  all Pro-tier fields (5,000 free/month). If nothing Enterprise is requested,
  Job A is free in one month. Grep `FIELD_MASK` in `enrich-places.mjs`.

## Job B — menus for everyone

Measured hit rates from THROUGHPUT.md (2026-09-02), same queue, same day.

### B1. Free deterministic tiers — $0, overnight
Router (T1) + Playwright browser pass (T1b) + chain sharing (T0) via
`scripts/night-run.sh`. Already exhausted on the current queue (8.8% residual)
but the ~1,500 newly listed rows from Job A get a fresh pass: expect 10–15%,
so ~150–250 menus for nothing.

### B2. Websites first — $0, one hour
~1,050 of the target rows have no `website`. Every cheap tier starts from the
website, so `find-websites.mjs` (Serper, 2,500 free queries, $50 for 50k) runs
before anything else. Needs `SERPER_API_KEY`.

### B3. Subscription agent waves — $0 cash, 2–3 weeks
Sonnet subagents, 4 at a time, 55% hit rate when handed the router note,
~25 menus/hour. 2,200 restaurants at ~48 tried/hour = ~46 hours of wave time,
yielding ~1,200 menus. Costs nothing in dollars; costs Calvin's attention and
usage limits, and is the slowest of the paid-or-free options.

### B4. Headless API run — $300–600, one weekend
Same agent logic, run through the API instead of the subscription so it can
run 20-wide unattended (Claude Agent SDK or `claude -p` workers). Measured
usage is ~27k tokens per restaurant; on Sonnet 5 ($2 in / $10 out per M) that
is roughly $0.10–0.25 per restaurant with caching, ~$0.20–0.45 per menu found.
2,200 restaurants × ~5 min / 20 workers ≈ 9 hours. Haiku 4.5 halves the price
but the 3%-vs-55% result shows judgment is what yields menus; stay on Sonnet.
Message Batches (50% off) do not fit: no agentic loop, so it only works when
the menu is already in fetched HTML, which was the 8% Firecrawl case.
`fetch-menus.mjs` (Opus + web search) works but runs ~$0.50–1 per menu.

### B5. Vision on PDF/image menus — ~$20, one evening
The not_found pile is dominated by PDF and image menus. A 3-page PDF is
5–8k tokens on Sonnet 5 → $0.02–0.05 per menu. Maybe 200–400 restaurants.
Parked until now only because it costs money at all.

### B6. Delivery-platform scrape — $50–150, 1–2 days
DoorDash / Uber Eats / Grubhub carry full priced menus for most restaurants
that deliver. Apify actors do it for a few dollars per 1,000 listings. Likely
60–70% of whatever remains after B1–B4. Two real problems: delivery prices are
marked up 15–30%, which is wrong for a product that shows dish prices, and it
is against those platforms' terms. Usable as a "menu exists, here are the
dishes" source with prices flagged, not as a price source.

### B7. Human data entry — $1,500–3,500, 2–4 weeks
Upwork / Fiverr / MTurk at $1–2 per menu, 10–15 minutes each including PDFs,
Instagram-only menus and phone calls. Highest ceiling of anything here
(~95%+) and the only option that handles the true tail. Output goes through
the existing `screen-menus.mjs` → `load-menus.mjs` path so QA is already built.

### B8. Commercial data — not viable
Datassential / Technomic / MenuData are enterprise contracts ($10k+/yr,
national, not SD-scoped). Yelp Places ($229/mo) has no menus. Google has no
menu API.

### B9. Demand-driven — $0 upfront, never finishes
The on-demand lookup already built (`/api/restaurants/[id]/menu`, Opus per
call, ~$0.50–1 each) plus user-posted plates. STATE.md's own read: below 50
reviews a user typing what they ordered beats a scraper. This is the right
answer for the last 5%, not a path to "total".

## The ceiling

Roughly 5–10% of live independents publish no menu anywhere: taquerias with a
board, food trucks, cash counters. Scraping of any kind tops out around 90–95%
of listed rows. The last few percent are humans (B7) or demand (B9).

## Recommended sequence

| step | what | cost | time |
|---|---|---|---|
| 1 | Job A paid: list the 1,585, resolve the 647 permits | ~$70 (or $0 over 3 months) | 1 day |
| 2 | B2 Serper websites, then B1 night-run over new rows | $0 | 2 nights |
| 3 | B4 headless Sonnet 5 run, 20-wide, over everything left | $300–600 | 1 weekend |
| 4 | B5 vision on the PDF pile | ~$20 | 1 evening |
| 5 | B7 humans on the remaining ~600–900 | $1,000–1,500 | 2–3 weeks |

**Total: ~$1,500–2,300 and ~4 weeks to ~95% of listed rows with a menu, and
every real restaurant in the county listed.** The all-free version (quotas +
subscription waves) takes ~3 months and stalls around 85%.

Decisions only Calvin can make: lift the Google quota cap (rule in
`enrich-places.mjs`), put an API key in `.env.local` for B4/B5, whether B6's
marked-up prices are acceptable even flagged, and whether the ~1,370 held
chains stay held (T0 would menu them for free if unheld).

## Correction (2026-09-04): the 6,500 target hid ~350 real restaurants

Calvin's spot check: The Duke Cocktails and Grub (6519 Mission Gorge Rd, permit
DEH2023-FFPP-016572, active) is not in the DB. The Other Side Bar and Grill
(6690 Mission Gorge Rd Ste D) is in neither the DB nor the county permit file.

Two matcher flaws in `scripts/verify-coverage.mjs` made permits look "covered":

1. **Held rows claim permits.** Rule 1 matches on street number + street for
   every row, including `hold_reason` = permanently closed / chain. The closed
   Longhorn Cafe row at 6519 Mission Gorge swallowed The Duke's permit.
2. **Google-formatted addresses never address-match.** `address()` is fed the
   full "…, San Diego, CA 92120" string, so the street key becomes e.g.
   `UNIVERSITYLAME` and never equals the permit's `UNIVERSITY`. Fix: split on
   the first comma before calling `address()`. With that fix live-row claims
   go from 4,706 to 5,538.

Reconciliation with both fixes applied (restaurant-type, active, live-status,
front-of-house, deduped by name+address = 8,377 permits):

| bucket | permits | meaning |
|---|---|---|
| claimed by a live row | 5,538 | in DB |
| resolved earlier as duplicate of an existing place | 517 | in DB (name/address differ) |
| claimed only by a chain-held row | 941 | excluded on purpose |
| claimed only by an "other"-held row, same name | 293 | held on purpose |
| **new business at a closed row's address (Duke hole)** | **86** | missing |
| **new business at an other-held address** | **63** | missing |
| **in queue, never sent to Google** | **85** | missing |
| **Google unmatched (Census-geocoded, held)** | **115** | missing, needs a place lookup |
| Google said not-food | 617 | mostly correct (hospital kitchens, clubs, churches); spot-check 50 |
| Google said closed | 104 | trust |

Missing real restaurants from the permit side: **~350**. Plus an unknown
number that have no county food permit under their own name (The Other Side:
sports bar, probably permitted under a prior or corporate name, or newer than
the April 2026 export). Also: **600 live DB rows match no permit at all** —
phantoms, closed places, or addresses outside the county format; they inflate
the 6,196 "live" count.

Revised target: ~6,400 independents from the permit file, **6,500–6,800**
once off-permit bars and post-export openings are counted. The size of the
number was roughly right; its composition was not.

Added work (all $0 within free quota, Calvin runs the Google step):
- Patch verify-coverage: skip held rows in claiming, split address on comma.
- Re-queue the 86 + 63 + 85 = 234 permits → resolve-places (234 Text Search
  calls, 460 free this month remain; otherwise wait for Oct 1).
- Re-try the 115 unmatched with name-only Text Search.
- Refresh `data/deh-facilities.json` from the county portal (free) — the
  current export is ~5 months old.
- Audit the 600 live-no-permit rows: Place Details status check, 600 calls,
  within the 1k free Enterprise tier; hold the CLOSED ones.

### Done 2026-09-04 (local, $0)

- `scripts/verify-coverage.mjs`: held rows now claim a permit only when the
  name also matches; `address()` uses the street line only; `nameTokens()`
  drops apostrophes (McDonald's = MCDONALDS); chain names from
  `data/excluded-chains.json` are excluded from the queue (853 permits).
- County export refetched: 17,503 -> 17,515 records, so it was already current.
- Queue rebuilt: 2,628 entries, 1,203 already resolved, **1,425 new**:
  260 restaurant-class (The Duke is in it) and 1,165 other-class (cafes,
  markets, delis — cafes we want, markets we do not).
- Coverage of our own rows: VERIFIED 79.9% (was 76.0%), UNVERIFIED 300
  (was 573). 144 of the 300 unverified are listed in the app: candidates for
  a Place Details status check.

### Calvin runs (Google, within free quota)

```
node --env-file=.env.local scripts/resolve-places.mjs --class restaurant --max-calls 300
node --env-file=.env.local scripts/import-deh.mjs --apply
```
The other-class 1,165 exceed what is left of September's 5k free Text
Search calls; run `--class other` after Oct 1 or accept ~$25 now.
