# For me: a Discover button that ranks every place by your restaurant history

Planned 2026-11-03. Read-only analysis; nothing in `src/` or the database was changed. Numbers below come from SELECT-only queries run today plus reading the code.

## 1. Summary (plain words)

A "For me" button goes first in the Discover filter row on web and phone. Tapping it turns the whole grid into one list ordered by how well each place fits you. The ordering comes from the restaurants you have posted at or marked "been", the cuisines you picked in Your taste, and which places your friends have been to. "Fits" now means more than the cuisine label. A place is close to one of yours when it shares dishes (tacos, birria, ramen), cuisines (main plus secondary) and service style, read from the menu profiles you just loaded. Every card says why in one short line, like "Like Tajima Ramen: ramen, gyoza", and has Been here / Not for me buttons that retune the list. The ranking is computed on the server inside a private, uncached POST, so the public cached Discover GET never carries anything personal. The existing "Your taste" strip stays as the small preview and the place where you edit picks; its "See all" now opens For me. Signed-out and brand-new users get a "pick what you like" prompt plus a well-rated list, never an empty page.

## 2. Scores (1-10, higher is better; build size 10 = smallest)

Scored on each design's core idea plus the code facts verified in section 3.

| Design | (a) Data/user fit | (b) Privacy/caching | (c) Build size | (d) UX web+phone | (e) Reason quality | Total /50 |
|---|---|---|---|---|---|---|
| extend (widen `scoreTaste` in place) | 6 | 8 | 9 | 6 | 6 | 35 |
| similarity (item-to-item on profiles) | 9 | 6 | 6 | 6 | 8 | 35 |
| user-first (POST-carried personal rank) | 7 | 9 | 7 | 8 | 7 | 38 |
| **Final hybrid (below)** | 9 | 9 | 7 | 9 | 9 | **43** |

Why the hybrid wins:
- Base is user-first: personal ranking only on POST, `private, no-store`.
- From extend: reuse `scoreTaste`'s gate, exclusions, weights, `buildReason`, and the private `/api/account/taste` plumbing instead of a second engine.
- From similarity: item-to-item affinity over `dish_types` instead of cuisine share. Reason: 9 of the 12 users with posts have only 1-2 distinct places, and the cuisine-share signal needs 3 (`MIN_POSTS`, `tasteMatch.ts:66`). One seed is enough for similarity.
- Correction to all three: `forMe` is a URL mode key (`?foryou=1`), not a `DiscoverFilters` field. A field would force carve-outs in `activeFilterCount`, the location-prompt effect, the photo-first partition and Your-taste gating.

### Data that drove the scoring (SELECT-only, 2026-11-03)
- 8,411 listed restaurants (`listed IS NOT FALSE AND hold_reason IS NULL`), all with coordinates; 83 have no cuisine.
- Usable profile (`status='ok'`): 6,638 (78.9%). No profile row: 1,653. Profile row with `status='hold'` but still listed: 120. So 1,773 (21.1%) need imputation.
- `dish_types`: every ok profile has some (avg 5.75, 0 empty), 2,028 distinct raw strings, long head: salads 2,225, sandwiches 1,745, tacos 1,508, burritos 1,254, burgers 1,072. Generic terms need low weight (IDF) or removal.
- `styles`: 1,332 distinct, avg 1.04 per profile, mostly one-offs ("baja" 441, "sushi" 253). Not used in v1.
- Secondary cuisines on 3,231 listed restaurants (already on `RestaurantView.cuisineSecondary`, `restaurantTypes.ts:35`).
- `profile->>'service'`: counter 2,181, full_service 1,975, cafe 758, fast_casual 716, bar 307, bakery 246, unknown 182, fine_dining 92.
- 515 groups of ok profiles share an identical `dish_types` array (chain branches on one menu). Naive similarity makes a visited chain's sibling branch the #1 match, so siblings of a seed are barred from the matched block.
- Users: 12 users, 64 posts. Distinct places per user: 1-2 for 9 users, 5-9 for 1, 10+ for 2. There is no ground truth for tuning, so all constants below are starting values pinned by the check script.

