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
