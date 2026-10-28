# Retag scope: one main cuisine + secondary cuisines from menus (2026-10-27)

Question: how hard is it to go through every restaurant's menu and redo the tags so each restaurant has ONE main tag but still fits under other tags, for the similarity (taste-match) score and for the filter.

Status: scoping only. Nothing built, nothing written to Neon, no tracked file touched. This file is the only artifact.

## Verdict

Size: M. Code is small (S to M). The data job is the real cost, because secondary tags do not exist anywhere today and have to be authored from menus.

- Scope: 9,023 listed restaurants. 7,084 have menus (563,439 dishes; 6,077 distinct menus). 1,939 have none.
- Wall time: about 1.5 to 2.5 hours of agent run time (about 105 to 120 Sonnet agents, 8 at a time), plus about 1 hour to build dump/apply scripts, 1 hour review, 1.5 to 2.5 hours code. Roughly a working day end to end, most of it unattended.
- Order matters: ship the column and the code first (a null secondary behaves exactly like today), then apply data. Nothing breaks in between.

## 1. Current state

- `restaurants.cuisine` (text): the single canonical bucket, one of 29. The ONLY thing the filter and the taste radar read. 159 of 9,023 listed rows are NULL (561 NULL across all 14,199 rows).
- `restaurants.cuisine_raw` (text): original source label (`mexican_restaurant`, `Cafe`, `restaurant`). About 310 distinct raw labels among live rows; 1,000 live rows are just "restaurant".
- `restaurants.cuisine_tags` (text, NOT an array): space-joined search blob built by `tagsFor()` from the raw label plus SYNONYMS plus the 2026-09-13 brand union. Non-empty on 7,976 live rows, 221 distinct words, mostly synonyms ("restaurant" 2,289, "breakfast" 1,767). Only about 325 live rows name another bucket once the "Breakfast" synonym is excluded. It is not a secondary cuisine and must not be used as the filter source ("Latin American" splits into two words).
- No `types` column, no secondary array. `users.favorite_cuisine` (1 row set) and `posts.tags` (empty) are unrelated.
- Live counts per cuisine: Mexican 1383, Coffee & Tea 1122, Bakery & Desserts 948, Bars 906, American 472, Japanese 457, Pizza 434, Mediterranean 273, Sandwiches 272, Italian 266, Breakfast & Brunch 248, Chinese 219, Seafood 213, Burgers 200, Thai 177, Asian 157, Juice 141, Vietnamese 141, BBQ 112, Chicken 108, Indian 103, Fast Food 100, Hawaiian 98, Vegetarian 80, Korean 68, Latin American 57, Steakhouse 49, French 43, African 17. All 29 in use.
- Vocabulary lives in `src/data/cuisines.ts` (591 lines): `CUISINES` (29), `ALIASES`, `UNSET`, about 55 `SYNONYMS`, `canonicalCuisine()`, `tagsFor()`.
- Existing writers (all single-valued, none writes a second cuisine): `import-osm.mjs`, `normalize-cuisines.mjs` (rebuilds `cuisine` and `cuisine_tags` from `cuisine_raw` plus brand union), `backfill-cuisine.mjs`, `infer-cuisine.mjs` (fills blanks only), `apply-cuisine-decisions.mjs` (blanks only), `discover-serper.mjs`.
- Same chain, different tag today: Dirty Birds 5 listed locations carry 3 cuisines (Chicken x2, Bars x2, American x1); Mendocino Farms 8 locations, 7 Sandwiches and 1 Vegetarian on an identical 36-item menu. Menu-based tagging unifies these.
- Calvin's standing call (RESUME.md): "if it's ambiguous, label them as both". This job is the general form of that.

## 2. Menu coverage and what to do without menus

Menus are in Neon (`dishes`: name, description, section, price; `menu_lookups`: source_url, confidence, dish_count). The `menus/` directory is old batch JSON, not authoritative. RESUME.md stats block is stale.