## 3. Final design

### 3.1 UX
Web (`src/components/DiscoverBrowser.tsx`, `src/components/DiscoverFilters.tsx`):
- Below `lg`: a "For me" pill is the first item in the strip, left of the Filters button. On `lg+`: a full-width toggle at the top of `FilterRail`. On = orange fill, `aria-pressed`.
- Toggling edits only the `foryou` key in the URL (`?foryou=1`). It composes with filters: filter first, rank inside the result (decision D3). Facet counts and "Clear all" are untouched; Clear all does not turn For me off.
- While on, the grid has a header: mono label "For me", one line from the server (for example "From the 7 places you've been, plus Japanese and Thai"), and a Tune toggle that opens the same cuisine chips Your taste uses. The `TasteSection` carousel and `OurPicks` (mounted at `DiscoverBrowser.tsx:307-308` under `active === 0`) are hidden while For me is on, because the grid is the picks. The photo-first partition (`discover.ts`, only when `activeFilterCount === 0`) is skipped.
- Cards: reason line under the existing meta, same slot as `matchedDish` (`RestaurantCard.tsx:246`), one line, truncated. Been here and Not for me use the card wrapper `TasteSection.tsx` already renders (reason `<p>` plus the two `BTN` buttons, lines ~92-113). Extract that wrapper to a shared `TastePickCard` and use it in both places. The Undo toast comes from `useTaste`.
- A thin full-width divider row (`col-span-full`) separates "Matches" from "Also well rated" (decision D4).

Phone (`src/components/mobile/PhoneDiscoverScreen.tsx`, `PhoneFilterBar.tsx`):
- "For me" is the first chip in the horizontal row, before the tan Filters button (`PhoneFilterBar.tsx`), as a `Link` built with `hrefWith({ foryou: on ? null : "1", shown: null })`. `hrefWith` (`PhoneDiscoverScreen.tsx:41`) must re-add `foryou` the way it re-adds `nav`. Same orange when on, `min-h-11`.
- Header line above the grid in 13px text with a Tune link. Reason line in `PhoneRestaurantCardGrid.tsx` (the `matchedDish` slot at line ~131, `line-clamp-2` because the 2-column cards are narrow) and in `PhoneRestaurantCard.tsx:115`. `PhoneTasteSection` is hidden while on. Been/Not for me reuse the control `PhoneTasteSection` already has (read it first; it was not read for this plan).
- Show more is the existing `moreHref` (`shown + PAGE_SIZE`).

Relation to Your taste: not merged, not replaced.
- One scorer feeds both. Your taste stays the compact home-page strip and the edit surface for picks. Its carousel is the top of the same ranking.
- "See all" in both `TasteSection.tsx` (~264-268) and `PhoneTasteSection.tsx` stops expanding inline and becomes a link to `?foryou=1`.
- While For me is on the strip is hidden, so nothing shows twice. The chips live in the For me header Tune panel (extract the chip block of `TasteSection` into `TasteChips`).

Search text and order: text search keeps its relevance order. `apply` drops `foryou` when `q` is set, and the server treats `forMe` + `q` as plain relevance and answers `forMe.paused = true` so the client never waits forever. The default order today is "distance when a position exists" (`orderResults`, `discover.ts` ~419-447, Calvin 2026-09-15); For me replaces that default, with distance only as the tiebreak. There is no other explicit sort in `discoverFilters.ts`.

### 3.2 Scoring (extends `src/lib/taste.ts`)
Same total as Your taste:

    score = 100 x (0.5 A + 0.2 F + 0.2 Q + 0.1 N)      weights unchanged, WEIGHTS at taste.ts:17

