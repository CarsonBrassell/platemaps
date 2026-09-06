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

- 2026-09-05: 2,711 live rows (2,707 sweep + 4 osm) outside San Diego County are listed (LA, OC,
  Riverside, Orlando, Tijuana, Cardiff). Hold them with hold_reason
  'outside_county'? Statement is in RESUME.md. Batch cutter already skips them.
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
- Lake Cuyamaca Restaurant & Store (10419) was rebranded as 'The Pub at Lake Cuyamaca' at the same address (lakecuyamaca.org). Not retired; needs a rename before its menu is filed. (2026-09-06)
- New York Buffalo Wings (1939) was rebranded as 'Wings Empire' at the same address (NetWaiter site). Not retired; needs a rename before its menu is filed. (2026-09-06)
- Apple Country Restaurants (12303) is now Farmhouse 78 at the same address; the Koffie Co (4905) is now S3 Coffee Bar at the same address. Not retired; need renames before menus are filed. (2026-09-06)
- Ginza Sushi (9670) is now Gintaro Sushi at the same National City address. Not retired; needs a rename before its menu is filed. (2026-09-06)
- ZZan Sushi & Soju exists twice in restaurants (7138 and 7870, same address); both got the same menu in w6d-17. One should be held as a duplicate. (2026-09-06)
- Gordy's Bakery and Coffeehouse may be two rows (7986 has a menu from w6d-20; 6960 blocked in w6e-08). Check addresses; hold one if they match. (2026-09-06)
- Taqueria Morelos (8657) now operates as 'Taqueria Morelos #2' at the same address; menu loaded in w6e-09, name may need a rename. (2026-09-06)
- The Vybe Lounge (9395) is a rebrand of Star Gazer Club at the same address (Yelp); nightlife venue, food status unclear, blocked in w6e-06. (2026-09-06)
- The Whet Noodle (11010): Yelp snippet says CLOSED, Instagram says it might return; blocked in w6e-11, needs a direct look before retiring. (2026-09-06)
- w6f-01..20 cut 2026-09-07 (--window 6): 200 rows, 0 overlap with w6e-15..20, 0 out-of-county by address. Cutter: queue 3515, spoken for 1137, blocked 24h 622, cutting from 1746.
- Candied Apple Cafe (13252) now listed as 'Candied Apple Pastry Co' at the same address (MapQuest); Yelp says CLOSED. Blocked in w6e-10 as a rebrand; may need a rename. (2026-09-07)
- Happy Lemon Del Mar (8726) rebranded to HeyTea at the same address (Maps); blocked in w6e-16, needs a rename. Fatte's Pizza (2347): batch address 205 W Mission Ave does not match the known 242 W Mission Ave site; blocked, may be relocated. (2026-09-07)
- Formosa Club (1041): agent called not_found (dive bar, no kitchen, per atly/wanderlog); withdrawn as unclear-food-status bar, no verdict recorded. Bistro Kaz (3976): 204-item priced menu on menupages.com only, needs a second source. (2026-09-07)
- Canyon Vista Restaurant (5175, UCSD dining hall): 117 priced dishes in result-w6f-01.json, quarantined as doubled (46 repeats across stations). Could be deduped by name+price and reloaded if campus dining is wanted. (2026-09-07)
- Kiko's Place restaurant (10294): Yelp says CLOSED but DoorDash storefront live; menu loaded in w6f-07. Two Hands Corn Dog San Marcos (8806): Yelp and Uber Eats say closed, Google Maps active; blocked. (2026-09-07)
- Fish With You (8937) rebranded to 'Yonny Mini Hot Pot' at the same address; blocked in w6f-06, needs a rename. Coal Bros Taqueria (11723): Yelp closed vs Google Maps active; blocked. (2026-09-07)
- Spring Valley Inn (1160): dive bar, no food evidence across 8 listings; blocked (not not_found) in w6f-05. Yummy House (6611) menu is beyondmenu-only, loosely cross-checked. (2026-09-07)
- Las Brazas Mexican Food (8882) and All Stars Sports Bar & Grill (11482): Yelp CLOSED vs still-active marketplace/Facebook listings; both blocked in w6f-09, need a manual look. Forbidden Cove (11853) is a drinks-only tiki bar per its own FAQ; blocked. (2026-09-07)
- A1 sports Bar (9131) rebranded to A1 Hookah Bar; blocked in w6f-10. DoughBoys Grill (8975): Yelp closed but several live sources; menu loaded. Cafe Bella Bacon St (9235): Uber Eats prices 1.25-1.45x first-party; blocked. Filipino Grill (10645) may now be Donas Hawaiian and Filipino Grill (same address/phone); blocked in w6f-11. (2026-09-07)
- Manka Peruvian Cuisine (8892): Uber Eats vs OpenTable prices disagree 12-14 pct; blocked in w6f-08, needs a first-party source. Arcana Brewing (9772) and The Elwood (9182) serve no food; blocked. (2026-09-07)
- w6g cut 2026-09-07 (--window 6): 200 rows, 0 overlap with w6f, 0 out-of-county by address. Cutter: queue 3361, spoken for 1265, blocked 24h 592, cutting from 1496.
- Noemas Tex Mex cuisine (9784) is the same business as Cocina Tex-Mex, marked temporarily closed; blocked in w6f-12. Hill Top Winery (11840) and La Corriente Coronado (7941) have menus behind the OpenTable bot wall only. (2026-09-07)
- Martini Hall 53 (12372) is probably a mis-transcription of Mess Hall 53, a restricted USMC dining facility at Camp Pendleton; blocked in w6f-13, consider holding. Quarter Deck Inn (5396) under new ownership, food status unclear. share-chain-menus ran 2026-09-07 mid: 14 branches, 780 dishes. (2026-09-07)
- Deli Mart (9136): DoorDash vs Uber Eats prices disagree 11-42 pct; blocked in w6f-14. Tierra Mia (9364): tierramiamenu.us is an unaffiliated farm domain, refused. (2026-09-07)
- Elmisa Cafe Escondido (10497) loaded with name+description merged into name for most of 156 dishes (flattened Toast HTML); candidate for a cleanup pass. (2026-09-07)
- Morada Restaurant Rancho Santa Fe (10588) rebranded to Lilians at the same address; blocked in w6f-15, needs a rename. Immersion Coffee appears twice (9308 and 9328), possible duplicate. Finjan Coffee Mission Valley (10545) filed with odd cent prices from DoorDash; markup check inconclusive. (2026-09-07)
- INCIDENT 2026-09-07: agent w6f-15 wrote blocked entries with a verdict field instead of the blocked key; loader recorded 7 not_founds (9475, 7393, 9328, 10588, 7109, 12367, 9788). Reversed by deleting those menu_lookups rows (snapshot in probe/snapshot-w6f-15-lookups.json); restaurants untouched. Added menus/wip/check-shape.mjs; run it before every load.
- Carruth Cellars Tasting Room (8885) has a real Carlsbad food menu behind a bot wall; Volcan Mountain Winery (13250) food is third-party vendors; both blocked in w6f-18. (2026-09-07)
- Saki Saki Sushi Bar (11479) replaced by Sushi Gato in the same suite (Facebook takeover post); blocked in w6f-17 as a rebrand, needs a rename or a Sushi Gato record check. Casa Brava (9795): DoorDash uniform 1.17x markup, blocked. (2026-09-07)
- El Mercadito (3911) at Fiesta de Reyes reads as a goods stall, not a restaurant; blocked in w6g-02, consider holding. Lollicup Tea Zone (2944) Uber Eats store closed since Feb 2024; blocked. (2026-09-07)
- The Round Up Grill (12304): Yelp closed Aug 2026 vs Sirved open with hours; blocked in w6f-20, needs a manual look. (2026-09-07)
- Lake Cuyamaca Restaurant and Store (10419) rebranded to The Pub at Lake Cuyamaca; blocked in w6g-01, needs a rename. Twin Peaks (9519) record points at a plaza site, not a restaurant; consider holding. Pizza Mania (5599) is the LEGOLAND buffet. (2026-09-07)
- YOHED COFFEE (6647): DoorDash vs Uber Eats disagree; agent filed Uber Eats, coordinator converted to blocked in w6g-03. Cheers (1162) and Cj Lounge (1184) are bars with no priced food; blocked. (2026-09-07)
- w6g-06: Un Mundo Mexican Grill (13025) not_found (Yelp CLOSED, MapQuest, Chamber of Commerce). Underdog Food Truck (12008) address differs from Uber Eats (2404 vs 3052 El Cajon Blvd), loaded. The Sushi Stand (10377) UE prices divide by 1.20, blocked. Chief Da Tiki Bar (10273) food but no priced menu. (2026-09-07)
- w6g-05: SusieCakes Carlsbad 6270 found 42 dishes; 9475 (w6f-15) is the same shop, likely duplicate row. Lilo (9813) prix-fixe only. Kiku Room (9284) and Over The Tap (9200) no food. Coffee Culture (9306) DoorDash anti-bot empty body, retry later. Bambinos #4 (7188) partial menu, 2 of 9 tabs. (2026-09-07)
- w6g-04: Park Commons (6563) is a multi-concept food hall (AllSpice, Best Dressed, Fricken Burgers, Slow Poke), blocked; consider hold. Social hookah lounge (6927) has a priced OpenTable menu behind Akamai 403. Bang Bang (2696) UE shows only bottle-service packages. (2026-09-07)
- w6g-08: Birrieria la Loteria (11196) not_found withdrawn; only Yelp CLOSED plus MapQuest quoting Yelp, needs a second independent source. Olive Oil Cafe (2245) is an SDSU campus unit, consider hold. Yomies Rice x Yogurt (3861) only client-rendered fantuanorder source. Suspiros Cakes (11416) 5 items at one flat price. (2026-09-07)
- w6g-09: Sage French Cake (8586) not_found (Yelp + Eater SD). South Park Kitchen (2976) withdrawn, Yelp + MapQuest only; address 1521 vs 1517 30th St. Asian Kitchen (5530) is an SD Airport concession, consider hold. Stadium Club (1222) menu is a password-protected flipbook. Necter Juice Bar (2123) DoorDash truncated at 91. (2026-09-07)
- w6g-07: Espresso Mio (9158) not_found, Yelp CLOSED plus owner Instagram announcing a new location (moved). Fresh Catch Fish Market (12022) has a ~90 item SinglePlatform menu but Yelp reports ownership change and FB shows closure; blocked, revisit. Campus Cafe (5997) no base prices. (2026-09-07)
- w6g-10: Presotea (3677) UE 20 pct above own Snackpass site, blocked. Josies Hideout Saloon (6557) now a lodging/venue site, food unclear. Brain Freeze Bonsall (10515) site parked. (2026-09-07)
- w6g-11: Kumo (8808) not_found (mmm-yoso blog, whatnow successor Momo Sando and Omakase, Yelp). The Pad Thai Stand 979 and 3897 are duplicate rows. Coffee Bar at Foothills Church (10729) address 315 vs 365 W Bradley. Cafecito on Seacoast (10744) moved 710 to 951 Seacoast Dr. (2026-09-07)
- w6h cut 2026-09-07 late: queue 3275, spoken for 1197, blocked 24h 498, cut from 1567; 200 rows, 0 overlap with w6g in flight, 0 out-of-county.
- w6g-12: Lemon Grove Bakery (12840) Yelp CLOSED, Lemon Grove Bistro now at the address, possible rebrand, blocked not not_found. Oakberry Acai (2091) rebranded Superberry Acai, needs rename. Fat Tuesday (8986) drinks only. (2026-09-07)
- w6g-14: Tree House (4527) batch address 9442 Pacific Heights #200 vs site 9945 Pacific Heights, loaded as likely typo; verify. Laderach (10739) national catalog prices. CRAVE Mediterranean (9853) DoorDash 1.035 markup, blocked. Trevi Hills Winery (7496) event venue. (2026-09-07)
- w6g-13: Old Hickory Steakhouse (9848) Gaylord Pacific hotel, no prices. Panpan wok (6930) DoorDash only, Grubhub snippet differed. Baklava King (10478) SiteGround captcha wall. (2026-09-07)
- w6g-15: Fall Brewing (9854) no kitchen per own FAQ. Ono Hawaiian BBQ (8961) entrees unpriced in PDF, Olo ordering needs browser. Burritos Luna (9856) Yelp menu tab only. (2026-09-07)
- w6g-17: Alonas Caketots (10768) is a cottage-food home bakery, hold candidate (no home kitchens). Californias Taco Shop (9858) UE vs Grubhub disagree, blocked. STUDIO Restaurant + Bar (9861) Marriott, no prices. Carruth Cellars 7039 is a second row for 8885. (2026-09-07)
- w6g-16: Old Town Eatery (1867) multi-vendor food hall, hold candidate. Jamals Chicken (2243) SDSU campus. Charade Speakeasy (10292) food comes from Balboa Bar and Grill. Arevalos Bakery has two rows 8068 and 8086. Frutilandia (6157) UE vs Grubhub disagree 50 pct. (2026-09-07)
- w6g-19: all 10 blocked. Cleopatras Lounge (11158) hookah only, hold candidate. Shake Smart (9864) Camp Pendleton North. Champs Korean BBQ (7368) AYCE per-person. Iconic Coffee Club (12185) Yelp closed vs active Instagram. DoorDash page-service.doordash.com served a wrong store under a plausible slug for Golden Dragon (8957) and Taqueria El Patron (7579). (2026-09-07)
- w6g-18: Hooked on Poke (8718) not_found (Yelp CLOSED, Uber Eats closed since Apr 2023). Wasa Sushi Bar (11571) is now Vibes Sushi Bar and Grill per Union-Tribune, needs rename. Brick 95 (9343) closed for now per Instagram. Sydneys (5059) SD Zoo PDF menu loaded. (2026-09-07)
- w6h-03: Calico Cidery (9675) serves no food per Conde Nast, hold candidate. Alibi (9140) temporary remodel closure, reopen Jan 2026. Glazed Coffee (6841) searching for a new location. KM BBQ (9676) AYCE per-person. El Original Mariscos German (9672) truck, batch 1531 47th St vs Yelp 4724 Federal Blvd. (2026-09-07)
- w6g-20: w6g complete. Hannegans House (9194) Yelp closed vs recent NBC owner quote, blocked. Italian Cucina (11286) casino restaurant, no prices. SUGARFISH Little Italy (7858) chain fixed-price menu loaded. Bay Books Coffee (10362) UE, 19 zero-base items dropped. (2026-09-07)
- w6h-02: Cielo Rooftop (3906) was Tequila del Cielo, now Cielo Rooftop Lounge. The Outpost by Valley Farm (8802) closure contradictory. East Village Brewing (10688) food from rotating trucks. (2026-09-07)
- w6h-04: The Leucadian (1107) drinks only. Live Oak Market (9679) gas station deli, edan.io farm site. Beach + Taco Shack (3227) Datadome wall. Pho House (6981) own site loaded, order.online 10 to 18 pct higher. (2026-09-07)
- w6h-01: 7 found. Rosarito Mexican Food #1 (6161) Uber Eats page said unavailable but Google snippet live, filed medium. Silverlake Ramen (1855) from order.online, own site CAPTCHA. Bonchon (3132) quarantined by id. Bravo Cafe (2644) own domain expired, blocked. (2026-09-07)
- w6h-06: all 10 blocked. Nickel Beer Co (9686) beer only. Ko-Li Bar (4017) kakigori, no prices. San Diego Blenders (5992) Uber Eats unavailable, DoorDash at address is Hot Chickz and Pizza: possible replacement, revisit. Bistro Pazzo (6033) menu page timeouts, browser pass. Starbread (10278) page-service returned wrong store again. (2026-09-07)
- w6h-05: Japanese Friendship Bell (9681) not_found, monument not a food business: hold candidate. ENO Market and Pizzeria (3223) rebrand of Eno Pizzeria and Wine Bar, blocked. Casa Reveles (9684) menu shared with sister site casareveles.net. Nothing Bundt Cakes (6119) 5 promo items only. (2026-09-07)
- w6h-10: Oyster and Pearl Bar (9702) not_found, Yelp CLOSED plus Reddit r/lamesa shuttered report Sept 2026. Sawaya Brothers Jr (9703) may be listed on Yelp as Pollo Mex at same address. Bronze Bird (9701) Westin Gaslamp hotel restaurant, no prices. Three needs-browser: The Keep Coffee (4097), Bar Kamon (3910), Valentinas Taco Shop (3479). (2026-09-07)
- w6h-08: El Primo Birrieria (7106) agent filed not_found on Yelp plus MapQuest; converted to blocked, rebranded to Santo Placer, closure unconfirmed. Seven Seas Roasting (2868) 2x price spread across platforms, blocked. YuJing (5946) only page 2 of scanned menu, 18 dishes. Chopsticks Chinese (3393) partial prices, blocked. (2026-09-07)
- w6h-07: Pacifica Breeze Cafe (10639) not_found, Instagram closure post plus Coast News article. Piper (12170) own site no prices, filed from SinglePlatform mirror. Paris Baguette (7081) Olo JS-only, blocked. (2026-09-07)
- w6h-09: Ramen Yamadaya (11440) not_found, Yelp CLOSED plus Istanbul Doner Kebab now at 531 Broadway on Google. The Oaks Grille (9699) PDFs branded Par Lounge and Deck, same operation, filed. Katsuya Ko (9698) official menu unpriced, third parties disagree, blocked. Mutual Friend Ice Cream (11581) flavors only. (2026-09-07)
- w6h-11: That Boy Good (11433) not_found, CBS8 article plus Instagram permanently closed post plus Yelp. Memos Golden Bagel (3303) rebranded to Golden Bagel Cafe, needs rename. Dia Del Cafe (11155) platform price disagreement. Cafe Matinal (10330) moved, DoorDash shows old address. (2026-09-07)
- w6h-13: 0 not_found. Explorers Cafe (796) SeaWorld concession. Idego Coffee (3524) no drink prices. Rosaritos #2 (3641) 158 dishes from Uber Eats, scattered cents, filed medium. Little Ceasars (1293) chain, menu loaded but likely held by exclude-chains. Three needs-browser: Black Radish 6697, Heavenly Donuts 3721, Criscito Pizza 4338. (2026-09-07)
- w6i cut 2026-09-07 late: queue 3194, spoken for 1385, blocked 24h 530, cut from 1277; 200 rows in w6i-01..20, 0 overlap with w6h in flight, 0 out-of-county. (2026-09-07)
- w6h-14: 0 not_found. Harrys Coffee Shop Del Mar (8845) 362 dishes from Toast, branch confirmed. The Luau (3706) tiki bar no food, hold candidate. Chico Club (1095) and Scotland Yard (1189) dive bars, food unclear. Golden Donut (6333) multiple same-name shops, unresolved. (2026-09-07)
- w6h-12: Sand Crab Tavern (10505) not_found, Yelp CLOSED plus BBB no longer in business. San Diego Blenders 5881 and 5992 duplicate. Julian Station (9706) multi-vendor complex, hold candidate. Side Chick (9704) blocked on 15 pct markup instead of dividing, revisit. House of Pizza (5788) and Nanays Best BBQ (2913) revisit, DoorDash likely fileable. (2026-09-07)
- w6h-15: 0 not_found. World Famous I Bar (3671) military base bar, no food: hold candidate. Understory Bar (4003) and Hino (4033) blocked. A Louest (4542) 133 dishes from 4 Squarespace pages. Modern Churro (7674) Uber Eats listing missing core sections, blocked. (2026-09-07)
- w6h-18: 0 not_found. Honey Cafe and Store (7631) relocated from 5544 La Jolla Blvd, new address unpublished: address fix needed. Smoking Cannon Brewery (9873) beer only, rotating vendors. Alohana Acai East Oceanside (13431) router cache pointed at Murrieta branch, filed from Uber Eats. (2026-09-07)
- w6h-17: 0 not_found. Nothing Bundt Cakes (6799) blocked on a clean 1.20x Uber Eats markup instead of dividing, revisit. Golden Donut 8673 and 6333 may be the same shop, check addresses. Jaguar Paw (4356) domain parked but active on Instagram, blocked. Playa Azul (6546) Uber Eats catalog incoherent. (2026-09-07)
- w6h-19: 0 not_found. Qualcomm Cafe Q (3259) corporate cafeteria and Tommy Vs Pizzeria (5531) SAN airport: hold candidates. The Sanctuary by Lost Abbey (9878) taproom no food. Tajima Plaza Bonita (8818) router Toast payload was wrong branch, filed from Postmates. (2026-09-07)
- w6h-16: 0 not_found. El Mofles (8044) DoorDash JSON-LD truncated at 79, full 145 recovered from embedded React Query catalog. Amuse Lounge (9869) Marriott hotel lounge. Mamas Boy Cookies (10626) domain hijacked, farmers market pop-up. Taco Loco (6305) blocked on a 4.8 pct uniform markup, revisit. (2026-09-07)
- w6i-03: 0 not_found. Mango Mania (9881) is the rebrand of Las Ricas Tortas 2 at 1146 13th St IB, needs rename check. Cake (8595) quote-only custom bakery, hold candidate. Cbar (12349) 282 dishes incl 200 retail wine bottles. (2026-09-07)
- w6h-20: 0 not_found. Lindas Yogurt and Deli (2531) own domain hijacked by casino spam, Uber Eats has prices in snippet only, revisit with browser. Papa Bambinos (8624) official menu scans have no prices. All That Shabu (4711) AYCE per-person. Tony Gwynns Sports Pub (9880) 48 from jamulcasino PDF. (2026-09-07)
- w6i-02: 1 not_found, Pho Olala (710) replaced by Ayumi Sushi and Chinese Cuisine at 9735 Campo Rd Ste 250 (Grubhub, Uber Eats, Apple Maps). Marvelous Muffins (2585) batch address does not match the business found, address check needed. China Express (3462) DoorDash 79-item truncation, React Query recovery not tried. Kinchana (817) Square Online needs-browser. (2026-09-07)
- w6i-01: 0 not_found. Shanghai Cuisine (2718) blocked on a clean 1.05x Uber Eats markup instead of dividing, third case of this. Lunas LUNpias (8866) SpotHopper duplicate DOM blocks with two prices, revisit. Party Burgers (7609) 15 of 20 captured, revisit. Parkys (1015) bar no food. Chins Gourmet (2772) 200 dishes own site. (2026-09-07)
- w6i-05: 0 not_found. Noodles Pala Casino (11496) food-court concession, hold candidate. Trinings Bakery National City (7002) own site covers Mira Mesa only. One of Us (8097) needs-browser Squarespace. Patties and Pints (11340) 55 from valleyviewcasino PDF images, add-ons omitted. Agent prompt now says divide out clean uniform markups and file (from w6i-07 on). (2026-09-07)
- w6i-04: 0 not_found. Mariscos La Reyna del Sur (7048) blocked on a clean 1.17x Uber Eats markup, revisit with divide rule. El Rinconcito Taco Shop (7546) Uber Eats shows closed, single source. Audreys Cafe (12400) UCSD Geisel Library concession, hold candidate. Backyard Brewery (10606) no food menu. Red Ribbon Bakeshop (8626) DoorDash truncation. (2026-09-07)
- w6i-06: 0 not_found. Camden Food Co (6135) SAN Terminal 2 concession, hold candidate. Coffee House at North Coast Church (13989) church cafe, possible rename, hold candidate. Java Time (11488) Uber Eats payload missing Coffee Hot section, revisit. Pizza Guys (10549) 108 chain, check share-chain. (2026-09-07)
- w6i-08: 0 not_found. Harbor Island Deli (9118) Yelp CLOSED vs Google active, unresolved. The Grillery (6453) menu exists behind hCaptcha, needs-browser. The Golf Bar (4620) sgcaptcha. Ba Le French Sandwich (4337) only the Mira Mesa Blvd branch has priced listings, this address has none. Maranello (9896) 54 Toast. (2026-09-07)
- w6i-07: 1 not_found, L55 (8915) closed per FOX5 News plus Yelp. Cali Banh Mi (4170) still blocked on a clean 1.30x Uber Eats markup despite the new divide rule, revisit. Isola Encinitas (9478) filed 59 but pizza/pasta section unpriced on Toast, needs-browser top-up. Tappi Sushi Lounge (7972) 201 Clover. atly.com carried a prompt injection, agent ignored it. (2026-09-07)
- w6i-09: 0 not_found. Layali nights lounge (9409, 9147) duplicate rows, same address, hookah lounge with no menu, hold candidates. Okayama Steakhouse (7720) no prices. Milonga Empanadas (7241) order.online partial, revisit. Bedda (9038) Grubhub SPA needs-browser. Bread and Cheese (7285) 50 from PDF. (2026-09-07)
- w6i-11: 0 not_found. Pub 1795 (2223) Camp Pendleton MCCS, military hold candidate. Hopnonymous Brewing (11151) pop-up food only, hold candidate. Carnitas La Caldera (9906) Sunday food truck, La Barbacoa Autentica (9901) weekend stand. Las Ricas Tortas (7669) two sources disagree. Milonga Fashion Valley (9354) 6 dishes thin, Alohana Carlsbad (3567) 9 thin. (2026-09-07)
- w6i-10: 0 not_found. Tazza D Oro (2309) absorbed into The Market by Buon Appetito and Tazza D Oro, rename candidate. My Cup of Tea Unique Gifts (9094) gift shop, hold candidate. All Things Ube Desserts (3834) 7 dishes from a Wayback snapshot, live site hosting-suspended. Cakey Bakey (11850) three sources disagree. Heavys Smokehouse (9900) pop-up. (2026-09-07)
- w6i-12: 1 not_found, Capriottis Sandwich Shop (692) closed 2017 per sandiegoville plus Yelp plus Reddit. Los Primos Panaderia (11128) now trading as Leon Bakery, rename candidate. Win Wings (8863) filed 19 from DoorDash, Yelp says closed but Google and a 2026 Instagram post say open. Elegance On Display (11489) custom cake bakery, hold candidate. Islands Restaurant Crowne Plaza (9908) 35 from Wayback. needs-browser 9300, 9442, 4558. (2026-09-07)
- w6j cut 2026-09-07 late: --window 6, 200 rows, 0 overlap with w6i in flight. Cutter stats: queue 3109, spoken for 1430, blocked 24h 601, cut from 1069. (2026-09-07)
- w6i-15: 1 not_found, Blackmarket Bakery Oceanside (11431) closed per company Facebook post, Uber Eats closed, liquidation auction at address. Papasotes (9945) filed 34 after dividing a 1.04 markup, first agent to apply the divide rule. Craft Pizza (4537) Windmill Food Hall stall, hold candidate. Diegos Taco Shop (11442) domain parked. Sun Gold Point Diner (7655) 176, Subterranean (7359) 120. (2026-09-07)
- w6i-13: 0 not_found. Mitris Delights (9339) social posts say closed but Shopify storefront live, filed 9. Roselys Eats and Sweets (11834) Yelp CLOSED only, Instagram active. The MRKT (5563) DataDome SPA needs-browser. Jamul 23 (9941) 71 from casino PDFs. (2026-09-07)
- INCIDENT w6i-13: screener emptied Healthy Grill Mediterranean (4027) and the loader recorded not_found; menu_lookups row deleted 2026-09-07, restaurant back in queue. Loop now runs check-shape on the ready file too. (2026-09-07)
- w6i-14 loaded 2026-09-07: 2 found (Citrus Station 8881 Toast 126, Khao San Thai Santee 8820 Uber Eats 71; Yelp says CLOSED but live Uber Eats store with address match, kept), 8 blocked. Rebrand: SAKE BAR GAGA 10230 = Sushi Gaga same address. Hold candidates (bars, food unclear): Over The Border 1179, BARESSITO ANTRO BAR 9369, El Santo Remedio Cantina 7352. Coverage 6,533.
- w6i-16 loaded 2026-09-07: 3 found (Suki Hana 3840 Uber Eats 16, Dirty Birds La Jolla 9949 own quick-menu boards 28, RiseUp BBQ 9947 Postmates 18), 7 blocked. Revisit with browser: Forum Deli 6282 and RiseUp BBQ 9947 (DoorDash captures truncated by category-count check). Royal Pearl Tea 4201 domain parked. Coverage 6,535.
- w6i-20 loaded 2026-09-07: 2 found (Sushi Yorimichi 2 7785 Uber Eats 194 divided 1.15, El After Social Club 7206 own site 39), 8 blocked. Rebrand: Mr. Manitas Taco Bar 10407 moved to Quecho Elevated Mexican Eatery 2603 B St (ours 2611 B St, not merged). Needs-browser: Alohana Acai Bowls North Park 7902 (Popmenu no prices). Hold candidates: Water Store 9091 (water refill store), Barbeer 9956 (sports bar). Coverage 6,537.
- w6i-17 loaded 2026-09-07: 3 found (Table 509 10702 SinglePlatform 56, Snapshot Coffee Bar 10546 own ordering site 40 despite Yelp CLOSED, FlavorFull 12378 own site 28), 7 blocked. Needs-browser: Thai Thai Melrose 7630 (DoorDash truncated), Board and Brew Downtown 7866 (Olo). Hold candidate: Weapon Ramen Liberty Public Market 10380 (food hall). Dirty Dough Oceanside 10541 blocked on non-uniform markup 1.248 vs 1.260. Coverage 6,540.
- w6i-18 loaded 2026-09-07: 4 found (KO Underground 9951 Uber Eats 46, Tiny Giant Taproom 8873 own site 19, Plant Based Meals 11854 vibrantfork.com 23, Frutitos Fruteria 8777 Uber Eats 65), 1 not_found kept (Surf Up Chicken 9054: own Instagram closure post plus Yelp CLOSED), 5 blocked. Needs-browser: PAPA GUAPO CANTINA 7908 (Firestore SPA). Hold candidates: Mission Brewing Kensington 9275 (beer only), The Cookie Opera 10589 (custom-order bakery). Coverage 6,544.
- w6i-19 loaded 2026-09-07 (w6i complete): 4 found (Pizza by Aromi 11139 DoorDash 52, Las Ricas Tortas 2 7792 DoorDash divided 1.30 169, Smoove Tea 9257 DoorDash 36, Marcello Pizza Napoli 9954 own site 29), 6 blocked. Rebrand: Gintaro Sushi 7377 appears to be a rename of Ginza Sushi same address, no source. Hold candidates: SIP Wine Bar 4311 (airport), 22 Area Galley 11887 (Camp Pendleton mess hall), 664 9013 (nightclub). Needs-browser: Last Spot Bar 9302 (Square Online SPA). Coverage 6,548.
- w6j-01 loaded 2026-09-07: 4 found (Cenaduria Mi Ranchito 8095 DoorDash 76, Jaws Topokki 7303 DoorDash 35, BGC Bar and Grill 9957 own PDF 52, SugarBears 10248 DoorDash 26), Crafted Coastal Bakery 10392 quarantined (6 dishes, real WooCommerce catalog), 5 blocked. Hold candidate: Formosa Club 1041 (dive bar, no food menu). Same-name traps avoided: Mi Ranchito decoy on Rancho Penasquitos Blvd, LA Sabores Oaxaquenos menu for 9958. Coverage 6,552.
- w6j-02 loaded 2026-09-07: 3 found (Cake by Sierra 10346 own site 22, Bodega Market 7916 DoorDash 12, Crazy wings n fries 9960 Toast 72), 7 blocked. Converted two agent not_founds to blocked before loading: Logan Inn 9481 (dive bar, no food) and Hillside Ranch Vineyard 12140 (winery, no food); both are hold candidates, not closures. Address tenant of ABC Market and Deli 9230 is now The Girls Deli (rebrand). EL PASO TACO SHOP 11014 only source is a 2014 menu photo. Coverage 6,555.
- w6j-03 loaded 2026-09-07: 2 found (Campland Cantina 7640 own site 45, Playground Art + Coffee 9415 Toast 56), 1 not_found kept (Mochinut San Marcos 8834: own Instagram and Facebook closure statements plus Yelp CLOSED; a stale order.online page still shows a menu), 7 blocked. Converted Notorious Barbecue 10988 not_found to blocked (Windmill Food Hall vendor gone from roster, no closure source). Quarantined: Tommys Pizza and Subs 8804 (56 dishes, screener markup 1.2; revisit with divide rule). Hold candidates: El Uno Bar 1088 (dive bar), Casa Del Lobo 9406 (soft-opened this week). tommyspizzasubs.com is domain-squatted. Coverage 6,557.
- w6j-04 loaded 2026-09-07: 3 found (Great Greek Barrio Logan 9961 Popmenu 33, Greenfinch 9964 SinglePlatform 166, Viewpoint Neighborhood Kitchen 10575 own site 80 rows deduped by coordinator to 44 and loaded from result-w6j-04b.json), 7 blocked. Rebrand: Smoke and Salt 11745 closed, The Leucadian Bar at the same Bldg B address with Toast ordering. Boba Life La Mesa 8024 temporarily closed per own Instagram (Apple Maps says permanent, ignored). Needs-browser: Aalami 4365 (Uber Eats client-rendered), The Pocket Pool and Bar 9965 (PDF 403). Hold candidate: MCX Food and Service Plaza Camp Pendleton 9966. Coverage 6,560.
- w6j-05 loaded 2026-09-07: 4 found (Michoacana Mia SDSU 6834 Uber Eats 33, Madina Market Halal 4815 DoorDash 12, Mimis Panini 8028 Uber Eats 28, Tierra y Mar 11825 Harrahs SoCal first-party PDF 60), 6 blocked. Hold candidates: Manta Pizza 798 (theme park), Get Baked Cookie Co 10519 (cottage food, no storefront). Rebrand: Mood ALsham 8093 is the Mal Al Sham chain, likely successor to Uncle Feras. Wrong-branch traps avoided: Francos Flapjack 7910, La Michoacana Ice Cream 12339. Coverage 6,564.
- w6j-06 loaded 2026-09-07: 4 found (SugarBears Sweet Provisions 10393 order.online 32, REGGAEBEATZ 9969 DoorDash 22, La Perla Cocina Mexicana 3991 DoorDash 80 at 3860 Convoy St, EXCELSA 9334 own site 9), 1 not_found kept (Pauma Indian Reservation 9967: tribal government complex, not a food business, two sources; also a hold candidate), 5 blocked. DUPLICATE: SugarBears Sweet Provisions 10393 and 10248 (both loaded). Rebrands: Zonkey 11132 now Paletas Catering; Ramen Girl 11468 closed, Hyshinu Ramen Sushi and Poke at same address. Acai Roots 11118 address shared with Archies Gourmet Cuisine on Grubhub, unresolved. Hold candidate: Oasis Breads 12262 (wholesale bakery). Quarantined: Boo Boos Sweet Potato Pies 11273 (7 dishes). Coverage 6,568.
- w6j-07 loaded 2026-09-07: 3 found (Pure Green 3661 DoorDash 62, Mariscos El Tiburon 6357 Postmates 86, Chapis 9971 DoorDash 77), 6 blocked. Withdrew Street Corner 9972 before loading: its only source was an ezCater catering listing (tray pricing), back in queue. Tasty Buds LLC 9974 (North County Food Hub vendor, Yelp closed only) hold candidate. Taqueria Los Famosos 6640 blocked on inconsistent cross-platform ratios. Same-name traps: Ortiz Bakery 6011 (Peoria IL site, Oxnard DoorDash). Coverage 6,571.
- w6j-09 loaded 2026-09-07: 1 found (Labendi cafe 9323 DoorDash RSC payload 87, JSON-LD had only 79), 9 blocked. Needs-browser: Blue Bowl Superfoods 4564 (Olo), Surf City Squeeze 8701 (Olo), Sip Fresh 5612 (Incentivio), Las Ranas Lonchera 9980 (Yelp photos bot-walled). Hold candidates: Coastal Coffee Scripps Memorial 12146 (hospital), longball cocktail 3108 (no food). Cork N Brew 7088 site down, possible 1.04 markup. Coverage 6,572.
- w6j-08 loaded 2026-09-07: 4 found (SolCurry 9979 imenu4u 28, Lyons Peak BBQ 9045 chalkboard photo 11 day-specific, Cayenne Food Truck 9975 SpotOn branded Baja Fish Taco and Burgers 22, Tacos El Parejita 9976 DoorDash 18), 1 not_found kept (East Village Nutrition 9231: dead domain plus Birdeye permanently closed at address), 5 blocked. Hold candidates: New Motion Beverages 9978 (kombucha taproom, no food), Cafe Del Mar 10638 (hotel cafe, no menu). Decoy avoided: Anakins Fruit and Deli for Anas Fruit and Deli 6578. Coverage 6,576.
- w6j-10 (2026-09-07): 1 found (Dalu Hawaiian BBQ 7896, MenuStar, 149 dishes), 9 blocked, 0 not_found. needs-browser: 9984, 7876, 11095, 9232, 10279. Hold candidates: Sweet Factory 9492 (candy shop), Pines 2253 (UCSD dining hall), Hot Blend Cafe 10543 (transit kiosk). Conflicts: Shaka Java 9232 Yelp closed vs Instagram active; Dubu San Diego Tofu 4645 soft-opening. Decoys seen: Poke Lakes NC, DUBU Tofu House (other city). Coverage 6,577/13,983.
- w6j-11 (2026-09-07): 3 found (WetStone Wine Bar 9006 own site 58; Tacos El Dorado 9986 DoorDash 25; Julia Maes Kitchen 9989 own site JS bundle 17), 7 blocked, 0 not_found. needs-browser: Taco de Ojo 8060 (Square), La Cucina 9985 (Grubhub client-rendered). Hold candidates: Black Sea Cafe and Market 11555 (grocery), La Paloma 792 (USD campus dining). No platform: Tacos el uzzi 9981, Wow Donuts 3271, Tejedas Peruvian Kitchen 12319. Coverage 6,580/13,983.
- w6j-12 (2026-09-07): 5 found (Cozy Cup 12158 UberEats 21; Showa Ramen 4565 Toast 36; Solana Coffee Co 11438 hotel site 14; Famous Wok 8773 UberEats 22; Bonne Vie Brasserie 11529 Westgate site 34), 5 blocked, 0 not_found. needs-browser: Great American Cookies Otay 9425 (Olo), Ambiance Kitchen 8072 (Grubhub shell). Hold candidates: Muscle Lounge 9360 (gym smoothie counter), Heftyboy BBQ 9988 (MEHKO home kitchen). No source: Rising Sun Sushi 2147 (decoy Rising Sun Collective). Coverage 6,585/13,983.
- w6k cut 2026-09-07 late: --window 6, queue 3041, spoken for 1351, blocked last 24h 575, cutting from 1103; 20 batches of 10, 0 overlap with w6j, 0 out-of-county.
- w6j-14 (2026-09-07): 3 found (Las Flautas 664 9992 MenuStar 24; Rams Hill Golf Club 12191 own PDFs 28; Donut Bros 7396 DoorDash 24, branch-verified), 6 blocked, 1 not_found kept (Tacos oasis 9994: Yelp closed plus successor Kids Empire at same suite). Hold candidates: Barona Coffee Company 11288 (casino food court), Mister G Salsa 4580 (salsa manufacturer), Erlenes Family Style Cuisine 9991 (private events only), Seaside BBQ 9505 (weekend pop-up at Seaside Market). No prices: Mombasa Cooker 3275 (Safari Park). needs-browser: Surf City Squeeze 5879 (Olo). Coverage 6,588/13,983.
- w6j-13 (2026-09-07): 4 found (Seacoast Beach Bar 12149 UberEats 45, own domain hijacked by gambling site; Jans Health Bar 9476 own PDF 27; Pahuas Bakery and Pizza 9514 DoorDash 35 deduped from 70; Sarahs Dessert Bar 10250 Wayback snapshot 12, live site down), 6 blocked, 0 not_found. Converted before load: Prado Perk 2632 and The Lookout at Lake Poway 4950 were filed not_found for open park concessions with no prices, now blocked hold candidates. Koakai Brewing 9418: agent filed 138 dishes from Kyoto Market Toast page (kyotomarketoside.com), converted to blocked pending shared-kitchen check. Hold candidates: Cacio 8852 (Windmill Food Hall), Chesters 4368 (gas-station concession). No prices: Cocina de Tamales 6982. Coverage 6,592/13,983.
- w6j-16 (2026-09-07): 2 found (Mia Sorella Chimney Cakes 8819 own Squarespace 14; Tuggamomma Smokehouse 11015 DoorDash 24), 8 blocked, 0 not_found. needs-browser: Immersion Express 9381 (joe.coffee), Al Chile Mexican Food 8933 (Grubhub shell). No prices: DEN 9997 (Marriott), Family Tacos 9995 (cash-only trailer), Therapie Bistro 4482, FiveO3 Pupusas 4389 (partial, call-in). Buffet: Manila Bistro 7924. PDF scramble: Burgers and Shakes 9996 (Jamul Casino PDF superscript prices, browser/PDF revisit). Coverage 6,594/13,983.
- w6j-17 (2026-09-07): 2 found (El Cilantro Mexican Grill 5400 UberEats 129; Carnitas Express 10253 UberEats 19), 8 blocked, 0 not_found. Revisit with divide rule: My O My Coffee 10542 (order.online divides by 1.04, agent blocked instead of dividing; prompt now says divide and file). Yelp-closed-only, kept blocked: EL SAZON DE MAMA 6325, Unico Juice Shop 5227. Hold candidates: The Boss Crepas 9999 (street cart, address conflicts), Mason Ale Works Tasting Room 10234 (brewery). Partial: So Cal Famous Beach Ice 11472 (2 items). needs-browser: Wild Child Ice Cream 10324 (Squarespace). No source: Mariposa Ice Cream Oceanside 10634. Coverage 6,596/13,983.
- w6j-15 (2026-09-07): 3 found (Little Hidden Bakery 7686 own site 33; Collettes Collaborative 4920 Toast 17, own domain hijacked; Fujiyame Ramen 9001 own ordering 20), 7 blocked, 0 not_found. Hold candidates: Sugared Cookie Company 11281 and KayeSimplyBakes 10560 (cottage food), Rumi 9372 (wine bar, no kitchen), San Diego Beer House 11246. needs-browser: Tus Chefs Favoritas 9993 (Square), Maxs Restaurant National City 11099 (Popmenu), Sweets by Victoria 11127 (Squarespace). Coverage 6,599/13,983.
- w6j-18 (2026-09-07): 4 found (Topos Tacos 923 own site 68; Freds Lunch Bag Deli 9076 own ordering 24; Public Square Cafe 7990 Toast 41; 999 Quan Vietnamese 7906 UberEats 26), 6 blocked, 0 not_found. needs-browser: Tlaloc Deli 6216 (Square), Ocean Rainbow 11760 and FLAVORS EXPRESS SDSU 6679 (Wix). Hold candidates: FENIX LOUNGE 11245 (bar, BYOF), Tortillas De Harina El Trigal 7242 (wholesale tortilleria). Site down: Fiesta Pinoy 6572. Coverage 6,613 (share-chain rerun added ~10).
- w6j-20 (2026-09-07): 4 found (Luis Reys 11503 Pala Casino PDF 14; Kahlo cafe 12436 UberEats 46; LA PLACE DELI 7657 DoorDash 29; Amalo Brew Coffee 9438 SinglePlatform 10), 6 blocked, 0 not_found. needs-browser: Macys Cafe Fashion Valley 9283 (joe.coffee), Chagee 4604 (SPA). Identity unconfirmed: Fruit 10004 (multi-tenant address). Conflict: Frutti Mas 10005 dead domain vs Google open. Partial: Juice Holler 7756. No prices: Lizzies Cake Couture 10261 (custom cakes). Coverage 6,617/13,983. w6j complete except w6j-19.
- w6j-19 (2026-09-07): 3 found (Cowboy Coffee 9271 DoorDash 86; Premier Mart and Deli 7203 UberEats 71; Dos Palmas Cafe Parkway Plaza 11166 UberEats 44), 7 blocked, 0 not_found. Hold candidates: Beach Street Tacos 10003 (LEGOLAND concession), Nettas Bakery 11730 (cottage food), Xicanitos 10220 (pop-up/catering, Yelp closed). Price disagreement: Michoacana Mia Vista 8003. No prices: Pinoy Express 4341 (site down), Rey Tj Burgers 10000, The Other Side Bar and Grill 10001. w6j COMPLETE. Coverage 6,620/13,983.
- w6k-02 (2026-09-07): 2 found (6th and G Breakfast Co 7697 own site 71; El Parque 6376 own WordPress 80), 8 blocked, 0 not_found. needs-browser: Mi Asador 6081 (Blizzfull), Hurricane Grill and Wings 6645 (Olo), Terzo Bakery 6656 (joe.coffee), Tacos Alex 6160 (Wix). Rebrand: Taqueria Revolucion 2782 -> Taqueria by El Prieto at 2015 Birch Rd (real Revolucion at 3001 Bonita Rd is a separate record, possible duplicate). No source: Pho 4 Queen 6434, Lisas Filipino Cuisine 6370, Panda Chef 6112. Coverage 6,622/13,983.
- w6k-01 (2026-09-07): 7 found (Anitas Mexican 6468 UberEats 138; Otay Mandarin 6337 UberEats 108; Stake Chophouse 6212 own 63; Burros and Fries Telegraph 6127 Clover 159; Connies 6278 DoorDash 61; Muay Thai Kitchen 6526 own 144; TNL Boba Tea 6291 own Wix 184), 2 blocked, 0 not_found. Red Lobster 6263 (81 dishes DoorDash) QUARANTINED by screener, 55/81 divide by 1.2: revisit with divide rule. Buffet: Hanu Korean BBQ 6724. PDF no text layer: Original Pancake House Vista 7035.
- w6k-03 (2026-09-07): 4 found (Nobu 3225 own 289; Ricos Antojitos 8111 DoorDash 60 divided 1.2; Chins Gourmet 6778 own 175; Mosa Tea 4320 DoorDash 57 divided 1.1), 6 blocked, 0 not_found. needs-browser: Mikes Giant NY Pizza 5673, Pick Up Stix 6133 (Olo). Hold candidate: Novecientos Grados by Tony Hawk 4303 (airport). No prices: Paradisaea 6858 (6 priced on Toast). Non-uniform markup: Pina Smoothies Twin Peaks 8117. No source: S Ks Donuts 6672.
- w6k-05 (2026-09-07): 3 found (Hyderabad Cafe 1865 UberEats 202; Romas Pizza 6211 DoorDash 82; CABETOS Pops 6907 UberEats 16), 7 blocked, 0 not_found. needs-browser: La Nacional 4289, Juice Stop Encinitas 6476 (Wix; DoorDash has 1.08 uniform markup, revisit with divide rule). Shared kitchen: Deanos Pub East 4109 (food is Nanays Kitchen pop-up). Temporarily closed: Calicos 2488 (reopening 2026-11-01). No prices: Jacks Donuts 5885, Agave Bar and Grill 5198 (Marriott), Angelas Eccentric Kitchen 5891.
- w6k-04 (2026-09-07): 4 found (Bopomofo Cafe 3937 order.online 45; Manzanita Roasting Co 4553 own 42; Urban Bubble 4319 Toast 67; Pizzabilities Alpine 7781 own 33), 6 blocked, 0 not_found. needs-browser: Cool Down Coffee 6198 (Clover), Teriyaki Madness 6987. Mixed markup: Fridas Taqueria 1707. Hold candidate: Smittys Downtown 1034 (dive bar). No prices: Toms Chinese BBQ 5735, Godfathers Diner 3703. Coverage 6,639/13,983.

