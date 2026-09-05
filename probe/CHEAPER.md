# Cheaper ways to finish coverage (written 2026-09-04)

Companion to PRESENCE-PLAN.md (presence) and COVERAGE-PLAN.md Job B (menus).
Numbers marked (verify) come from memory of vendor pricing pages, not from a
call made today. Each is a five-minute, zero-dollar check before relying on it.

## 1. What actually costs money, and why

Two jobs, very different bills.

### Presence (every real restaurant listed): Google Places

| SKU we call | what for | price after free | free/month | our count |
|---|---|---|---|---|
| Text Search Pro | permit name+address to place id | $32/1k | 5,000 | ~6,300 |
| Place Details Enterprise | rating, review count, website, hours | $20/1k | 1,000 | ~3,100 |
| Place Photo | the actual image | $7/1k | 1,000 (verify: may be 10,000) | ~3,100 |

Why expensive: Google prices by the most expensive field in the mask.
`rating` and `userRatingCount` are Enterprise, so one rating drags the whole
Details call to $20/1k and the free pool down to 1,000. Text Search Pro is the
price of `displayName` + `formattedAddress`; the id alone is a cheaper SKU.

The bill is therefore entirely a function of the calendar: the free pools
refill on the 1st. Every dollar in the presence plan is the price of not
waiting for a refill.

| timeline | Text Search | Details | Photos | total |
|---|---|---|---|---|
| Sep 4 to Sep 25 (all in September) | 5,840 paid = $187 | 2,100 = $42 | $15 | ~$245 |
| Sep 4 to Oct 10 (straddle the 1st) | 840 paid = $27 | 1,100 = $22 | $8 | ~$57 |
| Oct 1 to Oct 10 only | 1,300 = $42 | $42 | $15 | ~$100 |
| Sep to Nov, free pools only | 0 | 0 | 0 | $0 |

(PRESENCE-PLAN.md used $35/1k for Text Search; the script bills Pro at $32.)

### Menus (every listed restaurant has one): labour

~2,200 restaurants after presence lands. Free deterministic tiers (router,
Playwright, ordering-platform adapters for Toast, Clover, ChowNow, Popmenu,
Menufy, Slice, Owner, Square) are already built and already exhausted on the
current queue at 8.8% residual; they get 10 to 15% of the new rows for $0.

The rest needs judgement per restaurant: find the menu page, decide it is the
menu, read a PDF or an image, give up correctly. That is why it is expensive.

| path | why it costs | per restaurant | 2,200 restaurants |
|---|---|---|---|
| B4 API agents (Sonnet, 27k tokens each, measured) | re-reads pages in context | $0.10 to 0.25 | $300 to 600 |
| B7 humans (Upwork, Fiverr) | 10 to 15 min each | $1 to 2 per menu | $1,500 to 3,500 |
| B3 subscription waves | uses the Max plan already paid for | $0 cash | $0, ~46 wave-hours |

## 2. Cheaper presence, ranked

### 2a. Serper instead of Google for the lookup (~$10 total)

`find-websites.mjs` already uses Serper (key exists, 2,500 free credits,
then $50 per 50,000 = $1/1k). Serper's `/maps` endpoint returns Google Maps
results with rating, ratingCount, address, category, phone, website, opening
hours, thumbnail, and (verify) `placeId` + `cid`. If placeId is there:

- resolve: 6,300 queries, rating and review count arrive in the same call
- enrich: nothing left to fetch except the photo
- 9,400 queries minus 2,500 free = about $7, done in an afternoon, any month

Photo: Place Details with a Pro mask (`photos`, `businessStatus`,
`displayName`) is $17/1k with 5,000 free, so free for 3,100 rows, then Place
Photo. Or use Serper's thumbnail and skip Place Photo entirely.

Caveat: Serper is scraped Google. Google's terms forbid scraping; Serper bears
that risk, we bear the risk of building on a scraper. It is the same risk
find-websites already takes. Verify first: one free `/maps` call, check the
JSON for `placeId`.

### 2b. Google-native but restructured masks (~$45 to 115 in a cram, $0 spread)

- Text Search with `places.id` only is the Essentials SKU (verify: free or
  near free). Then Place Details Pro (`displayName, formattedAddress,
  location, businessStatus, primaryType, photos`) at $17/1k, 5,000 free.
  Same free count as today, half the overrun price, and the photo reference
  comes along free.
- Drop `rating`, `userRatingCount`, `websiteUri` from enrichment for new rows
  and the Enterprise SKU disappears ($42 to $0). Requires relaxing the listing
  gate for rows that have a photo but no rating (show them, sort them last,
  or take rating from Serper or TripAdvisor).
- September cram becomes 5,840 x $17 = $99 details, $0 enterprise, $15
  photos, about $115 instead of $245. Straddling Oct 1: about $20.

