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

**The migration is not finished.** `DiscoverBrowser` still receives every restaurant and filters in the browser, so the payload still grows with the table — the win so far is that the data is somewhere paginable and the page has a server boundary to paginate at. Server-side filtering is the next step and it changes Discover's interaction model (facet counts currently come from the same client-side predicate as the grid, deliberately).

`posts.restaurant_id` is a soft reference, not a foreign key — `fetch-restaurants.mjs` rewrites the id space wholesale, and an FK would turn a data refresh into a cascade through everyone's reviews.

`/` sets `revalidate = 300`. Without it Next prerenders the page at build time and an import would not show up until the next deploy.

### `src/lib/db.ts` is the only database module

It imports the Neon client at module scope, which makes it **server-only**. Client components that need a row shape declare a local mirror type with a comment pointing back at the original (`src/app/friends/page.tsx` has two) rather than importing from `db.ts` — importing it into a client component pulls the driver into the browser bundle.

Auth is a session cookie (`platemap_session`) → `sessions` table → user. `getCurrentUser()` in `src/lib/session.ts` is how every API route resolves the caller; passwords are bcrypt.

### Invariants that are easy to break

These are enforced by convention and long comments rather than by types. Read the surrounding comment before touching any of them.

- **Upvotes are public, hearts are private.** `getDiscoverFeed` must never join `post_hearts`. `hydratePosts` reads hearts only as "did *this viewer* heart it", never the list. Exactly two functions materialize a full heart list and both are author-only: `getHeartsForAuthor` (explicit check, throws) and `getActivityForAuthor` (scoped by construction — its `mine` CTE is the only source of post ids). Its route, `/api/account/activity`, takes no `userId` and must never grow one. Any third one must be author-only too. **Upvoters are never named, to anyone, including the author** — the upvote branch of `getActivityForAuthor` has no `users` join and keys its rows by timestamp rather than user id, so there is no name to leak; hearts naming their sender is the deliberate asymmetry.
- **`rating_kind` splits two incompatible scales.** `'restaurant'` = 1–5 stars about a place; `'dish'` = 0–100% about one plate. Never average across them. Aspect tallies read `'restaurant'` rows only.
- **`photos_public` is a snapshot**, frozen onto the post row at write time from the author's setting — never re-read live. `getDiscoverFeed` strips media server-side so a private photo's URL never reaches the response.
- **Counts that never display:** friend/follower counts, anywhere. `getFriends` returns rows without a total on purpose. Also no busyness or wait-time data — invented wait copy shipped once and was deliberately removed (PRODUCT.md). The one sanctioned exception is `ReservationPanel` + `src/lib/reservations.ts`, an unshipped booking prototype whose mock numbers are disclaimed in the UI; see PRODUCT.md before changing or deleting it.
- **The points economy lives in `src/lib/points.ts`.** Changing a number there changes the award logic, the info modal and the composer copy at once. Milestones fire once per post, enforced by a unique index on the `point_events` reason string.

### Derived models

- **`src/lib/aspectScores.ts`** — turns per-review praise/fault taps into per-category star scores, anchored to the restaurant's own average and damped by sample size (`CONFIDENCE_K`). Pure arithmetic, no imports, so `npm run aspects:preview` can run it under plain Node. Rendered by `RestaurantAspects`.
- **`src/lib/discoverFilters.ts`** — the filter model *and* the URL round-trip. Three surfaces read it (desktop rail, mobile sheet, grid); facet counts must use the same predicate as the grid or the numbers lie.
- **`src/lib/openState.ts` + `clock.ts`** — open/closed is computed in `America/Los_Angeles` from real closing times, never a stored label. `clock.ts` is one shared minute tick behind `useSyncExternalStore`; `getServerSnapshot` returns null so prerendered output doesn't bake in build time. Don't add a `setInterval` to a component.

### Gotchas

- **The MapLibre worker is a committed static file.** `scripts/copy-maplibre-worker.mjs` runs on `postinstall` to copy it into `public/`. Without it the map silently renders nothing while still fetching tiles. Re-copy after upgrading `maplibre-gl`.
- **`archive/`** holds working components that are no longer rendered (the old side rail and mobile bottom bar), kept for a future mobile app. Nothing in `src/` imports it, but it is still typechecked so it can't rot silently. See `archive/README.md`.
- **Prefer the Edit/Write tools over PowerShell for file surgery.** `Get-Content`/`Set-Content` round-trip source files through the ANSI codepage on this machine, which corrupts em dashes and adds a BOM. `core.autocrlf` is `true`, so working-tree line endings are normalized by git and are not worth "fixing".
