# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Documentation hierarchy

Four docs, each authoritative over a different thing. Read the relevant one before changing that area:

- **AGENTS.md** — the Next.js warning and the binding short-form design rules. Imported above, so it is always in context.
- **DESIGN.md** — the full design system: the three-voice type split, color tokens, shape, the three ranks of controls, map styling. Authoritative for anything visual.
- **PRODUCT.md** — users, positioning, capabilities, product principles. Authoritative for *what to build and what not to invent*. Its "Aesthetic Direction" section predates DESIGN.md and describes a terminal/utilitarian look that was not adopted — **DESIGN.md wins on visuals**.
- **README.md** — untouched `create-next-app` boilerplate. Ignore it.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build
npm run lint         # eslint over the repo
```

There is **no test framework** in this project — no vitest/jest/playwright, no test files, no `npm test`. Do not tell the user to run tests. Verify changes with:

```bash
npx tsc --noEmit     # typecheck (no npm script for this)
npx eslint src/app/friends/page.tsx    # lint one file or directory
```

`tsconfig.json` includes `**/*.tsx` and excludes only `node_modules`, so `tsc` covers `archive/` and `scripts/` too, not just `src/`.

Also note `npm run lint` walks `.claude/skills/**`, which is vendored and throws thousands of warnings. **`npx eslint src` is the signal.**

### Verifying UI in the browser

The dev server usually already runs on :3000. Attach to it with `preview_start {url: "http://localhost:3000"}` rather than starting a second one.

**Never tell the user the browser is unavailable, and never ask them to display a pane.** Two browsers are wired up and at least one always works:

- **In-app pane** (`mcp__Claude_Browser__*`) — use for DOM and logic checks: `read_page` for structure, `get_page_text` for copy, `javascript_tool` for computed styles, geometry and class names. Its `screenshot` fails with "not compositing frames" and retrying does not help.
- **Claude in Chrome** (`mcp__claude-in-chrome__*`) — the real Chrome. **Screenshots work here.** Tools are deferred; load them with ToolSearch, then `tabs_context_mcp` → `tabs_create_mcp` → `navigate` → `screenshot`, batched with `browser_batch`.

Create your own tab in Chrome rather than reusing the existing one — it is usually a tab the user is actively clicking around in, and it will navigate out from under you mid-capture.

**Actually look at a screenshot before calling a UI change done.** Verifying only through the accessibility tree hid a visible problem here (every "Any …" row rendering as selected at once).

Two traps when verifying this way, both of which have produced wrong conclusions here:

- **`transition-colors` is everywhere in this UI.** While the pane isn't compositing, transitions freeze part-way, so `getComputedStyle().color` returns arbitrary intermediate values — identical elements will report different colours. Assert against **class names**, not computed colours.
- **Element refs from `read_page` can be stale or off-screen**, so a click lands nowhere. Either resize the viewport tall enough to fit the rail (`1280x1400`) or drive the element with `javascript_tool` and `.click()`.

### Database and data scripts

Every script needing credentials reads `.env.local` via `node --env-file`. `DATABASE_URL` (Neon) and `YELP_API_KEY` live there.

```bash
npm run db:migrate         # idempotent DDL — safe to re-run
npm run db:seed            # demo users, plates and restaurant reviews
npm run restaurants:import # load src/data/{restaurants,dishes}.ts into Postgres
npm run ratings:blend      # recompute blended ratings into src/data/restaurants.ts
npm run aspects:preview    # run the aspect-score model against scenarios; touches no DB
```

`restaurants:import` is what makes a data refresh visible to the app — the fetch scripts only rewrite the seed files. It upserts restaurants by id and replaces dishes per restaurant, never deletes a restaurant, and supports `--dry`. Run it after `fetch-restaurants.mjs`, `fetch-menus.mjs` or `ratings:blend`.

`scripts/migrate.mjs` is a flat array of `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... IF NOT EXISTS` statements run in order — add to the end, never edit an existing one.

`scripts/seed-demo.mjs` deletes and recreates the `@demo.platemaps.app` users on every run; posts cascade from the user row, so that DELETE is the whole cleanup. It is the only way to remove seeded content:

```bash
psql $DATABASE_URL -c "DELETE FROM users WHERE email LIKE '%@demo.platemaps.app'"
```

The remaining scripts regenerate `src/data/` from external APIs and are **not** part of a normal build — they cost money or quota. `fetch-menus.mjs` bills the Anthropic API per token (not covered by a Claude subscription); run it with `--limit` first. Most support `--dry`.

## Architecture

### Postgres is the source of truth; `src/data/` is seed input

- **Neon Postgres** — everything: restaurants and dishes, plus everything users produce (accounts, sessions, posts, upvotes, hearts, saves, comments, friendships, point events, aspect votes).
- **`src/data/restaurants.ts` and `src/data/dishes.ts`** — generated by `scripts/fetch-*.mjs` from Yelp and real menu pages, then loaded into Postgres by `npm run restaurants:import`. **Nothing under `src/` imports these arrays**, only their types. Re-importing them is how a data refresh reaches the app.
- **`src/data/regions.ts`, `priceBands.ts`, `mapComments.ts`, `reviewScales.ts`** — still static, still imported. These are bounded, hand-authored vocabularies (map zones, band thresholds, seed bubbles), not corpora that grow with the city.

Restaurants used to be a static array imported straight into components. That could not scale past the 36 it shipped with: the home page was a client component, so the whole array was downloaded by every visitor. `getRestaurants()` in `lib/db.ts` replaced it, `/` became a server component, and the client surfaces that genuinely need the list read `/api/restaurants` and `/api/restaurants/dishes`.

### Discover is a server-side query

`src/lib/discover.ts` owns it. The URL is the query, `/` is dynamic, and the browser receives one page of results (`PAGE_SIZE = 24`) plus facet counts — so page weight is flat in the size of the table. Measured: ~138 KB unfiltered, ~53 KB for `?cuisine=Pizza`, where the old client-side version cost ~4 KB per restaurant in the corpus regardless of what was being asked for.

Three things follow from that, and each has a comment where it lives:

- **The predicate stays TypeScript, not SQL.** `matchesFilters` runs server-side now — the same function the grid used to call. Porting it to SQL would mean two implementations of "open now" (which parses `Closes 2am` against Los Angeles time including the small-hours wraparound) and of the aspect-score damping, and the first drift would make the rail print counts that no longer describe the grid. The corpus is scanned in memory behind a 60s cache. That is linear in the table, just linear somewhere with a CPU rather than over a phone's network; `getDiscoverPage` is the seam to replace with SQL when the scan is the bottleneck.
- **Coordinates never go in the URL.** "Nearby" puts only its intent there (`nearby=1`); the position goes to `POST /api/restaurants/discover`. A query string is shared, logged and kept in history.
- **Filter changes are navigations**, spent through a `useTransition` so the previous grid dims rather than blanks. That round trip is the price of the above.

`src/lib/geo.ts` exists because of this: `milesBetween` used to live in `lib/nearby.ts` beside `useNearby`, and the server cannot import a module that calls `useState`.

### Menus cost money, and there are two ways to get them

There is no menu API anywhere, so a menu costs a billed Opus call with up to six web searches and six page fetches behind it. **Not covered by a Claude subscription.** Everything below exists to stop paying for the same menu twice.

- **`scripts/fetch-menus.mjs`** — the batch path. Targets only restaurants with no menu (`--refetch` to override), merges into `dishes.ts` rather than replacing it, and reports cost *per restaurant* plus a projection for the rest of the corpus. Always start with `--limit 5 --dry`.
- **`src/lib/menuLookup.ts` + `POST /api/restaurants/[id]/menu`** — the on-demand path, and the one that scales. A signed-in visitor looking at a restaurant with no menu can ask for it; cost then tracks demand instead of pre-buying hundreds of menus that start going stale on arrival.

Four guards, and none of them are optional: once per restaurant (the `menu_lookups` primary key — the row records that money was *spent*, separately from `dishes` which records what came *back*), signed-in only, a rolling daily ceiling (`DAILY_LOOKUP_LIMIT`), and no key means the button is never offered. `menu_lookups.status` distinguishes `found` / `not_found` / `error` because they deserve different retry rules; only `error` is worth retrying.

### Other things easy to get wrong here

`posts.restaurant_id` is a soft reference, not a foreign key — `fetch-restaurants.mjs` rewrites the id space wholesale, and an FK would turn a data refresh into a cascade through everyone's reviews.

**`fetch-restaurants.mjs` merges, it does not replace.** Identity is the Yelp alias parsed out of `yelpUrl`, so a known business keeps its `id` and its position and a re-run cannot renumber the corpus — ids used to be array positions, which silently repointed every `posts.restaurant_id` on each run and made growing the corpus unsafe. A restaurant the search doesn't return is kept, never dropped; Yelp search is a ranked sample, not an enumeration. Flags: `--per-area`, `--min-reviews`, `--min-rating`, `--max-calls` (stops cleanly), `--no-hours`, `--hours-only` (search-free backfill of missing closing times, resumable).

**"Open now" is weaker than it looks, and worse at scale.** `openStateFor` knows only a *closing* time, so anything that hasn't closed yet reads as open — at 8am a place that opens at 5pm is "Open til 10pm". On top of that, a restaurant with no closing time at all resolves to `unknown`, which the filter passes rather than hides. Fixing it properly needs opening times, which Yelp's detail endpoint returns (`start` alongside `end`) but nothing here stores yet.

`restaurants.price_band` and `restaurants.sort_order` are written by the import, not derived per request. The band was a full scan of the dish table on every read; `sort_order` exists because `id` is TEXT and ordering by it puts "10" before "2", which visibly reshuffles the grid.

`RestaurantView` is a narrowed projection of `Restaurant`, and the narrowing is load-bearing: those rows go to client components, so every field is downloaded once per restaurant. `Restaurant` carries eight more that nothing on the grid renders. The detail page still gets the full row.

### `src/lib/db.ts` is the only database module

It imports the Neon client at module scope, which makes it **server-only**. Client components that need a row shape declare a local mirror type with a comment pointing back at the original (`src/app/friends/page.tsx` has two) rather than importing from `db.ts` — importing it into a client component pulls the driver into the browser bundle.

Auth is a session cookie (`platemap_session`) → `sessions` table → user. `getCurrentUser()` in `src/lib/session.ts` is how every API route resolves the caller; passwords are bcrypt.

### Invariants that are easy to break

These are enforced by convention and long comments rather than by types. Read the surrounding comment before touching any of them.

- **Upvotes are public, hearts are private.** `getDiscoverFeed` must never join `post_hearts`. `hydratePosts` reads hearts only as "did *this viewer* heart it", never the list. Exactly two functions materialize a full heart list and both are author-only: `getHeartsForAuthor` (explicit check, throws) and `getActivityForAuthor` (scoped by construction — its `mine` CTE is the only source of post ids). Its route, `/api/account/activity`, takes no `userId` and must never grow one. Any third one must be author-only too. **Upvoters are never named, to anyone, including the author** — the upvote branch of `getActivityForAuthor` has no `users` join and keys its rows by timestamp rather than user id, so there is no name to leak; hearts naming their sender is the deliberate asymmetry.
- **The category model has two invariants, and `npm run aspects:preview` asserts both.** (1) The five category ratings average to the restaurant's **sourced** rating exactly — they are a breakdown of it, not five opinions near it. (2) A category with **no votes is never above** that rating, and is strictly below it whenever anything was praised — silence is not evidence of quality. Getting both required leaving `net` unweighted and moving `FAULT_WEIGHT` onto the centred deviations, then rescaling the positive side to restore the balance; weighting inside `net` drags `mean(net)` negative and lifts the unvoted categories. Don't reorder those steps. The preview script exits non-zero if either invariant breaks, so run it after any change to `src/lib/aspectScores.ts`.
- **Categories need `MIN_REVIEWS` (12) before they get ratings at all**, and `MAX_REACH` (0.85) stops the top one landing on a flat 5.00. Both exist because of observed failures: five reviews produced a 5.00 off two votes, and at 1.0 reach the ceiling was being hit on most restaurants and then compressing the whole row behind it. Below the floor `RestaurantAspects` shows the vote counts with a dash where the rating goes.
- **Category scores display out of 5, not as a percent.** `aspectScores` computes on 0-100 — that is the scale of its anchor (the plate score) and of `ASPECT_STRONG_SCORE`, and what `npm run aspects:preview` tunes against — and `aspectOutOfFive` in `lib/ratingDisplay.ts` is the single place it becomes `4.4/5` for display. Don't rescale the model to fix a display question; both surfaces that show a category (the restaurant page block, the Discover card highlight) go through that helper.
- **The category chips never include Food.** `BEST_AT` in `src/data/reviewScales.ts` measures only what the plates can't say — Ambiance, Service, Menu variety, Drinks, Value — because the plate score already *is* the restaurant's food rating. Food was retired into `RETIRED_BEST_AT`, which is the repo's standing mechanism for this: a retired chip stays unpickable in the composer, unwritable through `/api/posts`, and absent from both the category scores and Discover's "Rated well for" facet, while old posts still render `Best at food` via `vibeChip`. Its existing votes stop counting, which is the intent. Don't add a food-shaped category back under another name.
- **There is one rating scale: a 0–100 percent about one plate.** Every rated post is `rating_kind = 'dish'`, and `/api/posts` refuses to write anything else. A restaurant's own number is never entered by anyone — it is derived from its plates by `src/lib/plateScore.ts`, which weights each plate by how many ratings it has and returns a **null percent** below its floor (3 rated dishes, 8 total ratings) rather than a confident number off two ratings. Aspect tallies and plate scores both read `'dish'` rows.
  `rating_kind` still exists because rows written before the 1–5 star restaurant review was retired carry `'restaurant'`, and those are **read** so an old post still renders as the stars it was entered as — `FoodPostCard`, `bubbleRating` in `/feed`, and `StarRating` are that read path. Never convert them: 4/5 and 80% answer different questions, and coercing one into the other would put a 4% plate into the average every restaurant score is now derived from.
  **A restaurant shows two numbers, and `src/lib/ratingDisplay.ts` owns the pair.** The plate score is ours and wears the orange accent; the Yelp/Google blend (`restaurants.rating`, written by `ratings:blend`) shows as muted stars *always printed with their `/5`*, because two numbers side by side is exactly when a bare `4.1` gets read as a percent. The blend is displayed because it carries the cold start — at launch most restaurants have no rated plates, and a corpus of "No plates rated yet" tells a visitor nothing.
  **`SHOW_BLEND_STARS` in that file is the switch that retires the stars**, and it is meant to be flipped once dish coverage is deep. Every surface that draws stars reads it, and Discover's "Top rated" switches from `TOP_RATED_STARS` (4.5) to `TOP_RATED_PERCENT` (85) off the same flag — so the filter never measures a scale the cards aren't showing. Don't add a star anywhere without gating it on this flag.
  When the plate score is null, the stars carry the surface alone and the gap is stated in words (`plateScoreLabel`) — never a borrowed number in the slot where a PlateMaps number goes.
- **`photos_public` is a snapshot**, frozen onto the post row at write time from the author's setting — never re-read live. `getDiscoverFeed` strips media server-side so a private photo's URL never reaches the response.
- **Counts that never display:** friend/follower counts, anywhere. `getFriends` returns rows without a total on purpose. Also no busyness or wait-time data — invented wait copy shipped once and was deliberately removed (PRODUCT.md). The one sanctioned exception is `ReservationPanel` + `src/lib/reservations.ts`, an unshipped booking prototype whose mock numbers are disclaimed in the UI; see PRODUCT.md before changing or deleting it.
- **The points economy lives in `src/lib/points.ts`.** Changing a number there changes the award logic, the info modal and the composer copy at once. **Pay-once awards are enforced by the reason string, not by the caller:** `milestone:<post>:<n>`, `upvote:<post>:<voter>` and `comment-upvote:<comment>:<voter>` each have a partial unique index on `point_events(reason)`, and `awardPoints` swallows the conflict and returns `awarded: false`. A route reporting earnings to the client must read `awarded` rather than assume — otherwise un-voting and re-voting floats "+1 point" for a payout the database refused. The `ON CONFLICT` predicates repeat their index predicates verbatim; that text is how Postgres picks the index, so `awardPoints` and `scripts/migrate.mjs` change together.

### Derived models

- **`src/lib/aspectScores.ts`** — turns per-review praise/fault taps into per-category star scores, anchored to the restaurant's own average and damped by sample size (`CONFIDENCE_K`). Pure arithmetic, no imports, so `npm run aspects:preview` can run it under plain Node. Rendered by `RestaurantAspects`.
- **`src/lib/discoverFilters.ts`** — the filter model *and* the URL round-trip. Three surfaces read it (desktop rail, mobile sheet, grid); facet counts must use the same predicate as the grid or the numbers lie.
- **`src/lib/openState.ts` + `clock.ts`** — open/closed is computed in `America/Los_Angeles` from real closing times, never a stored label. `clock.ts` is one shared minute tick behind `useSyncExternalStore`; `getServerSnapshot` returns null so prerendered output doesn't bake in build time. Don't add a `setInterval` to a component.

### Gotchas

- **The MapLibre worker is a committed static file.** `scripts/copy-maplibre-worker.mjs` runs on `postinstall` to copy it into `public/`. Without it the map silently renders nothing while still fetching tiles. Re-copy after upgrading `maplibre-gl`.
- **`archive/`** holds working components that are no longer rendered (the old side rail and mobile bottom bar), kept for a future mobile app. Nothing in `src/` imports it, but it is still typechecked so it can't rot silently. See `archive/README.md`.
- **Prefer the Edit/Write tools over PowerShell for file surgery.** `Get-Content`/`Set-Content` round-trip source files through the ANSI codepage on this machine, which corrupts em dashes and adds a BOM. `core.autocrlf` is `true`, so working-tree line endings are normalized by git and are not worth "fixing".
