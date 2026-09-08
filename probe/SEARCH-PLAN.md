# Discover search: diagnosis and plan

Written 2026-09-07 from Calvin's report: searching a restaurant he had just
eaten at returned nothing unless the spelling was perfect or he typed only the
first word, and unrelated places ranked above the one he meant.

Revised the same day with Calvin's second instruction: a **typed suggestion
dropdown while you type** — so a visitor can say "I mean this as a *place*",
"as a *neighbourhood*", "as a *dish*" — and the ranked fallback only decides
things when nobody picked.

## Diagnosis — four defects

### 1. The match is one contiguous substring. `src/lib/discoverFilters.ts:316`

```ts
if (f.q && !searchable(r).includes(foldSearchText(f.q)) && !ctx.dishes?.has(r.id)) return false;
```

`searchable(r)` (`discoverFilters.ts:273`) flattens four fields into one string:
`name + cuisine + cuisineTags + neighborhood`, folded to lowercase with
apostrophes stripped. The only test run against it is `String.includes`.

- **One wrong letter returns zero rows.** No edit distance, no trigram, no
  stemming.
- **Words must be contiguous and in the stored order.** If the row says
  `Kairoa Brewing` and the visitor types `Kairoa Brewing Company`, the
  substring fails. If the row says `Sunny Side Solana` and the visitor types
  `Solana Sunny Side`, it fails. This is exactly "it only works if I search the
  first name of it".
- **Only apostrophes are folded.** `&` vs `and`, hyphens, accents and a leading
  `The ` all break the substring.

### 2. There is no ranking on the grid. `src/lib/discover.ts:250`

`applyFilters` is a boolean filter — it returns rows in corpus order
(`sort_order, id`), which is import order and has nothing to do with relevance.
`orderResults` then does exactly one thing:

```ts
if (!here || !f.q || f.neighborhood) return matched;
// ...otherwise sort purely by milesBetween(here, r)
```

So on a phone with location on, **every search is sorted by distance and by
nothing else**. A place matching on a cuisine tag or on a dish, 0.2 miles away,
outranks the restaurant whose *name* is the query 3 miles away. The results
were not random — they were matched on the wrong field and then ordered by a
key that ignores which field matched.

**The ranking Calvin is asking for already exists in this codebase.**
`src/lib/restaurantRank.ts` scores name-prefix 100, name-substring 80,
cuisine-prefix 60, cuisine-substring 50, dish 48, tags 45, neighbourhood 40/30,
rating as the tiebreak — name over cuisine over dish, the exact ladder. It
feeds the header dropdown and the map dropdown. Discover's grid is the one
surface that never got it.

### 3. The dish half is an unranked OR over 385,165 rows. `src/lib/db.ts:3024`

`dishMatchesFor` is `d.name ILIKE '%term%'` — any substring, mid-word, no
boundary. A restaurant matching on a dish is admitted at exactly the same
standing as one matching by name. `urban` admits every menu carrying
"suburban".

### 4. `promote()` silently reinterprets the query. `discoverFilters.ts:629`

A term that names a cuisine or neighbourhood is quietly converted into that
filter: `?q=Thai` becomes `?cuisine=Thai`. When it fires, the term stops being
a name search entirely — so a restaurant actually *named* "Thai Time" is no
longer name-ranked, it is just one of two hundred Thai places in corpus order.
Good intent, invisible to the visitor, and it is a direct contributor to the
"random stuff came up" report. The dropdown below is the honest version of this
behaviour: ask instead of guessing.

## The shape of the fix

Two halves, and they answer two different questions:

- **Picking a suggestion is an exact filter.** No scoring, no ambiguity — the
  visitor said which dimension they meant.
- **Enter with nothing picked is a ranked search.** Name, then cuisine, then
  dish, as specified.

## Part A — the typed suggestion dropdown

### A1. What the dropdown offers

Grouped by kind, each group labelled, best-first inside the group:

| Kind | Example row | Commits to |
|---|---|---|
| Restaurant | *Kairoa Brewing Company* — North Park | `/restaurant/{id}` — straight to the place |
| Cuisine | *Mexican* — 1,204 places | `?cuisine=Mexican` |
| Neighbourhood | *North Park* — 312 places | `?neighborhood=North+Park` |
| Dish | *Carne Asada Fries* — 129 places | `?dish=carne+asada+fries` (**new param**) |