- 7,084 listed (78.5%) have menu items. Median 52 items, mean 67.5, p10 18, p90 131, max 1,650. 168 menus under 10 items, 471 over 150.
- 1,939 have no menu. 1,938 have `cuisine_raw`, 1,847 have a `cuisine`, 1,663 have `cuisine_tags`, 1,200 have a website. Only 1 has no signal at all.
  - About 1,000 have a usable signal (specific raw label or specific cuisine): keep the main as is; add a secondary only when the name or an existing tag clearly says so ("Cafe de Thai And Sushi"). No external calls.
  - 931 are weak (generic raw label, null cuisine, or Bars / Coffee / American / Asian / Fast Food; current cuisines Bars 427, Bakery 383, Coffee 306, null 92). Phase 2, optional: name + website, or Serper / WebSearch (Google Places and Yelp stay forbidden). RESUME says Serper credits ran out 2026-10-14; not re-checked. If no credits, leave these on their current main with no secondary. That is a valid end state.
- Chains: 601 names cover 1,853 rows and copy the nearest branch's menu. Classify once per chain name (or per menu hash) and fan out: about 7,800 units instead of 9,023.
- Junk that misleads a classifier: about 554 junk dish rows on 52 listed restaurants ("OUT OF STOCK" 305 rows on 49 restaurants, "Close", "Card Fee", "Unavailable"; `junk-delete.mjs` is pending). Filter these in the dump; do not run the delete as part of this job. Known identity problems to pre-seed as HOLD: Barona shared 6-vendor menu, id 3163 holding the Encore Sushi menu, Babe (cosmetics store), Sushi Hana (spam-site source). Also 583 single-section menus, 1,464 menus from Google menu photos, 785 from delivery platforms (affects prices, not cuisine).

## 3. The data job

Classifier rules (the original rule plus the three verifier rules; this is the brief):

1. Count food rows only. Drop drinks (including beer and wine lists), sides, kids, merch, cover charges, bottle service, "OUT OF STOCK" and other non-dish rows before counting. Never derive a secondary from drink rows. Coffee & Tea is allowed only when drinks are the whole food menu (Em Coffee House).
2. Main = largest coherent food group, judged by section, not raw row count (Cravory has 391 cookie SKUs).
3. Secondary = at least 15% of remaining food rows AND at least 4 matching rows, or the cuisine is named in the title. Cap 3. Count each item once (one item cannot feed both main and a secondary). A dietary or substitution section (vegan, gluten-free) is not a cuisine.
4. Venue tags (Bars, Fast Food) come only from the existing tag or the name, never from the menu. Food decides the main; a venue main is replaced by the food cuisine and the venue tag is kept as a secondary.
5. HOLD (keep current tag, secondary NULL): fewer than 10 food rows, mostly one-item sections, retail/merch majority, or a known identity-problem menu.
6. If the top two groups are within 2 rows, the restaurant name decides and the result is marked low confidence.

Batches and agents:
- Dump script (new, `scripts/retag-dump.mjs`, SELECT only) writes `probe/retag/in-NNN.txt`: `id | name | current cuisine | raw | top sections with food-row counts | up to ~40 capped dish names`. About 300 tokens per restaurant, about 2.3M tokens total. Descriptions skipped (would be about 6.5M).
- 75 rows per agent, about 105 to 120 Sonnet agents (memory rule: subagents run on Sonnet, never Opus). 8 concurrent, replace each as it finishes.
- Output per agent: `probe/retag/out-NNN.txt`, one line per id: `<id> | <Main> | <Sec1,Sec2> | <H/M/L> | <note, 12 words max>`. To skip a row remove the line; never blank the cuisine (a blank retires the restaurant, per the downgrade-by-deleting note).
- Pilot first: 2 batches (150 rows) plus the 30-restaurant sample as a regression set, read before launching the rest.
- Alternative: the `infer-cuisine.mjs` pattern (keyword stage + claude-sonnet-5 structured output with an enum of the cuisines, `@anthropic-ai/sdk` and `zod` already installed) finishes in minutes for a few million tokens, but `ANTHROPIC_API_KEY` is not in `.env.local` or the shell. Blocked until the owner adds one.
- Wall time (estimate, not measured): about 1.5 to 2.5 hours for the agent wave including review, about 1 hour to build dump/apply scripts.

Review:
- Second-agent verifier on a 10% random sample (the sample verifier agreed with 28 of 30 mains and 22 of 30 secondary lists, so expect roughly 7% main disagreement and about a quarter of secondary lists needing a trim without the rules above).
- Human/agent review of every L-confidence row, every main that moves out of Bars or Fast Food, and every HOLD.

