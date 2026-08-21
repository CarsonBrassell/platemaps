# Menu extraction — status and method

Last updated 12 Aug 2026, mid-session.

## Where it stands

**The corpus is complete. 671 / 682 restaurants have menus (98%), 24,809 dishes.**
`menus-todo.mjs` returns an empty queue. Batches 01–13 predate this session; 14–33 were
loaded during it, taking coverage from 237 to 671.

Confidence across all 682 `menu_lookups`: **479 high, 187 medium, 16 low.**

The remaining 11 have no menu because none exists to find, not because they were skipped —
four are Tijuana restaurants that should never have been in a San Diego corpus (see below),
the rest are places with no priced source anywhere online. Each has a `menu_lookups` row
recording what was checked, so the queue will not re-offer them.

## Method measurement (batches 31–33)

Wall-clock per tool call is a fixed ~7s, so cost is entirely a function of call count, and
call count is dominated by *finding* the source rather than reading it. Splitting scouting
from extraction was worth roughly 2.2×:

| | calls per restaurant |
|---|---|
| Batch 31, single-phase | ~23.8 |
| Batch 32, scout + extract | 13.6 |
| Batch 33, scout + extract, refined | **10.5** |

Wall-clock did *not* improve in batch 32 — the scout phase was serial and one slow group
gated the batch. Batch 33 fixed both: scouts ran in parallel up front, and the known-hard
cases were isolated in their own group so they could not block anyone else.

The one regression to watch: handing an agent a working aggregator URL stops it looking for
something better, which cost a confidence tier several times in batch 32. Adding *"spend
1–2 calls checking for a first-party page before accepting an aggregator URL"* recovered
it — five restaurants in batch 33 upgraded themselves from aggregator to first-party, one
of them proving a 20% delivery markup in the process ($17.99 vs $21.59).

Also: scouts use plain fetches, which get bot-blocked where a real browser does not. Three
sources a scout reported as broken worked fine in the browser. A scout's failed fetch means
*unverified*, not *dead* — say so in the handoff.

**Corpus sizing.** 682 is not a natural ceiling, it is `PER_AREA = 3` in
`fetch-restaurants.mjs`. The gap that matters is per-neighborhood: 21 of 63 neighborhoods
have five restaurants or fewer (University City has 1, Barrio Logan 1, City Heights 2)
while Gaslamp has 28 and Carlsbad 27. A floor of 12–15 per neighborhood puts the target
around **1,200**, roughly 500 more restaurants. Raise `--per-area` rather than lowering
`--min-reviews`; the script merges and never deletes, so widening is safe.

Most of that work should not be done by agents. Of 555 sourced menus, 111 came from Toast
alone and 217 from a recognisable ordering platform — and the true share is higher, since
many "own site" sources are Toast or Clover under a custom domain. Those platforms serve
structured JSON at predictable URLs (Toast, BeyondMenu, and a PopMenu GraphQL endpoint all
turned out to be easier to read than the pages they render). A scripted extractor over the
major platforms would cover the bulk at near-zero token cost, leaving agents for the tail:
image-only menus, PDFs, price-free own sites, and the hijacked domains.

## Resuming

```bash
node --env-file=.env.local scripts/menus-todo.mjs --limit 22
```

That is the whole handoff. The queue excludes any restaurant with a `menu_lookups` row,
so a restaurant that was never reached is automatically back at the front and one that
came back genuinely menu-less is not retried. Nothing needs reconstructing after a crash.

## The pipeline

1. `menus-todo.mjs` — the queue, ordered by review count, seed menus first.
2. **Four subagents**, ~5–6 restaurants each, each writing `menus/wip/<id>.json`
   **the moment that restaurant is done**. Six agents died mid-batch this session
   (API drops, a watchdog stall, a session limit); per-restaurant files are the only
   reason completed work survived every time.
3. `scripts/merge-wip.mjs menus/wip menus/batch-NN.json` — merges and flags problems.
4. `scripts/load-menus.mjs menus/batch-NN.json --dry` then without `--dry`.
   **Run the real load with a timeout above 120s** — batch 25's load was backgrounded
   at the foreground timeout and silently stopped after 10 of 22. Re-running fixed it;
   the loader upserts, so re-running is safe.