- F = min(1, friends / 2); Q = quality (plate score and source rating, +0.15 photo); N = neighborhood share. All unchanged.
- A = 0.6 Apick + 0.4 Ahist when both exist, else whichever exists (unchanged blend). Apick unchanged (explicit loves, secondary cuisines at 0.4 as in `taste.ts` ~206).
- **New Ahist** (replaces cuisine-share): `Ahist = conf(k) x (0.75 x max_s sim(c,s) + 0.25 x mean of top 3 sim(c,s))` over seeds s. `conf(k) = min(1, 0.6 + 0.2 (k-1))` for k seeds (1 seed 0.6, 2 seeds 0.8, 3+ 1.0). The max keeps every taste family alive; the top-3 mean rewards density (eight Mexican visits beat one Thai visit).
- **sim(c,s) = 0.55 D + 0.30 K + 0.15 V**
  - D = IDF-weighted Jaccard of normalized `dish_types`: sum idf of the intersection / sum idf of the union, idf = ln(N / df).
  - K = weighted Jaccard of cuisines, main weight 1.0, each secondary 0.4.
  - V = 1 same `service`; 0.5 for counter/fast_casual, cafe/bakery, full_service/fine_dining, bar/full_service; else 0.
  - Normalization: lower-case, strip trailing s/es, small synonym map (fries/french fries, pasta/pastas), drop generics (appetizer, entree, dessert, side, special, beverage, drink).
- Seeds = restaurants the viewer posted at (`restaurantIdsPostedBy`) plus `been`, capped at the 30 most recent. Ratings and hearts are not used as signals; only "went there". Explicit loves still act through Apick.
- Imputation for the 1,773 candidates and seeds without an ok profile: D uses the cuisine centroid (top 8 dish terms by IDF among ok profiles of the same main cuisine), K uses main only, V = 0, then sim x 0.8. These are flagged `imputed` and may never produce a "shared dishes" reason. Null-cuisine places have A = 0.
- Gate (replaces `taste.ts:354`, `if (!(A > 0) && !(F > 0)) continue;`): matched block if `A >= 0.15 or F > 0`. Everything else goes to the tail block.
- Blocks: Block 1 (matches) sorted by score; Block 2 (tail) sorted by 100 x (0.2 Q + 0.1 N). One list, so the grid is never blank and Show more can reach `MAX_SHOWN` (240).
- Order stability: ties break on plate score then id; one pass over the full list, so `shown=24` is a prefix of `shown=48`.
- Exclusions: visited ids, `hidden`, and skipped cuisines are removed (applied right after `applyFilters` so totals and facets agree). Sibling branches of a seed (same `chainKey`, `taste.ts:218`) are barred from Block 1 but allowed in Block 2.
- Diversity (Block 1, single pass): `chainKey` dedupe keeping the best branch, then dedupe by dish-set hash + main cuisine; from position 6 a main cuisine may hold at most 40% of the prefix (`cuisineCapShare`), relaxing when the best alternative scores under half. No separate adjacent-cuisine quota in v1: max-over-seeds already surfaces cross-cuisine neighbors.
- Refactor: split `scoreTaste` (`taste.ts:278`) into `scoreAll` (every candidate scored, uncapped) and `rankTaste` (blocks, diversity), keep `scoreTaste` as a thin wrapper so Your taste output and `npm run taste:check` do not change. `restaurantTraits` (`taste.ts:209`, the cuisine-only seam) returns main + secondaries.

### 3.3 Data used from `restaurant_profiles`
Loaded: `dish_types`, `profile->>'service'`, `status` (ok only). Cuisine and secondaries already ride on `RestaurantView`, so no join. Not used in v1: `styles` (1,332 distinct), vibes, proteins, dietary, spice, summary, signature_dishes (candidate for richer reasons later).

Load path: new `getProfileTraitRows()` in `db.ts`: `SELECT restaurant_id, dish_types, profile->>'service' AS service FROM restaurant_profiles WHERE status = 'ok'`, about 6.6K rows, roughly 0.5 MB. Lazily loaded on the first For me request with its own 10-minute cache, not folded into `readCorpus` (`discover.ts` ~160), so ordinary Discover requests pay nothing. If the table or query fails, everything is imputed from cuisine and the feature still works. The IDF table and cuisine centroids are built once per loaded set (memoized).