Snapshot and apply (per the snapshot-before-bulk-SQL rule):
- `scripts/retag-apply.mjs`: validates every value against `CUISINES` (plus the new tag if approved), secondary not equal to main, max 3, deduped; skips unknown ids and ids not currently listed; dry-run prints a diff count (mains changed, secondaries set, nulls filled, holds) before anything is written.
- Snapshot first: write `probe/snapshots/retag-<date>.json` with id, cuisine, cuisine_tags, cuisine_secondary for every row to be touched. Verify the file is non-empty before the first write.
- One parameterised `UPDATE ... WHERE id = $1` per row (never split a script on newlines; refuse any statement without WHERE; never touch `listed` or `hold_reason`).
- Secondaries are applied for all non-hold rows (additive, reversible by setting NULL). Mains are applied for H and M confidence; L-confidence main changes go to `probe/retag/review-mains.txt` instead.
- Rollback: restore from the snapshot by id.

## 4. Code changes (about 6 files plus 2 supporting, about 60 to 100 lines)

Schema:
- `migrate.mjs`: add `cuisine_secondary TEXT[]` of canonical names. NULL or empty means no secondary. No index needed; the filter runs in memory over the cached corpus.
- Shipping the column and code before the data is a no-op for users.

Filter semantics: main OR secondary.
- `discoverFilters.ts:525`: predicate becomes `r.cuisine === f.cuisine || r.cuisineSecondary?.includes(f.cuisine)`. Put it in one helper (`hasCuisine(r, c)`) so every site shares it.
- `discoverFilters.ts:634-636` `matchMarksFor`: highlight a card on a secondary match too.
- `discoverFilters.ts:770-796` `countFacets`: a row counts toward each of its cuisines, or facet counts and results disagree.
- `discoverFilters.ts:672-690` `optionsFor` / `cuisineOptions`: facet totals and order use the same helper.
- `:911` `promote` and `:945-963` URL parse: no change.
- `suggest.ts` about 96-155: the "Thai (N)" line goes to `?cuisine=Thai`, so N uses the same helper; bump secondaries at `:145`.
- `restaurantTypes.ts`: add `cuisineSecondary?: string[]`. `db.ts`: map the column in the restaurant selects.
- Web and phone: `DiscoverFilters.tsx`, `PhoneFilterSheet.tsx`, `PhoneDiscoverScreen.tsx` render from `discover.ts`, so the shared libs update both. No UI edits needed (functionality universal; only an optional visual "also Thai" mark is design work).
- Caching: corpus cached 60 seconds, so a backfill shows within about a minute.

Display: main only. No change to `RestaurantCard.tsx:207`, `PhoneRestaurantCardGrid.tsx:158-168`, `PhoneRestaurantCard.tsx:107`, `PhoneDetailHero.tsx:149`, `RestaurantHeader.tsx:76`, `OurPicks.tsx:100`, `RestaurantPicker.tsx:142,230`. `RestaurantMap.tsx` has no cuisine layer.

Search: no code change needed. `textMatch.ts:552-575` scores tags at tiers 900-920 and the main cuisine at 930-960, so if secondary names are appended to `cuisine_tags`, main beats secondary for free. Caveats:
- `normalize-cuisines.mjs` rebuilds `cuisine_tags` from `cuisine_raw` plus the brand union, so appended secondaries are wiped on its next run. Either make it union in `cuisine_secondary` or skip appending and accept that search finds secondaries only through the filter.
- Do not add the new column to the `searchRestaurants` SQL haystack (`db.ts:3673-3678`); `idx_restaurants_search_v2` would need rebuilding to match.

