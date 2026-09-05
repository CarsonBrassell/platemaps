# Menu extraction — where things stand

Snapshot taken 2026-09-03 05:00. Re-run the query at the bottom rather than
trusting these numbers if any time has passed. The 2026-08-31 snapshot is kept
below the current one so the series stays readable.

## Corpus

| | |
|---|---|
| Restaurants with a menu | **4,158** |
| Dishes | **299,131** |
| Total restaurants | 8,564 |
| — of them retired or held (`hold_reason`) | 2,364 |
| Live restaurants | 6,200 |
| — of those actually **listed** (visible to a visitor) | 4,327 |
| Untried queue | 3,005 |
| Recorded `not_found` | 523 |

**The denominator moved on 2026-09-02 and the coverage number moved with it.**
The county-permit import took the table from 5,695 rows to 8,564, so a raw
percentage now compares against thousands of rows that have never been
enriched and are not shown to anyone. Three denominators, all true:

- 4,158 of 8,564 total rows = 49%
- 4,158 of 6,200 live rows = 67%
- **2,836 of 4,327 LISTED rows = 66%** — the only one a visitor experiences

**Coverage is heavily skewed toward the restaurants people search for**, which
matters more than any of the three figures above, because the queue has always
been worked `review_count DESC`:

| reviews | listed rows with a menu |
|---|---|
| 1000+ | **92%** |
| 500–999 | 77% |
| 200–499 | 62% |
| 50–199 | 20% |
| under 50 | 11% |

So the product is far closer to shippable than 66% suggests, and the remaining
grind is concentrated in the tail — which is also where a user typing what they
ordered is a better answer than a scraper. Anyone planning extraction work
should read this table before spending a week on restaurants with 30 reviews.

### Previous snapshot, 2026-08-31 06:45

Restaurants with a menu 3,513 · dishes 244,934 · total 5,694 · retired 443 ·
listable 5,251 · coverage 66.9% of listable · untried queue 1,269 ·
`not_found` 505.

**Read the denominator.** Coverage was reported as 59.7% through 2026-08-30 by
dividing into all 5,694 restaurants, 443 of which are retired and can never
carry a menu. Against the 5,251 that can, the same corpus was 64.7%. Both
numbers are quoted above so the series stays comparable.

Session of 2026-08-29/30 moved this from 2,624 menus / 166,926 dishes — about
**+774 menus and +67,700 dishes**.

**The overnight session of 2026-08-31 added +110 menus and ~+9,800 dishes**, and
the dish count understates it: five ordering platforms and one file format came
off the browser-only list that night (see below), which is worth more than the
restaurants it converted directly.

**The ceiling estimate below is now too pessimistic.** It assumed the platforms
in the browser-only list were permanently out of reach; six of those categories
are not. It has not been re-derived — treat "~4,300 / ~76%" as a floor rather
than a ceiling until someone recounts.

## Coverage: we have roughly half of San Diego, not all of it

*Measured 2026-09-02 against the County of San Diego DEH food-facility permit
list — 17,503 records, pulled from CivicData's CKAN datastore and saved to
`scratchpad/deh/facilities.json`. Every legal food business holds one of these,
which makes it the only complete enumeration available.*

| | |
|---|---|
| County active **restaurant** permits | **9,290** |
| County front-of-house eatable permits (incl. deli/market/low-risk) | 11,838 |
| Corpus records | 5,695 |
| **Verified** — address or same-city name matches a permit | **3,798 (66.7%)** |
| **Probable** — name matches a permit, address written differently | **1,142 (20.1%)** |
| Untestable — no usable address on our record | 239 (4.2%) |
| Unverified — has an address, no permit, name unknown to the county | **516 (9.1%)** |
| **Permitted places with no record of ours** | **7,166** |

**86.8% of the corpus is confirmed against the county.** An earlier pass using
exact string matching reported only ~3,800 verified and implied ~1,900 records
were suspect; that was a bug in the matcher, not a finding about the data. It
put Anthony's Fish Grotto and Mitch's Seafood in the doubtful pile. Re-run it
with `scripts/verify-coverage.mjs` rather than trusting that number.