### 3.4 API, routes, caching
- `GET /api/restaurants/discover` (`route.ts:25`): unchanged and public, CDN-cached by URL through `cachedJson`. If the URL carries `foryou` it answers 400 `no-store`, so a For me flavored URL can never be cached. It never reads the session.
- `POST /api/restaurants/discover` (`route.ts:35`): body gains `forMe?: true` and `prefs?: FullTastePrefs` (the signed-out or fallback localStorage copy, run through `sanitizePrefs`; lists capped). The response for `forMe` carries `Cache-Control: private, no-store` and `Vary: Cookie`. Flow: validate, `resolveTasteContext(req, prefs)`, `loadCorpus()`, `loadProfileTraits()`, `rankTaste`, then `getDiscoverPage(search, { shown, here, rank, exclude })`. Filters, facets, total and `shown` slicing are the existing code; `orderResults` gets a rank map (id to order) that wins over distance; `DiscoverResult` gains an optional `reason`; `DiscoverPage` gains optional `forMe`.
- Contract that both server and client steps code against:

      ForMeReason = { kind: "like" | "pick" | "friends" | "cuisine" | "rated"; text: string }
      DiscoverResult.reason?: ForMeReason
      DiscoverPage.forMe?: { basis: "history" | "picks" | "none"; header: string; seeds: number; matched: number; paused?: boolean }
      POST body: { search, shown, coords?, forMe?: true, prefs?: FullTastePrefs }

- Identity comes from the session only; there is no user id in any request, as in `/api/account/taste`. Extract that route's viewer resolution (prefs with the `TasteTableMissingError` fallback, visited ids, friend visits) into `src/lib/tasteContext.ts` and use it from both routes.
- Rate limit: signed-in For me reuses the `taste:user` scope (120 per 10 min, `account/taste/route.ts:77`); add a per-IP scope for signed-out calls (new scope in `src/lib/rateLimit.ts`), because the scorer is compute.
- Static shells `/` and `/m` (revalidate 60) stay static. `?foryou=1` is answered client-side like every other query, via POST.
- Client (`src/lib/useDiscoverQuery.ts`): add `foryou` to `NOT_FILTERS` (line 38) so it never enters the filters or the GET; expose `forMe`; include `forMe` and a `tasteRev` in the `wanted` key (line 80); fire the POST when `coords || forMe`; wait for `useAuth().resolved` before the first For me POST so a signed-out ranking never flashes before the personal one. The answer carries `forMe`; `pending` (line 116) is true whenever the requested `forMe` differs from the answer on screen, which draws the skeleton. Without this, a bare `?foryou=1` would paint the default-order shell as if it were personal. `useTaste.ts` exports `readLocalTaste` (today the private `readLocal`) and a `tasteRev` counter bumped on love/unlove/skip/unskip/reset. Been/hide remove the card locally with the existing Undo and do not refetch; the next page request already carries them in `prefs`.

### 3.5 Cold start and signed-out
- Signed-in, enough seeds: normal.
- Thin history (1-2 places, 9 of 12 users): works from 1 seed with `conf(k)` scaling; the header says "Based on 1 place so far; post more to sharpen this". Decision D2 lowers the gate from 3 to 1; Your taste's cuisine-share part keeps `MIN_POSTS`.
- Signed-out with picks or `been` in `pm.taste.v1`: ranked from those (local prefs travel in the POST body, never stored server-side).
- No signal at all: the matched block is empty; show the Tune chips as a "What do you like?" prompt, a "Sign up to keep your picks" nudge (same link Your taste uses), then the tail ("Also well rated"). Never fake matches.

