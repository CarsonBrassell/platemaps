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

- **The dish is the unit of review, not the restaurant.** Ratings, photos, and verdicts attach to a specific plate, so a well-reviewed restaurant can hold a weak dish and an average one can hold a standout. This is what the name encodes. A restaurant's own percent exists but is derived from its plates and drills back into them — see Product Principle 1.
- **Map-first social discovery.** You see what people around you are actually eating, placed on a map, rather than querying a directory.
- **Recency over aggregate.** Recency-weighted "hot" ranking surfaces what is good now, in preference to averages accumulated over years.

Explicitly *not* positioning: Plate Points and the leaderboard are a supply-side mechanism that keeps fresh local posts coming. They are a capability, not the reason the product wins, and should never be presented as the differentiator.

## Operating Context

- Used at the moment of deciding — frequently one-handed, on a phone, close to mealtime — which makes proximity and open-now state load-bearing rather than decorative.
- Scope today is San Diego County: 36 seeded restaurants across Little Italy, North Park, Hillcrest, Pacific Beach, Point Loma, Liberty Station, La Jolla, Mission Valley, Del Mar, Chula Vista, La Mesa, Alpine and others.
- Open/closed and "closing soon" are computed in `America/Los_Angeles` from real closing times, not stored labels.
- Deployed on Vercel (project `platemaps`) from `github.com/CarsonBrassell/platemaps`, served at `platemap-five.vercel.app`.

## Capabilities and Constraints

Confirmed functionality:

- **Discover** (`/`): filter by neighborhood, cuisine, open now, top rated and trending; curated "Our Picks" strip; restaurant detail pages carrying dishes. "Top rated" means ≥4.5 stars on the Yelp/Google blend while the blend is still displayed, and flips to a plate score ≥85% when the stars are retired — one flag, `SHOW_BLEND_STARS`, decides both the filter and the display so they can never disagree.
- **Feed** (`/feed`): composer — up to 4 client-resized photos, restaurant, dish off its real menu, price, distance label, a 0–100% rating on the plate, best-at and let-you-down chips, food tags, amenities, caption. One rated path, plus a comment-only door. Tabs are For You (recency-weighted hot score), Following, and Map.
- **Social**: like, comment, like a comment, save, follow, share, delete own post, and a "would you eat this?" yes/no verdict.
- **Plate Points**: +10 to publish, +1 per like received, +2 per comment received, +1 to the voter for a first verdict on a post; one-time bonuses at 25/100/500 likes. Leaderboard windows are Today/Week/Month/All time.
- **Map**: a custom MapLibre GL vector style over OpenFreeMap/OpenStreetMap data. Pins scale and glow by the restaurant's best post score and dim when it is closed; comment bubbles are placed with screen-space collision avoidance and thinned by zoom.
- **Auth**: email signup/login/logout with bcrypt hashing, plus avatar upload.

Terminology: a post is a **plate**; the currency is **Plate Points**; the verdict prompt is **"would you eat this?"**.

Technical constraints:

- Data lives in Neon serverless Postgres.
- Yelp Fusion supplies restaurant names, cuisines, coordinates, ratings, review counts, photos and closing times. Displaying Yelp content obliges visible attribution via each record's `yelpUrl` credit link.
- The map obliges OpenStreetMap and OpenFreeMap attribution.
- MapLibre's worker is served as a static file from `public/` because the dev bundler serves it with a non-JavaScript MIME type; `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` must be re-copied when `maplibre-gl` is upgraded.
- No menu API exists at any price. Dish data is extracted from real menu pages by `scripts/fetch-menus.mjs` through the Anthropic API — billed per token, not covered by a Claude subscription — and every dish records the page it came from.

Undecided, to be recorded rather than assumed:

- Whether San Diego is the permanent scope or the first market.
- Whether Yelp remains a live dependency or was seed data for launch.

## Brand Commitments

- Name: **PlateMaps**, plural, everywhere — copy, share titles, image alt text, page title, the npm package, the repo, and the Vercel project. The original `platemap-five.vercel.app` URL survives as an alias on the renamed project, so links already in the wild keep working.
- Logo mark and wordmark assets in `public/` (`logo-mark.png`, `logo.png`), rendered through `BrandMark` / `WordMark`.

Observed in existing copy but not user-confirmed as binding: plain, direct, sentence-case voice with no marketing hype.

## Aesthetic Direction

**Warm Editorial (2026-08-09)** — warm, airy, photo-forward, with an editorial
typographic layer. This supersedes both the original launch look and the
briefly-recorded terminal/utilitarian direction; it is built and shipped, and
the binding rules live in `DESIGN.md` (summarized in `AGENTS.md`).