5. `rm -rf menus/wip && mkdir -p menus/wip`, then next batch.
6. **After any menu load, recompute price bands:**
   `node --env-file=.env.local scripts/recompute-price-bands.mjs --apply`
   `price_band` is a stored column read straight out of the row, and the only
   thing that used to write it was `import-restaurants.mjs` deriving it from the
   `src/data/*.ts` seed files. `load-menus.mjs` writes dishes to Postgres and
   never touches it, so after 24,809 dishes went in, 663 of 682 restaurants
   still had a null band — and a null band is excluded by every price filter.
   Discover's price facet was answering for 19 restaurants out of 682 until this
   was caught by opening the site. Now: $ 120, $$ 359, $$$ 152, $$$$ 29, and 22
   with no priced menu.

## Agent configuration

Sonnet, four agents per batch. Two guardrails matter:

- **"Do the work yourself; do not spawn sub-agents."** Without this line, three of four
  Sonnet agents delegated to sub-agents and burned ~160k tokens handing off work they
  should have done. With it, none did.
- **~25 tool calls per restaurant**, with an explicit exception for platforms that hide
  prices behind per-item detail screens. Without the exception the budget truncated two
  menus into fragments (Shake Shack came back with 9 dishes).
- **`restaurantId` must be a quoted string in the brief's JSON example.** `restaurants.id`
  is a `text` column and the loader matches with `id = ANY(...)`, so a bare number matches
  nothing and the whole batch fails with "no such restaurant" — batch 28 hit this.
  `merge-wip.mjs` now coerces it, so this is belt-and-braces.

Fan-out is not a cost lever — five agents versus three changes wall-clock, not tokens.
The cost is per-restaurant browsing, so more restaurants per agent amortises better.

## Method that works, in priority order

1. **Find the restaurant's own ordering page first** — Toast, Square, Clover, ChowNow,
   Olo, HungerRush, Menufy, MenuStar, GoTab, Cake, KwickMenu, BentoBox, OrderExperience,
   order.online. This is frequently the *only* place prices exist: several restaurants
   publish price-free menus on their own sites, one with files named `Dining-Menu-NO-PRICE`.
2. **Verify the street address before reading any price.** A chain picker autocompleted a
   ZIP to the wrong city; another defaulted to a store in another county. URL slugs lie —
   a La Jolla store's slug said "del-mar", another gave a corporate address, another
   misspelled the restaurant.
3. **Chain store-pickers give real per-store pricing.** Three Broken Yolk stores ran three
   different tiers for the same dish ($16.95 / $18.95 / $19.55), differing in both
   directions, so it is franchise pricing rather than online markup. Never reuse a
   sibling store's prices.
4. **Staleness runs both ways.** Own sites and own PDFs have been stale (one ~40% low);
   one restaurant's own site was the freshest source while every aggregator was stale.
   Judge by whether the number is believable for San Diego today, and cross-check when
   the source is not a first-party ordering page.
5. **Prove markup rather than assuming it.** Toggling Delivery→Pickup is definitive.
   Markup is sometimes selective — one item +18% while three others were identical — so
   the "divides evenly by 1.15" heuristic is not sufficient. One Toast page exposed both
   a standard and a "(3PD)" third-party tier on the same screen.
6. **Read cheaply**: `get_page_text` → `document.body.innerText` → schema.org JSON-LD →
   hidden DOM tab panels via `textContent`. Screenshot only for genuinely image-based
   menus. One PopMenu page had 305 characters of text and 140 items in its JSON-LD.
   **When a menu looks truncated, suspect the reader before the page.** `get_page_text`
   returns only what it considers visible, so a page that pre-renders every item
   off-screen reads as a fragment. One store page looked like a lazy-load stall at 26
   items; querying `button` elements for `textContent` directly returned all 148. Before
   concluding a category is unreachable, read the raw DOM. Genuine SPA failures do also
   happen — where clicking category pills was dead, navigating straight to each
   `/menu/<category>` URL worked, and one chain then rate-limited after ~8 navigations.