### 2c. Apify Google Maps scraper (~$25 to 40, also does the category sweep)

About $4 per 1,000 places with rating, photos, hours, website, place id, and
it searches by area x category, which is Phase 2b done for you. $5/month
free credit is about 1,000 places/month. Same terms-of-service grey as 2a.
Fastest way to run the whole sweep in one evening.

### 2d. TripAdvisor Content API for rating + photo (free)

5,000 calls/month free, returns rating, num_reviews, photos, website. Terms
clean, but thin on taquerias and counters. Useful as the rating source for
rows where Google would bill Enterprise; not a full replacement.

### 2e. OSM/Overpass for the category sweep ($0)

Free and already enumerated once. Catches nothing that opened since the last
pull, which is exactly the gap the sweep exists for. Use as a diff, not as
the sweep.

### 2f. Do not: multiple GCP projects for more free quota

Circumventing quotas breaks Google's terms and can suspend the billing
account that the live site's Maps key is on. Not worth $200.

## 3. Cheaper menus, ranked

### 3a. Subscription waves ($0 cash, 3 weeks)

Already the standing job in THROUGHPUT.md. 2,200 rows at ~48 tried/hour is
about 46 wave-hours, about 2.2 h/day for three weeks, 4 agents wide, ~55% hit,
so ~1,200 menus. Cost is Calvin's usage window, nothing else.

### 3b. Split find from extract, and pre-fetch ($80 to 150 API, one weekend)

The 27k tokens per restaurant is mostly the agent re-reading pages. Change
the shape:

1. Playwright (free, built) fetches the candidate pages and saves text.
2. Sonnet only decides which page is the menu: 3 to 5k tokens.
3. Haiku 4.5 extracts dishes from the chosen text, through Message Batches
   (50% off, no agent loop needed once the text is on disk): $0.01 to 0.02
   per menu.
4. PDFs and images: Haiku vision through Batches, about $0.01 each.

Total for 2,200 is about $80 to 150 instead of $300 to 600, same 55% hit
rate, runs 20-wide unattended.

### 3c. Gemini free tier for the extract step ($0)

Gemini 2.5 Flash or Flash-Lite free tier (verify current requests per day;
historically hundreds to ~1,500/day) can do step 3 above from fetched text
for nothing. Extraction from a menu page is easy enough that model quality
barely matters; keep Sonnet for the finding judgement.

### 3d. Delivery platforms for the residual ($50 to 150, grey)

DoorDash and Uber Eats carry full menus for delivery restaurants. Apify
actors at a few dollars per 1,000. Prices are marked up 15 to 30% and it is
against their terms, so: dishes yes, prices flagged, use only after 3a to 3c.

### 3e. Pay only for demand ($0 upfront)

The on-demand lookup already exists (about $0.50 to 1 per call, Opus). For
the last 5 to 10% (taquerias with a board, cash counters) let the first
visitor trigger it. Total spend then equals restaurants people actually look
at, not the whole tail. Plus user-posted plates. This is the cheapest true
tail answer and it never needs Upwork.

### 3f. Humans, but cheaper than Upwork

If a human pass is still wanted for the tail: MTurk micro-tasks at about
$0.30 per PDF transcription with the existing screen-menus QA, or an in-app
bounty (first plate posted at a menu-less restaurant earns a badge). Both
beat $1 to 2 per menu; both are slower and need QA.

## 4. The four timelines, cheapest form of each

| timeline | presence | menus | cash |
|---|---|---|---|
| Zero dollars (Sep to Nov 30) | Google free pools, 3 refills | waves + free tiers + demand | $0 |
| Five weeks (Sep 4 to Oct 10) | Serper (2a) or straddle Oct 1 (2b) | waves + 3b/3c | $10 to 90 |
| Three weeks (Sep 4 to 25) | Serper (2a) ~$10; Google-native 2b ~$115; today's plan ~$245 | 3b ~$80 to 150, or waves $0 at ~85% by Sep 25 | $10 to 265 |
| Ten days in October | Google restructured ~$60; Serper ~$10 | 3b in parallel | $10 to 210 |

Recommended: three weeks, Serper for resolve + rating, Place Details Pro for
photo refs (free under 5,000), 3b for menus with Gemini or Haiku extract.
About $100 total end to end, versus the $1,800 to 2,600 first quoted, with
the same coverage target and the same finish date. The build work is about
one extra agent-day (a Serper resolve adapter, a find/extract split in the
wave brief).

## 5. Zero-dollar checks before committing to the cheap path

1. One Serper `/maps` call: does the JSON carry `placeId`? (decides 2a)
2. Google pricing page: Text Search Essentials price; Place Photo free count.
3. Gemini API free-tier requests per day for 2.5 Flash-Lite. (decides 3c)
4. Listing gate: may a row with photo but no rating list? (decides whether
   Enterprise can be dropped)
