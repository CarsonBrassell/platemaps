# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: San Diego locals deciding where to eat and what to order, in the moment — typically at or near mealtime, on a phone, choosing among places they could reach tonight. Their job is not "research a restaurant" but "tell me what to order, right now, near me."

Posting is the supply side of that same loop rather than a second audience: the recent, local, dish-level verdicts the primary user relies on only exist because other users publish plates.

## Product Purpose

Answer "what should I eat tonight?" with specific, recent, nearby dish verdicts instead of restaurant-level aggregate scores. Success is the visitor leaving knowing a particular plate to order and where to get it.

## Positioning

Three confirmed differentiators:

- **The dish is the unit of review, not the restaurant.** Ratings, photos, and verdicts attach to a specific plate, so a well-reviewed restaurant can hold a weak dish and an average one can hold a standout. This is what the name encodes.
- **Map-first social discovery.** You see what people around you are actually eating, placed on a map, rather than querying a directory.
- **Recency over aggregate.** Recency-weighted "hot" ranking surfaces what is good now, in preference to averages accumulated over years.

Explicitly *not* positioning: PM Points and the leaderboard are a supply-side mechanism that keeps fresh local posts coming. They are a capability, not the reason the product wins, and should never be presented as the differentiator.

## Operating Context

- Used at the moment of deciding — frequently one-handed, on a phone, close to mealtime — which makes proximity and open-now state load-bearing rather than decorative.
- Scope today is San Diego County: 36 seeded restaurants across Little Italy, North Park, Hillcrest, Pacific Beach, Point Loma, Liberty Station, La Jolla, Mission Valley, Del Mar, Chula Vista, La Mesa, Alpine and others.
- Open/closed and "closing soon" are computed in `America/Los_Angeles` from real closing times, not stored labels.
- Deployed on Vercel (project `platemap`) from `github.com/CarsonBrassell/platemaps`.

## Capabilities and Constraints

Confirmed functionality:

- **Discover** (`/`): filter by neighborhood, cuisine, open now, top rated (≥4.5) and trending; curated "Our Picks" strip; restaurant detail pages carrying dishes.
- **Feed** (`/feed`): three-step composer — up to 4 client-resized photos, dish name, restaurant, price, distance label, 0–10 rating, room vibe, food tags, amenities, caption. Tabs are For You (recency-weighted hot score), Following, and Map.
- **Social**: like, comment, like a comment, save, follow, share, delete own post, and a "would you eat this?" yes/no verdict.
- **PM Points**: +10 to publish, +1 per like received, +2 per comment received, +1 to the voter for a first verdict on a post; one-time bonuses at 25/100/500 likes. Leaderboard windows are Today/Week/Month/All time.
- **Map**: a custom MapLibre GL vector style over OpenFreeMap/OpenStreetMap data. Pins scale and glow by the restaurant's best post score and dim when it is closed; comment bubbles are placed with screen-space collision avoidance and thinned by zoom.
- **Auth**: email signup/login/logout with bcrypt hashing, plus avatar upload.

Terminology: a post is a **plate**; the currency is **PM Points**; the verdict prompt is **"would you eat this?"**.

Technical constraints:

- Data lives in Neon serverless Postgres.
- Yelp Fusion supplies restaurant names, cuisines, coordinates, ratings, review counts, photos and closing times. Displaying Yelp content obliges visible attribution via each record's `yelpUrl` credit link.
- The map obliges OpenStreetMap and OpenFreeMap attribution.
- MapLibre's worker is served as a static file from `public/` because the dev bundler serves it with a non-JavaScript MIME type; `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` must be re-copied when `maplibre-gl` is upgraded.
- No menu API exists at any price. Dish data is extracted from real menu pages by `scripts/fetch-menus.mjs` through the Anthropic API — billed per token, not covered by a Claude subscription — and every dish records the page it came from.

Undecided, to be recorded rather than assumed:

- Whether San Diego is the permanent scope or the first market.
- Whether Yelp remains a live dependency or was seed data for launch.
- The product name is inconsistent in shipped code: the wordmark, page title and repo say **PlateMaps**, while `package.json`, the Vercel project and one feed error string say **PlateMap**. One spelling needs to win.

## Brand Commitments

- Name: **PlateMaps** (subject to the inconsistency noted above).
- Logo mark and wordmark assets in `public/` (`logo-mark.png`, `logo.png`), rendered through `BrandMark` / `WordMark`.
- A warm orange accent (`--pm-orange`, the `#e8875a` family) against charcoal, carried through primary actions, pins, and the map's streetlight glow.

Observed in existing copy but not user-confirmed as binding: plain, direct, sentence-case voice with no marketing hype.

## Evidence on Hand

- **Real restaurant data** — 36 businesses with genuine names, cuisines, coordinates, ratings, review counts, closing times and photos, generated by `scripts/fetch-restaurants.mjs` and `scripts/fetch-photos.mjs` from Yelp Fusion. See `src/data/restaurants.ts` and `public/restaurants/`.
- **Real dish data** — extracted from live menu pages into `src/data/dishes.ts`, each dish traceable to its source URL.
- **Seeded map commentary** — `src/data/mapComments.ts`; demo content via `scripts/seed-demo.mjs`.

Absences future work must not fabricate: there are no testimonials, user counts, press mentions, partnerships, funding, pricing, or licensing claims. There is also **no busyness or wait-time data** — invented wait copy previously shipped and was deliberately removed in favor of honestly computed open/closed state. Do not reintroduce it.

## Product Principles

1. **The plate is the unit of truth.** Ratings, photos and verdicts belong to a specific dish; never collapse them into a restaurant average.
2. **Serve the decision, not the archive.** Proximity, open-now and recency outrank completeness and historical depth.
3. **Real data or an honest gap.** Never invent a fact about a business; state the absence instead, and honor the attribution that real data obliges.
4. **Supply serves demand.** The points economy exists to keep fresh local plates flowing; it must never outrank or obscure the decision the visitor came to make.
5. **Built for a phone at the moment of choosing.** One-handed, outdoors, in a hurry, possibly on a poor connection.

## Accessibility & Inclusion

No formal conformance target has been set by the user. The codebase already holds a consistent, deliberate standard that future work should treat as the floor: 44px minimum touch targets (`min-h-11`), visible `focus-visible` rings on every interactive control, `aria-current` / `aria-pressed` / `aria-label` on stateful and icon-only controls, `role="status"` and `role="alert"` for asynchronous feedback, decorative imagery given empty `alt` with descriptive text only where the image carries information the label does not, and `prefers-reduced-motion` honored by every animation including the map's pin pulse and opening camera move.