### 3.6 Reasons (one short honest line per card, max 48 chars, server-built)
Priority by the dominant contributor:
1. `like`: "Like {seed name}: {1-2 shared dish terms}" (needs non-imputed profiles and a non-empty intersection; if only cuisine overlaps, "Like {seed name}: both {cuisine}").
2. `pick`: "You picked {cuisine}".
3. `friends`: "{n} friends have been" (counts only, as `buildReason` does today).
4. `cuisine`: "More {cuisine}" for imputed matches.
5. `rated` (tail): "Well rated in {neighborhood}" only when Q >= 0.6, otherwise "Different from your usual".
Seed names appear only in the private POST response.

### 3.7 Feedback loop
Been here and Not for me use the existing `useTaste` ops (`been`, `hide`) and optimistic card removal with Undo. Love/skip chip changes bump `tasteRev` and refetch. Been adds a seed, so the list tunes itself. No new tables, no hearts or ratings.

## 4. Build steps (10, plus a gate)

Steps in the same group can run in parallel (Sonnet agents; give each only its files and the contract in 3.4).

Step 0 (gate, you): land the uncommitted Your taste and enrichment work first (decision D1); For me edits the same files.

Group A (independent):
1. Profile traits: new `src/lib/profileTraits.ts` (normalize, IDF, centroids, `similarity`, imputation; pure) and `getProfileTraitRows()` in `src/lib/db.ts`.
2. Taste context: new `src/lib/tasteContext.ts`; refactor `src/app/api/account/taste/route.ts` to call it (behavior unchanged).
3. Client hook: `src/lib/useDiscoverQuery.ts`, `src/lib/useTaste.ts` (`readLocalTaste`, `tasteRev`), `src/lib/discoverFilters.ts` (export the `foryou` key; confirm `searchFromFilters` leaves it alone).

Group B (needs 1 and 2; the two can run in parallel, B2 may stub `rankTaste`):
4. Ranking: `src/lib/taste.ts` (`scoreAll`, `rankTaste`, thin `scoreTaste`, new Ahist, gate, `like` reasons).
5. Pipeline: `src/lib/discover.ts` (`rank`, `exclude`, skip photo-first, attach `reason`), `src/app/api/restaurants/discover/route.ts` (POST `forMe`, GET 400, headers), `src/lib/discoverWire.ts` (types), `src/lib/rateLimit.ts` (signed-out scope).

Group C (needs 3 and 5; all three in parallel):
6. Web UI: `src/components/DiscoverBrowser.tsx`, `src/components/DiscoverFilters.tsx` (pill in strip and rail), `src/components/RestaurantCard.tsx` (reason slot), `src/components/TasteSection.tsx` (See all link, `TasteChips` and `TastePickCard` extraction).
7. Phone UI: `src/components/mobile/PhoneDiscoverScreen.tsx`, `PhoneFilterBar.tsx`, `PhoneRestaurantCard.tsx`, `PhoneRestaurantCardGrid.tsx`, `PhoneTasteSection.tsx` (See all link).
8. Check script (needs 4): new `scripts/check-forme.mjs` plus a `forme:check` entry in `package.json`.

Group D (sequential, last):
9. Verify: `npx tsc --noEmit`, `npm run taste:check`, `npm run forme:check`, `npm run build`.
10. Chrome screenshots (once, at the end), then update `probe/RESUME.md`.

Gate G1 (your "show an example first" rule): after step 6, one seeded web screenshot for your OK before polishing phone.

## 5. Verification plan

`scripts/check-forme.mjs` (no framework, same shape as `check-taste.mjs`; deterministic fixture plus a read-only live-corpus replay that skips offline and never prints secrets):
1. Ramen seed ranks ramen/izakaya Japanese above generic Japanese above Thai; a birria seed pulls Mexican-seafood via secondaries.
2. Two seeds from different families (ramen + birria): both families appear in the top 24. A single seed still gives a sensible list.
3. A chain sibling of a seed is absent from Block 1; chain dedupe keeps one branch.
4. An imputed candidate scores below its profiled twin and its reason never mentions dishes.
5. Visited, hidden and skipped-cuisine places never appear; `been` acts as a seed.
6. Prefix stability: the first 24 of a 48-result run equal the 24-result run, over shuffled input order and two runs.
7. Block order: no tail item before a matched item; a zero-signal user still gets a non-empty list.
8. Reasons: all present, 48 chars or fewer, a `like` reason names a real seed and a term in both profiles.
9. Thin history (1 seed) returns matches; `conf(k)` scales.
10. Privacy (against a dev server): GET with `foryou` is 400; GET responses are byte-identical with and without a session cookie and have no `Set-Cookie`; the For me POST has `private, no-store`.
11. Live replay: no NaN, sim(self) = 1, sim symmetric, matched-block size distribution printed per sample user, rank time for 8.4K candidates x 10 seeds well under 150 ms (an estimate, not yet measured).
12. Regression: `npm run taste:check` unchanged and green; `npx tsc --noEmit` clean.

