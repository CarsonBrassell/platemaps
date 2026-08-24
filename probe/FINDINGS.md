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

1. **Yelp menu tab** (`yelp.com/menu/<alias>`) — consistent plain HTML across
   every restaurant, easiest to parse, hit repeatedly across groups. The alias
   comes free from the Yelp enrichment call, which is why that pass runs first.
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