Restaurants first and always, since that is the dominant intent. Counts on the
non-restaurant rows because they are what make the kind legible at a glance —
"Mexican, 1,204 places" reads as a category, "Kairoa Brewing" reads as a place.

### A2. `?dish=` is a new filter dimension

Cuisine, neighbourhood, price, aspect and quick filters all already exist as
URL params with a resolved-against-the-corpus model. A dish filter has to be
added to the same places, or it will be the one dimension that cannot be shown,
removed or counted:

- `DiscoverFilters` type + `NO_FILTERS` (`discoverFilters.ts:56`, `:84`)
- `activeFilterCount` (`:95`)
- `filtersFromSearch` / `searchFromFilters` (`:676`, `:710`)
- `matchesFilters` — an exact dish-name match, not the fuzzy `q` path
- `countFacets`, so the rail's numbers keep coming from one predicate
- the summary chip row, so it is removable like every other filter

Unlike cuisine and neighbourhood, a dish name cannot be validated against the
in-memory corpus (the corpus holds no dishes, deliberately — see
`dishMatchesFor`'s header). It gets validated by the lookup returning nothing,
which degrades to an empty grid; the empty state should say *"No menus list
that dish"* rather than the generic line.

### A3. The suggest endpoint

New `GET /api/discover/suggest?q=`, returning the four typed groups.

- Restaurants, cuisines and neighbourhoods come off the **existing 60s corpus
  cache** (`discover.ts:144`) — no new database read.
- Dish names are the only part that needs SQL. Distinct dish name plus the
  count of listed restaurants serving it, word-boundary prefix match against
  `idx_dishes_name_trgm` (`scripts/migrate.mjs:973`).
- Guards, because this fires as you type: minimum 2 characters, ~150ms debounce
  on the client, dish group skipped under 3 characters, and the same
  `s-maxage=60` edge cache the sibling routes use.
- **Measure first:** `SELECT count(DISTINCT lower(name)) FROM dishes` over
  385,165 rows. If the distinct vocabulary is large enough that a per-keystroke
  query is slow, the answer is a materialised `dish_names(name, place_count)`
  table refreshed by the menu loader — decide with the number in hand, not
  before.

### A4. Where the dropdown goes

- `PhoneDiscoverSearch` (`src/components/mobile/PhoneDiscoverSearch.tsx`) has
  **no dropdown at all** today — it is a bare form that submits on Enter. This
  is the surface Calvin was using.
- Web Discover has no field of its own; it uses the header's
  `RestaurantSearch`, which already has a dropdown and already splits
  "highlight a row = one place" from "Enter = the broad search". Its header
  comment documents that split as deliberate. The change there is that the
  dropdown gains the three non-restaurant kinds, not that it gains a dropdown.

Behaviour must be identical on both; the styling does not have to be (phone
gets a full-width sheet under the field, web keeps the existing popover).

Keyboard and touch: arrow keys move through rows across group boundaries,
Enter commits the highlighted row, Escape closes without committing, Enter on
nothing highlighted runs the ranked search. Rows need `role="option"` inside a
`role="listbox"` with `aria-activedescendant`, since this is now a real combobox
rather than a list of links.

### A5. Spell-corrected rows in the dropdown

Corrections are not a separate feature — they are the B2b fuzzy tier surfacing
in the dropdown instead of only in the grid. One scorer, two places it shows.
What needs deciding is the presentation, because a correction the visitor
cannot see is the same mistake as `promote()`.

**All four kinds get corrected**, not just restaurants: `vietnemese` ->
*Vietnamese* (cuisine), `gaslmap` -> *Gaslamp* (neighbourhood), `carna asada
fires` -> *Carne Asada Fries* (dish). The restaurant name is the one that
matters most and the one Calvin hit, but a misspelled cuisine dead-ends
identically today.

**Labelling depends on whether anything matched literally.**

- If the group has any exact / prefix / substring hit, corrections simply sort
  below those, unlabelled. The visitor typed something real; no need to
  editorialise.
- If a group has *only* fuzzy hits, that group gets a **"Did you mean"** header.
  This is the state the visitor is actually in when the search is broken today,
  and saying so is what turns a confusing list into an answer.

**Picking a correction rewrites the field to the corrected text and commits**,
so the visitor sees what happened and can edit from there. It never happens
silently.

**Enter never auto-corrects.** Enter runs the ranked search on the literal text.
It does not need to correct, because B2's fuzzy tier already puts the right
restaurant first — the correction in the dropdown is a shortcut to the *place*,
not a prerequisite for the search working.

**Below the floor, offer nothing.** `searchModel.ts` already argues this case:
keyboard mash scores 0.29 against "Pizza" on one shared bigram, and answering
nonsense with a confident wrong guess is worse than an empty state. Cap at
three corrections per kind so the dropdown does not become a wall of guesses.

**Reuse, don't rewrite.** `suggestFor` in
`src/components/drafts/searchModel.ts:135` already returns exactly this shape —
`nearMiss` (closest real restaurant names) plus `terms` (cuisines and
neighbourhoods that genuinely exist, closest first), with the floor and the
fallback already reasoned through. It is written, calibrated against this
corpus, and currently unshipped, living only in the drafts folder. It needs
lifting to `lib/textMatch.ts` alongside the Dice implementation and extending
with the dish kind.

**Dish corrections are indexable.** `idx_dishes_name_trgm`
(`scripts/migrate.mjs:973`) is a GIN trigram index, so `name % 'query'` and
`ORDER BY similarity(name, 'query') DESC` both use it — fuzzy dish suggestions
do not need a sequential scan over 385,165 rows. This is another argument for
the materialised `dish_names(name, place_count)` table in A3: correcting
against ~N distinct names is cheaper and gives better answers than correcting
against 385,165 rows that repeat the same dish hundreds of times.

### A6. Retire the silent `promote()`

Once a visitor can say "I mean Thai the cuisine", guessing it for them is a
liability. Narrow `promote` to fire only when the term matches **no restaurant
name at all** — otherwise leave it as free text and let the ranking put the
named place first. A picked suggestion arrives as `?cuisine=` already, and
`promote` only fills empty dimensions, so the two compose without further work.

**Done 2026-09-07, but not as written above — the corpus says that rule is
wrong.** Counted over the 9,043 listed places:

| name matches the term | places |
| --------------------- | ------ |
| exactly               | 1      |
| by prefix             | 248    |
| by substring          | 2,077  |

"No restaurant name at all" in the prefix or substring sense would stop
`"mexican"`, `"pizza"`, `"italian"` and `"japanese"` from promoting — every
category word, which is the case promotion exists for (`Mexican Seafood &
Grill`, `Pizza Pal`, `Italian Cucina`). So the guard shipped is **exact name
only**, one line at the top of `promote`.

That is not a technicality: the single exact collision is a real restaurant
named `Pizza` in University Heights, and before this it could not be reached by
typing its name — `?q=pizza` became `?cuisine=Pizza` and the place sat somewhere
inside 400 others. It is now the first card of a 1,066-result search, because a
name match outranks everything (B2a). `?q=mexican` still promotes, heading and
rail unchanged.

The looser half of the original intent is served by the dropdown instead: anyone
who typed a category word and meant a restaurant of that name gets it in the
Restaurants group regardless of how the term resolves.

## Part B — the Enter fallback: ranked, fuzzy, name-first

This is what runs when nothing was picked.

### B1. A structured, memoised search index on the corpus

Replace the `SEARCHABLE_TEXT` WeakMap (`discoverFilters.ts:261`) with a
`SEARCH_FIELDS` WeakMap holding, per row, the folded `name` / `cuisine` /
`cuisineTags` / `neighborhood` **kept apart**, plus the name's token array and
its character-bigram set. Built once per row and discarded with the 60s corpus
cache, so bigrams over 9,043 listed rows are computed once a minute, not once
per keystroke.

Normalisation gets stricter than `foldSearchText`: lowercase, strip
apostrophes, replace every other non-alphanumeric with a space, collapse runs,
map `&` to `and`. Applied identically to query and haystack.

### B2. One scorer, shared by the dropdown and the grid

Extend `restaurantRank.ts`'s ladder — which is already the right ladder — with
the two things it lacks (out-of-order tokens, and fuzzy), and use the same
function for the dropdown's restaurant group and for the grid:

| Tier | Condition | Score |
|---|---|---|
| Name exact | normalised name === normalised query | 1000 |
| Name prefix | name starts with query | 900 |
| Name tokens | every query token is a token-prefix in the name, **any order** | 800 + coverage |
| Name substring | name contains query | 700 |
| Name fuzzy | Dice bigram similarity >= 0.34, or one mistyped token | 500 + 100 * dice |
| Cuisine / tag exact | cuisine or a `cuisine_tags` entry equals the query | 400 |
| Cuisine / tag partial | substring or fuzzy on cuisine/tags | 300 |
| Neighbourhood | matches the neighbourhood only | 250 — **open question** |
| Dish exact | a dish name equals the query | 220 |
| Dish partial | a dish name contains the query at a word boundary | 200 |

### B2a. The hard rule: a misspelled name outranks a perfect dish

This is the thing to get right, and it is two separate requirements that are
easy to conflate:

**Recall — a typo must return the restaurant at all.** Today it returns
nothing, because the only test is `String.includes`. The fuzzy tier is what
makes the row appear; everything else here is ordering. Without B1/B2 there is
no row to rank.

**Ordering — the fuzzy name beats the exact dish.** Guaranteed by the band
arithmetic, not by hope. Name tiers occupy 500-1000. Cuisine occupies 300-400.
Dish occupies 200-220. The worst possible name match (500, a bare-threshold
fuzzy hit) is **280 points above the best possible dish match** (220, an exact
dish-name equality). Nothing can close that gap, because:

> **Tiebreakers never cross a tier.** Distance, plate score and rating order
> rows *within* one band and are never added to the tier score.

That constraint is not cosmetic — **`restaurantRank.ts` violates it today and
it is a live bug.** Its tiers sit 2-5 points apart while `rating` adds up to 5
directly onto the score (`score + (r.rating ?? 0)`, `restaurantRank.ts:95`).
So a 4.8-star dish match scores 52.8 and beats a cuisine substring match at
50.0, and a 5-star tag match ties it. The header dropdown already mis-orders
for exactly the reason Calvin is describing. Widening the bands to 100 and
moving the tiebreak out of the score fixes the dropdown and the grid together.

### B2b. What "fuzzy" has to mean here

A single Dice score over the whole string is not enough, because the common
real failure is **one wrong letter inside one word of a multi-word name**, and
a long correct remainder drowns it. The name score is the **maximum** of:

- whole-string Dice of query against name;
- **per-token best match** — for each query token, the best Dice against any
  name token; the name score is the mean of those, so `kairoa brewng` scores
  ~1.0 on `kairoa` and ~0.85 on `brewing` and lands high, instead of being
  averaged into the noise of a name the visitor typed only part of;
- Dice against the name truncated to the query's length, so a short query
  against a long name ("kairoa" vs "Kairoa Brewing Company") is not punished
  for the words the visitor did not type.

Whichever wins, the tier is the same — this is about not *missing*, not about
scoring finer.

The Dice-over-character-bigrams implementation already exists and is already
calibrated against this corpus, in
`src/components/drafts/searchModel.ts:101-128` (0.34 floor; "vietnemese" ->
Vietnamese 0.78, "gaslmap" -> Gaslamp 0.50, keyboard mash 0.29). Lift it into a
shared `src/lib/textMatch.ts` so drafts, the dropdown and Discover use one copy.

### B2c. Calibrate the floor against the real corpus, do not guess it

The 0.34 floor was measured for a "did you mean" list of three, where a wrong
guess is cheap. Here it gates whether a restaurant appears at all, so it needs
its own measurement. Two failure modes to tune between:

- floor too high — the typo still returns nothing, which is today's bug;
- floor too low — 9,043 rows all "match" and the grid becomes noise.

**The test corpus is generated, not collected.** `probe/typo-calibrate.mjs`
reads the 9,043 listed names and derives typo queries from each one, in the
shapes people actually produce:

- single-character substitution on an adjacent key (`kairoa` -> `kairos`)
- adjacent-character transposition (`brewing` -> `brewnig`)
- one dropped character (`cucina` -> `cucna`)
- one doubled character (`solana` -> `sollana`)
- a dropped trailing word (`Kairoa Brewing Company` -> `Kairoa Brewing`)
- words in the wrong order (`Sunny Side Solana` -> `Solana Sunny Side`)
- apostrophe and `&` dropped or spelled out

For each generated query it records where the true restaurant ranks and how
many other rows clear the floor. That is tens of thousands of pairs across the
real name distribution — far better calibration than any hand-remembered list,
and it needs nothing from Calvin. Read-only; it scans names, writes a report.

The floor is then whatever puts the true row first on ~99% of single-character
typos without letting the median result count explode. Report both numbers per
candidate floor and pick from the curve.

### B3. Wire the scorer through

- `matchesFilters` keeps its signature; its `q` branch becomes
  `matchScore(...) !== null`, so **facet counts and the grid still come from
  one predicate** — the invariant `discover.ts` opens by defending.
- Memoise `matchScore` per request keyed by row id: `matchesFilters` runs six
  times per row per request (grid plus five facet dimensions), so without this
  the bigram work is paid six times.
- `orderResults` sorts by score descending, then the tiebreakers. Its header
  comment documents distance-first as a deliberate choice and must be rewritten.

### B4. Tighten the dish half

- `dishMatchesFor` (`db.ts:3024`): word-boundary match instead of raw `%term%`,
  returning the match kind so the dish tier grades exact vs partial.
- Skip the dish round trip entirely when the query already has a strong name
  match — a real saving on the common case, which is a name.

### B5. Parity for the typeahead SQL (optional, decide separately)

`searchRestaurants` (`db.ts:2970`) — behind `/api/restaurants?q=` — has the
same flat-substring recall and orders by `sort_order, id`. Its own comment
asserts that a term which finds a place in the dropdown must find it in
Discover. `pg_trgm` is installed and `idx_restaurants_search_ws` exists
(`scripts/migrate.mjs:757`), so it can gain `OR name % term` plus
`ORDER BY similarity(name, term) DESC` with no new index. Strictly it is
outside "the Discover page", but the dropdown's restaurant group is fed by it,
so in practice B5 lands with Part A.

## Verification

- Fixture test of `query -> expected top result`, generated by
  `probe/typo-calibrate.mjs` (B2c) over the real corpus. The acceptance bar:
  **a single-character typo of a restaurant name returns that restaurant
  first**, across the whole corpus, not on a hand-picked sample.
- Cases to lock in regardless: out-of-order words, a one-letter typo, a missing
  trailing word ("Brewing Company" vs "Brewing"), a cuisine word that is also a
  substring of many dish names, and a restaurant whose name *is* a cuisine
  ("Thai Time" must outrank the Thai cuisine filter's contents).
- **The B2a case, as its own assertion:** a query that is a misspelling of a
  restaurant name AND an exact match for a dish name on other menus must return
  the misspelled restaurant first. Assert on the ordering, not just on presence.
- A regression test for the `restaurantRank.ts` tiebreak bug: a 5-star
  dish-match must not outrank a cuisine match.
- Dropdown: each kind commits to the right URL; Escape does not commit; Enter
  on nothing highlighted runs the ranked search.
- Corrections: a misspelled name shows the corrected restaurant under a "Did
  you mean" header; picking it rewrites the field to the corrected text; Enter
  without picking still finds the place anyway; a nonsense query offers no
  correction at all rather than a confident wrong one.
- `npm run typecheck` and eslint, then real searches on localhost with a
  screenshot before calling it done.

## Suggested order of work

1. B1 + B2 + B2a/b/c + B3 — fuzzy recall and the ranked fallback. This is the
   whole of Calvin's complaint: the typo returns the restaurant, and the
   restaurant sits above every dish match. No new UI, ships to phone and web at
   once. Everything below is improvement on top of a search that already works.
2. B4 — dish precision.
3. A2 — the `?dish=` dimension.
4. A3 — the suggest endpoint (measure the distinct-dish count first).
5. A4 + A5 — the dropdown on both surfaces, with corrected rows. A5 costs
   almost nothing once A4 exists: the scorer is shared and `suggestFor` is
   already written.
6. A6 — narrow `promote`, once the dropdown makes it redundant.
7. B5 — SQL parity.

## Phone and web

Parts B1-B4 are entirely server-side in `lib/discover.ts` and
`lib/discoverFilters.ts`. `DiscoverBrowser.tsx` (web) and
`PhoneDiscoverResults.tsx` (phone) both render `getDiscoverPage`'s output, so
both surfaces get the ranking from one change with no design edit. Part A needs
a component on each side — same behaviour, different styling.

## Open questions

1. **Where does neighbourhood rank in the Enter fallback?** Calvin named
   name -> cuisine -> dish and did not say. The table assumes just below
   cuisine, above dish.
2. **Does picking a restaurant in the dropdown navigate to its page, or filter
   Discover down to it?** Header search navigates today. Going straight to the
   place is almost certainly what "I meant this one" means.

## Status

**Part A is done** (A1–A6), 2026-09-07, on `main`'s working tree.

- `src/lib/suggestTypes.ts` — new, and it **imports nothing, ever**. The wire
  shapes have to be readable by `"use client"` components, and `lib/db.ts`
  constructs the Neon client at module scope, so a type imported from
  `lib/suggest.ts` would pull the driver into the browser bundle.
- `src/lib/suggest.ts` — the four readings, one row each. Corrections are
  dropped across **all four at once** the moment any reading has a literal hit —
  that is what stops "landini" offering *Did you mean Indian* beside three exact
  Landini's, and it is why the "Did you mean" notice can be one line above the
  list instead of a label on every row.
- `src/components/useSuggest.ts` — new. All behaviour: the 150ms debounce, the
  stale-response guard (both a cancel flag and an echoed-`query` check, because
  the edge cache can answer a term the field has moved past), arrow keys down
  the rows, `facetParamFor` and `hrefForScope`. Picking a vocabulary row **drops
  `?q=`**: keeping both would AND a misspelling against the correct filter and
  return an empty grid, which is the failure this whole plan started from.
- `src/components/SuggestMenu.tsx` — new. All markup, at two scales (`SIZING`).
  Divs carrying `role="listbox" / "option"`, not nested `ul`s — one flat list,
  no groups, because there is one row per reading and nothing to group.
- `src/components/RestaurantSearch.tsx` — rewired onto the two above; its own
  `/api/restaurants?q=` debounce and dropdown deleted (290 → 207 lines).
- `src/components/mobile/PhoneDiscoverSearch.tsx` — same dropdown, phone sizing.
  **This surface had none at all before**, and it is the one Calvin was using.
- `src/lib/discoverFilters.ts` — the exact-name guard on `promote` (A6).

### One row per reading, and the count is the destination (2026-09-07)

The first build printed a capped list of names under four headings, with the
count on each heading. Calvin rejected it twice — first "just have something
like (cannonbal, restaurant 1 result,) or (cannonball dishes 2 results)", then,
against a per-name version, "no no i dont like thats not hat i meant, i meant
one selection for dishes, one selection for restaurants and one selection for
food or whatever". So there is now **one clickable summary row per reading**,
carrying its count, and no list of names at all. A menu of names has to guess
which three of four hundred to print; a menu of readings answers the question
the visitor has and hands the rest to the grid.

`dishSuggestions` / `DishSuggestion` / `DishMatches` are gone from `lib/db.ts`
with the name lists they fed.

**Where a row goes** (`hrefForScope` in `components/useSuggest.ts`): one
restaurant → `/restaurant/167`; one cuisine or neighbourhood → `?cuisine=Thai`,
the param the rail already speaks, so the filter lights up and can be taken off
again; everything else → the ranked search **scoped** to that reading,
`?q=…&in=dish`. `SCOPE_PARAM` is `in`, and `matchesFilters` enforces it with one
comparison — `scopeOf(score) !== f.scope` — because `scoreRestaurant` returns
the first field that hit, so the tiers are contiguous bands and a score already
says *which field matched*. Scoping therefore cannot disagree with ranking, and
costs no second text pass.

**The count on a row is the size of the page that row opens.** This is the part
that was wrong on the first pass and is worth not re-deriving: counting each
reading with its own function (names by `scoreName`, cuisines by walking the
vocabulary) double-counts a restaurant that matches on two fields and drifts
from the grid wherever the two passes disagree about the fuzzy band. The
Restaurant row offered **140** for "thai" and `/?q=thai&in=restaurant` then
rendered **150**. `suggest()` now makes one pass with the grid's own
`relevanceFor` over the corpus — plus `dishMatchesFor(q)`, exactly as
`getDiscoverPage` hands it over — and files each row under `scopeOf`, so the
four counts are a partition of one ranked result set.

Two counts are kept per reading and they answer different questions.
`literal` decides only whether a row **appears** (a reading reached only by
correcting spelling drops off the moment any other reading has a real hit).
`all` is what a row **prints**, because `?in=` knows nothing about corrections
and keeps the fuzzy tail. The exceptions both print their own destination's
size: a row naming one restaurant prints 1 (it opens that page, not a search),
and a row naming one cuisine or neighbourhood prints the facet's size — 178 for
Thai, not the 150 that scored.

Dishes are the only reading needing a second round trip, and only when nothing
matched literally anywhere: `nearestDishName` for the corrected wording, then a
second `dishMatchesFor` + rescore **with the correction as the query**, since
that is what `?q=<nearest>&in=dish` will run. `SuggestScope.term` carries it, so
the row prints "Sushi" and searches for "Sushi" while the field said "sushhi".

Verified in Chrome and against the grid, every row against the page it opens:

| typed | row | count | destination | page |
| --- | --- | --- | --- | --- |
| cannonbal | Cannonball · restaurant | 1 | `/restaurant/167` | — |
| cannonbal | cannonbal · dish | 2 | `?q=cannonbal&in=dish` | 2 |
| thai | thai · restaurant | 150 | `?q=thai&in=restaurant` | 150 |
| thai | Thai · cuisine | 178 | `?cuisine=Thai` | 178 |
| thai | thai · dish | 530 | `?q=thai&in=dish` | 530 |
| sushhi | sushhi · restaurant | 253 | `?q=sushhi&in=restaurant` | 253 |
| sushhi | Japanese · cuisine | 459 | `?cuisine=Japanese` | 459 |
| sushhi | Sushi · dish | 52 | `?q=Sushi&in=dish` | 52 |
| little italy | Little Italy · neighborhood | 155 | `?neighborhood=Little Italy` | 155 |
| birria | birria · dish | 454 | `?q=birria&in=dish` | 454 |

Two labelling traps found on the way, both fixed: a cuisine row naming one
cuisine must print the corpus's spelling however many places sit under it
("Thai", not the typed "thai"); a **restaurant** row may print a name only when
it holds that one restaurant — 253 places score against "sushhi", and labelling
that row "Arbor Sushi & Grill Express" promises a page it does not go to.

**Step 1 (B1 + B2 + B2a/b/c + B3) is done and on `main`'s working tree**, 2026-09-07.

- `src/lib/textMatch.ts` — new. The ladder, the fuzzy matcher, `SIMILAR_ENOUGH = 0.65`.
- `src/lib/discoverFilters.ts` — `SEARCHABLE_TEXT`/`searchable()` replaced by a
  `SEARCH_FIELDS` WeakMap of four prepared fields; `FilterContext.scores` added;
  the `q` branch is now a score test. `foldSearchText` stays exported for
  `useMapSearch.ts`.
- `src/lib/discover.ts` — scores the corpus once per request before filtering,
  and `orderResults` sorts on relevance with distance as a within-tier tiebreak.
- `src/lib/restaurantRank.ts` — the rating tiebreak no longer crosses a rung.
- `probe/typo-calibrate.mts`, `probe/search-check.mts` — the two probes.

`npx tsc --noEmit` clean. `npx eslint src` reports one pre-existing error in
`RankRing.tsx`, untouched by this.

### The floor, measured

600 names, 4,016 generated typo queries, seven shapes:

| floor | real restaurant first | median results | p90 results |
| ----- | --------------------- | -------------- | ----------- |
| 0.50  | 95.9%                 | 27             | 275         |
| 0.60  | 95.6%                 | 7              | 69          |
| 0.65  | 95.3%                 | 3              | 33          |
| 0.70  | 94.2%                 | 2              | 20          |
| 0.80  | 89.3%                 | 1              | 10          |

Accuracy is flat from 0.30 to 0.65 and the result set falls two orders of
magnitude, so 0.65 is the knee. Above it the floor cuts true matches, and
transposition goes first (89% at 0.65, 48% at 0.85).

### What it does now

```
"kairoa brewng"       2 results, #1 Kairoa Brewing Company    (was: nothing)
"cheesse cake factry" 7 results, #1-#5 The Cheesecake Factory (was: nothing)
"carne asada fries"   482, name matches above every dish match
"pizzza"              482, #1 Bronx Pizza
```

### Known limitation

`"buona fortes"` puts **Fortunate Son** above Buona Forchetta, by 2 points. Both
are fuzzy name matches, so the tier is right and only the order inside it is
wrong: whole-string Dice ignores word boundaries, so "buonafortes" shares seven
bigrams with "fortunateson" by coincidence, which beats the per-token reading
that Buona Forchetta wins on. The obvious repairs — boundary-padded grams, a
length-weighted token mean, a partial-token tier — either do not flip this case
or promote a common query word (`"pizzza port"` would lift *Port of Call* to the
top). Left alone rather than tuned by feel; the ~4.7% of queries that do not
rank first are dominated by this class.

## The All row, and `?in=all` (2026-09-07)

Calvin: "add an all tab that comes first", then "also make the labeles orange".

`SuggestKind` gained `"all"` as its **first** member. It is not a field: the
other four are exactly `SearchScope` in `lib/textMatch.ts`, and `scopeOf` never
returns `"all"`. The row is the whole matched set, every reading at once,
ranked — which is the search Enter was already running and the one answer the
menu never named. First rather than last because it is the fallback, and a
fallback offered after four alternatives reads as a fifth alternative; it is
also the only row that cannot be the wrong choice, which is what a default is.
Suppressed when nothing matched, since an All row over an empty grid is exactly
the failure this plan started from, printed in advance.

**Its count is the sum of the four tallies, taken before any reading is
rewritten** — deliberately *not* the sum of the four printed numbers. Those are
the sizes of four different pages: a cuisine row prints its facet's size, and a
corrected dish row counts rows the typed spelling cannot reach at all.

### The bug it exposed: there was no URL meaning "all"

`promote()` turns a bare `?q=thai` into `?cuisine=Thai`, which is the right
answer to a term someone typed meaning a category — 178 Thai places. The All row
means the opposite thing and counts 723. Detected because `?q=thai&in=dish`
(530) was *larger* than unscoped `?q=thai` (178), and adding a filter cannot
increase a count.

So `lib/discoverFilters.ts` now has:

- `ALL_SCOPE = "all"` — the `?in=` value that narrows nothing.
- `QueryScope = SearchScope | typeof ALL_SCOPE` — what `?in=` accepts.
- `QUERY_SCOPES` — the parse vocabulary. `SEARCH_SCOPES` is untouched and stays
  the four fields, because that is what `scopeOf` ranges over.

`matchesFilters` exempts `ALL_SCOPE` from the `scopeOf(score) !== f.scope`
predicate — it asked for every reading, which is every row that scored at all —
and the `promote` call site skips promotion when `in=all` is set. **Enter still
promotes**, because Enter picked nothing and so nothing was said.
`hrefForScope` therefore always writes `SCOPE_PARAM`, including `in=all`.

### Orange labels

Only the reading word (`ALL`, `DISH`) is orange; the count stays `zinc-500`, at
Calvin's follow-up "make the number and results original color". The reading is
what is being chosen between; the count is a supporting figure like every other
number on a muted line. `--pm-orange-text` (#A8481A, 5.8:1), not `--pm-orange` —
this is small text and
the fill orange is 3.1:1 on white, below the body floor (DESIGN.md). The
separating dot stays with the muted run at 40%, so it divides without reading as a third
word.

### Verified

Every row's count against the page it opens, by curl:

| row | count | destination | page holds |
| --- | --- | --- | --- |
| thai · All | 723 | `?q=thai&in=all` | 723 |
| thai · Restaurant | 150 | `?q=thai&in=restaurant` | 150 |
| Thai · Cuisine | 178 | `?cuisine=Thai` | 178 |
| thai · Dish | 530 | `?q=thai&in=dish` | 530 |
| little italy · All | 408 | `?q=little italy&in=all` | 408 |
| Little Italy · Neighborhood | 155 | `?neighborhood=Little Italy` | 155 |
| cannonbal · All | 4 | `?q=cannonbal&in=all` | 4 |
| cannonbal · Dish | 2 | `?q=cannonbal&in=dish` | 2 |
| sushhi · All | 387 | `?q=sushhi&in=all` | 387 |
| birria · All | 502 | `?q=birria&in=all` | 502 |
| mexican · All | 2472 | `?q=mexican&in=all` | 2472 |

Screenshotted on both `/` and `/m`: row order reads All / Restaurant / Cuisine /
Dish, labels orange on both.

### Kept on purpose

The bottom `Search Discover for "x" — ENTER` button stays, even though it is now
mildly redundant with All on Discover. It is not one of the readings (no
`role="option"`, arrows don't reach it), and on the `/feed` search field its
`submit()` navigates to `/feed` while every dropdown row navigates to `/`.
Removing it deletes feed search.