Chrome (new tab through `browser_batch`, once at the end; not the in-app pane):
- Web 1440 wide: `/` with the pill first in the rail; signed-out empty prompt plus tail; seeded `pm.taste.v1` with 3 `been` ids shows the For me grid with reason lines; `?foryou=1&cuisine=Mexican` composes; Your taste "See all" switches the URL; Show more keeps the first 24.
- Phone 390x844: `/m` chip row with For me first; `/m?foryou=1` grid with reason lines (no clipping at 2 columns); Been/Not for me and Undo.
- Network: the POST `cache-control` is private/no-store; no `foryou` on any GET.
- A signed-in screenshot needs your login; ask you to check one signed-in view.

## 6. Decisions for you (recommended default first)

- D1. Land the current uncommitted Your taste + menu-enrichment work before building? Default: yes, commit it as its own commit(s) first, since For me edits `taste.ts`, `DiscoverBrowser.tsx`, `PhoneDiscoverScreen.tsx`, `useDiscoverQuery.ts` and `discoverFilters.ts`.
- D2. Lower the history gate from 3 posts to 1 so thin-history users (9 of 12) get recommendations? Default: yes, with `conf(k)` scaling; Your taste's cuisine-share part keeps 3.
- D3. Should For me compose with filters (For me + Mexican ranks inside Mexican)? Default: yes; text search still wins and pauses For me.
- D4. After the matches, keep going with a divided "Also well rated" tail, or stop at matches? Default: keep the tail, so the grid never ends short.

## 7. Open risks

- Evidence is thin: 12 users, 64 posts, no ground truth. All constants (0.55/0.30/0.15, the 0.15 gate, the conf curve, 0.8 imputation, the 40% cap) are starting values, only tested for shape. Matched-block size on real data is unmeasured; the check script prints it.
- 21.1% of listed places have no usable profile and rank on cuisine only. 120 listed places carry a `hold` profile and are treated the same. Chain branches share identical profiles (515 groups); the chain and dish-set dedupe is what keeps the top 24 from filling with one menu.
- Static-shell flash: if `pending` is not keyed on `forMe`, the default-order shell shows as personal. Covered in 3.4 and by a screenshot check.
- The corpus refreshes every 60 s (10 min stale max), so rank can shift between two Show more clicks; prefix stability holds only within one corpus copy.
- `taste_prefs` is missing in Neon (pending in `scripts/migrate.mjs` from another session), so prefs fall back to localStorage. For me works either way; running the migration is a separate call.
- Several touched files carry uncommitted edits from other sessions (`DiscoverBrowser.tsx`, `PhoneDiscoverScreen.tsx`, `discoverFilters.ts`, `db.ts`, `package.json`); hence D1.
- Privacy: reasons name the viewer's own places and appear only in the private POST; keep that body out of logs. Friend reasons show counts, not names.
- Compute: each For me POST scores every filtered candidate against up to 30 seeds; the cost is small but unmeasured, and the signed-out path needs its own rate limit.
- `PhoneTasteSection.tsx` and parts of `TasteSection.tsx` (lines 170-225) were not fully read for this plan; steps 3, 6 and 7 start by re-reading them.
- No distance or "open now" factor in v1; nearness is only the existing `here` tiebreak.