### Why the 516 unverified records have no permit

Each one was checked against the permit list rather than assumed
(`scratchpad/deh/why.cjs`):

| | | |
|---|---|---|
| **332** | 64% | **A permit exists at that exact address under another name.** The county files by legal or parent entity: 20 Twenty appears as "SHERATON CSBD RESORT & SPA TWENTY/20", Anthony's Fish Grotto as "ANTHONYS". Our record is right; the names differ. |
| **120** | 23% | Street is known to the county but no permit at our number — a slightly wrong address, or a genuine closure. **This is the only bucket that may contain dead businesses.** |
| **43** | 8% | Bars and breweries. **A drink-only venue needs no food permit**, so its absence is correct and expected, not a defect. |
| **21** | 4% | Address unusable to the county (partial, or outside the county — a handful of Tijuana/Tecate rows from an early bbox overshoot, all `listed: false`). |

So the corpus is not full of phantoms. At most ~120 records are questionable,
and even those are as likely to be address errors as closures.

**This reframes the corpus.** 5,019 of our records came from one OpenStreetMap
snapshot and 675 from a Yelp ranked search. Both are volunteer- or
popularity-driven, and both under-represent the same thing: neighbourhood bars,
grills and cafes that nobody hand-mapped and that do not rank. Six restaurants
named from memory in September 2026 — Del Cerro Pizza and Beer, Clems Station,
The Duke Cocktails and Grub, Chamorro Grill, KNB Bistro, The Other Side — and
**five were absent from the corpus while being present in the county permit
list.** That is the failure mode in one line.

The good news is that what we have is real: **88% of addressed records match a
county permit.** The problem is absence, not quality.

**The missing list is on disk, import-ready**, with name, address, city and zip:
`scratchpad/deh/missing-real.json` (~5,978 rows, venue sub-permits already
stripped — the zoo alone holds six separate permits, a hotel one per kitchen).

