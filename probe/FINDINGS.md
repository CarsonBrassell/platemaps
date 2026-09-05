# What a menu looks like in the tail

A 50-restaurant probe, August 2026. Five agents, ten restaurants each, drawn at
random from the OpenStreetMap import — ordinary San Diego restaurants, not the
well-reviewed Yelp corpus the first 682 menus came from.

The question was narrow: **does a menu with prices exist online, and where?**
Nothing was transcribed. The point was to size the job before committing weeks
to it.

## The numbers

```
  27  54%  third_party_priced
  17  34%  own_site_priced
   5  10%  closed_permanently
   1   2%  own_site_no_prices

gettable priced menu          44/50  (88%)
of restaurants still trading  44/45  (98%)
```

**98% of restaurants that still exist have a gettable priced menu.** The 90%
menu-coverage target is reachable. What it is *not* is reachable by reading
restaurant websites.

## The failure mode is not "no website"

This is the finding that should shape the pipeline, and every group hit it
independently.

Only 34% of menus were on the restaurant's own site. The rest were not missing —
they were somewhere else, because **the official site publishes dishes without
prices**. Cocina 35 lists 97 items with descriptions and no numbers. The Night &
Day Cafe has a complete 71-item HTML menu with only upcharges. El Pollo Loco
renders every item as "Price Varies". Sushi Hana's menu is a flat image.

A pipeline that scrapes official sites and stops gets roughly 35%. A pipeline
that knows where else to look gets 88%.

Of the 17 own-site wins, most were still not plain text: a 6-page image PDF
(Greek Corner Cafe), a single PNG (Timestead), JS accordions (El Paisa), prices
baked into product images (Jersey Mike's). **Perhaps 5 of 50 were menus a
plain HTTP fetch could have read.** That is the measured ceiling on any
fetch-and-extract approach, and it is why extraction runs through a real
browser.

## Never take prices from a delivery marketplace

Uber Eats prices are inflated over the restaurant's own. Measured at The Night &
Day Cafe: a chocolate chip pancake reads **$16.96 on Uber Eats against $11–13**
on the restaurant's real menu.

Using marketplace prices would overstate the cost of eating in San Diego
systematically, on thousands of restaurants, in a product whose entire promise
is telling people what a meal costs. Delivery listings are acceptable for
*finding* that a menu exists and for dish *names*; the prices must come from the
restaurant's own pricing.

There is a safe middle category worth keeping separate: **the restaurant's own
hosted ordering system** — Toast, Square, ChowNow, Foodbooking, Slice — linked
straight from its site. That is the restaurant's own pricing on someone else's
domain, and it is trustworthy in a way an Uber Eats scrape is not.

**`order.online` needs checking, not trusting.** It is DoorDash's white-label
storefront, and whether it carries the restaurant's prices or DoorDash's
depends on the restaurant. Breakfast Republic, Joyee's Dumpling House and
Maurizio Trattoria were all extracted from it at `high` confidence and all
three price out at exactly 1.15x a clean menu — $22.43, $21.28, $16.96, none
of which is a price anyone sets. Lourdes' `order.online` storefront, checked
the same night, matched Yelp to the cent on fourteen items and was fine.

So it is not a blanket rule, and the earlier version of this paragraph saying
so was wrong. Run the division test before trusting any `order.online` menu.

**No online ordering channel is automatically in-store pricing.** Books and
Records' own Toast storefront runs $2–5 above their printed dinner menu on
every overlapping item — a burger at $24 against $19 plus $5 fries. That is an
online-ordering surcharge, not a scrape artifact, and the printed menu is the
one to use. The ranking below is about *likelihood*, not guarantee: the
restaurant's own printed or PDF menu beats its ordering system, which beats a
third party.

## Yelp's menu tab is not safe by default

The probe ranked it first. Two extraction batches later that is too generous —
it was wrong on **two of six** restaurants where a first-party price existed to
check against, and wrong in *both directions*:

| Restaurant | Yelp | The restaurant's own system |
|---|---|---|
| Hayes Burger cheeseburger | $13.20 | **$11.00** (uniform 1.20x markup) |
| Greek Corner gyros sandwich | $17.50 | **$14.25** |
| Mountain Mike's create-your-own | $9.99 | **$17.99** (Yelp stale, not inflated) |

So it is not simply "delivery markup" — some Yelp menus are marked up, some are
years out of date, and Greek Corner's was *both* (one item higher, another
lower). Mountain Mike's Yelp page also carried 12 items against 70 on their own
ordering site.

**Always check the restaurant's own ordering system when one exists.** Yelp is
a fallback for restaurants that have none.

Two tells worth knowing. A uniform multiplier with odd cents ($13.20, $24.24,
$3.90) is a markup applied to a real menu. Conversely, POS-style pricing with
cheap loss-leaders — samosa $2.50, miso soup $3.00, odd cents like $1.05 and
$3.69 — is a decent sign you are looking at the real till prices.

## Source ranking, by what actually worked

> **This ranking is superseded. Read the trust ladder further down instead.**
>
> It is kept because its reasoning is still instructive and because it caused a
> real failure worth remembering. It ranked Yelp's menu tab first — on the
> grounds that it parses easily and is available for nearly every restaurant,
> both true — while a later section of this same file bars Yelp outright. Agents
> read both. In one wave, one agent refused Yelp for Aunt Emma's and another
> took 170 items off it for Swami's, and an audit then found **66 already-loaded
> menus sourced from it**.
>
> The agent that used it was not disobeying the playbook. It was obeying the
> half of the playbook that said Yelp was the best source available.
>
> Ease of parsing ranked a source that is undated and crowd-edited above sources
> that are merely harder to read. Rank by whether the price is *right*, and
> treat "easy to extract" as a tiebreak and nothing more.

1. ~~**Yelp menu tab**~~ — **BARRED.** Undated, crowd-submitted, wrong in both
   directions (see the table above). `screen-menus.mjs` now rejects `yelp.com`
   mechanically, because a rule that lives only in prose holds only as long as
   every agent chooses to follow it. The one exception that is not this source:
   a *dated photograph* of an in-store menu, where the date can be established.
2. **Toast** — the single most productive source in group 4. Real restaurant
   pricing.
3. **DoorDash** `/business/<slug>/menu` — renders full priced text. Its
   `/store/` pages often do not.
4. **RestaurantGuru / Allmenus / BeyondMenu** — good coverage of places with no
   site at all, but frequently stale (Allmenus pages dated 2023, pre-2020
   prices seen).
5. **Uber Eats / Postmates** — bot-block often, and inflate prices. Names only.

Two search notes: `html.duckduckgo.com` was markedly more reliable than Google
for finding store-specific URLs, and Google rate-limited parallel agents sharing
one IP. And Yelp's own website field found an official site that did not rank on
Google for its own name (San Diego Burger Co.).

## Menu sizes: the 45-item cap is wrong for this

```
n = 45 measured
min 1   median 60   max 240
73% of menus carry more than 45 items
```

Sushi counters run 120–240. Habaneros is ~200. Humphreys is ~190, though roughly
half of that is drinks. Medina really is 16 items and Sushi MARU really is one
(a $180 omakase).

A 45-item cap truncates nearly three quarters of the corpus, and 47% of the
menus already extracted are sitting exactly at it. Extraction should take the
whole menu; the *display* can still show 45 with the rest behind a scroll.

## Source data is stale and mislocated

- **10% permanently closed.** Across 5,017 OSM rows that is roughly 500
  restaurants. The Yelp enrichment pass catches these via `is_closed` before any
  menu work is spent on them.
- **~30% wrong neighbourhood.** Carmelita's is in Borrego Springs, not Julian
  (18 miles). Inland Tavern is San Marcos, not Rancho Santa Fe. Happy Time is El
  Cajon, not Jamul. Partly OSM staleness, partly that regions.ts has no
  sub-area for Escondido, San Marcos, Vista, Fallbrook or Borrego Springs, so
  the nearest-neighbour rule files them under whatever is closest.
- Two OSM nodes sat ~0.6 mi from the real address in the Encanto corridor.

## Techniques that paid off

Collected from extraction batches rather than the probe, and each one turned a
dead end into a menu:

- **Parallel `WebFetch` before opening a browser.** Fan out across every
  restaurant's homepage at once, harvest the menu links, fan out again on those.
  Agents resolved five to seven of ten restaurants this way before touching
  Chrome. It is the single biggest throughput lever.
- **`pdftotext -layout`** turns a text-layer PDF menu into plain text
  instantly. Try it before assuming a PDF needs vision — several "image" menus
  were not.
- **Toast multi-location pickers** 404 on `/locations` and ignore typed
  addresses. Pull the store slug straight out of the page with
  `/"(?:shortUrl|slug)"\s*:\s*"([^"]+)"/` instead.
- **Squarespace images** can be fetched at a readable size with `?format=1500w`
  when the page itself resists.
- **A CDN that returns `MissingKey`** wants signed cookies the browser already
  holds — restack the images inside the live page with JS and capture there,
  rather than fetching the URL directly.
- `html.duckduckgo.com` now CAPTCHAs `WebFetch` (Chrome and `WebSearch` are
  fine), and `javascript_tool` fails opaquely on any return value containing a
  query string — strip it with `.split('?')[0]`.

## Hijacked domains

One in 50, and it was reached **by following a link from the legitimate parent
site**: `fredsmexicancafe.com` links to `fredsmexicancafeoldtown.com`, which
redirects to a push-notification scam. A crawler that trusts a restaurant's own
outbound links is exposed. Earlier passes found the same pattern at roughly 3%
(bronxpizza.com, breakfastrepublic.com, figtreeeatery.com).

Agents are instructed to leave without clicking and record `hijacked_domain`.

Known bad, still sitting in the `website` column of the rows they belong to:
`navajolive.com` (now serves an Australian online-casino guide),
`thelandingelcajon.com` (a "Redirecting…" shell with obfuscated click-through JS),
`fredsmexicancafeoldtown.com` (redirects to a push-notification scam),
`sdsushihana.com` (302s to `ww9.` — the classic parked-domain pattern),
`antojitoscolombianos.com` (expired, now GoDaddy SEO filler),
plus `bronxpizza.com`, `breakfastrepublic.com` and `figtreeeatery.com` from
earlier passes. A `302` to a `ww<N>.` subdomain of the same name is the
signature worth matching on.

## Aggregators: a trust ladder, not a yes/no

The Aug 23 wave surfaced a failure mode that the earlier "prefer the
restaurant's own site" rule does not cover on its own. When a chain's own site
is JS-rendered and unfetchable, agents fall back to whatever ranks — and what
ranks for `<brand> menu prices` is almost entirely SEO content farms.

Observed in one wave of 24 restaurants:

- `daveshotchicken.us` — the official site is `daveshotchicken.com`. **A ccTLD
  or alternate-TLD twin of a brand name is squatting, not a source.** Treat any
  `<brandname>.us` / `.org` / `.net` variant as untrusted on sight.
- `menupedia.us` — same shape, generic aggregator wearing a `.us`.
- `mojosalesandbranding.com/post/costco-food-court-menu-2026-complete-guide-prices-items`
  — a sales-and-branding agency's blog publishing a "complete guide" to a
  restaurant menu. The long keyword-stuffed slug is the tell. (Its Costco prices
  happened to check out against known public figures, which is exactly why this
  is dangerous: content farms mix real and invented values.)
- Olive Garden was correctly refused by one agent on precisely this basis —
  "dozens of near-identical SEO clone domains" — and recorded not-found. That
  was the right call and is the standard.

**The ladder, best to worst:**

1. The restaurant's own site (HTML, or a PDF pulled with `pdftotext -layout`).
2. The restaurant's own ordering platform — Toast, ChowNow, `order.yourmenu.com`,
   Popmenu. Still run the markup check.
3. A white-label delivery storefront (`order.online`) that **passes** the markup
   check. Confidence `medium` at best.
4. SinglePlatform and similar restaurant-submitted directory data. `medium`.
5. Everything else — allmenus, menupedia, brand-twin domains, agency blog posts.
   **`low` confidence, and only when two independent sources agree on the
   price.** One agent did exactly this for Costco and it is the correct
   procedure.

A `not_found` is worth more than a plausible-looking invented price. A wrong
price on a plate is the single most visible failure this product can have.

## Parallel agents contend for one Chrome