7. **When a menu page 404s, check the sitemap.** One restaurant's nav and Google both
   pointed at dead URLs while the live pages existed only in its Yoast sitemap.
   When a page renders only skeleton loaders, check the network tab for the API behind
   it — a PopMenu site served nothing but placeholders to `innerText` while its
   `/graphql?operationName=menuSection` endpoint returned the whole priced menu.
8. **Never invent a price.** Market-price items and AYCE-included items get `"—"`.
   Prix-fixe restaurants get the package price in `notes` and `"—"` per course.
   No priced source anywhere is a legitimate result: write `dishes: []` with
   `sourceUrl: null` and record what was checked.

## Hazards found

Five restaurant domains were abandoned, parked, hijacked or compromised:
`pho7cow.com` redirects to a gambling site, `laplayatacoshop.com` into an ad network
serving a fake "MacOS Security Center" page, `jeuneetjolie.com` is a GoDaddy lander
whose real site is the hyphenated `jeune-jolie.com`, and two had casino spam injected
into their footers. Agents are told to leave immediately, never interact, never attempt
a CAPTCHA or Cloudflare check, and abandon any domain throwing an SSL error rather than
clicking through.

Auto-generated SEO scraper domains (`*.shop`, `*.res-menu.net`, `*.menu-world.com`,
`*.weeblyte.com`) are a distinct category — one restaurant's *stored* website was one.

## Known data problem: `neighborhood` is unreliable — root cause found

Around **35 restaurants** have been found whose stored location disagrees with reality.
The cause is `nearestNeighborhood()` in `scripts/fetch-restaurants.mjs`: it assigns a
neighborhood by finding the nearest sub-area **center point** in `src/data/regions.ts`.
Every business gets the nearest listed name whether or not that name is right, and the
function has no notion of being wrong. It fails two ways:

1. **The neighborhood isn't in `regions.ts` at all.** Pacific Highlands Ranch and Carmel
   Mountain Ranch are both missing, so their businesses land on the nearest listed
   neighbour. Five PHR businesses are stored as Rancho Penasquitos — El Pueblo (613),
   Fresh Brothers (612), Pacific Social (615), Luna Grill (616, whose *own name* says
   Pacific Highlands Ranch), PITA 22 (617) — and Duffs Doggz (592), on Carmel Mountain
   Rd, is stored as Rancho Bernardo.

2. **One center point can't represent a large or elongated area.** Oceanside's center sits
   at downtown Oceanside, so South Oceanside businesses are genuinely nearer Carlsbad's
   center and get labeled Carlsbad. Measured: Wrench & Rodent 1.3 mi to Carlsbad vs 1.8 mi
   to Oceanside; Tanner's 1.1 vs 2.0; Hunter Steakhouse 1.2 vs 2.1; Teri Cafe 2.3 vs 3.1.

### Fixed, 13 Aug 2026

Four sub-areas were added to `regions.ts` — **Pacific Highlands Ranch** (at Village Way),
**Carmel Mountain Ranch**, **Rancho Santa Fe**, **South Oceanside** — and
`scripts/fix-neighborhoods.mjs` recomputed the column from stored coordinates.
**32 rows corrected**, in four clean clusters: 9 Carlsbad→South Oceanside,
9 Rancho Bernardo→Carmel Mountain Ranch, 7 Rancho Penasquitos→Pacific Highlands Ranch,
3 Rancho Penasquitos→Rancho Santa Fe. Almost every one landed within a mile of its new
point. Run the script with no flags for a report and `--apply` to write.

Two judgment calls worth knowing about:

- **Addison (609) and Amaya (619)** both sit at the Grand Del Mar and moved to Pacific
  Highlands Ranch. Carmel Valley is the conventional label for Addison. Moving Carmel
  Valley's point south to win them back was tried and cost three other restaurants —
  one point cannot cover an area that elongated. Left as-is deliberately.
- **Luna Grill Poway (586) and Villa Capri (589)** moved to Carmel Mountain Ranch because
  their *stored coordinates* are ~1.8 mi from their real Poway Rd addresses. That is a
  coordinate problem, not a labelling one, and this script cannot fix it.