**What it needs before import:** the county publishes no coordinates, and the
map needs them. Nominatim (OSM's geocoder) is free at ~1 request/second, so
~6,000 addresses is a couple of hours unattended; Google geocoding is faster and
costs. Either way this is the highest-value data work outstanding — bigger than
any remaining menu extraction, because a menu on a restaurant nobody can find is
worth nothing.

## What the remaining queue is made of

Not uniform, and this is the single most important thing to understand before
estimating anything.

- **Chain propagation is spent.** Only 123 of 1,394 are branches of a
  multi-location name. Early waves were cheap because one extraction fed 30
  branches; that leverage is gone. Everything left is independents, one at a
  time.
- **~156 restaurants have been blocked at least once** (see
  `menus/blocked-log.jsonl`). Their re-attempt yield is **bimodal, not low**:
  two batches of previously-blocked restaurants ran an hour apart and returned
  1 of 10 and 5 of 10. The difference was what the block was made of — "nobody
  had tried the RSC payload yet" is recoverable instantly; "Clover COLO2 SPA" is
  not recoverable without a browser.
- **The realistic ceiling for a no-browser pipeline is ~4,300 menus / ~76%.**
  The rest are restaurants that publish no prices anywhere, plus the
  browser-only backlog below.

## The browser-only backlog

These recur constantly and **no amount of no-browser hours converts them**.
They need a Chrome-equipped agent watching what the page fetches:

Square Online (`*.square.site` ordering) ·
HungerRush · PoppinPay · MealKeyWay ·
Paytronix · Agilysys / IG OnDemand ·
anything behind Cloudflare, Datadome or Vercel bot mitigation ·
chain SPAs that only price after a client-side store pick

**Six platforms came off this list on 2026-08-31** — Clover COLO2, NetWaiter,
Popmenu, Menufy, ChowNow and Chowbus — all by the same method: open one
storefront in a browser, find out what it fetches, then reproduce it with curl.
All six had been recorded as unreadable on the strength of what the page
*rendered*; all six ship the menu in the response. See `PLAYBOOK.md` §9 and
`RUNBOOK.md` §4b.

**Chowbus took no cracking at all** — an extraction agent simply tried curl on a
Chowbus storefront and got fully server-rendered HTML with every price. It had
been on this list unexamined. That is the cheapest possible refutation, and it
is a fair warning about the rest of the names here: at least one of them is
probably a plain `curl` away, and nobody has checked.

**Image-only PDFs came off it the same night**, which matters more than any one
platform: `probe/extract_pdf_images.js` copies the embedded JPEG out of each
page, and `Read` has always worked on JPEG. A PDF yielding 2 bytes to
`pdftotext` produced an 87-item capture. This is the honest version of the
technique that caused the fabricated-price incident — read a real extracted
image, never claim to have read the PDF.

**The remaining names above have not been checked this way**, and on a
five-for-five record they are worth an hour each before anyone treats them as
settled. Of 101 restaurants ever blocked on a named platform, 40 now have menus;
the 61 still open are mostly bot walls (Cloudflare/Datadome, 23) and one-off
problems — dead domains, no first-party source, aggregator-only — rather than
one more platform waiting to be cracked.

The Square Online entries in the blocked set are, on inspection, retail
storefronts — beans, brewing equipment, apparel — rather than food menus. That
is a different problem from a technical block and probably resolves as
`not_found` for several of them.

**Coffee Bean & Tea Leaf's Olo storefront defeated six attempts** before an
agent finally got 211 dishes out of its RSC payload — worth remembering before
declaring any of these permanently impossible.

**NetWaiter is solved and is no longer browser-only** (2026-08-31).
`POST /<city>/menu/GetMenu` with body `{}` returns the full priced menu over
plain curl; see `PLAYBOOK.md` §9 and `probe/extract_netwaiter.js`. The eleven
restaurants it had blocked all return an empty menu, which is the truth about
those storefronts rather than a block — no browser hour will convert them.

## Automation in place

- **`platemaps-menu-wave`** — scheduled task, every 2 hours. Salvages any
  interrupted result files, cuts fresh batches, runs 3–4 agents, loads, and
  propagates. **Only fires while the app is open**; if closed it runs on next
  launch.
- **`scripts/cut-batches.mjs`** — cuts work-list batches excluding anything
  in flight. Always use it; see `RUNBOOK.md` §6.
- **`scripts/screen-menus.mjs`** — the quality gate. Markup detection,
  brand-twin and farm-domain bars, quarantine by id, duplicate-row dedup,
  doubled-catalog detection.
- **`scripts/load-menus.mjs`** — retries through dropped Neon connections and
  upserts dishes, so a re-run after a partial load is safe.

## Open items needing Calvin

- **Discovery dense-cell gap (2026-09-05).** `discover-serper.mjs` scanned 908
  Maps cells at one page (~20 places) each and imported 694 new `gmap:` rows.
  Cells that returned a full page were only partly seen; downtown, North Park,
  Convoy and Hillcrest can hide restaurants that are on none of our sources.
  A page-2/3 pass over full cells costs a few hundred Serper credits. Offered.
- **The 694 gmap rows need menus** and are not in the w5 batches. 194 have
  no cuisine because Google typed them plain "Restaurant".
- **~1,000 unverified rows** (785 DEH permit-only + 220 OSM pins) are listed
  because listing no longer needs a rating. Offered to hold them with a
  "not yet verified" reason; Calvin has not answered.
- **`menu_lookups` rows with confidence high and 0 dishes** (e.g. 1012, 1017)
  exist; not investigated.

- **Vercel `DATABASE_URL` is stale** — every dish is invisible in production.
  Not urgent while the site is not live; must be fixed before launch.
- **GitHub App write access** on `CarsonBrassell/platemaps` — the cloud routine
  cannot commit without it. Only matters when the machine is off.
- **Non-conforming price strings: 11,885 → 4,628.** They were three problems
  counted as one, and the mechanical one is now done:

  | | rows | status |
  |---|---|---|
  | `3.49`, `12`, `12.5` | 7,257 | **fixed 2026-08-31** by `scripts/normalize-prices.mjs` — `3.49` → `$3.49`, `12.5` → `$12.50`. Same number, written like every other row, so sorting works. Reversible from `menus/retired/2026-08-31T09-06-27-513Z-price-format.json` |
  | `—` | 1,913 | no price at all (see below) |
  | `$7.69 - $17.79`, `$16.70+`, `$17.95 (Lunch) / $23.95 (Dinner)`, `$10 glass / $35 bottle` | ~2,700 | genuinely multi-valued — **still needs your decision** |

  **The remaining decision is only about the third group**, and it is a display
  question rather than a data one: these rows carry something the restaurant
  actually published, and collapsing `$17.95 (Lunch) / $23.95 (Dinner)` to one
  number throws half of it away. Six survivors are conditional rather than
  multi-valued (`0.99 per year of age`, a buffet's child pricing) and no format
  will fix those.

  `scratchpad/price-shapes.cjs` regenerates the breakdown.

- **13 restaurants render a menu with no prices in it at all** — every row an
  em-dash: Brigantine (59 dishes), El Patio (45), 356 Korean BBQ (42), Top of
  the Hyatt (30), Seaside Buffet (27), City Cruises (26), Kensington Club (26),
  La Barrita (22), Sycamore Den (17), Albert's (15), Tacos El Gordo (14), Wine
  Vault (10), Addison (2). By this repo's own rule — a dish list without prices
  is not a menu — all 335 rows should go.

  **The disposition differs per restaurant and that is why it is still here.**
  `retire-untrusted-menus.mjs` writes a permanent `not_found` alongside the
  delete, which is right for a business that publishes no prices anywhere (Top
  of the Hyatt, City Cruises) and wrong for Tacos El Gordo, which plainly does
  and just needs re-extracting. Deleting without the ledger row re-queues them;
  deleting with it retires them for good. One line from you settles it and the
  rest is mechanical.

  A further 260 restaurants have SOME em-dash rows — Taste and Thirst is 80 of
  100 — which is the same question at a smaller scale and can follow the same
  rule.

## 25 restaurants whose menu exists and is simply priced wrong

**A fifth of the blocked pile is a fee rather than an absence.** 39 restaurants
have been blocked at least once because the only reachable source carried a
markup; 14 were later captured from a clean channel, and **25 still have no
menu** (`scratchpad/markup-open.cjs` lists them — Isshido Ramen, Pacific Pizza,
Ginza Sushi, Silverlake Ramen, Lucca's, Shozen BBQ and 19 others).

These are the highest-yield restaurants left in the backlog, because unlike a
genuine not-found we know the menu exists, is complete, and is reachable — only
the numbers are a platform's rather than the restaurant's. **The fix is a
different channel, not more effort on the same one:** a dine-in photo, the
restaurant's own PDF, a printed menu in a Yelp gallery. Roger's Pizzerolo was
converted exactly this way tonight, off a dated photo of the printed trifold —
which itself states that online and cash prices differ.

Worth a dedicated pass, with the multiplier from the blocked log in each brief
so agents know what they are looking for and know not to reach for it.

## Six restaurants a daytime run picks up for free

Of the 135 restaurants currently blocked and still without a menu, **six are
blocked by a closed-store time gate rather than by anything technical**
(`scratchpad/timegated.cjs` regenerates the list):

3539 Birdseye · 3074 The Goods · 3598 Farmhouse 78 · 3227 Beach + Taco Shack ·
3223 ENO Market & Pizzeria · 4350 Popeyes Louisiana Kitchen

Their storefronts load fine; they just refuse to price anything while the store
is shut. Two of these — the Hotel del Coronado pair — had been assumed
bot-walled until an agent traced the network and found the platform works and
opens at noon. The Goods collapses to three doughnuts outside 8am–2pm.

**This is the argument for running a wave in daylight.** Overnight is otherwise
the right time — nobody is using the machine — but every wave run at 3am
re-confirms the same six closures. It is a small number today because most
blocks are genuine, but it costs an agent twenty minutes each time to rediscover.

## An open question about chain menus

**~48 Domino's branches carry the same 82-dish shared menu; one now has 206.**
On 2026-08-31 an agent matched a single store to its Domino's StoreID and pulled
the official `order.dominos.com/power/store/<id>/menu` catalog — the full
Build-Your-Own and specialty matrix across every size and crust. It is more
complete and better sourced than the 82-dish menu the other branches share.

It was deliberately NOT propagated over them, for two reasons worth a decision:

- **Those 124 extra rows are mostly size/crust permutations.** A page listing
  "Pepperoni (Small/Hand Tossed)", "(Small/Thin)", "(Medium/Hand Tossed)" and so
  on is more data and probably a worse read than 82 clean rows.
- **Domino's prices are per-franchise.** Chain-sharing already assumes one
  branch stands for its siblings, which this corpus accepts — but sharing a
  richer store-specific price matrix across 47 franchises leans on that
  assumption considerably harder than sharing a core menu does.

`share-chain-menus.mjs` only fills branches with no menu at all, so nothing will
happen here by itself. If the fuller matrix is wanted, it needs an explicit
upgrade pass and a view on how variant rows should render.

## Record repairs still outstanding

Addison duplicate (3171/609 — 609 is the one carrying a post, 3171 the one
carrying the real name and address, so a merge has to move the post) · Joyee's
duplicate (626/3426; note 1857 in Vista is a third record with 184 dishes) ·
Casa Estrella name/address mismatch · "Aquarias" typo (2564) · Gate of Damascus
(5490) → Tarbosh rebrand · Urban Craft (5524) → Urban Crave · Aladdin (3713) now
trades as Maisa Lebanese Cuisine. Each rebrand needs an external check before
the rename lands.

**Palominos (3463) is done** — `hold_reason` reads "permanently closed (verified
2026-08-28)".

**South Bay Lounge (4710) may not be a restaurant.** The website on the record
belongs to an urgent care clinic at that address, and an agent could find no
evidence a lounge of that name exists there. It was filed `not_found`, which
retires it from the queue and is the right practical outcome — but if the record
is a phantom rather than a closed business, `hold_reason` would say so more
honestly. Worth one look before launch, since it will otherwise sit in the
corpus as a listable restaurant with no menu.

**Birrieria Enriques (4546) is probably spelled wrong.** The record says
"Enriques"; the restaurant's own WordPress site says "Enriquez". `load-menus.mjs`
refused the batch over the mismatch — the safety check doing its job — and the
menu was filed under the record spelling to get it in. One letter, but it is the
name on the page.

**Raul's Mexican Food (2329) has renamed itself "Raul's Shack"**, and the
website on the record already points at raulsshack.com. Worth updating the name,
and worth knowing that until it is, the screen's brand-twin rule will keep
flagging its own storefront — that rule compares domains against the name WE
hold, so every rebrand trips it. Address is what settles those.

**Café de l'Opera (2576) has a wrong street number.** The record says 410 J
Street; the restaurant's own site says 910 J St, and an extraction agent
confirmed the latter before filing its menu. One digit, and it puts the pin four
blocks off.

**Rookies' neighbourhood is not a one-record typo.** `neighborhood` is a coarse
proximity bucket, not the city off the address, and 36 restaurants with an
Oceanside address sit in `Carlsbad`, `South Oceanside` or `Bonsall` — Rookies
(1065) is one of them, not an outlier. Fixing that single row would make the
field less consistent, not more. Needs a decision on what the field is for
before any of them move.

~~188 orphaned dishes~~ — **repaired 2026-08-31.** Sushi Hana (100),
Hilberto's (69) and El Michoacan (19) held dishes under a `not_found` lookup.
All three were Yelp-era captures of exactly the class
`retire-untrusted-menus.mjs` exists to remove — Hilberto's 69 rows carried no
prices at all — and re-running that script picked up all three, exported them to
`menus/retired/2026-08-31T06-37-01-629Z.json`, and deleted them. Restorable from
that file if it was the wrong call.

## Re-measure

```
npm run db:stats            # the corpus table above, live, ~120 tokens
npm run db:stats -- --json  # also writes probe/stats.json
```