Running six extraction agents at once, they share a single Chrome instance and
navigate each other's tabs away mid-task — one agent reported watching unrelated
restaurants (Jack in the Box, Denny's, Smashburger) appear and vanish in its own
tabs. Work through `WebFetch` / `WebSearch` wherever possible and reserve Chrome
for the JS-SPA cases that genuinely need it. Do not assume a tab you opened is
still yours on the next call.

## OSM neighbourhood mislocations are frequent, not occasional

Four of 24 in one wave: Stone Brewing "Rancho Bernardo" (nearest real location
is Escondido), Mi Guadalajara "Rancho Bernardo" (actually downtown Escondido),
Casa de Bandini "Encinitas" (only location is Carlsbad), Mike's Red Tacos
"Liberty Station" (Point Loma / Clairemont Mesa / Mira Mesa). ~17% in this
sample, consistent with the ~594 rows sitting >5km from their claimed
neighbourhood. Extract the menu anyway — it is the same restaurant — but the
neighbourhood column needs its own repair pass.

## Chain SPAs hide real prices behind an internal API

Olive Garden and P.F. Chang's both render ordering sites where the visible page
never shows a price - and both were solved in the same wave that another agent
recorded Olive Garden as not-found. The difference was refusing to accept the
rendered page as the whole story.

- **Olive Garden**: pick a location, then read the network request the page
  makes to its own `/api/menu?restaurantNum=<id>` JSON endpoint. San Diego
  stores include Carmel Mountain / Rancho Bernardo at `restaurantNum=1369`.
  Yielded 103 priced items where search had yielded only clone farms.
- **P.F. Chang's**: `order.pfchangs.com/menu/<storeId>` renders server-side once
  a location is selected - no API dive needed, just the right URL.

The general move: on a chain SPA, select the San Diego location first, then look
at what the page fetches. Location-specific endpoints return real local prices
rather than the national averages the aggregators reprint.

## An expired certificate is not a hijacked domain

McP's Pub's own site failed to fetch on a cert error, which reads at a glance
like the parked-domain signature. It was simply an expired certificate on the
genuine site: `curl -k` reached it, and the menu turned out to be JPGs that had
to be read visually. Check what the domain actually serves before recording
`hijacked_domain` - the two failures look alike from the outside and one of them
costs a real menu.

Menus published as images are common enough to be routine, not an obstacle:
download the JPGs and read them.

## Wave 2 (Aug 24): what the location-selection rule was worth

Wave 1 quarantined 21% of extractions. Wave 2, with the trust ladder and the
chain-SPA technique written into the brief, quarantined 8% - and one group of
twelve came back with nothing withheld at all.

The single highest-value instruction was **select a San Diego location first**.
Chains that wave 1 recorded as not-found or captured as six-item fragments
returned full priced menus once a specific store was chosen:

| | wave 1 | wave 2 | how |
|---|---|---|---|
| Sonic | 10 (hub.biz) | 175 | own ordering platform, store #6390 |
| La Bella | 56 (allmenus) | 156 | `order.labellapizza.com` |
| Pappalecco | 12 (menuweb mirror) | 108 | Clover, on their own domain |
| Applebee's | - | 104-106 | own site, Chula Vista selected |
| Claim Jumper | 18 (truncated) | 77 | official site (Popmenu) |
| Raising Cane's | 6 | 24 | own ordering site, Mira Mesa |
| Mike's Red Tacos | 16 (low) | 35 | Toast |

Add to the platform list already in this file: **Clover**, **Appfront**, and
**Slice** all host restaurants' own ordering, and all publish real prices.
`res-menu.net` and `kwickmenu.com` are hosted menu microsites - tier 2, fine.

Chains confirmed solvable this way: Applebee's, Arby's, Buca di Beppo, Chili's,
Del Taco, Dunkin', Habit Burger, Krispy Kreme, Olive Garden, Panda Express,
P.F. Chang's, Raising Cane's, Sonic. Do not record any of them not-found without
selecting a store first.

**Still genuinely unfindable:** McDonald's - no web prices at all, and the
ordering flow gates behind accepting updated terms, which agents must not click.
Buffets often have no per-item pricing by nature; Pan Asia Buffet's per-person
figures disagreed across sources and recording nothing was right.

IHOP was on this list for about an hour. One agent recorded it not-found in the
same wave that another pulled 80 priced items off `ihop.com/en/menu`. Two agents
disagreeing is the normal case, not a contradiction to resolve by picking a
side: treat "not-found" as one agent's result, never as a property of the
restaurant, and let the queue try again. The caveat that stands is narrower -
that capture is the *national* menu, because the store-scoped
`?StoreNumber=` URL 403s and Chrome redirects back to the generic page, so it
may not carry San Diego pricing.

### A new content-farm tell

`menuweb.menu`'s page for Vintana carried menu text belonging to an unrelated
restaurant ("Wa Jeal") mixed into it. Templated aggregators stitch pages from
whatever they scraped, and cross-contamination between restaurants is the
clearest possible signal that nothing on the page can be trusted. If a menu
contains an item that plainly belongs somewhere else, discard the whole source
rather than the item.

### Copying a menu between branches is propagation's job, not extraction's

One agent read a Jack in the Box branch in full, then wrote a subset of that
same menu under two sibling branch ids, reasoning that prices are standard
within a metro. The reasoning is likely correct; the mechanism is not. It
arrives indistinguishable from three independent reads. `share-chain-menus.mjs`
does this honestly - it stamps `chain-shared` and records the source branch - so
extract one branch properly and let propagation do the rest.

## Staleness is a separate axis from invention, and the ladder only measured one

Three findings from wave 3 that all turn out to be the same finding.

**Yelp's menu tab was never enforced in code.** It was a hard reject in every
brief from wave 1 onward, and an audit found **66 already-loaded menus sourced
from it** - Hash House A Go Go, Din Tai Fung, The Crack Shack, Snooze, Puesto,
Tacos El Gordo, Las Cuatro Milpas among them. In the same wave, one agent read
Swami's Cafe off Yelp and defended it by showing the prices sat *below*
Postmates' by the usual delivery multiple; another agent, same brief, refused
Yelp for Aunt Emma's and routed through a merchant-priced storefront instead.

The defence is aimed at the wrong target. Yelp's menu tab is barred for being
**stale** - crowd-submitted, undated - not for being marked up. Being cheaper
than a delivery app says nothing about *when* it was written.
`screen-menus.mjs` now bars `yelp.com` mechanically. A rule that lives only in a
prompt holds exactly as long as every agent chooses to obey it.

**SinglePlatform is stale too, and it sits at tier 4.** Rainbow Oaks' entry
listed two eggs at $6.49 - roughly half current - and was internally consistent
throughout. "Restaurant-submitted" means submitted once, not maintained.

**A cross-check is worth only what its freshest source is worth.** The Yellow
Deli's allmenus prices matched a 2020 San Diego Reader article exactly. That
match is evidence the aggregator is repeating 2020, not that the prices are
current. The ladder's "two independent sources agree" was written to catch
*invention*; agreement does nothing about *age*.

So when using tier 4 or 5, date the source or discard it. Prefer a menu that
carries a date - a daily PDF, a dated photograph of an in-store menu - over one
that merely agrees with another undated page.

### Verify a suspicious domain instead of trusting the heuristic

`kingsmenu.site` matches the brand-twin pattern exactly - a chain's name under
`.site` - and is genuinely King's Fish House's own menu host, linked from
`kingsfishhouse.com`, serving a per-location PDF regenerated daily. It was
withheld until checked.

The check is one fetch: **does the restaurant's real homepage link to it?** A
squatter is never linked to by the business it imitates. Run that before
discarding a domain the pattern flags, and before trusting one it doesn't.

## A tier-2 page can carry marked-up prices inside itself

Mavericks Beach Club's own Toast ordering page served two menus: the real one,
and a duplicate section labelled "(GH)" whose every price ran 1.15-1.25x higher.
Ahi Nachos read $21.00 in one section and $25.62 in the other, on the same page,
under the restaurant's own storefront.

The ladder's premise up to now was that the markup risk lives in the *source* -
check the delivery marketplace, trust the restaurant's own platform. That is not
sufficient. A restaurant that also sells through GrubHub can have that channel's
inflated prices mirrored back into its Toast page as a parallel section.

**Run the division test on every source, including tier 1 and 2.** And when a
page shows two prices for the same dish, the lower one is the restaurant's and
the higher one belongs to whoever is taking the commission. Look for a channel
name in the section heading - "(GH)", "Delivery", "Third Party" - and drop that
whole section rather than the individual items.

The same wave caught the ordinary version of this at Mission Valley Breakfast
Company: its `order.online` prices divided by exactly 1.15 onto round dollars
($19.55 → $17.00, $18.40 → $16.00), and a sister location's Toast listing priced
the same burrito at $18.00 against that storefront's $21.28. Recorded not-found
rather than borrow the sibling's menu, which was the right call twice over.

### The in-page markup section is systemic, and it has more than one label

Two restaurants in one wave, found independently:

- **Mavericks Beach Club** — own Toast page, duplicate section labelled "(GH)",
  every price 1.15-1.25x the primary. Ahi Nachos $21.00 and $25.62 on one page.
- **Mike Hess Brewing IB** — own Toast page, duplicate section labelled
  "Food (3PO)" ("third-party ordering"), roughly 15% higher.

So the labels to watch are at least "(GH)", "(3PO)", "Delivery" and "Third
Party", and there will be others. The rule is structural rather than a list:
**when one page prices the same dish twice, the lower figure is the
restaurant's and the higher one belongs to whoever takes the commission.** Drop
the whole marked section, not the individual items.

A clean confirmation of the same arithmetic from the other direction: Amardeen
Cafe's Pistachio Chicken Salad was $19.49 on Toast and $22.27 on DoorDash - a
1.14x multiple - which is what makes Toast the right read rather than a
preference.

### Another hijacked domain, and an agent that stopped when it should

`superchinabuffet.com` now redirects to a fake "I'm a human" software-download
page. Same parked-domain scam pattern as the rest of the list below; the agent
left without clicking, which is the instruction.

Separately, Popeyes' site began returning AWS WAF 403s after about ten rapid
scripted calls to its GraphQL API, and the agent **stopped rather than working
around the block**. That is correct and worth stating plainly: a menu is not
worth evading a rate limit for. The capture is partial (13 items, missing wings,
seafood, sides and drinks) and is recorded as partial rather than dressed up.

### A matching name is not a matching restaurant

`goldenchopsticks382.com` looks exactly like the official site for Golden
Chopsticks, and serves a real, priced, well-formed PDF menu. It belongs to an
unrelated restaurant of the same name at 382 Route 25A, Rocky Point, **New
York** - the number in the domain is its street address. An agent nearly loaded
a New York menu onto a San Diego listing, and nothing in the page would have
looked wrong afterwards.

None of the existing guards catch this. It is not a brand twin, not an
aggregator, not stale, not marked up: it is a correct menu for the wrong
business. **Confirm the address before trusting a domain**, especially when a
restaurant's name is generic enough to be shared. The same wave saw Tacos El
Gordo's DoorDash listing priced at $5+ a taco against the ~$2.60-$3.43 the real
brand charges - the price gap was the only tell that it was a different
business.

### Evidence recorded here held up months later

Breakfast Republic's `order.online` storefront was flagged in this file at
exactly 1.15x with the figures $22.43, $21.28 and $16.96. An agent re-checking
it independently found those same three numbers unchanged. Worth knowing that
markup on a given storefront is stable, so a recorded multiplier stays useful
rather than needing re-derivation each time.

### `res-menu.net` is currently unreachable

It sits on the platform allowlist as a legitimate hosted-menu microsite, and it
is - but it rendered blank through both Chrome and WebFetch (which 403'd) across
multiple restaurants in one wave. Restaurants whose only source is a
`res-menu.net` page should be recorded not-found and retried later rather than
chased; the host, not the restaurant, is the problem.

**Refinement, 2026-08-27: it is no longer a blanket outage.** An agent working
Hernandez' Hideaway established that the domain itself is up - a sibling
restaurant's `res-menu.net` page loaded normally in the same session - while
this store's own listing rendered a completely blank page. So the failure is
per-store, not site-wide, and the two cases want opposite handling:

- **A sibling page loads, this one is blank** - the host is up and the STORE PAGE is broken. Waiting will not fix it. Spend the effort on a different channel instead.
- **Every `res-menu.net` page you try is blank or 403** - genuinely the host. `blocked`, and move on cheaply.

Test which one you are in before deciding: load any other restaurant's
`res-menu.net` page. It costs one fetch and it changes the answer.

Also note the instruction above to record these **not-found** predates the
blocked-is-not-not-found rule and is superseded by it. A `res-menu.net` failure
is `blocked`. On 2026-08-27 three restaurants in one 48-restaurant wave - Cafe
Bassam, Hernandez' Hideaway and Birdseye - were stopped by this host alone,
which is 6% of a wave riding on one dependency.

## Chain-first is worth roughly ten normal waves

The work queue sorts by review count, which is right for independents and badly
wrong for chains. A single Rubio's is unremarkable on review count and sits deep
in the queue; the *chain* is 31 restaurants that all inherit from one
extraction. Sorting by prominence hides that completely.

Measured on 2026-08-25: **1,030 of 3,308 queued restaurants - 31% - were
branches of a chain already in the corpus.** Ranking the queue by
branches-unlocked instead of review count produced a 48-restaurant wave worth
**442 branches**. A review-count wave of the same size is worth about 35.

So: periodically re-rank the queue by how many menu-less siblings share each
restaurant's name, and spend a wave on the heads of the biggest chains. The
query is in `scripts/mark-unpriced-chains.mjs`'s neighbourhood - group the
queue by name, exclude names that already have a priced menu somewhere, order
by branch count.

### Propagate BEFORE cutting the queue, not after

The wave used to run `share-chain-menus.mjs` last. That meant every branch
propagation could have covered for free was still in the queue when the queue
was cut, and an agent spent ten minutes on it. The wave skill now propagates
first and again at the end - both runs matter, because newly loaded menus create
new branches to inherit from.

### A dish list without prices is not a menu

Starbucks' own API publishes 383 products with **no price field on any of
them**. McDonald's offers app-only pickup or a delivery menu that states
outright its prices are higher than in the restaurant. Both were extracted
honestly as dish names with `-` for every price, and the result is 200 rows that
look like a menu, count as a menu, and answer nothing.

It is also self-defeating: `share-chain-menus.mjs` refuses to propagate a
priceless menu, so those two extractions unlocked zero of their 271 branches.
The coverage number would have moved by 271 and the product by nothing.

**Never record a dish without a price.** A chain that publishes no prices is a
not-found - say so in the report and move on. The 271 Starbucks and McDonald's
branches are now retired with `menu_lookups.confidence = 'unpriced-chain'`,
reversible in one statement if either ever starts publishing.

## A consistent price ratio is not automatically markup

The markup test says prices that divide cleanly by 1.1/1.15/1.2/1.25 are a
delivery platform's inflation and must not be recorded. Giant Pizza King broke
that rule's assumption: its own site and its Slice listing disagreed by a
consistent ~11%, but in the *other* direction - Slice was **cheaper**, because
the restaurant runs a standing online-ordering discount.

So the ratio tells you the two lists are related, not which way. Check the
direction before concluding anything: if the third party is HIGHER, that is
markup and the third party is disqualified. If the third party is LOWER, it is
a promotion and the restaurant's own site is still the right source - which is
what was recorded here.

## Sibling agents contending for one Chrome damages extractions

Three separate agents in one wave reported the same failure mode, and each one
cost real menu data:

  - Everbowl's category tabs "stopped responding to clicks partway through",
    losing four whole categories. It had to be quarantined and re-queued.
  - bb.q Chicken's Side category would not expand - "script-injection timeouts
    from sibling agents sharing the browser".
  - Broken Yolk's price modals could not be reliably reopened, so its pancakes,
    waffles and French toast were omitted.

None of these are the site's fault and none would have happened to a lone agent.
Four extraction agents plus anything else the session is running is past what
one Chrome handles. Two effects worth separating: an agent that gets a timeout
usually *knows* and says so, which is recoverable - but an agent whose click
silently does nothing records a short menu and reports success, which is not.

Prefer WebFetch wherever the page will yield to it, and treat "the tab stopped
responding" in an agent report as a reason to re-queue rather than a quirk.

## Corporate siblings cannot corroborate each other

The ladder allows a tier-5 aggregator "only when two independent sources agree".
Two agents in one wave satisfied that honestly and proved nothing:

  - Los Primos was read off **allmenus** and cross-checked against **Seamless**.
    Both are Grubhub.
  - Zappy Pizza's **order.online** storefront matched a **DoorDash** listing
    "exactly", which the agent reported as a good sign. `order.online` IS
    DoorDash's white-label product.

One company's data agrees with itself perfectly, every time - so a corporate
sibling does not just fail to corroborate, it produces the *strongest-looking*
possible agreement while carrying no information at all. Neither second source
was on the untrusted list, so the screen passed both until `SAME_OWNER` was
added to `scripts/screen-menus.mjs`.

Current groupings: Grubhub (grubhub, seamless, allmenus, menupages), DoorDash
(doordash, order.online, caviar), Uber (ubereats, postmates). Add to it when a
new white-label or acquisition turns up - the tell is prices that match to the
cent across two "different" sites.

## Section shape beats dish count, every time

Einstein Bros. Bagels came back with ten dishes, all of them from "Hot Coffee &
Tea" - a bagel chain with no bagels. Ten is comfortably over the thin-capture
threshold, and the menu is still absurd.

The same wave produced El Pollo Loco with twenty-six dishes spread across nine
sections, which looks healthy until you notice "Chicken Meals" has two entries
in it. And Parfait Paris, a patisserie, with no macarons and no cakes.

**Ask whether the SECTIONS make sense for that kind of restaurant.** A taqueria
with no burritos, a pizzeria with no pizzas, a bagel shop with no bagels - all
of these can clear a dish-count threshold comfortably. Extractions should report
which categories they reached and which they did not, and every agent in this
wave that did so made the screening decision obvious.

## Hijacked domain: primofoodsinc.com

Primo Foods (in the corpus as "Los Primos", 5282, an OSM mislabel of "Primo
Foods" / "Primo Food Mart"). Its own domain now redirects to what appears to be
a foreign gambling/login page. Leave without clicking.

## `Rubio's` and `Rubio's Baja Grill` are one brand under two names

Confirmed by an agent that extracted both: same national chain, same menu.
Because `share-chain-menus.mjs` groups by normalised name, the two never share
menus with each other, and every extraction of one leaves the other's branches
untouched. Worth a look at how many other brands are split this way - the cost
is silent and it is paid on every wave.

## Some ordering platforms hide prices while the store is CLOSED

Two restaurants in one late-night wave failed for a reason that has nothing to
do with the restaurant, the source, or the agent:

  - **The Coffee Bean & Tea Leaf** — every San Diego location was shut (they
    open 5-6am) and the Olo storefront gates all item pricing behind
    store-open status. No workaround found.
  - **Dairy Queen** — the Chula Vista store is "Treat Only" and genuinely open
    later in the day, but the storefront blocked all pricing while closed,
    unlike other Olo/Toast sites which serve prices regardless.

**This is a property of the clock, not of the menu.** A wave run at 2am will
record not-found for restaurants that would extract cleanly at noon, and a
`not_found` row is believed permanently - the restaurant never returns to the
queue. That makes an overnight wave quietly destructive in a way a daytime one
is not.

Two consequences worth acting on:

1. An agent that hits a closed-store price gate should say so in exactly those
   words, and that restaurant should be re-queued rather than recorded, the
   same way a quarantine is.
2. Chains on Olo in particular are better scheduled for daytime waves. Note
   this is not universal - most Olo and Toast storefronts served prices fine at
   the same hour in the same wave - so it is a per-brand configuration rather
   than a platform rule.

Unknown and worth establishing: whether the gate follows the STORE's hours or
the visitor's clock, and how many other brands do it. Both were found at
roughly 11pm local.

### `blocked` is now a field, not a judgement call

The screen distinguishes "no menu exists" from "I could not get at the menu
just now", because only the first is safe to record permanently. Set
`"blocked": "<short reason>"` on an entry when a TEMPORARY condition stopped
you — a closed-store price gate, a host outage, a reproducible backend error,
a page that stopped responding. Blocked entries are quarantined and re-queue
themselves; `not_found` entries are believed forever and never come back.

Six restaurants were re-queued on 2026-08-26 after being recorded not-found for
exactly these reasons on a late-night wave: two Coffee Bean and Dairy Queen
branches behind closed-store price gates, two Bruegger's behind a broken
ordering backend, and one behind the `res-menu.net` outage.

## A uniform cent-ending is a markup signature the division test cannot see

Fleming's Prime Steakhouse came back from DoorDash with 47 dishes, **45 of them
ending in .50** - 96%. The restaurant's own site quotes whole dollars ($82 filet
mignon). The division test cleared it completely: dividing by 1.20 produced zero
round results and 1.25 only eight.

The reason is worth understanding rather than memorising, because it will recur.
The platform marks up and **then rounds to the nearest fifty cents**, and the
rounding destroys exactly the clean ratio the divisor test looks for.
`$82 x 1.15 = $94.30`, rounded to `$94.50`. The multiplier is untraceable and
the markup is fully intact.

So check the **distribution of cent-endings** as well as the divisors. A real
menu prices in whole dollars, or in .95, or messily and inconsistently. It does
not put an entire steakhouse on .50 boundaries. If one ending accounts for most
of a menu and the restaurant's own site uses a different convention, that is
markup regardless of what dividing by 1.15 says.

Practical form: `count(price ends in .X0) / count(prices) > 0.8` and the
official site disagreeing is enough to reject on its own.

## `r.jina.ai` fetches pages that return 403 to WebFetch

An agent working around heavy Chrome contention routed blocked sites through
the `r.jina.ai` reader proxy and completed nine restaurants without opening a
browser at all. Worth reaching for before escalating to Chrome, which is the
scarcest resource in a wave and the one whose failures are silent.

## Unfilled ordering-platform templates look like a real menu and are not

El Salvador Pupuseria's own `order.<brand>` domain resolved to a live ordering
site with a full section list - Popular Items, Beverages, Appetizers, Soup,
Combination, Mexican Food, Dessert - and every one of those sections contained
**the identical placeholder items** (Steak & Cheese $8.00, Asada $8.99, and so
on) repeated verbatim. It is the platform's demo content on a storefront the
restaurant never filled in.

The tell is repetition ACROSS sections. A real menu's Beverages and Appetizers
share no items; a template's share all of them. This one is more dangerous than
a content farm, because the domain genuinely belongs to the restaurant and the
prices are plausible - nothing about the source looks wrong, and only reading
two sections side by side reveals it.

Discard and treat the restaurant as `blocked` if the real menu is elsewhere and
unreachable, not as a not-found.

## A dated photo is only worth its date

A 2018 Tripadvisor photograph of New Century Buffet's price board was the only
priced source available and was correctly discarded - eight years is not
"dated", it is archaeology. The rule that a dated in-store photo beats an
undated aggregator page has an obvious upper bound, and it is worth saying out
loud: a photo earns trust from its date, so a very old one earns none.

## Two delivery marketplaces agreeing proves nothing about price

Pho Express came off Seamless, cross-checked against DoorDash, matching **to the
cent** on three items - and the agent noted correctly that Grubhub and DoorDash
are independently owned, so the corporate-sibling rule does not apply.

It still proves nothing, because **markup is a property of the channel, not of
the company**. Both marketplaces charge above the counter price, both are fed
from the restaurant's own POS, and both land on the same inflated number. Their
agreement establishes that the marketplace price is stable, which is a different
claim from the one being made.

`MARKETPLACE` in `screen-menus.mjs` now rejects marketplace-vs-marketplace
cross-checks specifically. A marketplace corroborated by a FIRST-PARTY source is
still fine, and a first-party source needs no marketplace to confirm it.

Related: Pho Express's own site was down with an SSL error across http and
https. That is a `blocked` condition, not a not-found - reach for `blocked`
whenever the restaurant's own site is the thing that failed.

## Location-suffixed branch names cost propagation ~18 restaurants, and that is fine

`share-chain-menus.mjs` groups by exact normalised name, so a chain whose OSM
names embed the location never shares between branches: `filippis pizza grotto
jamul` and `filippis pizza grotto scripps ranch` are different keys. Same for
`rubios` vs `rubios baja grill`, and for punctuation drift like `karl strauss
brewing` / `... co` / `... company`.

Measured 2026-08-26: **12 brands split this way where at least one branch has a
menu, stranding 18 branches.** Filippi's 3, Mike Hess Brewing 4, the rest one or
two each.

**Do not fix this with a prefix or fuzzy match.** The same scan surfaced "Top of
the Market" and "Top of the Hyatt" - a three-word shared prefix and two entirely
different restaurants. Merging them would copy one menu onto the other, which is
the same-name-different-business error this project has already made twice and
which is invisible once loaded.

Eighteen restaurants get extracted normally in the ordinary course of the queue.
That is a better trade than a heuristic that can silently misprice a page. If it
is ever worth closing, close it with an explicit hand-written alias list, never
by inference.

## Two techniques that beat sites which hide prices

Both came out of one wave of retries on restaurants that had already defeated
two agents each. Reach for these before recording a chain not-found.

### JSON-LD structured data in the page source

Fleming's Prime Steakhouse publishes its full dinner menu as `application/ld+json`
in the head of its own location page. An agent that had failed on the rendered
page pulled **77 dishes at whole-dollar prices** straight out of it - and that
also settled the earlier dispute, because the DoorDash capture's uniform .50
endings were markup, exactly as suspected.

Restaurant sites, steakhouses and chains especially, publish `Menu`,
`MenuSection` and `MenuItem` schema for Google. It is often complete, always
cleanly parseable, and needs no clicking. Check the page source before
concluding a menu is unreachable.

### The store's own Olo API endpoints

El Pollo Loco beat two agents with its "Price Varies" gate - every category
required a per-item click, and the best previous captures were 12 and 23 dishes
with the chain's core Chicken Meals section nearly empty.

Selecting the Chula Vista store and then reading
`/api/olo/restaurants/<storeId>/menu` and `/modifiers` returned **79 dishes
across all 13 categories, fully priced**. Twenty-four branches inherit from that
one read.

This is the chain-SPA technique in its strongest form: do not scrape what the
page renders, watch what the page FETCHES. Olo powers a large share of US chain
ordering, so `/api/olo/restaurants/<id>/menu` is worth trying by name.

## Hijacked domain: carmelitasborrego.com

Carmelita's (Borrego Springs) official domain now 301-redirects to
`restaurantecasalucianomadrid.es`, an unrelated Spanish restaurant. Leave
without clicking. Third confirmed hijack after `superchinabuffet.com`,
`primofoodsinc.com` and `mariscoselprieto.com`.

## "Correct menu, wrong business" was declined correctly

Restaurant 944 is recorded as "Las MIlpas" in the neighbourhood of Campo. No
such restaurant exists near Campo. The obvious candidate is Las Cuatro Milpas,
the 90-year Barrio Logan institution - a different name, sixty miles away.

The agent found the plausible match, could not verify the identity against an
address, and left it unrecorded rather than load a real menu onto the wrong id.
That is the right call every time: a missing menu costs one page, and a menu
loaded onto the wrong restaurant is wrong in a way nothing downstream can see.

## Seven Mexican restaurants were still in the corpus, hiding behind US neighbourhood labels

Tacos El Güero was flagged by an agent as an OSM mislocation - "actual address
is San Ysidro, not Dulzura". The address is actually **Av. Benito Juárez 451,
Tecate, Baja California, Mexico**. A search for others found six more: five in
Tecate, one in Tijuana, all `listed = true`, all labelled Campo, Dulzura or
Otay Mesa.

The labels are not wrong so much as meaningless. `regionForCoordinate` assigns
every coordinate to its nearest sub-area, and that rule cannot return "not in
San Diego County" - by construction it always answers. A restaurant fifteen
miles inside Mexico gets the nearest US name and looks domestic ever after.

This also explains a not-found earlier in the same wave: an agent could find no
restaurant called "Las Milpas" near Campo, reasoned carefully about whether it
meant Las Cuatro Milpas in Barrio Logan, and correctly declined to guess. It was
in Tecate the whole time.

All seven are now held with `confidence = 'out-of-country'` menu_lookups rows so
they stop drawing extraction budget. **When importing, filter on the country
before assigning a region** - the nearest-neighbour rule will never do it for
you.

## Fabricated `.shop` listings are a templated network

`cafebassam.shop` and `tacoselguero.shop` are the same operation: a gmail
address matching the domain, AI-written copy, empty categories where the real
menu would be, and prices that contradict the page's own claims (one advertises
99-cent tacos beside a $3.75-4.50 "menu highlights" list). Neither restaurant
has a real site, which is exactly what makes the fake rank.

`.shop` has been added to BRAND_TWIN. Note the difference from a squatted chain
domain: these do not imitate a known brand's site, they invent a listing for a
small business that has none - so the "does the real homepage link to it?" test
cannot fire, because there is no real homepage. The tells are the contradictory
prices and the empty sections.

## Clover's REST API bypasses "Show More" truncation

Filippi's Poway serves its menu through `filippispoway.smartonlineorder.com`
(Clover), whose UI truncates each category to five items behind a "Show More"
control. Reading `/wp-json/moo-clover/v1/categories/{uuid}/items` directly
returned all **98 dishes across 10 categories**.

Third member of the same family as the Olo and JSON-LD findings: when a page
renders less than it knows, look at what it fetches.

## Popeyes is not solvable by the Olo trick, and is now deferred

Popeyes has now been blocked four times across three waves, by the same wall:
`locations.popeyes.com` refuses navigation (AWS WAF / SSL handshake failure) and
`popeyes.com`'s Order Pickup flow never surfaces a location search after a click.

An agent tried the Olo pattern that solved El Pollo Loco and established why it
cannot work here: **Popeyes runs on RBI's own React/GraphQL stack, not Olo**, so
`/api/olo/restaurants/<id>/menu` returns the SPA shell rather than menu JSON.
Its real API is a GraphQL endpoint that WAF-blocks after roughly ten calls.

Do not spend more waves on it. Its branches are deferred with
`confidence = 'blocked-persistent'` and will come back the moment someone
deletes those rows.

## `blocked` needed a backoff, and now has one

`blocked` fixed a real bug - overnight waves were permanently retiring
restaurants whose ordering platform merely hides prices while the store is shut.
But it re-queues immediately, so a persistent obstacle came back every wave and
failed identically each time. Popeyes cost three waves; El Salvador Pupuseria
three, on the same `res-menu.net` 403.

`screen-menus.mjs` now appends every blocked entry to `menus/blocked-log.jsonl`,
and `scripts/defer-blocked.mjs` retires anything blocked three or more times
with `confidence = 'blocked-persistent'`. That takes it out of the work queue
and leaves the listing alone - these restaurants are open and fine, it is only
their menus that are unreachable, so a `hold_reason` would be wrong.

Counted per restaurant, not per restaurant-plus-reason: two agents describe the
same wall in different words ("AWS WAF" and "SSL handshake failure" are one
obstacle), and keying on the prose would reset the count exactly when wording
drifted.

Reverse the whole set in one statement when a host recovers:
`DELETE FROM menu_lookups WHERE confidence = 'blocked-persistent';` A good
number of these are waiting on `res-menu.net` specifically.

## The hijacked `.com`, legitimate `.us` inversion

Crispy Fried Chicken's `.com` was hijacked and redirects to an offshore-casino
guide; its **`.us` is the genuine site**. BRAND_TWIN flagged the real site and
would have thrown away 92 dishes.

This breaks the usual test. "A squatter is never linked to by the business it
imitates" assumes the business still controls its own domain. When the good
domain has been taken, the legitimate site is the one on the odd TLD. The agent
settled it by matching contact email and hosting provider rather than by
reputation of the TLD - which is the check that still works when the other one
cannot.

## Confirming a store location is not a form submission worth refusing

Nectarine Grove was recorded blocked because its Incentivio ordering platform
gates the priced menu behind a "Verify this is the right location" confirmation,
and the agent read the standing safety rule as forbidding it.

The safety rule is about **personal data and commitments**: age gates,
birthdates, logins, emails, accepting terms, creating accounts, payment details.
A store-location confirmation is none of those - it is the same act as clicking
a location in a picker, which every chain extraction already does. Declining it
cost a menu that exists.

**Selecting or confirming a STORE is always allowed.** Entering anything about
the person is never allowed. If a gate asks for a postcode purely to pick a
branch, that is a store selection; if it asks for an email to "see prices", that
is a not-found.

## A URL slug can name one location and serve another

Mainstream Bar & Grill publishes per-location menu pages, and the URL containing
`poway-...-menus` **served the Carlsbad sibling's menu**. The agent noticed and
used the correct Poway page.

This is nastier than the usual same-name-different-branch trap, because the URL
is the thing you would normally trust to disambiguate - it names the right city
and returns the wrong menu, with no error and nothing visibly wrong. Confirm the
location from the page CONTENT (an address, a phone number, a location heading),
never from the slug.

## Los Charros: 323 dishes from the Clover REST endpoint

The rendered page truncated every category to five items behind "Show More".
Reading `/wp-json/moo-clover/v1/categories/{uuid}/items` directly returned the
whole thing - the largest single menu in the corpus. Second time this endpoint
has broken a truncated page open; treat "Show More" on a Clover storefront as a
signal to go to the API rather than to start clicking.

## Markup shows up as direction before it shows up as ratio

Island Spice was withheld a wave earlier as genuinely ambiguous: every price on
its smorefood ordering page was a $1.25 step - $13.75, $18.75, $20.00, $23.75 -
which is equally consistent with a 25% platform fee and with a restaurant that
prices in $1.25 increments. No amount of re-reading that one page settles it,
which is why the right instruction was "find a second channel", not "look again".

The second channel (a MenuStar page linked from the restaurant's own domain)
settled it, and the tell was not a clean ratio. Only one item divided exactly:
Curry Chicken $18.75 vs $15.00. The rest did not - $18.75 vs $17.00, $23.75 vs
$21.00, $18.00 vs $20.00. What was perfectly consistent was the **direction**:
the ordering platform was higher on all seven overlapping items, never once
lower, never equal.

That is the signature of a markup applied and then rounded per item, and it
defeats `screen-menus.mjs` by construction - the mechanical test hunts for a
single divisor landing on round dollars, and rounding destroys exactly that.

So the two tests catch different things and neither subsumes the other. One
source with suspiciously regular prices is a question, not an answer; the answer
needs a second source, and the comparison to run on it is **sign, not ratio**.
Consistent direction across many items is strong evidence even when no divisor
fits; a couple of items differing in both directions is ordinary menu drift.

## An empty entry that explains nothing is a stopped agent, not an absent menu

Four agents were killed mid-wave by a session limit. Each left on disk the
restaurant it was partway through, and one of them - The Red Door - would have
been recorded as a permanent `not_found`. This is the second time this has
happened; the first was a result file read while its agent was still writing.

`not_found` is the most expensive write in the pipeline, because it is the only
one that removes a restaurant from the queue forever. Getting it wrong is
invisible: the restaurant simply never comes up again.

The two cases are cleanly separable, and not by dish count - both have zero.
A real not-found is the *end* of an investigation and always carries prose (what
was tried, what each channel returned, why absence is the conclusion). A
casualty is an entry the agent had just *opened*: it holds the URL it was about
to read and nothing else, because the reasoning had not happened yet.

`screen-menus.mjs` now quarantines any zero-dish entry with no `notes`, no
`blocked` and no `confidence`. Quarantine writes no ledger row, so it re-queues -
which is the correct fate for a restaurant nobody finished looking at.

## The blocked counter was counting screener runs, not attempts

`defer-blocked.mjs` retires a restaurant after THRESHOLD blocks, on the theory
that three separate waves hitting a wall is a finding rather than bad luck. It
counted rows in `blocked-log.jsonl` - but the screener appends on every
invocation, and the screener gets invoked more than once per wave as a matter of
course, because reading its output means running it again.

Taco Bell, Birdseye and Cotijas each carried 4-6 rows from **two** real waves;
18 of 38 rows in the log were same-wave duplicates. Under the corrected count,
not one restaurant in the log actually meets the threshold. Four had been
retired early and are back in the queue.

Worth noticing that the failure was silent and self-confirming: a status whose
entire meaning is "we tried repeatedly" was being awarded for trying once. The
fix collapses entries for the same restaurant inside an hour into one occasion,
in the *reader* rather than the writer, so it repairs the history already on
disk rather than only future rows.

## Using a chain's own location picker as a membership test

Alberto's Mexican Food is a generic taco-shop name in California, and
`albertosmexicanfoodca.com` is a real chain of that exact name - with Inland
Empire locations. The cheap way to test whether the Escondido restaurant belongs
to it was to type the city into the chain's own pickup-location search: it spun
without ever matching. A chain's ordering SPA is an authoritative list of that
chain's branches, so failing to find a city in it is real evidence of
non-membership, and it is faster than trying to prove a negative from search
results.

## A same-named restaurant in another state is a sharper trap than a fake one

The fabricated-listing networks (`.top`, `hey-restaurants`, `weeblyte`, the
`.shop` twins) are recognisable once you know them: templated, thin, no real
address. On 2026-08-27 an agent working Señor Pancho's in San Marcos hit
something harder. `senorpanchos.com` ranks well for the name, and it is a
completely legitimate site with a real, current, priced menu — for an unrelated
Mexican chain in Connecticut, founded 1989.

Nothing about the page looks wrong, because nothing about it *is* wrong. It is
a real restaurant's real menu. It is simply not this restaurant.

A brand-twin check cannot catch this: the domain is the plain `.com`, which is
the exact shape the ladder tells you to trust most. The only thing that
separates it from a first-party source is the address, so **read the address on
any site before you read its prices**, and confirm it against the address on the
work item. This costs one glance and it is the difference between 60 correct
dishes and 60 confidently wrong ones.

## An unpriced official menu still dates a priced one found elsewhere

Marisi publishes a full dinner/brunch/dessert menu with no prices anywhere — a
deliberate fine-dining choice, and by our rules a not-found. An agent then found
a genuinely first-party priced PDF of the same restaurant's printed menu hosted
on a magazine's CDN, which looks like exactly the escape hatch you want.

It rejected it, and the reasoning is the reusable part: the PDF's pasta and
hearth-entree lineup **did not match the lineup on the current live menu**, and
independent commentary put current pasta around $30 against the PDF's $19–29.
The PDF predated a menu refresh and a price rise.

So a priceless official menu is not worthless. It is a free freshness check on
any priced source you find elsewhere: if the two lineups disagree about what
dishes exist, the priced one is old, and its prices are old with it. Compare
lineups before trusting prices. This is the inverse of the markup test — markup
asks whether prices were inflated, this asks whether they were ever current.

## Two more white-label backends, and a way to open both

Add to the tier-2 platform list:

- **BeyondMenu.** Panda Country's own site (`pandacountryca.com`) is a white-label
  BeyondMenu front end. It renders a virtualized list that defeats ordinary
  scrolling, but an in-page synchronous XHR exposes the embedded JSON with the
  whole menu in it — 232 dishes — and `beyondmenu.com` serves the same data
  directly, which makes a free confirmation.
- **PoppinPay**, behind `order.<brand>.com` for Square-adjacent coffee shops.
  Lofty Coffee's ordering site fronts `api.poppinpay.com`; 106 dishes.

Both fall to the same move that opened Sonic, Olive Garden and Kung Fu Tea: when
a page shows items but not prices, or shows only what it has lazily rendered,
stop reading the page and look at what it fetches.

Two related traps from the same wave:

- **Clover can report every item at `$0`** when the real price sits behind a
  required modifier group (choose your protein). Caliente Mexican Grill looked
  free of charge until `/wp-json/moo-clover/v1/items/{uuid}` returned the actual
  numbers. A wall of `$0` is a fetch target, not a menu.
- **A PDF on an expired certificate is still a readable PDF.** Park & Rec's menu
  served over a bad cert; the browser interstitial is not worth fighting when
  you can pull the embedded JPEGs straight out of the PDF bytes and read them.

## A hijacked domain can take a restaurant's only menu with it

Curbside Cafe was carried over specifically to find a non-allmenus source, and
the answer turned out to be that there is not one: its own domain now
301-redirects to `voctestbursa.org`. No ordering platform, no DoorDash or Uber
Eats listing for the Vista location, Sirved and zmenu 403, menupix paywalled,
restaurantji and sluurpy carry names without prices.

That makes it a genuine not-found rather than a blocked entry, and the
distinction matters: the restaurant trades, but its only priced source is a
single tier-5 aggregator with nothing independent to corroborate it. Recording
161 uncorroborated dishes would have been worse than recording none.

Worth remembering when a carry-over comes back empty a second time: "we could
not find a better source" and "a better source does not exist" eventually
converge, and the second one is a legitimate answer.

## `res-menu.net` blank pages are now the single most common obstacle

Across the two waves of 2026-08-27 it stopped or diverted **five** restaurants:
Cafe Bassam, Hernandez' Hideaway and Birdseye were blocked outright by it, and
Cotijas and Mucha Fruta only avoided that by falling back to DoorDash. The three
blocked ones each hit their third strike and were retired as
`blocked-persistent`, which is roughly 6% of a wave lost to one host.

Two practical consequences:

- **Do not start at `res-menu.net`.** If a restaurant's own site links there,
  check for a Toast/Clover/SpotOn/MenuStar storefront first. Shank and Bone's
  res-menu page was blank and its Toast site had all 62 dishes.
- **When it is the only first-party option, a markup-checked DoorDash page beats
  a blocked entry.** Cotijas and Mucha Fruta both came back at `medium` that way,
  the second with all 29 categories.

When the host recovers, everything it cost comes back with one line:

```
DELETE FROM menu_lookups WHERE confidence = 'blocked-persistent';
```

## "Fountain Drinks / Aguas Frescas" is genuinely unpriced, twice over

Two different taquerias in the same wave - Mucha Fruta and Castañeda's - publish
every category with prices except fountain drinks and aguas frescas, which carry
no price anywhere on the platform. Both agents excluded the section rather than
guessing, which is right.

Worth knowing because it looks exactly like a truncated capture from the
outside: a 236-dish menu missing precisely one drinks category reads as a lazy
scroll that stopped early. It is not. If a Mexican menu is complete except for
aguas frescas, that is the restaurant's own omission, not the agent's.

## The wrong-business trap arrives through delivery platforms too

Already recorded: a same-named restaurant in another state with a legitimate
`.com`. On 2026-08-27 the same trap turned up one tier lower. Searching DoorDash
for Garcia's Mexican Cuisine returns "Garcia's Mexican Restaurant" — a real,
live, orderable storefront belonging to an unrelated chain in Utah and Arizona,
with a completely different menu and 1.15x markup pricing.

A delivery listing feels safer than a random `.com` because you reached it by
searching the platform rather than the open web, and the platform "knows" which
restaurant it is. It does not. Platform search matches on name, and name is
exactly what collides.

So the address check applies to delivery storefronts as well as websites, and it
is the whole defence: `senorpanchos.com` (Connecticut), `Garcia's Mexican
Restaurant` (Utah/Arizona). Both real, both current, both wrong.

## Hijacked domains, running list

Restaurants whose own domain now redirects somewhere unrelated. In every case
the restaurant still trades — the domain lapsed and was bought:

- `mamasbakery.net` → `evoketherapy.com`, a therapy blog (Mama's Bakery, whose
  real menu is on Toast, 95 dishes)
- Curbside Cafe's own domain → `voctestbursa.org`
- Crispy Fried Chicken's `.com` → an offshore-casino guide, while its `.us` is
  the genuine site

The pattern matters more than the list: **a dead `.com` is not evidence the
restaurant is gone**, and the real menu is usually one platform search away
(Toast, Clover, SpotOn). Treat a redirect to an unrelated business as a lapsed
domain, leave without clicking further, and go look for the ordering platform.

## A dated menu photograph beats an undated web page

`kensushiworkshop.org` looked like a defensible tier-5 source: DoorDash's prices
divided onto it at a clean 1.20x across all eight overlapping Entrees,
descriptions word for word, which is a strong argument that the `.org` carried
un-marked-up base prices. It was loaded nowhere only because the extracting
agent flagged its sushi sections as short.

A later agent found the real menu — photographs of the physical menu pages
posted by a reviewer on the restaurant's Google Maps listing in March 2026,
carrying the restaurant's own logo — and the `.org` collapses against it:

| Item | `.org` | Real |
|---|---|---|
| Salmon Crudo | $25 | $27 |
| Triple Belly Sampler | $35 | $45 |
| Chilean Sea Bass Misoyaki | $16 | $25 |
| Ankimo | $10 | $18 |

Its Sake section shares no items at all with the real one. So the 1.20x
agreement was real but local: **a markup relationship confirmed on one section
says nothing about the others.** Do not generalise a cross-check from the
section you tested to the sections you did not.

The reusable technique is the other half. A restaurant's Google Maps listing has
a **Menu photo tab**, and reviewer-posted menu photographs are dated, show the
restaurant's own printing, and cost nothing. That makes them better evidence
than any undated aggregator page. Two practical notes: the photo carousel is
virtualized — roughly three thumbnails exist in the DOM at a time, so page
through deliberately — and it renders black or loses its place under heavy
Chrome contention, which is a reason to keep the four-agent ceiling.

## A restaurant's OWN ordering platform can carry a surcharge

The markup test was built for marketplaces — DoorDash and friends taking 15–25%
off the top. Cotijas (id 1979) shows it catches something else as well, and the
ladder's instruction to "still run the markup check" on tier 2 is not a formality.

Its own Clover storefront, `cotijasmarkest.smartonlineorder.com`, tripped the
test at **1.04** with 137 of 214 prices dividing onto round dollars. That looked
like a false positive at first: 4% is not a delivery fee, and this is the
restaurant's own site rather than a marketplace. The prices settle it:

| Displayed | ÷ 1.04 |
|---|---|
| $13.51 | $12.99 |
| $10.39 | $9.99 |
| $9.35 | $8.99 |
| $15.59 | $14.99 |
| $17.67 | $16.99 |

Every one lands on a `.99` menu price. That is a 4% online-ordering or
card-surcharge applied on top of the real board prices, and the displayed
numbers are not what a customer pays in the shop.

Two things follow:

- **First-party does not mean unmarked.** The surcharge is smaller than a
  marketplace's and therefore easier to miss by eye, which is exactly why the
  mechanical test is worth running on every host rather than only the
  suspicious ones.
- **The multiplier is a clue about the source, not just a reason to reject.**
  1.15–1.25 says marketplace. 1.03–1.05 says the restaurant's own checkout
  adding a fee. The second is worth a retry against a dine-in or in-store view,
  because the real prices demonstrably exist one step behind it.

Do not "recover" the base by dividing. The division is convincing here but it is
still inference, and 77 of the 214 do not divide cleanly — a re-extraction from
an unsurcharged view is cheap and certain.

## When a Google Maps photo lightbox will not open, take the URLs from the DOM

Dated menu photographs are the best source this project has, and the carousel
that holds them is the flimsiest interface it deals with. It renders about three
thumbnails into the DOM at a time, and under browser contention the lightbox
refuses to open or comes up black. On 2026-08-27 that cost two restaurants: Ken
Sushi's sashimi pages and Tacos El Poblano's whole menu, the latter nearly
recorded as a permanent not-found over a modal that would not open.

A third agent, working Mary's Donuts the same afternoon, hit the identical wall
and went around it: it read the full-resolution image URLs straight out of the
DOM with JS and fetched them, never clicking the carousel at all. Four chalkboard
photos, cleanly.

So: **do not click the photo set, read its URLs.** Clicking is the part that is
broken; the images themselves are ordinary files on a CDN.

The same agent also handled a wrinkle worth copying. Two photos showed different
board states, $17.99 against $16.99 for a dozen donuts. It used the
cleaner-formatted board and said so, rather than averaging them or picking
silently - which leaves the next reader able to check.

## Round-dollar prices break the markup test

The markup test asks whether prices look like a base times a round multiplier.
A whole-dollar price answers yes for nothing: $5/1.25 = $4, $10/1.25 = $8,
$20/1.2 = $16. Any venue pricing in whole dollars trips it automatically.

Pal Joeys - a dive bar, on its OWN site, showing a happy-hour board - scored 5
of 8 and was withheld for a delivery fee it could not possibly have. Bars, happy
hours, taco Tuesdays and $1 oyster nights all price this way, so this is a whole
category of venue, not one restaurant.

Whole-dollar prices are now excluded from the ratio, and the minimum sample is
12 rather than 8. What remains is the case that carries information: a price
with real cents on it. $13.51 dividing to $12.99 says something. $10 dividing
to $8 says nothing.

Both real detections still fire after the change - Cotijas at 1.04 on its own
Clover storefront, George Burgers at 1.20 on an unaffiliated DoorDash listing -
which is the check worth running whenever this heuristic is loosened.

## We extract at night, and daytime businesses are shut when we do

Four restaurants came back blocked in one batch on the evening of 2026-08-27,
and all four for the same reason: their own ordering platform gates the entire
menu behind store-open status, and the store was closed.

| Restaurant | Platform | Stated hours |
|---|---|---|
| The Goods | Clover | 8:00am–2:00pm |
| OB Bean Coffee Roasters | Toast | 7:30am–4:30pm |
| Bruegger's Bagels | own platform | 6:00am–2:00pm |
| Good Bar | Popmenu | "Orders start Friday 12:30pm" |

Every one is a breakfast, coffee or lunch business. That is not a coincidence:
**the venues most likely to be shut when a night wave runs are exactly the ones
whose whole trading day ends before evening.** A dinner restaurant read at 10pm
is often still serving; a bagel shop that closes at 2pm never is.

This has been recorded four separate times as individual blocks - Coffee Bean,
Dairy Queen, and now these - and treated each time as one restaurant's bad luck.
It is a scheduling problem. The gate is not a fault to work around, it is the
platform behaving correctly for a closed store.

Two things follow:

- **A restaurant blocked on a closed-store gate should be retried in its own
  trading hours**, not simply re-queued into the next wave, which will usually
  run at a similar time of night and hit the same wall.
- **Morning waves are worth more than they look.** They are the only time a
  large class of restaurant is readable at all, and they cost nothing extra.

Note also that Bruegger's Bagels failed the same way on 2026-08-26 at two other
branches, and there are eight in the corpus. If the next daytime attempt also
fails, that is a chain-wide backend problem rather than a clock problem, and the
whole brand should be deferred rather than retried eight times.

## Deduplicating prices before the markup test makes it worse

Village Indian Cuisine scored 29 of 31 at 1.25 off its own ordering platform -
a flat 25% platform fee, apparently. It is not one. Its 31 non-round prices
collapse to SIX distinct values, most of the hits being one $89.99 catering item
repeated, and every one of them ends in `.99`.

`.99` pricing sits one cent below a round number by design. $19.99 reads as $20
under the test's one-cent tolerance, and $20 is exactly 16 x 1.25. So any menu
using `.99` prices whose next dollar is divisible by five - $19.99, $24.99,
$89.99 - hits at 1.25 no matter who set the prices.

The obvious fix is to count distinct prices instead of every price. **It makes
the test worse, and inverts it:**

| | distinct | deduped ratio | truth |
|---|---|---|---|
| Cotijas | 60 | 0.45 | real 4% surcharge |
| George Burgers | 16 | 0.38 | real 20% markup |
| Village Indian | 6 | **0.67** | false positive |

Deduped, the two genuine cases fall below threshold and the false one becomes
the strongest signal of the three. The reason is that in a real surcharge
*every* price is marked up, so repetition is exactly the evidence that matters;
throwing it away throws away the case.

**Price diversity is the discriminator, not the ratio.** Count every price for
the ratio, and gate the whole test on there being at least 12 DISTINCT non-round
prices. Sixty distinct prices that mostly divide by 1.04 describe a real
multiplier. Six, four of them `.99`, describe nothing.

The tolerance cannot simply be tightened either: the same one-cent slack that
lets $19.99 pass for $20 is what catches Cotijas' $13.51 as $12.99 x 1.04.

The general lesson is worth more than the fix. This heuristic has now produced
five false positives - flat-price boards, round-dollar bar menus, `.99` pricing
twice, and small samples - and two true catches. **Every loosening must be
re-run against the known true cases before it is kept**, because the changes
that most look like principled improvements are the ones that quietly disable it.

## A stale copyright footer is not evidence about the menu

Dragon Chinese Cuisine's site carries a 2012 footer, and an agent rightly
flagged it as the batch's biggest staleness risk - a fourteen-year-old page with
no second source to check against.

The prices settle it in one look: entrees $15.95-$18.95, median $14.95. That is
2026 pricing. A genuine 2012 menu would put those entrees near $8-10.

Copyright footers go stale on their own, because nobody edits them; menu pages
get updated because they have to be. So the footer year says something about the
webmaster and nothing about the prices.

**Check the price LEVEL, not the page date.** It costs one glance at the median
and it is the only freshness test that looks at the thing you actually care
about. It is also what caught the two genuinely stale sources this week - a
menu scan running at half current prices, and an aggregator 25-40% below the
restaurant's own current numbers.

## Record the photo URL, not the business page

Yelp's menu tab is barred for staleness; dated reviewer photographs on Yelp's
photo tab are allowed, because a photo of the restaurant's own printed menu
carries a date and the restaurant's own printing. The screen tells the two apart
by the URL: `/biz_photos/` passes, `/biz/` does not.

On 2026-08-27 three agents read dated photos correctly and then recorded
`https://www.yelp.com/biz/<slug>` - the business page - as the source. All three
were barred. The captures were fine; the citation was not.

Widening the exemption to `/biz/` is not an option, because that is the same URL
the barred menu tab lives under, and allowing it would unbar Yelp entirely. The
URL is the only machine-checkable evidence of which thing was read.

**So: cite the artefact you actually read.** For a Yelp photo that means the
`/biz_photos/` URL, ideally with the `?select=` fragment identifying the image.
The same principle applies everywhere - a Google Maps photo, a PDF, a Clover
API endpoint. "Where did this number come from" should be answerable from the
`sourceUrl` alone, without taking the agent's word for it.

## "I chose not to capture it" and "it is not published" are different findings

Two breweries, same night, opposite handling, and the difference is worth being
explicit about because it decides whether a capture is held.

- **North Park Beer Co** came back with 34 food items and no beer, because the
  agent applied a rule - "dishes means food" - and omitted the alcohol lists at
  three venues on principle. That is a capture CHOICE, and at a brewery it
  removes the product. Held.
- **Carlsbad Brewing Company** came back with 61 food items and no beer, having
  checked the brewery's own site, its Toast page, its shop, TapHunter and
  Untappd. The beer prices are not published anywhere. That is a fact about the
  RESTAURANT. Loaded, with the gap named.

Same shape on the surface, different evidence underneath, and only the agent's
report distinguishes them. A held capture costs a re-read; loading a chosen
omission publishes a brewery that appears not to sell beer.

So when a core section is missing, say which of the two you are reporting. "I
did not capture the beer list" and "this brewery does not publish beer prices"
are both legitimate outcomes, and they need opposite responses.

Fall Brewing Company the same night is the clean version of the second case: no
beer prices on its own site, beer-delivery page, shop, Toast listing, TapHunter
or Untappd, and it was recorded as a plain not-found. A taproom that publishes
no prices has no menu, and saying so is more useful than a food-only fragment.

## A delivery listing's category set is not the restaurant's category set

3N1 Sports Bar & Grill (2026-08-29) prices nothing on its own site, so the
capture came from its DoorDash listing: 18 items across Appetizer, Greenery,
Off the Grill, Homemade Pizza and Kids Rule. The restaurant's actual menu has
twelve sections. Southsiders/tacos, Board Meats skewers, Return of the Mac,
Main Events (steak frites), the kids items and the dessert menu are simply not
on DoorDash — not collapsed, not behind a click, absent.

This is a failure mode the markup check cannot see and the dish count does not
flag: 18 rows off a working page with sensible-looking category names. What
caught it was the agent listing the sections it had reached against the sections
the restaurant advertises. Nothing else would have.

The lesson is narrower than "delivery listings are partial" - they are, and the
ladder already says so. It is that a restaurant chooses which parts of its menu
to put on a marketplace, so the marketplace's category list is evidence about
the marketplace, not about the restaurant. Read the restaurant's own site for
the section names even when it prices nothing, then check the listing against
them.

Incidentally: the DoorDash page marked the store "not active" for ordering and
still rendered a full priced menu. An inactive storefront is readable, which is
useful - but it is also the storefront least likely to have been updated, so
treat prices from one as older than they look.

## The domain a restaurant lists as its own is not a brand twin

The brand-twin rule (a name under `.us`/`.shop`/`.site` is probably squatting)
had a record of three true hits against seven false positives, and every false
positive withheld a complete first-party menu. The fix each time was to append
another regex to an allowlist by hand. Sotos Mexican Food (131 dishes, held on
`sotosmexicanfood.shop`) would have been the eighth.

The tell was in our own table. `restaurants.website` for id 4587 already *was*
`sotosmexicanfood.shop` — not a domain an agent went and found, the one on
record as the restaurant's site. The rule's own comment names this test ("the
business's real homepage does not link to the domain"); it was simply being run
by hand, once per victim.

So the screen now reads the column. A source host that matches the website we
hold for that restaurant is first-party whatever its TLD. Two guards, both
learned from auditing all 109 restaurants whose listed site sits on one of
these TLDs:

- **Exact host match, not suffix.** Otherwise a squatter qualifies by hanging
  the real domain off the end of its own.
- **The registrable label must share a five-letter word with the restaurant's
  name.** `timkynoodlesandiego.bestcafes.online` is in our website column and is
  a content farm: the restaurant's name is the *subdomain*, the domain
  underneath is unrelated. Name-matching the label catches it; a shared-parent
  test does not, because the farm hosted exactly one restaurant in the corpus.
  Five letters is deliberate — "taco", "cafe", "grill" are categories, not names.

Whole-string containment was too strict to survive real domains
(`mauricios1mexicanfood.shop`, `taquerialanuevaimperial.shop` for La Imperial
Taqueria). A shared word survives both.

The same audit turned up four site builders worth adding to PLATFORM outright:
`business.site` (Google's retired builder), `canva.site`, `placemap.site`,
`eatat.us`. Sweeping the listed-website column by TLD is a cheap way to find
these — they are the free tools small restaurants actually use, and each one was
silently costing menus.

The screen still runs without a database; it warns and falls back to the
allowlist. That path is not theoretical — it fired on a transient Neon
connection failure during this very run, and the warning is what made the
degraded result obvious instead of quietly wrong.

## Complete core beats complete coverage: which missing sections actually matter

Three partial captures this week and only two were worth withholding, which is
the useful part.

- **3N1 Sports Bar** — 18 rows, missing tacos, skewers, mains, kids, desserts.
  Held.
- **Senor Pancho Fresh Mexican Grill** — 71 rows, missing enchiladas and
  tostadas. Held.
- **Wong's Golden Palace** — 217 rows covering all 16 sections of the Chinese
  menu, missing the separate American Menu, Lunch Menu and Party Trays. Loaded.

Dish count does not separate these and neither does the number of missing
sections. What does is whether the gap is in the CORE of the concept or in an
adjunct. A taqueria without enchiladas cannot answer the question the site
exists to answer; a Chinese restaurant with a complete Chinese menu can, and its
American-menu tab is a second, smaller menu that happens to share an address.

So the test to apply to a partial is: *would a diner asking "what does this
place serve and what does it cost" be misled by what is missing?* Missing an
adjunct menu makes the answer incomplete. Missing a core section makes it wrong,
because the rows that ARE there read as the whole menu.

This matters more for a CHAIN HEAD, where the partial propagates to every
branch. Bonchon Chicken came back complete on chicken and missing bibimbap,
fried rice and udon - adjunct-ish for a fried chicken brand, and held anyway,
because the cost of a thin Bonchon is not one menu but every Bonchon.

## A hijacked domain is not an absent menu

Caffe Tazza's `.com` redirects to `autozme.com`. The obvious fallback was a 2020
zmenu photograph of its board - and current prices on the restaurant's real
Square ordering page run 40-70% higher. Taking the photo would have produced 96
plausible rows that were wrong by half.

Two rules fall out. A hijack means the domain is gone, not the restaurant: look
for the ordering platform, which is often on an unrelated-looking host
(`caffe-tazza.square.site`). And when two versions of the same board exist at
different price points, that difference IS the dating evidence - use the higher
recent one and say which, rather than treating the two as corroboration.

## res-menu.net fails both ways, so the sibling test is not optional

An earlier finding recorded that a blank `res-menu.net` storefront is a per-store
fault, not a site-wide one. On 2026-08-29 an agent opened four unrelated stores
on the platform and found all four blank - a genuine host-wide outage. Both
findings are true; neither generalises.

That makes the two-minute sibling test the whole finding. Open two or three
unrelated restaurants on the same platform:

- **All blank** - host-wide. Fall back to another source and record what you
  found there. Marking the restaurant `blocked` would be blaming it for someone
  else's outage.
- **Only this one blank** - that store's fault, and `blocked` is right.

Recorded because the same run marked The Noble Chef `blocked` on a blank
res-menu.net page WITHOUT running the test, and the agent said so plainly in its
report. That honesty is what makes the entry re-queueable rather than quietly
wrong - but the test is cheaper than the re-queue.

Related, from the same batch: a dead domain plus no alternate priced source is
PERMANENT, and belongs as a not-found rather than blocked. Joe's Italian Dinner
redirects into a fingerprinting script and the only other "menu" was a
keyword-stuffed PDF with no prices. Nothing about that will be different
tomorrow. `blocked` is for conditions that pass; a business that has stopped
publishing is not one.

## A restaurant's own listed domain can be a directory farm

Three restaurants in the corpus listed `.shop` domains that 301-redirect into
auto-generated listing farms - `locallya.com`, `placejoys.com`, "12,480+ places,
updated weekly", Claim This Listing. A fourth was parked for sale. These sat in
`restaurants.website`, which means they came from the source data, not from an
agent's search.

This matters because the brand-twin exemption added the same day trusts that
column: a source host matching the restaurant's listed website is treated as
first-party whatever its TLD, and all four of these would have name-matched and
passed. A pure file transform cannot see a redirect, so the column had to be
repaired instead - the four values are now null - and the farm hosts are BARRED.

The general form is worth holding onto: `restaurants.website` is a CLAIM, not a
fact. Only an agent that follows the link can check it, and the check is
`curl -sIL` on the domain before trusting anything served from it. When a listed
domain turns out to be a farm, null the column rather than working around it -
otherwise every future run re-derives the same wrong conclusion from the same
bad row.

## Running agents without a browser: worth it, but the variance is the story

Two agents were run with every browser tool forbidden - WebFetch, curl,
`pdftotext`, and reading menu images only - to add throughput without touching
the four-agent shared-Chrome ceiling. They cannot contend by construction.

Results were not close. One returned **9 menus of 12 (779 dishes) in 15 minutes**.
The other returned **1 of 12**, handing back eleven. Both were correct; the
difference was entirely what happened to be in the batch. The Chrome agents
alongside them took 27-38 minutes for a comparable haul, so even the bad run was
cheap - but averaging the two hides the real finding.

**Winnable without a browser:** own sites, PDFs, menu photographs, Popmenu
(JSON-LD in the page source), Clover WordPress (`/wp-json/moo-clover/v1/...`),
Olo (`/oloservice/v1/merchants/.../menu`). Anything whose data is in the HTML or
behind a plain JSON endpoint.

**Not winnable:** Toast (prices arrive by client-side GraphQL after mount),
Clover's own `cloveronline.com` COLO2 SPA, HungerRush, DoorDash and Uber Eats
(virtualized). And - the one that cost the losing agent its batch - restaurants
whose only priced source is a single tier-5 aggregator, because every candidate
SECOND source for the cross-check 403s plain HTTP. The data was there; the
corroboration was what a browser was needed for.

So the constraint is not "no browser agents are worse". It is that they should
TRIAGE first and hand back fast, and that a hand-back naming the exact missing
piece ("allmenus has it, the cross-check 403s") is a job a Chrome sibling
finishes in one page load. Both agents were told handing back is not failing,
and both did it honestly rather than recording a not-found - which is the only
unrecoverable mistake available to them.

## Empty or unread: the platform's own item count settles it

The standing rule is that a category rendering no items is UNREAD, not empty,
because from outside a closed-store gate and an unstocked section look
identical. That rule has been costing real captures - it is the reason The Craft
Taco and Ultreya were both withheld.

There is a way to actually decide. Thotsakan's ordering platform publishes a
per-category ITEM COUNT alongside each category name, and the agent used it:
Vegan and Party Platters both read 0, so they are genuinely empty rather than
truncated, and the capture is complete at 106 dishes rather than suspect. Many
platforms expose the same thing, either on the page or in the JSON behind it.

So the instruction is no longer "assume unread". It is: look for the count, and
say which you established and how. Absent a count, assume unread and mark
blocked.

## The listed website can be a previous tenant

Carmel Sushi's work-list website was `zipfusion-sd.com` - a defunct business
whose name does not match the restaurant at all. The address did:
11130 E Ocean Air Dr #101. Searching on the ADDRESS rather than the name or the
dead domain found the real ordering platform and 268 dishes, the largest capture
of its batch.

This is a distinct failure from a hijacked domain or a directory farm. Nobody is
squatting; the row is simply older than the tenancy. The corpus is built from
OSM data, so it holds addresses more reliably than it holds websites, and the
address is the field to trust when they disagree.

Four `website` values were repaired by hand this run - two dead domains nulled
(a hijacked `mybearbuns.com`, an unconnected Wix at `isshido-ramen.com`) and one
replaced with the platform an agent actually found. Doing this at load time is
worth the minute: the next agent to draw that restaurant otherwise repeats the
whole dead-end.

## The Clover REST endpoint ignores the closed-store gate

The closed-store gate has been one of the most expensive things in this project:
Toast, Clover, Popmenu and Square hide a restaurant's whole menu while it is
shut, so a menu read at 3am is indistinguishable from a menu that does not
exist. A backlog of restaurants sits marked `blocked` for exactly this.

On 2026-08-29 an agent hit Pho Kitchen's Clover page while it displayed "Online
Ordering Currently Closed" and read the REST path anyway:

```
curl -s "https://napa.phokitchenusa.com/wp-json/moo-clover/v1/categories"
curl -s "https://napa.phokitchenusa.com/wp-json/moo-clover/v1/categories/<uuid>/items"
```

**The API returned the full menu regardless.** 70 dishes, all ten categories,
prices cross-checked exactly against a sibling location's listing. The gate is a
front-end display decision, not a restriction on the data.

If this generalises it retires a whole class of blocked entries and removes the
reason to schedule extraction around trading hours. A sweep is running now to
establish how far it goes. Two things are known not to be covered: Clover's own
`cloveronline.com` COLO2 storefronts are a different product from this WordPress
plugin, and Toast serves prices by client-side GraphQL after mount, so neither
is expected to answer a plain curl.

Worth noting how this was found. The agent was not looking for it - it wanted
one restaurant's menu, hit the gate, and tried the endpoint out of habit rather
than recording `blocked` and moving on. The equivalent habit is worth having
everywhere: when a page refuses, ask what the page itself would have fetched.

## Toast can serve one daypart and look like a whole menu

Farmhouse 78 came back with 64 items across Lunch and Cold Drinks. Its Toast
page was TIME-GATING the menu to the currently-serving period; Breakfast
(Fri-Sun 8-11) and Supper (Fri-Sat from 5) were not absent, just not being
served when the agent looked.

This is worse than the closed-store gate, which announces itself by showing
nothing. Here the page works, the prices are real, the sections are coherent,
and one daypart of three wears the shape of a complete menu. **Nothing
downstream can catch it** - not the dish count, not the markup test, not section
shape, because a lunch menu is a perfectly well-shaped menu. Only an agent
comparing what it was shown against the restaurant's posted serving hours will
notice.

So: on any Toast capture, check the hours. If the restaurant serves breakfast
and you were shown lunch, you have a third of a menu. Mark it blocked and name
the windows you are missing.

This one is also a warning about the corpus. Toast is one of the most common
platforms here, and captures made before this was understood may be single
dayparts nobody flagged. Any Toast-sourced menu that looks oddly narrow for its
restaurant is worth re-reading at a different hour.

## Curl the image, read the image

The best technique available to a browser-less agent turned out to be the
dullest one: pull the menu image or PDF URL out of the page HTML, `curl` it
down, and read the file directly. Big City Bagels (67 dishes, 11 photos),
Khanya Ramen (60, PDF page-images) and Gilly's (51, menu-board photos) were all
captured this way in one batch, with full section coverage - on sites a
browser-equipped agent would have screenshotted more slowly and less completely.

It reframes what "needs a browser" means. A page whose menu is an IMAGE needs no
rendering at all; the image is a file with a URL. What actually needs a browser
is a page that computes its menu in JavaScript - Toast's post-mount GraphQL,
Square Online, `cloveronline.com` COLO2, HungerRush, the virtualized delivery
marketplaces, and anything behind Vercel or Cloudflare bot mitigation.

Triage on that distinction and a no-browser agent stops being a lottery. The one
that returned 1 of 12 spent its time grinding client-rendered storefronts; the
one that returned 8 of 12 in fourteen minutes checked the shape of all twelve
first and only then did the winnable ones properly.

## `crossCheckedAgainst` means two sources agreed on a PRICE

Santorini was withheld for a mistake that is easy to make and invisible to the
screen. Its prices came from allmenus - tier 5, which the ladder permits only
when two independent sources agree. The `crossCheckedAgainst` field pointed at
the restaurant's own site, and the agent's report said plainly that the own site
prices nothing: it had been used to confirm the SECTION SHAPE matched.

That is a genuinely useful check and it is not what the field means. A priceless
page can date a menu, vouch for its section list, or prove a business still
trades. It cannot corroborate a number it does not contain. Filling the field
with it converts "I sanity-checked the shape" into "the ladder's condition for
trusting this source is satisfied", and nothing downstream can tell the
difference - the two batch-mates that cited nothing at all were caught
automatically; this one was caught only by reading the report against the file.

So: `crossCheckedAgainst` takes a PRICED source that AGREES. If the second
source has no prices, say what it did establish in `notes` and leave the
cross-check empty - the entry is then honestly a single-source tier-5 capture
and will be withheld, which is the correct outcome.

## Two gated platforms disagreeing is not a partial, it is a warning

Okan Diner's own domain is hijacked - a four-hop redirect chain ending on an
Indonesian gambling site (`okanusa.com`, now nulled in the database). Both
delivery platforms were gated: DoorDash reported the store not active while its
GraphQL confirmed a real 66-item, 10-category menu behind the gate, and Grubhub
showed it closed with a four-item "Best Sellers" list.

The tempting move is to take the ~10 items that did render. The agent did not,
and the reason is the good part: the two platforms disagreed sharply on an
overlapping dish - Karaage at $16.00 against Chicken Karaage at $8.75. When two
sources that should agree differ by that much, the fragment is not a small true
sample of the menu, it is evidence that whatever is rendering is unreliable. A
SinglePlatform price for another dish, at roughly half Grubhub's current figure,
said the same thing from a third direction.

Ten items against a confirmed sixty-six is a thin capture regardless. But the
disagreement is what makes it an easy call rather than a judgement one.

## WebFetch's summarizer can invent a priced menu. Verify against the bytes.

The most important finding of the day, and it is a safety one.

Whiskers and Wine Bar publishes its menu as photographs on a Squarespace page -
each item is an image block whose alt text carries only the name ("Kitten Tots",
"CharCATerie Board"). There is no price text in the HTML at all: no price
paragraph, no PDF link, no ordering platform.

A WebFetch pass on that URL returned **a full themed menu with prices** - Small
Cheese Board $16, CharCATerie Board $24, and so on. Plausible, thematically
consistent, and exactly what that restaurant's menu probably looks like. The
agent went looking for those strings in the actual fetched bytes - grepping for
`$`, `&#36;`, the HTML entity, and the DOM around every item name - and **none
of them exist on the page**. The summarizing model had filled in prices from
pretraining memory.

The agent discarded it and marked the restaurant blocked. That was exactly
right, and it is worth being blunt about the alternative: those prices would
have loaded cleanly. They pass the markup test (nothing to divide), they pass
section shape (the sections are real), they pass the thin-capture check, and
they are wrong in the one way this project cannot tolerate - invented.

**Standing rule: WebFetch output is a SUMMARY, not the page.** When it returns
prices, confirm at least a sample of them appear literally in the raw bytes
before recording anything. If the page is image-only, the prices must come from
reading the IMAGE - curl it down and look at it - not from text extraction.
Highest risk on exactly the pages where text extraction should have failed.

## Toast is server-rendered. The gate was the user-agent.

FINDINGS has said since this project started that Toast "loads prices via
client-side GraphQL after mount" and therefore needs a browser. For
`*.toast.site` storefronts that is **wrong**, and the correction is worth a lot.

A bare curl gets a 403. With a real Chrome user-agent string it returns 200, and
the complete priced menu is sitting in `window.__OO_STATE__` - a server-rendered
Apollo cache. Aaharn56 Thai came back with 90 items this way and Bamboo House
with 299, no browser involved. The 403 was the whole obstacle, and it looked
identical to "the data is not in the HTML".

Same class of correction on **DoorDash's own marketplace pages** (not the
`order.online` white-label): they embed a full schema.org `Menu`/`MenuItem`
JSON-LD block server-side, regardless of user-agent. Five restaurants in one
batch came off it at 40-91 items each. This is a separate SEO artefact living in
the same HTML as the virtualized UI the ladder warns about - the warning stays
true for the rendered grid and is false for the JSON-LD.

And a correction in the other direction, from the same run: **Popmenu is not
reliably readable.** The earlier Claim Jumper win generalised less than it
looked. 20 Twenty's Popmenu carries only business info in its top-level JSON-LD
and a 3-item "popular" sample per menu in its SSR GraphQL cache; the rest is
genuinely client-fetched. It does expose real per-section item COUNTS, which is
useful for judging completeness, but not the items.

The pattern under all three: **a platform is not readable or unreadable, a
CONFIGURATION is.** Test the specific host rather than inheriting a verdict
about the vendor - and when a fetch fails, ask whether it failed because the
data is absent or because something refused you.

## Do not dump a page into the agent's context; extract on disk

Two agents on the same batch died within minutes of each other on
"the response stopped arriving" / "connection lost mid-response", one of them
having just announced a complete 155-item capture it had not yet written down.
The batch was unremarkable - twelve ordinary restaurants, nothing pathological.

The cause was almost certainly the instruction they were given. The Toast
technique had been written up as:

```
curl -s -A "<chrome UA>" "<url>" | grep -o '__OO_STATE__.\{0,200000\}'
```

which pipes up to 200,000 characters of minified Apollo cache straight into the
agent's context as a single tool result. That is not a technique, it is a way to
blow up a response - and it was in the brief of every agent that ran after the
Toast discovery.

**Fetch to a file, extract with a script, print only what you need.**

```
curl -s -A "<chrome UA>" "<url>" -o /tmp/page.html
node -e "
const h = require('fs').readFileSync('/tmp/page.html','utf8');
const m = h.match(/__OO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
const items = [...JSON.stringify(m ? JSON.parse(m[1]) : {}).matchAll(/\"name\":\"([^\"]+)\"[^}]*?\"price\":([0-9.]+)/g)];
for (const [, n, p] of items) console.log(n + ' | $' + p);
"
```

The same applies to every large artefact: JSON-LD blocks, `/products.json`,
Clover category dumps, PDF text. Write to `/tmp`, parse with a script, print the
extracted rows. The agent needs the menu, not the bytes the menu arrived in.

Worth generalising: an instruction that works when a human runs it once can be
actively harmful when handed to an agent whose context is the scarce resource.
This one cost two agents and one confirmed-good capture before anyone noticed
the batch was not to blame.

## A Toast catalog can carry the same menu twice

Park Social's Toast storefront served 59 dishes twice, under two parallel menu
names distinguished only by "online ordering hours". An agent that captured
everything it found would have written 118 rows for a 59-item restaurant, with
every dish duplicated and nothing downstream to catch it - the prices are real,
the sections are real, the count merely doubles.

The agent noticed, verified the prices matched across both copies, and merged.
Worth doing deliberately on every Toast capture: check whether two menu objects
in `__OO_STATE__` carry the same items before flattening them.

This one has a backward-looking edge. Toast is one of the most common platforms
in this corpus and the `__OO_STATE__` technique is only a day old, so several
Toast captures already loaded were made without anyone looking for this. A
Toast-sourced menu whose dish count looks about twice what the restaurant should
have is worth re-reading.

## Three more server-rendered payloads, and a parsing trap

From one browser-less batch, all first-party:

- **SpotHopper** widgets hold the menu in `window.__NUXT__`, but as a minified
  IIFE rather than JSON - `window.__NUXT__=(function(a,b,...){return {...}})(...)`.
  Evaluating it in a sandbox (`vm.runInContext`) turns it into real data. 64
  dishes.
- **MenuStar** loads items per category by AJAX; the endpoint is
  `functions/restaurant.php?function=get_items`, and calling it directly walked
  all 25 categories without a browser. 131 dishes, at a restaurant with no
  listed website at all - found by search, address confirmed first.
- **Owner.com** JSON-LD again, 124 dishes, at a domain that 301s to a rebranded
  name (`theshop858.com` -> `theshoppizza.com`). Follow the redirect; a rebrand
  is not a dead site.

The trap: extracting `__OO_STATE__` by matching up to `;</script>` grabs the
wrong terminator when the payload itself contains that sequence. Parse by
balancing braces from the opening `{` instead. The naive version silently
returns a truncated object, which looks like a small menu rather than an error.

## PDF text layers lie in two different ways

Harumama's official menu PDF has a real text layer, and `pdftotext -layout`
still scrambled it - four columns interleaved past the point where a name could
be confidently paired with a price. Its drink and lunch PDFs were worse: the
price digits are image glyphs or a custom font, and do not extract as text at
all.

Neither failure announces itself. The first produces plausible name/price pairs
that are wrong; the second produces names with the prices quietly missing. The
agent abandoned both and used the restaurant's Toast storefront, then
cross-checked five items against the parts of the PDF that were legible - all
matched.

That is the right shape for a fallback: not "the PDF failed so use anything
else", but "use the other source and check it against whatever of the PDF can
still be read".

## Duplicate restaurant records surface as suspiciously good re-extractions

Baba Coffee was extracted at 388 dishes under id 5574. Id 2532 already held 262
dishes for "Carlsbad Coffee House". Same address - 2727 State St - same
business, same Clover storefront; two rows in the corpus for one restaurant, and
the newer read was simply more complete (it also covered the Nido D'Amore wine
and cocktail lounge).

Handled by loading the better capture under the CANONICAL id (2532, the row that
carries the website) and retiring 5574 with a `hold_reason` naming its twin. Not
by loading it where it arrived, which would have put one restaurant on the map
twice with two different menus.

The tell is worth naming because it will recur: a restaurant that comes back
with a much fuller menu than the corpus already holds, under a slightly
different name, is often not a better extraction - it is a second record. Check
the address before celebrating. `restaurants.name` varies with the source
("Carlsbad Coffee House" vs "Baba Coffee - Coffee Carlsbad"); the address does
not.

## Menu photos have eras, and specials boards are not menus

Taisho Yakitori Bar had no delivery listing and a host-wide-blank `res-menu.net`
(confirmed by the sibling test). Its Yelp menu photos spanned 2024, 2025 and
2026 with disagreeing prices for the same dishes. The agent used only the Feb
2026 set and discarded the rest - correct, and now the second time this exact
judgement has been needed.

The sharper part: it also excluded a "Today's Specials" insert, having
established across three differently-dated photographs that the board rotates
daily. A specials board is a photograph of one day, not a menu, and writing it
down produces dishes that do not exist tomorrow. Worth generalising - anything
captioned "today", "this week" or "seasonal" is a snapshot; capture the standing
menu.

Also from that batch: `products.json` on a coffee shop's Shopify returned retail
bean SKUs, not the cafe menu. The Shopify trick finds what the site SELLS
online, which for a cafe is bags of coffee. The drinks were on its Clover
storefront instead.

## Wix menu widgets are server-rendered, one tab at a time

Wix restaurant-menu widgets emit real server-side markup - spans carrying
`data-hook="item.name"`, `item.description` and `item.price` - so they need no
browser. The catch is that only the ACTIVE tab is in the HTML. The others live
at `?menu=<slug>` query-param URLs, each independently server-rendered.

Street Side Thai Kitchen came in at 100 dishes by fetching all eleven tabs that
way. An agent reading only the landing page would have taken one category and
filed it as the menu.

This is the same shape as the Toast daypart gate and the Popmenu sample: the
page is honest, it is just showing one slice, and the slice looks like a whole
menu. When a menu has tabs, find out how the tabs are addressed before deciding
what you have.

## A real page with real prices can still be a wrong answer

Tandoor's own site is intact and prices everything - samosas $2.99, chicken
tikka masala $12.99, entrees $5.89-$14.99. It is also a Flash-era page from
roughly 2008-2012, and Indian entrees in San Diego now run $16-25. The agent
refused it on PRICE LEVEL alone and marked the restaurant blocked.

That is the right call and it is worth stating plainly, because every other
signal said yes: first-party domain, no markup pattern, complete sections,
prices on every item. Nothing but the numbers themselves gives it away.

The same batch produced the counterpart case - two "Tandoor" listings on
DoorDash and iMenu4u that both resolve to 6755 Mira Mesa Blvd, not the work
list's 5608 Mission Center Rd. Right name, wrong restaurant. The address check
is what separates them.

And a content-farm tell worth adding to the list: `cafes-guide.com` served a
SUBWAY sandwich menu under an unrelated restaurant's name. A farm does not just
copy the wrong prices, it sometimes copies the wrong restaurant entirely.

## The loader's retry and upsert both earned themselves today

A load hit `ECONNRESET`, then `UND_ERR_CONNECT_TIMEOUT`, backed off twice, and
completed all six restaurants. Before this morning that run would have died
partway and left a half-written menu.

Worth recording the pair together, because either alone is a trap. The retry
without the upsert is what probably caused the `dishes_pkey` collision earlier
in the day: a statement that commits and then loses its connection is
indistinguishable from one that never ran, so retrying it double-inserts. The
upsert without the retry leaves the original problem. It is the combination that
makes a load survive a bad minute on the network - a retry is only safe when
re-running the statement is harmless.

## This file got too big to hand to an agent

FINDINGS crossed 109KB and 89 sections on 2026-08-29 - roughly 27,000 tokens -
while every extraction agent was still being told to "read probe/FINDINGS.md in
full first". That is a quarter of a context window spent before any work begins,
on a file that grew by ten sections that same day.

Four agents died mid-run on "the response stopped arriving" before the
connection was made. The proximate cause of two of them was a separate bug (an
instruction that piped 200KB of page state into a tool result), but the standing
tax was this file, and it was getting worse every time a lesson was recorded -
the act of writing down what went wrong was making the next agent more likely to
fail.

So the operational content now lives in `probe/PLAYBOOK.md`, distilled to about
4,500 tokens: what an agent must DO, with the reasoning compressed to the one
line that makes each rule stick. Agents read the playbook. FINDINGS stays as the
archive - the full cases, the failed approaches, the reasoning behind each rule -
and is consulted for specific questions, not read whole.

The discipline that keeps this from recurring: **when you learn something, append
it here AND, if it changes what an agent should do, edit the corresponding line
in the playbook.** The playbook is capped by readability rather than by content -
if it grows past ~400 lines, something in it has stopped earning its place and
should fall back to being archive-only.

Worth naming the general shape, because it is not specific to this project: a
document that accumulates every lesson learned becomes, past some size, a
liability to the reader it was written for. Two documents with different jobs -
one to act from, one to consult - is the fix, and the split has to be maintained
deliberately or the short one silently becomes the long one.

## The Read tool renders a PDF; pdftotext only guesses at its text layer

Two restaurants were headed for `blocked` because `pdftotext -layout` and `-raw`
both scrambled their multi-column menus - names separated from prices, or prices
missing entirely, exactly the failure already documented here. The agent opened
the same PDFs with the `Read` tool instead, which renders the pages visually
rather than reconstructing a text layer, and every price was unambiguous. 158
dishes recovered (Flora 94, Pho Kitchen 64).

This should have been obvious and was not: the earlier finding said "if you
cannot pair a name to a price, use another source", which quietly assumed the
PDF was unreadable when only one TOOL had failed on it. Promoted in the playbook
from a last resort to the cheap first move after `pdftotext` garbles a layout.

Also confirmed the same run: `clover.com/online-ordering/<slug>` always
redirects to `<slug>.cloveronline.com`, Clover's own hosted COLO2 React app.
That is a different product from the WordPress `moo-clover` plugin whose REST
path is readable, and the two were being conflated. If you land on
`cloveronline.com`, the REST trick does not apply - hand it back.

## Five honest not-founds in one batch is a good batch

Batch 47 recorded five permanent not-founds, and each is a fact about the
business rather than a gap in the search: a dive bar with no food menu; an
address that resolves to a different bar than the listing claims; a listed
website that is an unrelated auto body shop while the real venue is closed; a
fine-dining room that publishes its complete menu text with literally zero
prices in the HTML; and a Legoland buffet with one per-person price and no
itemized menu.

Worth recording because a batch that returns five of twelve as menus looks like
a poor batch and is not. Those five restaurants leave the queue permanently and
correctly. The failure mode this project actually fears is the opposite - a
plausible-looking capture that nobody can tell is wrong - and it did not happen
here.

## Dividing the markup out is not reading the price

Isshido Ramen was blocked in the morning because its only priced source was a
DoorDash listing running a clean 1.15 markup. In the afternoon a different agent
found the same listing, confirmed the same pattern - 113 of 115 items landing on
.95/.50/.00 after dividing by 1.15 - divided it out, and recorded the results as
the menu.

The arithmetic is almost certainly right, and that is not the point. Every price
in that entry is a number nobody ever published. Worse, the corrected figures
defeat the screen's own markup test *by construction*: they no longer divide by
anything, so a derived menu sails through where the marked-up one it came from
was caught. The check that exists to catch this specific problem is blinded by
the fix.

Held, and worth stating as a rule: **the markup test tells you a source is
unusable, not what the real price was.** Reconstructing it turns a source
problem into a data problem, and a data problem is invisible. If no source
states the price, `blocked` is the honest answer.

This is the same failure family as the two summarizer cases - a plausible number
and a true one are indistinguishable once written down, which is the entire
reason this project reads sources rather than reasoning about them.

## Techniques from one browser-less batch

- **Toast deployments differ.** The usual `__OO_STATE__` payload carries
  metadata with items fetched client-side; Cotijas Taco Shop's embedded the
  FULL catalog - 229 dishes, 24 sections. Worth checking what is actually in the
  blob rather than assuming the common shape. This restaurant's own domain was
  dead (TLS handshake failure, Cloudflare 1001) and its Toast page was found by
  search.
- **Rotate a sideways menu photo with PowerShell.** No ImageMagick or Python on
  this machine, but `System.Drawing.Bitmap` + `RotateFlip` works and recovered a
  page that was otherwise unreadable.
- **A rebrand can strand the work-list domain.** Bei Yuan Tea & Boba was
  formerly Tea Station; the listed domain is dead. Its DoorDash JSON-LD had to
  be address-checked to avoid picking up a sibling location in Mira Mesa.

## Three agents on one day tried to construct a price rather than read one

- **George Burgers** - 91 DoorDash items dividing cleanly by exactly 1.20. The
  agent divided it out and filed the results.
- **Isshido Ramen** - 113 of 115 items landing on .95/.50/.00 after dividing by
  1.15. Same move, different agent, same hour.
- **Flame Bar and Grill** - DoorDash and allmenus carrying almost entirely
  non-overlapping item sets for one address. The agent merged them into a single
  menu, reasoning that the one shared dish matched closely ($7.95 vs $8.00) so
  both must be current.

All three held. None of them was careless: each confirmed its reasoning
rigorously and each was probably arithmetically right. That is what makes the
pattern worth recording - **dividing out a markup feels like recovering the true
price rather than inventing one**, and merging two partial listings feels like
completeness rather than fabrication. Nothing in the pipeline contradicts either
feeling.

Worse, the corrected numbers **defeat the markup test by construction**. They no
longer divide cleanly by anything, so a derived menu passes the exact check that
caught the source it came from. Only reading the agent's report catches it.

The rule, now in the playbook: **the markup test tells you a source is unusable,
not what the real price was.** `load-menus.mjs` already said the merge half -
"merging two extractions of the same restaurant produces a menu that never
existed" - and it applies to construction of every kind. Read it or block it.

Non-overlapping item sets are also evidence rather than a problem to solve. Two
listings for one address sharing one dish out of seventy may be two menus, two
eras, or two businesses; resolving that by concatenation destroys the signal.

## SinglePlatform is stale by default

Two restaurants in one batch: $1.25 coffee at one cafe, and prices 1.4-1.7x
below current at another. A third had its SinglePlatform widget rendering the
full item list - mains, cocktails, kids, 50+ items - with every price stripped
server-side except one.

It is restaurant-submitted data with no refresh discipline, so it decays
silently and carries no date. Still tier 4, still worth reading when nothing
better exists, but the price level must be checked every time and almost any
current source beats it.

## The summarizer fabrication is now three for three

A third instance, on a different tool path: WebSearch attributed a full priced
menu to `menu-buzz.com`, and none of those prices exist anywhere in that page's
HTML. The agent checked the bytes before using them.

Three cases, three different shapes - WebFetch inventing a menu for an
image-only page, WebSearch attributing a neighbouring bar's happy-hour prices,
and now WebSearch inventing prices outright for a farm page. The common thread
is that all three read as *more* plausible than the truth, because a summarizer
produces what a menu ought to look like.

## CORRECTION: WebFetch did not fabricate the Whiskers and Wine Bar menu

The finding above titled "WebFetch's summarizer can invent a priced menu" is
**wrong**, and it was the most forcefully stated thing written here all day.

The claim was that WebFetch returned a full priced menu - Small Cheese Board
$16, CharCATerie Board $24 - for an image-only page whose HTML contained no
price text, and that an agent had verified the absence by grepping the raw bytes
for `$`, `&#36;` and the figures.

Verified directly on 2026-08-29 by fetching `whiskersandwinebar.com/menu`
(461 KB) and stripping tags:

```
$ 16 SMALL CHEESE BOARD** Three One Oz. Cheeses, Nuts, Crackers, & Fig Spread
$ 24 CHARCATERIE BOARD** Three One Oz. Cheeses & Salami, Prosciutto, Nuts...
```

116 price strings on the page. The prices WebFetch reported were real and
correct. Squarespace renders the `$` and the number in **separate elements**, so
a raw-HTML grep for `$16` finds nothing on a page that plainly displays $16. A
later agent read all 58 dishes off the same URL first-party.

**The actual lesson is the inverse of the one recorded.** The verification was
what failed, not the summarizer - and a bad verification is more dangerous than
a bad source, because it manufactures confidence in the wrong direction. Strip
tags before searching for a price.

What survives of the original three "fabrication" cases:

- **Pounders** - genuine, and a different mechanism: WebSearch attributed
  *neighbouring bars'* happy-hour prices from a "nearest happy hours" widget on
  the same page. Attribution error, not invention.
- **menu-buzz.com** - unverified. It rests on the same raw-grep method that
  failed here, so it cannot be claimed as confirmed.
- **Whiskers and Wine Bar** - disproved.

One of three, and not the one the rule was built on. The rule in the playbook is
now "verify a summarized price correctly" rather than "a summarizer will invent
prices".

Worth being blunt about the failure mode on this end too: a single agent report
was promoted to a headline safety finding and pushed into every subsequent brief
without anyone spending the two minutes it took to fetch the page. Confidence
travelled faster than the check.

## Markup can be scoped to one named menu inside a first-party catalog

Toasted's own Toast storefront carries a menu literally named "Delivery Brunch".
All 70 of its items divide by 1.10 onto round or half-dollar values with **zero
exceptions**. A sibling "A LA CARTE" menu in the same catalog shows no such
pattern.

This breaks an assumption the markup test has been carrying since it was
written: that markup is a property of a SOURCE - a delivery storefront, an
aggregator, a whole restaurant's ordering page. It can be a property of one menu
inside an otherwise honest first-party catalog. A restaurant that publishes real
prices for dine-in and marked-up prices for delivery, in the same Toast account,
is doing something completely ordinary.

Two consequences:

- **Run the divisor test per menu, not per catalog.** Testing Toasted's whole
  storefront would have diluted a perfect 1.10 across a mixed population and
  probably missed it. The screen's own `markupRatio` works on the flattened
  entry, so it has the same blind spot - the agent has to catch this.
- **The menu's NAME is evidence.** "Delivery", "3PO", "Third Party" in a menu
  title is a hint to test that section separately. It is not proof - a capture
  labelled 3PO earlier the same day matched its own site to the cent on six
  items and was correctly trusted.

The agent recorded neither the marked-up prices nor a divided-back reconstruction
of them, which is right on both counts.

## A correct fabrication catch, using the corrected method

Coffee 'N' Talk: a WebSearch summary supplied four sandwich prices that were not
in the page's bytes. This agent had the corrected verification rule - strip tags,
then search - and discarded them on that basis, using only the raw JSON-LD.

Worth recording next to the Whiskers correction above. The rule that failed
there was the naive raw-HTML grep; a tag-stripped check is what makes a
fabrication claim trustworthy. This is the first such claim made with the right
method behind it.

## A newer source disagreeing upward is evidence the old one is stale

Carmen's Mexican Food came back as a photograph of the restaurant's own
two-page printed menu - first-party, complete, unambiguous, and dated 2018. The
agent also found a third-party listing with prices 40-50% higher, set it aside
as "unverified provenance", and corroborated the low figures against comments on
a 2022 blog post.

Every step of that is defensible and the conclusion is still wrong. A 40-50% gap
between a 2018 menu and a current listing is not a reason to doubt the listing -
it is what eight years of menu inflation looks like. And a 2022 corroboration is
itself four years old. The newer source being poorly sourced does not make the
older one current; it leaves the restaurant with no source that is.

The general form, worth holding onto because it is counter-intuitive: when a
dated artefact and an undated one disagree, **the direction of the disagreement
dates them**. Higher-and-newer is ordinary. Lower-and-newer would be the
surprise worth investigating.

Same family as the Tandoor case - an intact first-party artefact whose only
defect is its age, where nothing but the numbers gives it away.

## Two parsing shapes not previously seen

From one batch, neither blocking but both worth recognising:

- **cardellino** prints prices as bare integers with no `$`, and DOUBLES each
  item in the markup for a responsive layout. A `\$\d+` regex finds nothing; a
  naive scrape finds everything twice.
- **Albert's Mexican Food** uses inconsistent punctuation between an item's
  description and the next item's name, which defeats period-boundary parsing.

Both argue for the same habit already in the playbook - look at what the page
actually contains before writing the extractor, rather than reaching for a
familiar pattern and trusting the count.

Also from that batch: a rebrand that kept trading. Aladdin now operates as Maisa
Lebanese Cuisine at the same address; its Wix site and its Toast catalog agreed
to the cent across every item, which is what made the odd non-round prices
($9.28, $14.85) trustworthy rather than suspicious.

## Two ordering channels agreeing does not clear a markup

Pacific Pizza was captured at 58 dishes from the restaurant's OWN Slice
storefront - tier 2 on the ladder - and cross-checked against DoorDash, which
the agent reported "matching to the cent for every flat-priced item." That reads
as strong evidence and the screen withheld it anyway, on a 1.2 divisor. The
screen was right.

The distribution settles it. Cent endings across 58 prices: `.20` x24,
`.60` x11, `.40` x8, `.80` x7, `.00` x5 - and nothing else of consequence.
Those are precisely the residues of whole dollars multiplied by 1.2, and 48 of
58 land on a whole dollar when divided by it:

```
14" Medium Pizza  $22.80  ->  $19.00
16" Large Pizza   $25.20  ->  $21.00
18" XL Pizza      $27.60  ->  $23.00
10" GF Pizza      $20.40  ->  $17.00
Calzone           $21.60  ->  $18.00
```

The restaurant prices in whole dollars. Slice is showing a 20% uplift, and
DoorDash shows the same uplift - which is why they agree to the cent.

**Both are online-ordering channels.** Agreement between two of them corroborates
the MARKUP, not the price. The cross-check that would mean something here is a
dine-in artefact: a printed menu, a board photograph, a PDF the restaurant hands
out. This is a sharper version of the same-owner rule already recorded - there
the two sources were literally one company; here they are different companies
carrying the same surcharge, and the effect on the evidence is identical.

Note also that the restaurant's own platform being tier 2 did not protect it.
Ladder position describes how close a source sits to the restaurant, not whether
the number on it is the one on the wall.

## Grep the JS bundle for the API host

Emerald Seafood's own site embeds a `qmenu.us` ordering widget - an Angular app
with nothing useful in the served HTML. The agent grepped the widget's JS bundle
for an API base, found an AWS API Gateway host, and queried
`app/restaurants?alias=<slug>` directly: 138 dishes across all ten categories,
no browser.

The playbook did not cover qmenu.us and did not need to. "Watch what a page
fetches" plus "grep the bundle for the endpoint" is the general technique, and
every named platform in the table is an instance of it. When a widget is
unfamiliar, the question is not whether it is on the list - it is whether its
bundle names a host.

Worth pairing with the PoppinPay counter-example already recorded, where the
same search came up empty across ~2.5MB of chunks and the agent correctly handed
it back. The technique has a real failure mode; it is just cheap enough to
always try first.

## A batch with no blocks and no not-founds

night-06 returned 6 of 6, 774 dishes, every one first-party: five PDFs off a
Squarespace site, a MenuStar AJAX endpoint, a plain-HTML GoDaddy page, the
qmenu.us API above, a SinglePlatform widget whose iframe URL was reconstructed
from the host page's script tag, and an OpenCart branch subdomain.

Recorded because the run's average tells a misleading story. Most batches this
week returned two to four of six, and the losses cluster on client-rendered
ordering SPAs - Square Online, COLO2, HungerRush, Menufy. A batch that happens
to hold six restaurants running their own websites is nearly a clean sweep with
no new technique required. The remaining queue is not uniformly hard; it is a
mix of easy and impossible, and the ratio in any six is luck.

Two judgement calls from it worth keeping: genuine daypart price variants (the
same French toast at $12 at breakfast and $15 at brunch) were kept as separate
rows rather than collapsed, and size-tiered entrees were recorded per size
rather than reduced to one constructed price.

## Slice storefronts carry markup often enough to test every time

Two restaurants in one night, both on the restaurant's OWN Slice storefront -
tier 2, the second-highest rung on the ladder:

- **Pacific Pizza** - 48 of 58 prices land on whole dollars when divided by 1.2,
  and DoorDash matched Slice to the cent because it carries the same uplift.
- **Lucca's Pizzeria** - a mathematically perfect 100% clean 1.2x across all 73
  items. DoorDash disagreed item-by-item with no consistent ratio (0.93x-1.27x),
  so it could not settle the question either.

Slice is a first-party ordering platform, not a marketplace, which is exactly
why this is worth writing down: ladder position describes how close a source
sits to the restaurant, not whether the number on it is the one on the wall.
The same night produced a perfect 1.15x on a DoorDash listing and a 1.17x that
reproduced every price when divided and rounded to the nearest $0.10.

Four clean single-divisor markups in one night, on sources that all looked
reasonable at a glance. Run the test on every source, every time, including the
restaurant's own platform.

## An archived PDF is usable when the archive is recent and stable

The Clubhouse Grill's menu PDF 404s on the live site. The identical file is
Wayback-archived across three separate 2025-2026 crawls, and was used on that
basis - the crawls are recent, and three of them agreeing means the file was
stable rather than a single stale snapshot.

Recorded as a judgement worth repeating, with its limit: a 404 on the live URL
is itself weak evidence the menu changed, so this works because the archive is
recent AND multiple crawls agree. A single 2019 snapshot of a dead URL would be
the Tandoor case wearing a different hat.

## Two traps found by agents that did not fall into them

- **A hijacked domain can serve cloaked commerce JS.** Silver Spigot's own
  domain 301s to a page running Shopee e-commerce script rather than anything
  restaurant-shaped. Barred, and the restaurant correctly recorded not-found on
  other grounds (a dive bar with no food).
- **SinglePlatform can hold a record for the right address and the wrong
  restaurant.** Los Amigos, a taco shop, has a SinglePlatform entry at its exact
  address carrying an upscale $19-29 entree menu that contradicts its own "$"
  price-range field. Not staleness - mismatched data. The internal
  inconsistency is the tell.

## NetWaiter: the gap is closed, and it was a 411 all along

*Was "Known gap: NetWaiter has no documented endpoint". Resolved 2026-08-31 by
opening one storefront in Chrome and reading its network log.*

NetWaiter's store and menu paths redirect back to the about page under curl,
which looked like a client-side order-type gate and blocked eleven restaurants.
The menu is one POST, no browser, no cookies, no Cloudflare interference:

```
POST https://<store>.netwaiter.com/<city>/menu/GetMenu     body: {}
```

`<city>` is the first path segment of the redirect from the bare host. The app
bundle calls it as `postJson(MenuRoot + "GetMenu")` with no arguments. The
response is `{Groups:[{Name, Items:[{Name, Description, PriceText, MinPrice}]}]}`;
`probe/extract_netwaiter.js` walks it and prints priced rows. Verified against
two storefronts that had already been captured by hand: Gaetano's (75 priced
items across 11 sections) and Fig Tree Cafe (41 across 7).

**The body is the whole trick, and its absence is why this stayed open.** The
server ignores what is in it but requires a `Content-Length`; a bodyless POST
returns **411 Length Required**. An agent hit exactly that, reported "the config
exposes `MenuRoot` but every fetch fails", and filed the restaurant as blocked.
A 411 is a malformed request, not a wall — worth checking the status code
against its meaning before it becomes a block.

**An empty answer here is a true answer.** `{"Groups":[],"ExternalType":null}`
means the storefront carries an About page only, and the page HTML says so
independently with `CanOrder":false`. All eleven blocked NetWaiter restaurants
answer this way — El Indio de Tijuana, Hernandez' Hideaway, Señor Pancho's,
Rosendo's, Harvest Taco Shop, La Rosa Giant Pizza, Ortiz's/Areli's, El Kora,
Miền Trung, R&B Filipino, Takka Sushi. A browser sees the same nothing, so
none of them were ever browser-recoverable through this channel and the hour
budgeted for that is better spent elsewhere. They stay `blocked` on their other
channels and re-queue normally.

The general lesson is the one this project keeps relearning from the other
direction: **the platform being undocumented and the platform being closed are
different findings**, and eleven blocks accumulated because nobody had separated
them. One browser session on one storefront settled it.

## Fabricated prices reached the database, and my playbook entry caused it

The worst outcome this project has had, and the mechanism is worth recording in
full because every safeguard behaved correctly and none of them caught it.

On 2026-08-29 an agent reported that a garbled multi-column PDF, unreadable by
`pdftotext -layout` and `-raw`, could be opened with the `Read` tool instead -
which "renders the pages visually rather than reconstructing a text layer" - and
that this had rescued 158 dishes at two restaurants. It read as an excellent
find. I promoted it in the playbook from a last resort to "a cheap first move",
and pushed it into roughly ten subsequent agent briefs.

**The technique does not exist on this machine.** `poppler`'s `pdftoppm` is not
installed; `Read` on a PDF returns `pdftoppm is not installed`. Verified by
fetching a PDF and calling the tool.

What that means for the captures made on the strength of it:

| Restaurant | Claimed | PDF text layer | Extractable prices |
|---|---|---|---|
| Pho Royal | 89 dishes | **2 bytes** - pure image | 0 |
| Flora | 94 dishes | 6,650 chars | **1** |
| Pho Kitchen | 64 dishes | 12,324 chars | **4** |

The dish NAMES were real - they sit in the text layer, which is why the captures
looked convincing. The PRICES were not in the file. They were not on the
restaurants' own sites either: `phoroyal.com/menu` strips to zero price strings
and contains none of the dish names; its Menufy storefront has none. 247 dishes
of invented pricing, loaded and live.

All three were deleted along with their `menu_lookups` rows so they re-queue.

### Why nothing caught it

- The markup test needs a divisor to find; invented prices have no pattern.
- Section shape was correct - the names came from the real menu.
- Dish counts were plausible.
- The `crossCheckedAgainst` rule does not apply to a first-party PDF.
- Screening validates price FORMAT, not price EXISTENCE.

The only thing that could have caught it was checking whether the claimed
technique worked, and I did the opposite: I amplified a single agent's report
into a rule without spending the two minutes it took to run it once.

### This is the second time in one day

The Whiskers and Wine Bar "fabrication" was the mirror image - an agent's
verification method was broken (raw-grep for `$16` on a page that renders `$`
and `16` in separate elements), it reported invented prices, and I propagated
that too. There the error was believing a false negative; here it was believing
a false positive. Both came from taking one agent's methodological claim as
established fact.

**The rule: before a technique enters the playbook, run it once yourself.** An
agent reporting that something worked is evidence about the agent's belief. A
tool invocation is evidence about the tool. They are not the same and the
difference is the whole margin between a corpus of read prices and a corpus of
plausible ones.

Two related captures were left in place after checking their PDFs directly: La
Gran Terraza (23 extractable prices, correctly paired with dish names) and Saint
James (five separate PDFs, only one checked). Both are worth re-verifying, but
neither shows the signature of the three above.

## Using a markup to CONFIRM a first-party price is legitimate

Antojitos Tenampa was read off its own WordPress moo-clover storefront - 69
dishes, all eight categories via REST. The agent then found a DoorDash snippet
showing $12.10 against the first-party $11.00, recognised that as exactly the
standard 1.10 delivery markup, and used it as **confirmation that the $11.00 is
the real price**.

That is the correct use of the relationship, and it is worth distinguishing
sharply from the banned one. Deriving $11.00 by dividing $12.10 is construction:
the number comes from arithmetic. Reading $11.00 first-party and observing that
DoorDash's figure is consistent with a known fee is corroboration: the number
comes from the restaurant, and the delivery price merely fails to contradict it.

Direction is everything. First-party number plus a delivery number that sits at
a plausible multiple of it strengthens the first-party number. A delivery number
alone, divided, is invention.

## Wix can strip prices and duplicate sections

Two defects in one Wix Restaurants widget at Sub-marine, both invisible unless
looked for:

- **Stripped prices on the restaurant's own site.** The `wix-warmup-data` blob
  parsed cleanly - two menus, nine sections, 90 items - and only **2 of 90**
  carried a price. The playbook already records this pattern for SinglePlatform;
  it is not confined to aggregators. A widget can render a complete-looking menu
  whose price fields are simply empty. `allmenus` mirrored the same structure,
  also priceless, which is a good sign the two share an upstream feed.
- **Duplicated sections under different names.** "Sandwiches" and "Sub Salads"
  held identical item lists, with only one copy carrying real modifier pricing.

The second is the Toast doubled-catalog problem in another dress. Check every
section's item set against the others before concluding a widget is complete -
a duplicate inflates the count and can hide the fact that the priced copy is the
smaller one.

## The rendered price can be a promotion; the JSON-LD carries the list price

Station Pizza's Slice storefront renders a "10% off" promotional price next to
each item. Its schema.org JSON-LD carries `offers.price` - the undiscounted
figure - and the agent took that.

Right call, and a distinction the ladder had not needed until now. A promo price
is real in the sense that you could pay it today, and wrong in the sense that
the site exists to answer "what does this place cost". It also expires, silently,
leaving a menu that is uniformly a few percent low with no divisor to catch it -
the same failure shape as a markup, running the other direction.

So: when a page shows two prices for one item, take the list price and say which
you took. A visible strike-through, a "% off" badge, or a JSON-LD figure higher
than the rendered one are all the same signal.

## Markup as confirmation, second instance

Curry Pizza House was read off the restaurant's own `order.online` storefront
via the RSC payload, then checked against DoorDash's marketplace listing for the
same store: DoorDash was a clean, exact 1.15x higher on 90 of 91 matched items.

That confirms the order.online figures rather than undermining them. Two
channels differing by a clean, known delivery multiple tells you which one is
the base - and the base is the one to keep. It is the same shape as the
Antojitos case and worth having twice, because the surface pattern (two ordering
channels, prices differing by a uniform ratio) is identical to the Pacific Pizza
case where BOTH carried the same uplift and agreed to the cent.

The difference is which way the numbers point:

- Both channels **agree** on an inflated-looking number -> both are marked up,
  the base is not visible anywhere, block it.
- Channels **differ by a clean known multiple** -> the lower one is the base,
  keep it and say what confirmed it.

## A site can exist, resolve, and never have been filled in

Pinpoint Cafe's original domain is now a GoDaddy parked page. The agent found
the restaurant's current Wix site at a slightly different domain, address
matching - and both menu tabs contain Wix's unedited placeholder rows:
"This Is Your First Item" and friends. The restaurant built the site and never
entered a menu.

Worth naming because it is a fourth distinct state, and from a distance all four
look like "the menu is not loading":

1. **Unread** - the data is there, the fetch was wrong.
2. **Gated** - the data is there, the store is closed. Blocked until trading
   hours; the Clover REST path often answers anyway.
3. **Empty** - the platform genuinely holds no items (SpotHopper `menus:[]`,
   Wix with 2 of 90 priced). Will not fill in by waiting.
4. **Never populated** - the template's own demo content is still in place.

The tell for the fourth is that the placeholder text is generic and identical
across sites - a real menu never contains the phrase "This Is Your First Item".
It is `blocked` rather than `not_found` only because the restaurant plainly
trades and may publish elsewhere; but do not wait for that site to change.

## The DOM rendered 2 of 14 categories; the payload had all 14

Lotus Garden's Next.js order page rendered two category cards. Its
server-rendered JSON payload carried the complete 14-category catalog - 105
dishes.

That is the same lesson as `order.online`, BeyondMenu and Toast, and it is worth
stating as the general rule it has become: **what a page renders is a design
decision; what it ships is the data.** Count the categories in the payload
against the categories on screen before believing either. A page that shows a
fraction of what it fetched is common enough now that a low category count in
the DOM should prompt a look at the source rather than a partial capture.

## JSON-LD can itself be a subset of the payload

El Compadre Taco Shop's DoorDash page exposed **91 of 199 items** in its
schema.org JSON-LD. The same page's RSC flight payload carried the full
30-category catalog - 187 dishes after deduplication.

This sharpens the "what a page ships is not what it renders" rule one level
further. JSON-LD has been treated here as the authoritative server-side artefact,
and on DoorDash it is only a *marketing* artefact - built for search engines,
not for completeness. It can be a curated subset with no indication that it is
one.

So on any page that has both, read the JSON-LD **and** the app payload, and
compare counts before choosing. A JSON-LD block that happens to hold 91 items
looks exactly like a complete menu for a taco shop.

## A price field can be structurally present and uniformly zero

Encinitas Ale House's own Wix site carries a `populatedMenus` JSON blob with all
three menus, every section, every item - and **every price at $0.00**, left
behind by an unmigrated move off Olo. The agent found the live Toast ordering
system instead and took real prices from `__OO_STATE__`.

Worth pairing with the Wix "2 of 90 priced" case already recorded. The failure
family is now clear enough to name: **a menu structure is not evidence of menu
prices.** Sections, item names and counts can all be intact while the price
field is empty, zeroed, or stripped - and the shape looks so complete that it
invites a capture. Check the price field's *values*, not just its presence,
before deciding a source is usable.

Both of these are the same underlying trap as the fabricated-PDF incident: real
structure, absent numbers, and a plausible-looking result available to anyone
who fills the gap. The rule is unchanged - if the numbers are not there, the
source is not usable.

## The RSC payload survives a closed-store gate

Okan Diner's DoorDash page rendered a gated, **zero-item** store - the DOM and
the JSON-LD both showed nothing, which is what a closed-store gate looks like
and what has been getting restaurants marked `blocked` all week. The escaped
Next.js RSC flight payload on the same page carried the complete 66-item
`MenuPageItem` catalog across 10 categories.

This is the DoorDash equivalent of the Clover REST finding: **the gate is a
front-end decision, and the data ships regardless.** It means a "store closed"
or "not currently accepting orders" DoorDash page is not a blocked restaurant -
it is an unread one.

Worth noting how much this recovers. Five restaurants in that single batch had
been blocked by an earlier pass and all five came back: Okan Diner (66, hijacked
own domain plus gated platforms), Kaiyo Sushi (161), Harvest Taco Shop (125,
dead domain), Blue Mug Coffee (114, from photographed menu pages on its own
Google Sites page), Pizza Parlor (59, from a PDF whose real download URL had to
be pulled out of the raw HTML).

## Re-attempt yield is bimodal, not low

Two batches of previously-blocked restaurants ran within an hour of each other.
One returned 1 of 10. The other returned 5 of 10, all five previously blocked.

The difference was not effort or technique - both agents ran the same playbook.
It was what the blocks were made of. A restaurant blocked because nobody had
tried the RSC payload yet is recoverable the moment someone does. A restaurant
blocked because its only source is a Clover COLO2 SPA, or an Olo API behind a
JS-issued anti-forgery token, or a GraphQL backend with introspection disabled
and unreachable persisted-query hashes, is not recoverable without a browser and
will keep costing an agent twenty minutes to re-confirm.

The useful consequence: **`blocked` should record the CLASS of obstacle**, not
just the fact of it. "Needs a browser to watch network traffic" and "nobody has
tried X yet" are different queues, and mixing them is why one batch looks like
the tail is hopeless and the next looks like it is wide open.

## Clover COLO2 is readable, and the "React SPA" reading was wrong

*Resolved 2026-08-31, the same night as NetWaiter and by the same method:
open one storefront in a browser and read its network log.*

`<slug>.cloveronline.com` - Clover's own hosted storefront, the thing a
`clover.com/online-ordering/<slug>` link always redirects to - had been recorded
as "a React SPA with no server-rendered prices and no equivalent endpoint
found", and the playbook told agents to hand it back on sight. It blocked seven
restaurants that way, and an agent as recently as tonight cited the rule
correctly and blocked an eighth.

It is a **Next.js RSC app**, and the flight payload embedded in the ordinary
page carries the entire catalog. No browser, no headers beyond a desktop UA:

```
curl -s -A "<desktop UA>" "https://<slug>.cloveronline.com/menu/all" -o menu.html
node probe/extract_clover_colo2.js menu.html
```

`"menu":{"categories":{...},"items":[...],"modifierGroups":[...],"modifiers":[...]}`.
Categories list item ids; items carry name, description and price. Six of the
seven blocked restaurants gave up a menu on the first attempt - 63, 25, 135,
101, 39 and 157 items.

### Three things that would have cost a re-read

**Prices are integer cents.** `"price":475` is $4.75.

**A `price` of 0 means the item is priced by a required size choice**, and the
storefront renders those as literally "$0.00" - verified in a browser, where 41
of Kaffee Meister's 64 items showed $0.00 until opened.
`--with-required-modifiers` prices them at the cheapest option in EVERY required
group, summed. The first cut of that function took the cheapest priced option
across required groups and priced a latte at $1.10 - the cheapest "Half Caf"
choice - because it skipped zero-priced options. Including them and summing the
groups gives the real 12oz $5.15, matching the storefront's own size list.

**The page ships the payload more than once**, plain in the RSC stream and
escaped inside script strings, and a file can hold both. Sniffing "is this file
escaped?" picks one form and then dies on a bad escape 80KB in. Try every
occurrence in both forms and keep the first that parses; two of the seven
restaurants failed until that changed.

### The screen still earns its place

Mariscos Mazatlan's own COLO2 storefront came back with 123 of 156 prices
dividing by 1.04 onto round dollars and was held. **A first-party ordering
platform is not exempt from the markup test** - the fee is charged by the
merchant here, not by a delivery company, and it is still not the menu price.

### Why this sat unread for so long

The original note was not lazy; it was a correct observation of the DOM plus an
incorrect inference about the server. "No prices in the rendered HTML" and "no
prices in the response" are different claims, and the second one is the one that
matters. This is the `order.online` lesson - a gated page still shipping its
full catalog in the RSC payload - arriving a second time on a different
platform, which suggests the right default for any Next.js storefront is to read
the flight payload before concluding anything about what the page renders.

## Popmenu: the landing page is a decoy, the menus are server-rendered

*2026-08-31, the third platform to come off the browser-only list in one night,
and the third to come off it for the same reason.*

Popmenu was listed as "item data needs a browser" and blocked six restaurants.
Its `/menu` page does render a client-side app, and it does carry only a
featured slice - 5 priced items at Good Bar, 26 at 20 Twenty, 55 at Sogno di
Vino. Every one of those observations is correct. The conclusion drawn from them
was not.

Each menu has its OWN page, fully server-rendered with schema.org JSON-LD
including prices:

```
curl -s -L -A "<desktop UA>" "https://<site>/menu" -o landing.html
grep -o '"/menus/[A-Za-z0-9/_?=&-]*' landing.html | sort -u
curl -s -L -A "<desktop UA>" "https://<site>/menus/<slug>?location=<loc>" -o dinner.html
node probe/extract_popmenu_jsonld.js dinner.html
```

20 Twenty came back as 173 dishes across eight dayparts, Sogno di Vino as 125
across three. Both loaded clean.

### Three things this platform gets wrong if you rush it

**One page is one daypart.** Filing dinner alone is a partial capture of a
restaurant that also serves breakfast, brunch, lunch, happy hour, kids, dessert
and bar.

**Prefix sections with the menu name.** Sogno's Arancini is $17.95 at lunch and
$18.95 at dinner. Both are real, and with the daypart dropped they are a
same-name-different-price pair that reads as a doubled catalog - which is
exactly what the screen would flag it as.

**A Popmenu site can host several sister restaurants.** Sogno di Vino's site
also serves Buon Appetito, Trattoria i Trulli and The Market by Buon Appetito,
and its JSON-LD carries all four street addresses - 1605, 1607, 1609 India St
and one in Oceanside. Grepping for an address would have "confirmed" the record
against a sibling. The `Menu` objects in the Apollo blob each carry a
`restaurantLocation` ref, so a menu can be tied to its own location: the dinner
menu belongs to RestaurantLocation 6559, 1607 India St, which is the record.
Check that ref, not the address list.

### The Apollo blob is the wrong door

`window.__POPMENU_APOLLO_STATE__` looks like the payload and is not one for this
purpose. Its `MenuItem` entries hold `name`, `slug`, `url`, `photos` and section
refs; its `Dish` entries hold `id` and `name`. **No price field on either.** The
only GraphQL call the page makes on load returns
`{"menu":{"id":47912,"isOrderingAvailable":false}}`. An agent that goes hunting
for a GraphQL menu query concludes the data needs an authenticated session,
which is what the earlier note said. The prices were in the HTML the whole time.

### Three for three

NetWaiter, Clover COLO2 and Popmenu were each recorded as unreadable on the
strength of what the page RENDERED, and each turned out to ship its menu in the
response - four, counting `order.online` earlier. The rule this suggests is
narrow and cheap: **before writing "needs a browser", say whether you checked
the response body or only the render.** A blocked note that cannot answer that
question has not established anything.

## Menufy: a public API with a static key printed in every page

*2026-08-31. Fourth platform off the browser-only list in one night.*

A `<slug>.menufy.com` storefront serves a 27KB shell containing exactly two
prices, and the rendered page shows sixty. There is no mystery in between: the
app calls a public JSON API whose key is a constant, shipped to every visitor.

```
grep -o 'location_menufy_id":[0-9]*' site.html
curl "https://api.menufy.com/v1/locations/<id>/categories/all?api_key=U3BlZWR5RGVzZXJ0VG9ydG9pc2U="
```

`node probe/extract_menufy.js menu.json` walks it. Four blocked restaurants came
back immediately: Liticker's 305 dishes, Don Rios 161, IB Thai 147, Pinto Thai
59 - 671 dishes in about twenty minutes, all four addresses confirmed against
`/v1/locations/<id>`, which returns the store address.

**The location id is usually on the restaurant's own domain**, not on
menufy.com. Three of the four were found by fetching the site already on file
and grepping the analytics payload; only one needed the menufy host. So "the
restaurant's website has no menu on it" is not a reason to stop reading the
restaurant's website.

**`itemPriceHasUpgrades` is not a markup.** It marks items whose listed price is
a base that size or option choices add to - 122 of 161 at Don Rios. That is the
restaurant's own published starting price and is recorded as-is. It is worth
naming in the notes because a menu where three quarters of the items start-from
reads differently than one where they do not.

### How this one was actually found, since the method now has a track record

The browser recorded no XHR for the page at all, and the served HTML had no
embedded blob. Both of the usual doors were shut. What answered it was
`performance.getEntriesByType('resource')` in the page context, which lists
every request the page made whether or not anything was watching - and there was
`api.menufy.com/.../categories/all` with the key in the query string.

That is worth keeping as a third move after "read the payload" and "watch the
network log": **ask the page what it fetched.** The browser is not needed to
extract anything here, only to find out what URL to call, and one call answers
it for every Menufy restaurant afterwards.

## ChowNow: a 200 with an empty body is not an answer

*2026-08-31. Fifth platform off the browser-only list in one night.*

`api.chownow.com/api/restaurant/<id>/menu` returns **HTTP 200 with `{}`**. That
is the whole reason ChowNow was on the list: the endpoint is easy to find, it
answers cleanly, and what it answers is nothing. Anyone checking it concludes
the data is gated.

The menu is one path segment further along, at a version:

```
/api/restaurant/<id>                       -> "next_available_time": "202608311045"
/api/restaurant/<id>/menu/202608311045     -> the full catalog
```

`next_available_time` is the next order-ahead slot as a YYYYMMDDHHMM stamp.
Pizza Parlor came back as 48 priced items across 11 categories this way, and
`/api/restaurant/<id>` carries the store address for the branch check - here
"S. O St and Mc Cain Blvd, Building 614, Coronado", which is the Naval Base
location the record means by "614 S O St, 92135".

### Three traps in one small API

**An invented stamp returns `{}` with a 200**, identical to the unversioned
path. So the empty response cannot distinguish "wrong version" from "no data",
and constructing a plausible timestamp silently fails. Read the real one.

**The id in an `order.chownow.com/order/<n>` link is a different id space.**
Feeding 34208 from one restaurant's order link to `/api/restaurant/` returned
Mac Dynamite in Chicago - a clean 200, a real restaurant, entirely the wrong
one. Use the location id from `direct.chownow.com/order/<company>/locations/<id>`.

**A closed store may publish no `next_available_time` at all**, which is the
closed-store gate wearing yet another costume rather than an unreadable
platform.

### The pattern across all five

Toast 403s a bare curl. Clover COLO2 renders an empty DOM. NetWaiter redirects
away and returns 411 to a bodyless POST. Popmenu serves a shell page with the
real menus at other URLs. ChowNow answers 200 with `{}`.

Five different ways of saying nothing, and in every case the data was one small
adjustment away - a header, a path segment, a request body, a second URL.
**"The obvious endpoint returned nothing" is the beginning of the investigation,
not the end of it.** What separated the successes from the years of blocks was
always the same move: find out what the working page actually requests, then
reproduce that exactly.

## Image-only PDFs are readable after all, and the distinction matters enormously

*2026-08-31. This one reopens the case that caused the worst incident in this
project, so it is worth being exact about what changed and what did not.*

An image-only menu PDF - `pdftotext` returns 2 bytes, no text layer at all - was
a hard block here, because `pdftoppm` is not installed and `Read` cannot open a
PDF. On 2026-08-29 an agent claimed `Read` "renders pages visually", it was
promoted into the playbook, ~10 briefs carried it, three restaurants were filed
with **invented prices**, and 247 dishes were deleted.

**What is true now:** a scanned or designed PDF page is usually a JPEG, stored
whole inside the file. It runs from an SOI marker to an EOI marker and can be
copied straight out with no decoder, no poppler and no library:

```
node probe/extract_pdf_images.js menu.pdf outdir     # page-1.jpg, page-2.jpg…
```

Then `Read` the JPEGs, which has always worked. Verified on Gaslamp Lumpia
Factory's "Steampunk Menu AUG 2026": two pages, `pdftotext` yields 2 bytes, both
pages came out as clean 1080-px JPEGs, and the menu read perfectly - 87 items
including the full drinks page, loaded the same night after two prior blocks.

**Why this is not the old claim wearing a new hat.** The old claim was that a
tool renders PDF pages, which is false on this machine and produced prices that
existed nowhere. This produces an actual file on disk, of a format that is
independently verifiable (`file` reports JPEG, with dimensions), and what is
read is a photograph of the menu. The failure mode is also honest: if the pages
are Flate bitmaps rather than JPEGs the script writes nothing and says so,
rather than half-working.

**The rule that has to survive intact:** finding a way to SEE a menu never
licenses filling in what cannot be seen. The reason the earlier incident was so
damaging is that its dish names were real - lifted from the text layer - so
everything around the invented numbers looked sound. Where a page is illegible,
the dish is omitted. Santouka's board, released from quarantine the same night,
is the model: the cells behind glare and behind a "sold out" sticker came back
missing, not estimated.

**Extraction caveat worth keeping.** Do not cut the JPEG at the first `FF D9`
byte pair found after the start marker - that sequence occurs inside entropy
coded scan data and inside embedded thumbnails, and cutting there yields a file
that renders as the top third of the page and looks like a bad scan rather than
a bad extraction. Walk the JPEG segment headers to the real end marker.

## The same 4% fee, two arithmetics — and two captures that got past the screen

*2026-08-31. Recorded in full because the coordinator made this mistake, the
screen passed it, and the thing that caught it was neither.*

Two menus were filed and loaded tonight carrying a service fee baked into every
price. Both were first-party ordering platforms, which is exactly why they were
trusted: IB Thai's own Menufy storefront (147 dishes) and Surf Side Deli's own
Clover COLO2 storefront (63 dishes). Both were deleted, exported first to
`menus/retired/`, and both restaurants re-queued with no ledger row.

### Why the screen missed them

The markup test asks whether dividing by a round multiplier lands prices on
**whole dollars**, and it tried 1.04, 1.05, 1.08, 1.1, 1.15, 1.2, 1.25.

- **IB Thai** is a 4% fee as `base * 1.04`. Its base menu is priced on `.99` and
  `.35` endings, so dividing lands on $8.00 sometimes and $8.35 other times -
  it scored under the 0.6 threshold and passed.
- **Surf Side** is the same 4% fee charged as `base / 0.96`. That is
  `base * 1.041666…`, and **1.0416 is not 1.04**: only 10 of 63 prices hit at
  1.04, versus 62 of 63 at 25/24. The multiplier list simply did not contain it.

`$15.62 -> $15.00`, `$16.66 -> $15.99`, `$14.57 -> $13.99`. Once seen it is
unmistakable; the test just never asked that question.

### What actually caught it, and is now a second check in the screen

**Restaurants price on conventional endings** - .00, .25, .50, .75, .95, .99 -
and multiplying by a fee scatters the cents almost uniformly. So instead of
asking "does some multiplier produce whole dollars", ask **"do these prices look
like a human set them, and does dividing make them look dramatically more
human?"**

|  | on a conventional ending as published | after dividing |
|---|---|---|
| IB Thai | 1% | 73% (÷1.04) |
| Surf Side Deli | 5% | 98% (÷25/24) |
| Liticker's (clean) | 99% | — |
| Pinto Thai (clean) | 100% | — |

Both conditions must hold before it fires, so a restaurant with genuinely odd
pricing and no clean divisor is left alone. Verified against every capture this
session filed: it holds the two bad ones, passes the fifteen good ones, and
retroactively flags nothing in the agent batches already loaded.

### The lesson that generalises

**"First-party" answers the provenance question, not the price question.** The
ladder ranks the restaurant's own ordering platform at tier 2 because it is
authentic, and it is - these ARE the prices that storefront charges. They are
not the prices on the wall, and this site's promise is the wall price. Four of
tonight's five newly-readable platforms had at least one storefront carrying a
fee: Menufy, Clover COLO2 twice, and a Menufy/HungerRush site an agent caught at
94% on 1.04.

**Run the markup test on your own captures, not just on the ones you distrust.**
The coordinator ran it on the platform an agent flagged and skipped it on the
four it had captured itself an hour earlier. The audit that found this took two
minutes and should have been part of filing.

## A verified pattern is not a read price: the cheesecake ladder

*2026-08-31. Caught before loading, by checking rather than by suspecting.*

An agent captured The Incredible Cheesecake Company (5213) from the shop's own
WooCommerce Store API - a hard 403 to curl, read through the browser pane. Every
product is sold by size, so it fetched the 40-product catalog, opened two
representative flavors (Red Velvet and Key Lime), found both shared an identical
seven-tier ladder, and applied that ladder to the other 24 "standard" flavors.
205 rows.

Its reasoning was careful and it argued the case explicitly: the API's
`price_range` reported min $8.00 / max $64.95 for all 26, two independent
flavors matched exactly, and it had **found and separately read the two flavors
whose ladders differ** (Chocolate Pistachio Kataifi, Sugar Free Plain). That
last detail is what made it convincing - an agent blindly applying a template
does not find the exceptions.

**Fetching all 173 variations showed 12 of the 26 do not sell every size.**
Nine offer five tiers (no Junior 6", no Hostess 8"), two omit Hostess 8", one
omits Halves. The applied ladder had produced **21 rows for sizes those flavors
are not sold in**, each with a confident price.

The entry was rebuilt from all 173 variations plus 11 fixed-price items - 184
rows, every one read - and loaded.

### Why the endpoints agreeing proved nothing

`price_range` min and max are the cheapest and dearest variation. Every flavor
shares By Slice at $8.00 and Combo 10" at $64.95, so every flavor reports the
same range **whether or not it sells the four sizes in between.** The evidence
that looked like confirmation of the whole ladder was only ever confirmation of
its two ends.

### The rule this belongs to

Santouka's board stepped $1 per size, and filling two blurry cells with that
step got 107 dishes quarantined. This is the same shape one level up: a pattern
verified on part of the data, extended over the rest, with no way for anything
downstream to tell. The prices were even *right* for 14 of the 26.

**"I verified the pattern" and "I read the price" are different claims, and only
the second one is what gets published.** When a ladder repeats, either open
enough items to have actually read it, or record only the sizes confirmed and
say which. The cost of checking here was one API loop; the cost of not checking
was 21 fabricated SKUs at a real address.

## A fifth of the blocked pile is a fee, not an absence

*Measured 2026-08-31 across the 209 restaurants in `menus/blocked-log.jsonl`.
`scratchpad/markup-open.cjs` regenerates it.*

**39 restaurants have been blocked at least once because the only reachable
source carried a markup.** Not because no menu could be found — because the menu
that was found was priced by a platform rather than by the restaurant. Fourteen
of those have since been captured from a clean source; **25 still have none.**

The multipliers seen in one night: 4% (twice on first-party Clover storefronts,
once on Menufy, once at 94% of a Menufy/HungerRush catalog), 5% on Slice, 10%
several times, 15%, 17%, 20% baked into a restaurant's OWN embedded Slice
storefront, 25%, and 30% on DoorDash.

### Why this class deserves its own queue

A restaurant blocked for "no priced source anywhere" and one blocked for "the
source has a 20% fee on it" are different problems wearing the same label:

- The menu **demonstrably exists**, is complete, and is reachable. Only the
  numbers are wrong.
- We usually know the multiplier, so we know roughly what the real prices are —
  which is exactly why the temptation to divide is strong and exactly why the
  rule against it has to be absolute. **Knowing the answer approximately is not
  the same as reading it.**
- The fix is a different CHANNEL, not more effort on the same one: a dine-in
  photo, the restaurant's own PDF, a printed menu on Yelp. Agents did this
  successfully several times tonight — Roger's Pizzerolo had a confirmed 4% fee
  on its storefront and was priced instead from a dated first-party photo of the
  printed trifold, which itself states that online and cash prices differ.

That last case is the pattern worth copying: **the restaurant said out loud that
its online prices are not its counter prices.** When a storefront fails the
markup test, the menu on the wall is a different document, and it is often
photographed and sitting in a Yelp gallery.

### The first-party assumption is the thing to unlearn

Six of tonight's markup catches were on the restaurant's OWN ordering platform,
not a delivery marketplace. The ladder ranks first-party sources highly because
they are authentic, and they are — authentically the price that storefront
charges. This site promises the price on the wall. Those are not always the same
number, and nothing about a domain tells you which one you are looking at.

## Two marketplaces, merged, and why it was allowed (2026-09-03, Kanpai id 5950)

The playbook forbids merging listings and warns that two ordering channels
agreeing to the cent does NOT clear a markup — Pacific Pizza's own Slice
storefront matched DoorDash exactly *because* both carried the same 20% uplift.
An agent filed Kanpai anyway, at 273 dishes, from DoorDash and Uber Eats
combined. Read against its file, the capture holds up, and the reason is worth
recording because it is a test that settles this class of case in one line.

**Every one of the 273 prices ends in `.00` or `.50`** — 149 and 124
respectively, nothing else. A uniform multiplier cannot produce that. Applied
to a menu priced in halves and wholes, ×1.20 lands on `.20 .40 .60 .80 .00`
and ×1.25 on `.25 .75`; either way the two-value distribution shatters. So the
ending distribution is independent evidence of no uplift, and it is evidence
the "two channels agree" argument never supplies.

Sequence of tests for a marketplace-sourced menu, cheapest first:

1. **Cent distribution.** Collapsed onto `.00`/`.50`, or onto `.95`/`.99`? That
   is a printed menu. Spread across `.20 .40 .60 .80`, or `.15 .30 .45`? That
   is a fee, and the source is unusable — do not divide it out.
2. **Divisor sweep.** Share of prices landing on a conventional ending after
   dividing by 1.10 / 1.15 / 1.20 / 1.25 / 1.30. If some divisor beats 1.00,
   suspect it. Kanpai: 100% at 1.00, best rival 41% at 1.20.
3. Only then, whether two owners agree — which is corroboration of the LISTING,
   never of the price level.

The merge itself was safe because no price was constructed: each row was read
verbatim from one of the two payloads, the 91 overlapping items matched to the
cent, and the extra rows came from the fuller listing. What it does cost is
provenance — the entry names one `sourceUrl` while most rows came from the
other. Prefer the fuller single source when one exists; if you must combine,
say so in `notes` as this agent did.

Same session, same test, opposite direction: George Burgers (id 4972) had been
held since 2026-08-29 because an agent divided a confirmed 1.20 DoorDash markup
out and filed the quotients. Its 2026-09-03 Uber Eats capture reads 100%
conventional endings undivided with no rival divisor, so the storefront is
passing the restaurant's own prices through, and it was released. **The hold was
about a derived number, not about the host** — worth checking which of the two
any QUARANTINE_IDS entry actually means before assuming a restaurant is barred
from a whole platform.

## A platform is not trustworthy; a PAYLOAD is (2026-09-03)

One agent read two restaurants off MenuStar in the same batch and got opposite
answers. Lienzo Charro (`themenustar4.com`, restaurant_id 6405) came back with
230 dishes whose cents sit overwhelmingly on `.99`/`.49` - a printed menu.
Senor Taquero, the same platform on `themenustar.com`, returned 72 items
scattered across more than fifteen cent endings with under 2% conventional, and
a divisor sweep from 1.00 to 1.60 never got past 36%. Those are computed
numbers, and the agent blocked them.

Same vendor, same API shape, same day. So "MenuStar is readable" is not a fact
about MenuStar, and neither is the reverse. The same thing happened earlier the
same day on a custom white-label platform (Yingli, id 6577) and on DoorDash
(Handel's Homemade Ice Cream, flat scatter across fourteen endings with zero
conventional).

**Run the cent distribution on every capture, including from a platform section
9 already blesses.** It costs one pass over the prices you already have, and it
is the only check that catches a computed field - the markup tests cannot,
because there is no multiplier to find, and corroboration cannot, because a
second reader of the same field agrees.

The three shapes, in the order they are worth testing:

| cents look like | verdict |
|---|---|
| collapsed on `.00`/`.50`, or `.95`/`.99`, or ending in 9 | printed menu, file it |
| `.20 .40 .60 .80` or `.15 .30 .45`, or a divisor beats 1.00 | fee baked in, block, do NOT divide it out |
| flat across many endings, under ~30% conventional | not prices at all, block |

## Popmenu serves two menus, and the router screens the wrong one (2026-09-03)

Ramon's Taco Shop (id 6493) was recorded `screened-out` by the router:
161 of 178 prices divided cleanly by 1.04 onto round dollars, a textbook 4%
online-ordering fee, correctly refused. An agent then found the same restaurant
publishes BOTH shapes at sibling URLs on the same host:

    ramonstacoshop.com/menus/main-menu?location=…        150 clean whole/half-dollar prices
    ramonstacoshop.com/menus/main-menu-sync?location=…   the 4%-inflated copy

The `-sync` variant is the one wired to online ordering. The plain page is the
printed menu. The router follows whichever Popmenu link the site exposes, so
which one it lands on is luck.

Only one row in the whole corpus was affected, so this did not earn a router
change — checked before acting rather than assuming. But it generalises, and
the general form is worth carrying: **a 4% or 15% fee is a property of the
ORDERING CHANNEL, not of the restaurant, and a restaurant often publishes its
uninflated menu somewhere else on the same host.** Before accepting a
`screened-out` verdict, look for a sibling URL without the ordering wiring —
drop a `-sync`, `-online`, `-order` or `-delivery` suffix, or try the plain
`/menus/<name>` path. That is cheaper than hunting a second source and it
returns first-party prices rather than tier-3 ones.

## The counter-case: odd cents that ARE real (2026-09-03, Kuma Cafe id 6399)

Three captures the same day were blocked for scattered cents, so this one is
worth recording because blocking it would have been wrong.

Kuma Cafe filed 46 prices at only 31% conventional endings - below the floor
agents are told to block under. The rows:

    Ham, Egg & Cheese        $13.75      Croissant version   $15.65
    Ham, Egg, Cheddar        $11.25      Croissant version   $13.15
    Classic Avocado Toast     $9.60      Specialty            $10.70

The odd endings are not noise. Every croissant row is its base plus exactly
$1.90, applied to quarter-dollar bases: 13.75 + 1.90 = 15.65, 11.25 + 1.90 =
13.15. The cafe prices in quarters and charges an odd-value modifier, and the
modifier is what produces `.65` and `.15`. Source is the restaurant's own
Squarespace page with no ordering flow attached, so there is no channel for a
fee to live in either.

**The discriminator is not the scatter, it is whether the scatter is
EXPLAINABLE.** A computed field produces endings with no relationship to each
other. A real menu with modifiers produces a base cluster plus a constant
offset you can find by subtracting paired rows. So when a capture comes in
under the threshold:

1. Find two rows that are obviously variants of one dish. Subtract.
2. Do the same for another pair. If the difference is the same number, the
   odd cents are a modifier and the menu is real.
3. If the differences are unrelated, it is a computed field - block.

Compare Lucy's Bakery (id 5988), blocked the same hour: Torta de Milanesa
$10.35, Torta de Chorizo $5.33, Torta Embarazada $13.92. Nothing subtracts to
anything, and it sat beside a tight `.50` cluster of genuine prices. That is
a mixed payload. Kuma is one coherent price list.

## Sales tax is a divisor nobody was testing (2026-09-03, Orlando's Taco Shop id 6415)

Every markup test in this project sweeps 1.04, 1.10, 1.15, 1.20, 1.25, 1.30 —
the shapes of platform fees and delivery uplifts. An Uber Eats catalog for
Orlando's Taco Shop passed all of them and looked like garbage on the cent
test: only 3 of 112 prices on a conventional ending.

Dividing by **1.0775** — California's sales tax — put 79 of 112 (70%) back on
conventional endings. The storefront is quoting tax-inclusive prices.

Two things follow:

**Add 1.0775 to the sweep.** More generally, sweep finely rather than testing a
handful of round multipliers; a fine sweep from 1.00 to 1.35 in small steps
finds tax, fees, and combinations of the two without knowing in advance which
you are looking at. Several captures blocked earlier this session as "computed
field, no divisor found" were tested only against the round list and may be
recoverable — worth a re-run before anyone re-extracts them by hand.

**It is still not fileable.** A tax-inclusive price is not the price on the
menu, and dividing it out is constructing a number nobody published — the same
rule that bars dividing out a 20% delivery fee. Block it and look for the
pre-tax source. The value of identifying the multiplier is that it tells you
the payload is coherent rather than corrupt, which is a different follow-up:
a coherent tax-inclusive catalog usually has a pre-tax sibling somewhere.

Counter-case from the same batch, so the sweep does not become a false-positive
machine: Senor Tequero's MenuStar catalog also failed the round sweep at 18%,
but a subtraction test found the same $2.32 premium step recurring in three
independent places. A repeating offset is a real modifier. A single multiplier
that rescues the whole distribution is a fee or a tax.