- **Type split by authorship, three voices.** Fraunces 600–700 for proper
  names and screen titles; monospace (Spline Sans Mono) for every number and
  machine-generated value — prices, percentages, vote counts, timestamps,
  usernames, distances, and small uppercase section labels; system sans for
  anything a human wrote in prose.
- **Cream ground `#F7F4EC`; white cards, 14–16px radius.** No borders, no
  shadows, no gradients — grouping is white-on-cream, never an outline.
- **Pills.** Chips, tabs and buttons are fully rounded; selected state is
  orange `#C9591F` with cream text, unselected is tan `#EDE8DC` with muted
  text.
- **One accent color (orange), spent only on** recommendation percentages and
  vote counts, the selected state, and the primary action. More than about
  three orange elements beyond per-card data numbers is too many. Small orange
  text uses the darker `--pm-orange-text` `#A8481A` for contrast.
- **Photos lead; honest gaps are warm.** Missing photos render as flat warm
  tone blocks at the correct aspect ratio, never gray boxes or icons.
- **The map is ours, and it stays night.** The neo-noir dark vector style
  (`NEO_NOIR_STYLE`), its glowing beacon pins, and its dark chrome are
  preserved exactly as built before the Warm Editorial pass — a confirmed
  exception to the cream world, framed in a white card.
- **Vote arrows as `▲`/`△`**, in the mono, not icon-library glyphs.

The earlier "plate reference" exception (Fraunces + orange dish headlines on
feed cards) is retired: the feed card now names its plate in the bottom row as
a compact mono reference, per DESIGN.md.
## Evidence on Hand

- **Real restaurant data** — 36 businesses with genuine names, cuisines, coordinates, ratings, review counts, closing times and photos, generated by `scripts/fetch-restaurants.mjs` and `scripts/fetch-photos.mjs` from Yelp Fusion. See `src/data/restaurants.ts` and `public/restaurants/`.
- **Real dish data** — extracted from live menu pages into `src/data/dishes.ts`, each dish traceable to its source URL.
- **Seeded map commentary** — `src/data/mapComments.ts`; demo content via `scripts/seed-demo.mjs`.

Absences future work must not fabricate: there are no testimonials, user counts, press mentions, partnerships, funding, pricing, or licensing claims. There is also **no busyness or wait-time data** — invented wait copy previously shipped and was deliberately removed in favor of honestly computed open/closed state. Do not reintroduce it.

One deliberate, sanctioned exception to that last rule: `ReservationPanel` on the restaurant page is an **unshipped prototype** of a first-party booking surface, showing a walk-in wait and bookable tables. Its numbers come from `src/lib/reservations.ts`, which is a deterministic generator, not a source — the card says so on its face ("Preview · availability not live yet"). It exists to evaluate the design, and it is not a licence to fabricate elsewhere. Either wire it to a real provider or delete both files; do not quietly promote the mock to production copy by removing the disclaimer.

## Product Principles

1. **The plate is the unit of truth.** Ratings, photos and verdicts are *entered* about a specific dish, never about a place — there is one rating control in the product and it rates a plate.
   A restaurant does carry a percent, and it is derived from its plates rather than collected: the vote-weighted average in `src/lib/plateScore.ts`. Alongside it, for now, sits the Yelp/Google star blend — displayed because at launch it is the only signal most restaurants have, always labelled as outside context, and built to be switched off (`SHOW_BLEND_STARS`) once enough plates have been rated to stand on their own. This is not the restaurant average this principle used to forbid. That one was a separate judgement about the place, entered on its own scale, competing with the dishes for the top of the screen. This one has receipts — it decomposes into the plates that produced it, it cannot exist without them, and it is absent (stated as "N plates rated", never a number) until enough plates have been rated to describe the kitchen. A summary that can only say what its parts say does not displace them.
2. **Serve the decision, not the archive.** Proximity, open-now and recency outrank completeness and historical depth.
3. **Real data or an honest gap.** Never invent a fact about a business; state the absence instead, and honor the attribution that real data obliges.
4. **Supply serves demand.** The points economy exists to keep fresh local plates flowing; it must never outrank or obscure the decision the visitor came to make.
5. **Built for a phone at the moment of choosing.** One-handed, outdoors, in a hurry, possibly on a poor connection.

## Accessibility & Inclusion

No formal conformance target has been set by the user. The codebase already holds a consistent, deliberate standard that future work should treat as the floor: 44px minimum touch targets (`min-h-11`), visible `focus-visible` rings on every interactive control, `aria-current` / `aria-pressed` / `aria-label` on stateful and icon-only controls, `role="status"` and `role="alert"` for asynchronous feedback, decorative imagery given empty `alt` with descriptive text only where the image carries information the label does not, and `prefers-reduced-motion` honored by every animation including the map's pin pulse and opening camera move.