Taste-match weighting (recommended: split weight, main-heavy):
- `tasteMatch.ts` already works on shares (`count/total`, `:98-102`; sums at `:200`), so fractional counts need no change there. The change is `getCuisineCounts` (`db.ts` about 1169-1174): replace `COUNT(*)::int` grouped by `r.cuisine` with a weighted sum over main plus unnested secondaries.
- Weights: place with no secondary counts 1.0 for its main. Place with secondaries: main 0.7, secondaries share 0.3 (1 secondary 0.7/0.3; 2 secondaries 0.7/0.15/0.15; 3 secondaries 0.7/0.1/0.1/0.1). Each post still sums to 1.0, so `MIN_POSTS` (`total(counts)`) stays exact.
- Rejected: main-only (today's behaviour, defeats the point); main 1.0 plus partial secondaries (weights exceed 1 per post, `MIN_POSTS` trips early).
- Check the return type change (int to float) at every consumer of `getCuisineCounts`. Add fractional cases to `scripts/check-taste-match.mjs` (its cases use integer counts today). Taste data is tiny (48 posts, 7 users), so no load risk.

Existing writers: no change required for correctness (a new row with no secondary just appears under its main). Re-run the retag pass periodically on new rows rather than editing `import-osm.mjs`, `backfill-cuisine.mjs`, `infer-cuisine.mjs`, `discover-serper.mjs`.

Performance: `countFacets` makes about 13 passes over 9k rows; an array `includes` on 1 to 3 items is negligible.

## 5. Sample: 30 restaurants re-tagged by reading their menus (read-only), verifier corrections folded in

Sample selection: 10 required ids, 14 picked to stress the idea (sports bars, diners, a food hall, sushi-plus-Thai/Vietnamese, taco+burger, bagel/bakery), 6 hash-ordered random (Harland, Cotija's, Beverly Beach, BJ's, Kendall's, Pacific Point). The stress picks inflate the change rate.

| id | name | current | main (final) | secondary (final) | main changed? | note |
|---|---|---|---|---|---|---|
| 6974 | Hot Chickz & Pizza | Pizza | Pizza (low conf) | Chicken, Burgers | no | coin flip: 8 pizza vs 7 chicken items; name leads with Chicken; flag for review; appears under both either way |
| 4040 | Mendocino Farms (Univ Hts) | Sandwiches | Sandwiches | Salads & Healthy (if added) | no | 16 of 36 sandwiches/banh mi, 9 salads and wraps |
| 8699 | Eggies | Breakfast & Brunch | Breakfast & Brunch | Sandwiches | no | Coffee & Tea dropped (5 drink rows) |
| 180 | Breakfast Republic (Liberty Stn) | Breakfast & Brunch | Breakfast & Brunch | none | no | Vegetarian dropped: vegan section is 6 of 45 (13%) and is a dietary section |
| 10544 | Em Coffee House - Mission Valley | Coffee & Tea | Coffee & Tea | Vietnamese, Bakery & Desserts | no | drinks are the whole menu, so Coffee & Tea main is allowed |
| 9007 | sweetgreen (Mission Valley) | Vegetarian | Salads & Healthy (if added) | none | yes, only with new tag | chicken/steak/salmon salads; about 5 of 30 food rows vegetarian; without the new tag it stays Vegetarian |
| 850 | Oggi's Pizza Express | Pizza | Pizza | none | no | 25 of 40 pizza |
| 159 | Dirty Birds (Pacific Beach) | Bars | Chicken | Burgers, Bars | yes | wings, tenders, sandos; Bars kept from existing tag |
| 8875 | Slurp (Liberty Station) | Thai | Chinese (low conf) | Thai | yes | 21-item menu, about 10 Chinese to 5 Thai; coin flip, review |
| 243 | Madi (Kensington) | Breakfast & Brunch | Breakfast & Brunch | Sandwiches | no | Mexican dropped (3 rows, about 8%) |
| 8060 | Taco de Ojo Sports Cantina | Bars | Mexican | Seafood, Burgers, Bars | yes | fajitas, esquites, mariscos |
| 1024 | Jts Clubhouse Pub and Grill | Bars | American | Mexican, Burgers, Bars | yes | pub food; burritos/tacos 13, burgers 13 of 54 |
| 595 | Kaminski's Sports Lounge and BBQ | BBQ | BBQ | American, Bars | no | ribs, brisket; 17-item pub share list |
| 2802 | Kendall's Cafe (Borrego) | American | American | Breakfast & Brunch, Mexican, Sandwiches | no | diner; breakfast about 47, Mexican about 28, sandwiches 16 of 132 |
| 7655 | Sun Gold Point Diner | Coffee & Tea | Breakfast & Brunch (low conf; Bakery & Desserts is a near tie) | Bakery & Desserts, Coffee & Tea | yes (verifier) | baked/dessert about 48 rows, morning menu about 49, coffee/tea 19 of 176; Bars dropped (38 beer/wine SKUs are drink rows) |
| 13227 | E.A.T Marketplace | Bakery & Desserts | HOLD (keep Bakery & Desserts) | none | no | 135 one-item sections, 28 "OUT OF STOCK", non-dishes ("Reservation August 30"); has an Italian block of about 15 rows |
| 8878 | Cafe de Thai And Sushi | Thai | Thai | Japanese | no | Thai about 55% of 314 items, sushi about 40% |
| 629 | Bamboo Pho & Sushi | Japanese | Japanese | Vietnamese | no | about 28 of 42 Japanese |
| 9875 | Baja Fish Tacos & Burgers | Seafood | Mexican | Seafood, Burgers | yes | tacos/burros/quesadillas about 80% |
| 6627 | The Cravory | Bakery & Desserts | Bakery & Desserts | none | no | 597 rows are all cookie SKUs |
| 1329 | Einstein Bros. Bagels | Bakery & Desserts | Bakery & Desserts | Breakfast & Brunch, Sandwiches | no | Coffee & Tea dropped (hot coffee = drink rows); egg sandwiches count once, so these two may shrink |
| 5141 | Albertaco's | Fast Food | Mexican | Fast Food | yes | whole menu is burritos, tacos, tortas, combos |
| 3743 | Greek Style Chicken | Fast Food | Mediterranean | Chicken, Sandwiches, Burgers | yes | 30 Greek combos plus gyros; sandwiches 23, burgers 14 of 85 |
| 6067 | The Beverly Beach Garden | Bars | Bars | Mexican | no | 199 of 326 rows are drinks; main kept by judgment |
| 4841 | BJ's (Mission Valley) | American | American | Pizza | no | pizzas 19 of 133 |
| 10013 | Pacific Point (Encinitas) | null | Japanese | Seafood | null filled | sushi/sashimi 19 of 42; American dropped (catch-all from about 5 rows) |
| 446 | Mendocino Farms (UTC) | Vegetarian | Sandwiches | Salads & Healthy (if added) | yes | identical 36-item menu to 4040 |
| 263 | Dirty Birds (Rolando) | Chicken | Chicken | Burgers, Bars | no | same menu as 159 |
| 9700 | Harland Brewing Co - Scripps Ranch | Bars | HOLD (keep Bars) | none | no | menu is 123 merch rows, no food or beer |
| 6449 | Cotija's Taco Shop | Mexican | Mexican | none | no | breakfast 16 and seafood 11 of 228, each under 8% |

Totals after verifier corrections (my recount from the table):
- Mains changed: 11 of 30 (37%): 9 real changes with the existing vocabulary, plus sweetgreen only if "Salads & Healthy" is added (10 real), plus 1 null fill (Pacific Point). Hot Chickz would be a 12th if the name rule flips it to Chicken.
- 5 of those changes are venue mains replaced by food (Dirty Birds, Taco de Ojo, Jts from Bars; Albertaco's, Greek Style Chicken from Fast Food).
- Not representative: the 24 chosen restaurants had 10 real changes; the 6 random ones had 0 real changes and 1 null fill. A full-corpus rate nearer 5 to 15% of mains (about 450 to 1,350 rows) is more plausible than 37%. This is my judgment, not measured.
- Secondaries: 23 of 30 get at least one (original proposal 26 of 30), 39 tags total, average 1.3 per restaurant (original 48 tags, 1.6). 4 hit the cap of 3 (original 6).
- HOLD / no menu-based tag: Harland and E.A.T were named; the original run flagged 4 menus in total as unable to support a menu-based tag.
- Verifier agreement before corrections: mains 28 of 30 (misses: Sun Gold, E.A.T), secondaries 22 of 30. Corrections applied: Sun Gold main, E.A.T hold, and secondaries trimmed for Eggies, Breakfast Republic, sweetgreen, Madi, Einstein, Pacific Point.
- Same-chain consistency: Dirty Birds (5 locations, 3 cuisines today) and Mendocino Farms (8 locations, 2 cuisines) become consistent.

Vocabulary gaps seen:
1. Salads & Healthy: sweetgreen and Mendocino Farms (8 locations) borrow Vegetarian but their food is mostly chicken, steak, salmon. Recommend adding it as a 30th cuisine. Touches `CUISINES`, `ALIASES`, `SYNONYMS`, and the 80 current Vegetarian rows should be re-read.
2. Bars and Fast Food describe the venue, not the food. They work best as secondary tags; rule 4 handles this.
3. Cafe/diner (Sun Gold, Kendall's) and wings/pub food (Dirty Birds) have no value. Recommend no new tags: map to Breakfast/American/Chicken.

## 6. Risks

- Display mismatch: a Chinese-main, Thai-secondary place shows under `?cuisine=Thai` while its card says Chinese and does not highlight (unless `matchMarksFor` is extended). Decide whether to show an "also Thai" mark; design only, can follow later.
- Facet counts, suggest counts and results must share one predicate or numbers disagree with lists.
- `cuisine_tags` appends are wiped by `normalize-cuisines.mjs` re-runs (see Search above).
- Bars (906) and Fast Food (100) counts will drop as mains and grow as secondaries; the Bars filter still finds them via the secondary.
- Coin-flip and drink-heavy menus (Hot Chickz, Slurp, Sun Gold, Beverly Beach): low-confidence rows must not auto-apply.
- Menu junk and wrong-identity menus can mislabel confidently; the HOLD gate and the pre-seeded hold list are the control.
- 60-second corpus cache: a backfill shows within about a minute; Vercel redeploy needed for code changes.
- Serper credits may be out (RESUME, 2026-10-14), which blocks phase 2 only.
- Agent output drift: validate strictly in the apply script; never accept free-text cuisines.
- Cost if run on the API instead: a few million tokens at Sonnet rates; agents cost no API key but more wall time.

## 7. Steps and rough effort

| # | Step | Effort |
|---|---|---|
| 0 | Owner decisions: add "Salads & Healthy"? agents vs API key | 5 min |
| 1 | `migrate.mjs`: add `cuisine_secondary TEXT[]`, run it | 15 min |
| 2 | Code: type, `db.ts` mapping, one `hasCuisine` helper, filter + facets + matchMarksFor + suggest | 1.5 to 2 h |
| 3 | Taste match: weighted `getCuisineCounts`, fractional cases in `check-taste-match.mjs` | 45 min |
| 4 | Verify code with an empty column (no change in behaviour), then seed 3 test rows locally and check filter, counts, suggest on web and phone, one screenshot at the end | 30 min |
| 5 | Dump script (food-row filter, chain collapse, hold gate, 75 per batch) | 45 to 60 min |
| 6 | Classifier brief with the 6 rules and worked examples from the sample | 20 min |
| 7 | Pilot: 2 batches plus the 30-restaurant regression set, read the output | 30 min |
| 8 | Full wave: about 110 Sonnet agents, 8 concurrent | 1.5 to 2.5 h wall |
| 9 | Review: verifier on 10% sample, all L rows, all venue-main changes, all holds | 45 to 60 min |
| 10 | Apply script (validation, snapshot, per-row WHERE, dry-run diff), snapshot, apply | 45 min |
| 11 | Spot-check on the live site, redeploy Vercel if code is not out yet | 20 min |
| 12 | Optional phase 2: 931 weak no-menu rows via Serper / WebSearch | 1 to 2 h, credit dependent |

Total: roughly 8 to 10 hours of work, of which about 2 to 3 hours is unattended agent wall time. With an API key, step 8 drops to minutes.

## 8. Decisions needed from the owner

1. Add "Salads & Healthy" as a 30th cuisine? (Affects sweetgreen, Mendocino Farms x8, and the 80 Vegetarian rows; without it they stay Vegetarian with no salad secondary.)
2. Run via Sonnet agents (no key, about 2.5 h) or add `ANTHROPIC_API_KEY` for the scripted pass (minutes, a few million tokens)?
3. Minor, can default: taste-match weights 0.7 main / 0.3 secondaries (recommended); show an "also Thai" mark on cards when filtered (design, later).

No work has started. Awaiting a go.