Still not done: `nearestNeighborhood()` will still confidently label a restaurant that is
nowhere near any known point. The honest value is "unknown", but
`src/app/api/restaurants/route.ts` calls `r.neighborhood.toLowerCase()`, so a null throws
on search — making that safe is a product change, not a data fix. The script reports these
rather than touching them.

Neighborhood is user-visible and drives a Discover filter, so wrong values mean wrong
filter results.

**Eight restaurants on one street.** Village Way, in Pacific Highlands Ranch, is stored as
Rancho Penasquitos for El Pueblo (613), Fresh Brothers (612), Pacific Social (615), Luna
Grill (616 — whose *own name* says Pacific Highlands Ranch), PITA 22 (617), Bonchon (625)
and Ayu Sushi (627). Cocina del Rancho (628) and Leucadia Pizzeria (623) are stored the
same way but are actually in Rancho Santa Fe, ~15 miles off.

## Second data problem: four Tijuana restaurants in a San Diego corpus

**Restaurante Caesar's (312), Mariscos el Mazateño (318), La Justina (322) and La Corriente
Cevichería Nais (323)** are all stored as San Ysidro and all are in Tijuana. None has a US
location of any kind. San Ysidro is the border crossing, so a Yelp search centred there
returns businesses on the Mexican side.

This is not a neighborhood correction — those records do not belong in the corpus at all.

**Partly fixed, 13 Aug 2026.** `keeps()` in `fetch-restaurants.mjs` now rejects any
business whose coordinates fall outside San Diego County, so no more arrive. The southern
bound is 32.534, just south of the crossing, so a genuine San Ysidro business still passes.

Recomputing from coordinates found **seven** such rows, not four — Tacos El Franc (314),
Lion Fish (315) and Taco nazo (319) also have Mexican coordinates. Lion Fish is the odd
one: the restaurant is real and in the Gaslamp (435 Fifth Ave), so its *coordinates* are
wrong rather than the record. The other six are Tijuana businesses.

The seven are still in the database. `fix-neighborhoods.mjs` lists them and deliberately
does not touch them — deleting a restaurant orphans whatever posts point at it, which is
the exact hazard `fetch-restaurants.mjs` documents at the top of the file.

## Capture the restaurant's own photo while you are there

Extraction briefs should ask for one more field, and it is close to free:

```json
{ "photo": "https://therestaurant.com/hero.jpg", "photoAlt": "" }
```

Photos are the slowest thing in the pipeline — one Yelp call each against a free
quota of 300 a day, and that queue is what decides when the corpus finishes. But
the extractor is already standing on the restaurant's own website reading its
menu, and the hero image is right there. Every photo taken that way is a Yelp
call that never has to be spent, and it is the picture the restaurant chose of
itself rather than a stranger's photograph of a burrito.

Rules: absolute `https` URL, on the restaurant's own domain, showing the food or
the room — not a logo, not a stock photo, not a delivery-app thumbnail.
`load-menus.mjs` validates the URL and writes it with `COALESCE`, so it can only
fill an empty slot and never displaces a photo already there. The credit line is
derived from the URL host by `src/lib/photoCredit.ts`, so a restaurant-sourced
photo correctly carries no "Photo: Yelp".

## Other things worth knowing

- **The dish cap is 100** as of 20 Aug 2026, raised from 45 — convention, not schema,
  enforced in agent briefs plus a warning in `merge-wip.mjs`. The probe over 50
  tail restaurants (`probe/FINDINGS.md`) measured menus at median 60 / max 240 items,
  so the old cap of 45 captured only 54% of all items and truncated 73% of menus;
  100 captures 86%, inside the product's 80–90% coverage target. The 318 menus loaded
  at exactly 45 under the old cap are truncated and queued for re-extraction; new
  extraction takes the whole menu up to 100, and the display can page beyond 45.
- **Several restaurants add a 3–4% surcharge** to all checks. Stored prices are
  pre-surcharge, noted per file.
- **The corpus itself is a filtered sample**, not all of San Diego: `fetch-restaurants.mjs`
  defaults to `--min-reviews 300`, `--min-rating 4`, and excludes caterers, bakeries,
  delis and dessert shops. Expanding it multiplies the remaining menu work.