## 2026-09-08 cost problem
Calvin: 60% of weekly Max usage gone in a day. Measured this stretch: 73K-161K subagent tokens and 54-209 tool calls per 10-row batch, ~3 found per 10, so ~40K agent tokens per found menu, plus a coordinator round trip on every completion re-sending the whole context. Spawning paused after w6k-06..09 until Calvin picks levers: router-first with deterministic platform parsers, Haiku extraction with a tool-call cap and trimmed brief, auto-load script with a fresh small session, skip recently blocked rows.
- w6k-06 loaded 2026-09-08: found 6525 El Mundo De Mariscos (UberEats 127), 3920 Bonchon (DoorDash 46). Blocked 8: no prices 3780 2262 5747 1668 4549 5648; 5179 Dcs Across The Street only Toast page is Youngsville LA location; 2255 Muir Coffee joe.coffee needs-browser.
- 3920 Bonchon quarantined (33/46 divide by 1.1): revisit-with-divide.
- 2026-09-08 Calvin: just build it all (all four cost levers). Build delegated to a Sonnet agent.
- w6k-07 loaded 2026-09-08: found 3401 Del Sushi (Toast 46), 2796 BCB Coffee (Toast 215). Blocked 8: no prices 2962 2367 5068 3319; 1690 Village Pub no food, hold candidate; needs-browser 5561 Judys Deli (NetWaiter) 3962 Tastea (DoorDash 77/96 truncated); 8827 Pizza 22 downgraded from not_found to blocked (closed per agent, replaced by Elmisa Cafe, no source recorded), hold candidate.
- w6k-09 loaded 2026-09-08: found 7007 Mendozas (235), 11283 Ramen and Sushi Spot (order.online 138), 9454 Chai Waii (DoorDash 104), 11287 Barona Oaks Steakhouse (35), 9808 The Shore Room (PDF 16). Blocked 5: no prices 9431 6995 9803 9264; needs-browser 8790 Chens Kitchen (qmenu.us SPA).
- w6k-08 loaded 2026-09-08: found 2112 Hometown Taste (beyondmenu 294), 3086 Burrito King (MenuStar 104), 6164 Tolins Tacos (DoorDash 51), 7973 Dubai Loco (DoorDash 94). not_found 11439 Artisan Noodle Tatsuki (closed Aug 2020, SanDiegoVille). Blocked 5: 5094 LEGOLAND concession, 6403 Vicas Cafe unpriced, 11574 Yogurt Barn by weight, 9800 Latchkey food trucks, 9407 Euros Hookah no prices.
- 2026-09-05T19:00:53Z router-20260905-184549: Loaded 25 menus (1708 dishes) — Coverage: 6675/13983 restaurants have a menu.
- 2026-09-05T19:12:33Z result-w7-02: Loaded 0 menus (0 dishes) — Coverage: 6675/14078 restaurants have a menu.
- 2026-09-05T19:12:50Z result-w7-04: Loaded 3 menus (62 dishes) — Coverage: 6678/14078 restaurants have a menu.
- 2026-09-05 late: w7-02 (0 found, 1 not_found 8864 Phoenix Dessert Yelp CLOSED, 23 calls, 108K tok) and w7-04 (3 found, 25 calls, 114K tok) processed via process-result.sh. 9088 and 9398 Christine's Coffee are the same row twice (600 B St) -> dedupe candidate. restaurants.total rose 13,983 -> 14,078 during the day (another terminal importing).
- 2026-09-05T19:15:50Z result-w7-01: Loaded 0 menus (0 dishes) — Coverage: 6678/14078 restaurants have a menu.
- w7-01: 0 found, 1 not_found 2976 South Park Kitchen (Bock at address per Maps, Yelp closed), 38 calls, 129K tok. Hold candidate 9788 Main Street Pour House (no food). New-loop yield so far 3/60; most leftovers are needs-browser, so the headless tier should get them before Sonnet does.
- 2026-09-05T19:20:34Z result-w7b-01: Loaded 1 menus (49 dishes) — Coverage: 6679/14078 restaurants have a menu.
- w7b-01: 1 found (6484 Enoteca Buona Forchetta 49), 0 not_found, 17 calls, 111K tok. Yield 4/80 on router leftovers.
- 2026-09-05T20:09:27Z browser-20260905-191408: Loaded 35 menus (2111 dishes) — Coverage: 6726/14078 restaurants have a menu.
- 2026-09-05 19:xx: headless browser pass over router-20260905-184549 notes: 186 attempted, 45 filed, 35 loaded (2,111 dishes) via process-result.sh, ~10 quarantined by the screener. Coverage 6,726/14,078. A separate browser-20260905-192222.json (5 menus) was written by another run (night-run?).
- 2026-09-05T20:25:22Z result-w7-03: Loaded 1 menus (67 dishes) — Coverage: 6727/14078 restaurants have a menu.
- w7-03: 1 found (9917 Diegos Pizza 67), not_found 8907 Altered State (Yelp closed) and 10351 Loving Hut Vegan Express (HappyCow closed), 41 calls, 142K tok. Yield 5/100 on router leftovers.
- 2026-09-05T20:26:26Z result-w7b-02: Loaded 0 menus (0 dishes) — Coverage: 6727/14078 restaurants have a menu.
- w7b-02: 0 found, 0 not_found, 46 calls, 129K tok. New-loop Sonnet total: 6 batches, 120 rows, 5 menus, ~730K tokens (~146K per menu, worse than the old loop because router leftovers are the hard tail). Headless browser tier: 35 menus for 0 tokens. DECISION 2026-09-05 late: stop Sonnet on router leftovers; let night-run scheduled task keep the router+browser tiers cycling; next Sonnet wave only after Calvin sees these numbers.
- 2026-09-06T00:19:31Z result-w8-03: Loaded 2 menus (44 dishes) — Coverage: 6746/14199 restaurants have a menu.
- 2026-09-06T00:19:50Z result-w8-04: Loaded 0 menus (0 dishes) — Coverage: 6746/14199 restaurants have a menu.
- 2026-09-06T00:20:28Z result-w8-02: Loaded 1 menus (18 dishes) — Coverage: 6747/14199 restaurants have a menu.
- 2026-09-06T00:24:40Z result-w8-01: Loaded 4 menus (105 dishes) — Coverage: 6751/14199 restaurants have a menu.
- 2026-09-06T02:21:14Z result-w8b-01: Loaded 0 menus (0 dishes) — Coverage: 6769/14199 restaurants have a menu.
- 2026-09-06T02:22:07Z result-w8b-04: Loaded 0 menus (0 dishes) — Coverage: 6769/14199 restaurants have a menu.
- 2026-09-06T02:22:24Z result-w8b-02: Loaded 0 menus (0 dishes) — Coverage: 6769/14199 restaurants have a menu.
- 2026-09-06T02:22:37Z result-w8b-03: Loaded 0 menus (0 dishes) — Coverage: 6769/14199 restaurants have a menu.
