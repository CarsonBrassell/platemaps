/**
 * Discover's filter model: what the rail offers, what it matches, what each
 * option would return, and how the whole thing round-trips through the URL.
 *
 * It lives here rather than inside the components because three surfaces read
 * it â the desktop rail, the mobile sheet, and the grid â and because facet
 * counting has to use exactly the same predicate the grid does or the numbers
 * lie.
 */

import { BEST_AT_LABELS } from "@/data/reviewScales";
import { foldAccents } from "@/lib/brandName";
import { PRICE_BANDS, type PriceBand } from "@/data/priceBands";
import type { MatchedDish, RestaurantView } from "@/data/restaurantTypes";
import { aspectScores } from "@/lib/aspectScores";
import type { PlateScore } from "@/lib/plateScore";
import { SHOW_BLEND_STARS } from "@/lib/ratingDisplay";
// From lib/geo.ts, not lib/nearby.ts: this module is imported by the server
// (lib/discover.ts) as well as by client components, and nearby.ts is a React
// hook. See the note in geo.ts.
import { milesBetween, NEARBY_RADIUS_MI, type Coords } from "@/lib/geo";
import { openStateFor } from "@/lib/openState";
import {
  SEARCH_SCOPES,
  prepare,
  scopeOf,
  scoreRestaurant,
  type Prepared,
  type SearchFields,
  type SearchScope,
} from "@/lib/textMatch";

export type QuickFilter = "open-now" | "top-rated" | "trending";

export const QUICK_FILTERS: ReadonlyArray<{ value: QuickFilter; label: string }> = [
  { value: "open-now", label: "Open now" },
  { value: "top-rated", label: "Top rated" },
  { value: "trending", label: "Promoted" },
];

const QUICK_VALUES = QUICK_FILTERS.map((f) => f.value);

/**
 * What "Top rated" means, in each of the two scales a restaurant carries.
 *
 * Which one is in force follows `SHOW_BLEND_STARS` (lib/ratingDisplay.ts), the
 * same switch the display reads â so the filter always measures what the cards
 * are actually showing. A visitor filtering to "Top rated" and then seeing the
 * stars on every result is coherent; filtering on a percent nine cards in ten
 * don't have is not.
 *
 * `TOP_RATED_PERCENT` is the end state and takes over the day the stars go. It
 * excludes a restaurant whose plates haven't cleared the plate-score floor,
 * because that restaurant is unrated rather than well-rated â which is why it
 * cannot be the live threshold yet, and why the flag decides.
 *
 * 4.5 is where this sat before the plate score existed, and it is calibrated
 * against the real blend. 85 is not calibrated against anything yet â re-check it
 * once there are real dish ratings behind it.
 */
export const TOP_RATED_STARS = 4.5;
export const TOP_RATED_PERCENT = 85;

const PRICE_VALUES = PRICE_BANDS.map((b) => b.value);

export type DiscoverFilters = {
  /**
   * Where, as one dimension with three states: everywhere (`neighborhood`
   * null, `nearby` false), within the radius, or one named neighbourhood.
   * Nearby and a neighbourhood are mutually exclusive â the setters below
   * enforce it, so nothing has to reason about "nearby, in North Park".
   */
  neighborhood: string | null;
  nearby: boolean;
  cuisine: string | null;
  price: PriceBand | null;
  /** A category label from BEST_AT â "Service", "Ambiance", "Drinks"â¦ Never
      "Food": the plate score is the food rating, so it isn't a category. */
  aspect: string | null;
  quick: QuickFilter[];
  /**
   * Free text from the header search, matched against name, cuisine and
   * neighbourhood â the same three fields that search itself ranks on.
   *
   * It is what is *left* of a search after `filtersFromSearch` has taken out
   * anything the rail can express: a term naming a real cuisine, neighbourhood,
   * price band or category becomes that filter instead, so searching "Thai"
   * lands on Discover with Thai lit up in the rail rather than on a text match
   * that happens to return the same places. See `promote` below.
   */
  q: string | null;
  /**
   * One dish, named exactly — "show me the places that serve Birria Taco".
   *
   * Separate from `q` because it is a different question. `q` is a search and
   * is *ranked*: a name match beats a cuisine match beats a dish match, so a
   * misspelled restaurant still outranks a wall of menus. This is a *filter*,
   * chosen from the search dropdown out of real dish names, and it either holds
   * or it doesn't. The two compose — `?q=thai&dish=pad thai` is a text search
   * inside the set of places that serve Pad Thai.
   *
   * Carried as the visitor sees it ("Birria Taco", not "birria taco"), so the
   * chip that appears reads back as the thing they picked. The comparison folds
   * both sides — see `dishesNamedExactly` in lib/db.ts.
   */
  dish: string | null;
  /**
   * Which reading of `q` to keep — "cannonball, as a dish" rather than
   * "cannonball, however it matches".
   *
   * Meaningless without `q` and never set without one. The search dropdown is
   * the only thing that writes it: each of its rows is one reading of the typed
   * term, and picking a row says which. Enter, picking nothing, leaves this
   * null and gets the ranked search across all four.
   *
   * A narrowing of `q`, not a second dimension beside it — `scopeOf` in
   * lib/textMatch.ts reads the field a row matched on straight off its score,
   * so scoping costs the predicate one comparison and cannot disagree with the
   * ranking. That is also why this exists at all rather than four separate
   * params: "restaurants named X" and "places serving a dish called X" are the
   * same query asked of different fields.
   *
   * `"all"` is the fifth value and the odd one: it narrows to nothing, and says
   * so on purpose. What it actually turns off is `promote` — see the note there
   * and at the call site. A bare `?q=thai` becomes `?cuisine=Thai` and shows
   * 178 Thai places, which is the right answer to a term someone typed meaning
   * a category; the dropdown's All line means the opposite thing, every reading
   * at once, and it counts 723. Without a way to say "un-narrowed" that line
   * would offer 723 and land on 178.
   */
  scope: QueryScope | null;
};

/** The value of `?in=` that means "do not narrow this at all". Not a field, so
 *  it is deliberately not in `SEARCH_SCOPES` and `scopeOf` never returns it. */
export const ALL_SCOPE = "all";

/** Everything `?in=` accepts: the four fields, plus the un-narrowed reading. */
export type QueryScope = SearchScope | typeof ALL_SCOPE;

/** The `?in=` vocabulary, for parsing. Order is irrelevant; membership is not. */
const QUERY_SCOPES: readonly QueryScope[] = [...SEARCH_SCOPES, ALL_SCOPE];

export const NO_FILTERS: DiscoverFilters = {
  neighborhood: null,
  nearby: false,
  cuisine: null,
  price: null,
  aspect: null,
  quick: [],
  q: null,
  dish: null,
  scope: null,
};

/** How many separate choices are on â what the mobile bar's badge counts. */
export function activeFilterCount(f: DiscoverFilters): number {
  return (
    (f.neighborhood ? 1 : 0) +
    (f.nearby ? 1 : 0) +
    (f.cuisine ? 1 : 0) +
    (f.price ? 1 : 0) +
    (f.aspect ? 1 : 0) +
    (f.q ? 1 : 0) +
    (f.dish ? 1 : 0) +
    f.quick.length
  );
}

/* --- Aspects ---------------------------------------------------------- */

/**
 * The rating a category has to clear to count as "rated well for" it â on the
 * same 1-5 the categories are reported on, since `aspectScores` now works
 * natively in those units.
 *
 * 4.0 is where this has always sat. Re-tune with `npm run aspects:preview`.
 */
export const ASPECT_STRONG_SCORE = 4.0;

/**
 * What a restaurant is rated well for, and what to print beside it.
 *
 * The inner map of `StrongAspects` carries this rather than the bare label so
 * the grid can print the figure beside a card without re-running the model:
 * filtering to "rated well for Service" and then hiding the service figure made
 * the visitor open a restaurant to find out what they had just filtered on.
 * `.has()` reads the same on a Map as it did on the Set this replaced, so
 * matching is unchanged.
 *
 * `score` is null for a restaurant with no plate score â it qualified on votes
 * alone, so there is a count to show and no number. Callers must handle both;
 * `RestaurantCard` is the one that renders them.
 */
export type StrongAspect = {
  /** The category's rating on 1-5. */
  score: number;
  praised: number;
};

export type StrongAspects = ReadonlyMap<string, ReadonlyMap<string, StrongAspect>>;

/**
 * Mirror of `RestaurantAspectTally` in lib/db.ts, which owns the shape.
 *
 * Declared locally rather than imported because this module is pulled into
 * client components and db.ts constructs the Neon client at module scope â
 * the repo's standing rule (see CLAUDE.md) is to mirror the row shape rather
 * than risk dragging the driver into the browser bundle. Keep the two in step.
 */
export type AspectTally = {
  /** The restaurant's sourced rating on 1-5 â see lib/db.ts. */
  base: number;
  reviewCount: number;
  votes: Record<string, { praised: number; faulted: number }>;
};

/**
 * Scores every restaurant's categories through the same model the restaurant
 * page renders (lib/aspectScores.ts) and keeps the ones clearing the bar.
 *
 * Done once for the whole payload rather than per predicate call: the grid,
 * the facet counts and the mobile sheet would otherwise each re-run the
 * arithmetic for all 36 restaurants on every keystroke of state.
 */
export function strongAspectsFrom(
  tallies: Record<string, AspectTally>,
): StrongAspects {
  const strong = new Map<string, Map<string, StrongAspect>>();

  for (const [restaurantId, tally] of Object.entries(tallies)) {
    const scored = aspectScores(
      BEST_AT_LABELS,
      tally.base,
      tally.votes,
      tally.reviewCount,
    );
    /* Two conditions. The score bar alone would pass every category at a
       well-rated place, since a category nobody mentioned now lands exactly on
       the restaurant's rating â a 4.6 restaurant would read "rated well for
       drinks" on the strength of never having served one. Requiring a positive
       deviation means the category has to be one people actually singled out,
       not merely one at a good restaurant. */
    strong.set(
      restaurantId,
      new Map(
        scored
          .filter((s) => s.score !== null && s.score >= ASPECT_STRONG_SCORE && s.deviation > 0)
          .map((s) => [s.aspect, { score: s.score!, praised: s.praised }] as const),
      ),
    );
  }

  return strong;
}

/**
 * What one restaurant scored in one category, or null if it isn't rated well
 * for it â including while the tallies are still in flight, which is the same
 * "can't evaluate yet" null the filter context uses.
 */
export function strongAspectScore(
  aspects: StrongAspects | null,
  restaurantId: string,
  aspect: string | null,
): StrongAspect | null {
  if (!aspects || !aspect) return null;
  return aspects.get(restaurantId)?.get(aspect) ?? null;
}

/* --- Matching --------------------------------------------------------- */

/**
 * Everything a filter needs that isn't the restaurant or the filter itself.
 *
 * All three arrive after the first render, and all three are null until they
 * do â the clock mounts (lib/clock.ts), the visitor grants location, the
 * tallies come back from /api/restaurants/aspects. A null means the filter
 * that depends on it matches everything for the moment, which shows a superset
 * of the eventual result. The alternative is flashing an empty grid on a
 * filter the page cannot yet evaluate.
 */
export type FilterContext = {
  now: Date | null;
  here: Coords | null;
  aspects: StrongAspects | null;
  /**
   * Every restaurant's plate score, keyed by id â what "Top rated" reads. A
   * restaurant absent from the record has no rated plates; null is the whole
   * record still being in flight, and follows the same match-everything rule as
   * the other two.
   */
  plates: Record<string, PlateScore> | null;
  /**
   * Which restaurants serve a dish matching the current `q`, and which dish.
   * Null when the query has no free text, or while the lookup is in flight â
   * and null follows the same match-everything rule as the fields above, so a
   * pending lookup never hides a row the text already matched.
   *
   * Fetched per request by lib/discover.ts rather than carried on the corpus:
   * see dishMatchesFor in lib/db.ts for why the dish names are not in it.
   */
  dishes: Map<string, MatchedDish> | null;
  /**
   * How well each restaurant answers the current `q`, keyed by id — the output
   * of `scoreMatches`, computed once per request.
   *
   * Null is not "match everything" here, unlike the fields above: it means
   * nobody precomputed the scores, and `matchesFilters` scores the row on the
   * spot instead. The map is purely an optimisation — the predicate runs six
   * times per restaurant per request (once for the grid, once per facet
   * dimension) and the arithmetic does not change between those passes.
   */
  scores: Map<string, number> | null;
  /**
   * Which restaurants serve the dish named by `filters.dish`, and how they
   * spell it — `dishesNamedExactly` in lib/db.ts, fetched once per request that
   * has one.
   *
   * Distinct from `dishes` above, which answers the loose dish half of `q`. A
   * request can have both, and they must not be conflated: `?q=thai&dish=pad
   * thai` filters to the menus listing Pad Thai and then *ranks* what is left
   * by how well it answers "thai".
   *
   * Null follows the match-everything rule, like `aspects` and `plates`: a
   * pending lookup shows a superset rather than flashing an empty grid.
   */
  namedDish: Map<string, MatchedDish> | null;
};

export const NO_CONTEXT: FilterContext = {
  now: null,
  here: null,
  aspects: null,
  plates: null,
  dishes: null,
  scores: null,
  namedDish: null,
};

/**
 * The four fields a free-text query is matched against, prepared once per row.
 *
 * This used to be one lowercased string with name, cuisine, tags and
 * neighbourhood concatenated into it, tested with `String.includes`. Two things
 * were wrong with that and both were visible to a visitor: one mistyped letter
 * returned nothing at all, and a single string cannot say *which* field
 * matched, so "the name first, then cuisine, then dish" was not
 * expressible. lib/textMatch.ts holds the replacement; this holds the cache.
 *
 * `matchesFilters` runs six times per restaurant per request — once for the
 * grid and once for each facet dimension being counted — so preparing this
 * inline would build bigrams for the whole corpus six times over on every
 * keystroke's worth of navigation. Keyed on the row object, which
 * lib/discover.ts holds for the life of its 60s corpus cache; a `WeakMap` means
 * the entries go when that cache is replaced.
 */
const SEARCH_FIELDS = new WeakMap<RestaurantView, SearchFields>();

/**
 * Search text with apostrophes and accents removed, on both the query and the
 * haystack. 90 listed names carry a curly apostrophe ("Clem's Station") and
 * 1,100 a straight one; a visitor types neither reliably, and "clems station"
 * found nothing. 220 carry an accent that changes the letter ("Poké Chop",
 * "Señor Grubby's", "Phở Trúc Xanh"), which a visitor types even less often —
 * that one hid two of the four Poké Chop branches from anybody searching
 * "poke chop". lib/db.ts searchRestaurants folds the same two in SQL.
 *
 * Superseded for the grid by `normalize` in lib/textMatch.ts, which folds this
 * and more. It stays because the map's own search (components/useMapSearch.ts)
 * is a client-side substring filter over a list already in hand and does not
 * need the ladder.
 */
export function foldSearchText(s: string): string {
  return foldAccents(s)
    .toLowerCase()
    .replace(/['’`´]/g, "");
}

/** The memoised fields, shared so the suggest endpoint ranks the same prepared
 *  strings the grid does rather than building its own set per keystroke. */
export function searchFieldsFor(r: RestaurantView): SearchFields {
  let fields = SEARCH_FIELDS.get(r);
  if (fields === undefined) {
    /* `?? ""` rather than passing the field straight through: 557 restaurants
       have no cuisine (the OpenStreetMap import does not always carry one), and
       the string template this replaced rendered that null as the four
       characters "null" — which made `?q=null` match every one of them.

       `cuisineTags` was the stronger case: declared optional, so unguarded it
       rendered the literal "undefined" and `?q=undefined` matched every
       restaurant without tags. `prepare` handles null itself now, so this is
       belt and braces rather than the only guard. */
    fields = {
      name: prepare(r.name),
      cuisine: prepare(r.cuisine ?? ""),
      tags: prepare(r.cuisineTags ?? ""),
      neighborhood: prepare(r.neighborhood ?? ""),
    };
    SEARCH_FIELDS.set(r, fields);
  }
  return fields;
}

/**
 * How well one restaurant answers one prepared query. 0 means it does not.
 *
 * The dish name is passed in rather than looked up here because the corpus
 * deliberately holds no dishes — see `dishMatchesFor` in lib/db.ts. A dish match
 * is an OR, not a second test: "carne asada fries" matches no restaurant text
 * anywhere in the corpus and 129 restaurants serve it. It also sits below every
 * name tier, which is the ordering this whole change exists for.
 */
export function relevanceFor(
  r: RestaurantView,
  query: Prepared,
  dishes: Map<string, MatchedDish> | null,
): number {
  return scoreRestaurant(query, searchFieldsFor(r), dishes?.get(r.id)?.name ?? null);
}

/**
 * Every restaurant's relevance to one query, for `FilterContext.scores`.
 *
 * Built once by the caller and handed to the predicate, so the six passes
 * `countFacets` makes share one round of arithmetic instead of repeating it.
 * Rows that score 0 are left out: the map is read with `?? 0`, and a corpus-
 * sized map of zeroes is the common case for a specific query.
 */
/**
 * `prepare`, remembering only the last query.
 *
 * The unmemoised branch of `matchesFilters` would otherwise build the query's
 * bigrams once per row, and the whole point of a filter pass is that the query
 * is the one thing that does not change across it. One entry is the whole
 * working set: a pass asks about one query, thousands of times.
 */
let lastQuery: { raw: string; prepared: Prepared } | null = null;

function preparedQuery(raw: string): Prepared {
  if (lastQuery?.raw !== raw) lastQuery = { raw, prepared: prepare(raw) };
  return lastQuery.prepared;
}

export function scoreMatches(
  restaurants: readonly RestaurantView[],
  q: string,
  dishes: Map<string, MatchedDish> | null,
): Map<string, number> {
  const query = prepare(q);
  const scores = new Map<string, number>();
  for (const r of restaurants) {
    const score = relevanceFor(r, query, dishes);
    if (score > 0) scores.set(r.id, score);
  }
  return scores;
}

export function matchesFilters(
  r: RestaurantView,
  f: DiscoverFilters,
  ctx: FilterContext,
): boolean {
  if (f.neighborhood && r.neighborhood !== f.neighborhood) return false;
  if (f.nearby && ctx.here) {
    if (milesBetween(ctx.here, { lat: r.lat, lng: r.lng }) > NEARBY_RADIUS_MI) return false;
  }
  if (f.cuisine && r.cuisine !== f.cuisine) return false;
  /* A named dish is a filter, not a search: the visitor picked it off the
     dropdown, so the only places that pass are the ones whose menu actually
     lists it. Tested before `q` because it is a map lookup and `q` is
     arithmetic, and because it is the narrower of the two. */
  if (f.dish && ctx.namedDish && !ctx.namedDish.has(r.id)) return false;
  /* Free text is scored, not substring-tested, and the score is what both this
     predicate and the ordering in lib/discover.ts read — so a row that survives
     the filter arrives already carrying the reason it did.

     Anything above zero passes. The ladder lives in lib/textMatch.ts: name
     before cuisine before neighbourhood before dish, with the fuzzy name tier
     sitting 280 points above the best possible dish match, which is what makes
     a misspelled restaurant outrank a wall of menus that happen to contain the
     word. A filter still either includes a row or doesn't; the score only
     decides what order the included ones come back in.

     `ctx.scores` is the precomputed map when a caller built one. Null means
     nobody did, and the row is scored here instead — a client calling this with
     NO_CONTEXT gets the same answer, one row at a time. */
  if (f.q) {
    const score = ctx.scores
      ? (ctx.scores.get(r.id) ?? 0)
      : relevanceFor(r, preparedQuery(f.q), ctx.dishes);
    if (score <= 0) return false;
    /* A scoped search keeps only the rows that matched on the field the visitor
       picked off the dropdown. The band the score sits in *is* that field
       (`scopeOf`), so this is a comparison rather than a second pass over the
       text — and it cannot disagree with the ranking, because both read the one
       number. `ALL_SCOPE` is exempt because it is not a field: it asked for
       every reading, which is every row that scored at all. */
    if (f.scope && f.scope !== ALL_SCOPE && scopeOf(score) !== f.scope) return false;
  }
  // A restaurant with no menu has no band and so matches no price â see the
  // note in data/priceBands.ts about why it isn't given a guessed one.
  if (f.price && r.priceBand !== f.price) return false;
  if (f.aspect && ctx.aspects) {
    if (!ctx.aspects.get(r.id)?.has(f.aspect)) return false;
  }
  if (f.quick.includes("top-rated")) {
    if (SHOW_BLEND_STARS) {
      // A rating-less restaurant is deliberately excluded here, not just
      // incidentally: `null < TOP_RATED_STARS` happens to be true, but this
      // says so rather than leaning on the coercion.
      if (r.rating === null || r.rating < TOP_RATED_STARS) return false;
    } else if (ctx.plates) {
      // An unrated restaurant fails this, and so does one whose plates haven't
      // cleared the plate-score floor â see TOP_RATED_PERCENT.
      const percent = ctx.plates[r.id]?.percent ?? null;
      if (percent === null || percent < TOP_RATED_PERCENT) return false;
    }
  }
  if (f.quick.includes("trending") && !r.trending) return false;
  if (f.quick.includes("open-now") && ctx.now) {
    /*
     * Only a restaurant known to be open passes. This tested `kind === "closed"`
     * and so let "unknown" through â every restaurant whose hours had not been
     * fetched counted as open, and at 5,699 rows that was thousands of them:
     * "Open now" quietly meant "everything we cannot rule out", and its count
     * said 905 of 991.
     *
     * Asking to see what is open is a question about restaurants, not about the
     * completeness of our data, and the honest answer for one we know nothing
     * about is to leave it out. This is also now the only place in the product
     * that judges open or closed â the cards print hours and make no claim.
     */
    const kind = openStateFor(r.hours, ctx.now).kind;
    if (kind !== "open" && kind !== "soon") return false;
  }
  return true;
}

export function applyFilters(
  restaurants: readonly RestaurantView[],
  f: DiscoverFilters,
  ctx: FilterContext,
): RestaurantView[] {
  return restaurants.filter((r) => matchesFilters(r, f, ctx));
}

/**
 * Which of a card's own facts are the reason it survived the filter â what the
 * grid marks so the reader can see the answer without opening anything.
 *
 * It lives beside `matchesFilters` deliberately, because it is the *same
 * question asked for display*, and the two drifting apart is the failure mode:
 * a card lit up for a neighbourhood the predicate never tested would be a lie
 * with a highlight on it. Every branch here mirrors one there.
 *
 * The free-text leftover (`q`) marks whichever facet it matched. It is a
 * substring test against the same fields `matchesFilters` uses, so a search for
 * "gasl" that lands on Gaslamp lights Gaslamp. It cannot mark the name â that
 * is the third field `searchable` covers, and a card whose *name* matched needs
 * no explanation for why it is there.
 *
 * Returns plain booleans and labels, not JSX: the two card designs (web and
 * phone) mark them differently, and only the decision is shared.
 */
export function matchMarksFor(
  r: RestaurantView,
  f: DiscoverFilters,
): { cuisine: boolean; neighborhood: boolean; price: string | null } {
  const q = f.q ? foldSearchText(f.q.trim()) : null;
  return {
    /* Optional-chained because a restaurant can genuinely have neither field â
       557 rows arrived from OpenStreetMap with a null cuisine. Calling
       `.toLowerCase()` on that threw a TypeError *during the server render*,
       which took the whole Discover page down with an error boundary rather
       than simply not matching. Any `?q=` at all hit it. */
    cuisine:
      (f.cuisine !== null && r.cuisine === f.cuisine) ||
      (q !== null && (r.cuisine ? foldSearchText(r.cuisine).includes(q) : false)),
    neighborhood:
      (f.neighborhood !== null && r.neighborhood === f.neighborhood) ||
      (q !== null && (r.neighborhood ? foldSearchText(r.neighborhood).includes(q) : false)),
    // Mirrors the predicate's own note: a restaurant with no menu has no band,
    // so it never matches a price filter and never gets the chip.
    price: f.price !== null && r.priceBand === f.price ? f.price : null,
  };
}

/* --- Options ---------------------------------------------------------- */

export type FacetOption = {
  value: string;
  /** Count with no filters at all â fixes the display order (see below). */
  total: number;
};

/**
 * Options come from the restaurants themselves, never from a hand-kept list.
 *
 * The rail used to offer `neighborhoods` from data/restaurants.ts, which is
 * derived from `neighborhoodCenters` â the map's zone centroids, which that
 * file documents as deliberately independent of where restaurants actually
 * are. Twenty-two of its thirty-seven entries matched nothing, and five
 * neighbourhoods that do hold restaurants (Liberty Station, Del Mar,
 * University Heights, Spring Valley, Scripps Ranch â eight places between
 * them) had no option at all, so a fifth of the map was unreachable from the
 * filter.
 *
 * Ordered by unfiltered count, then alphabetically. Ordering by the *live*
 * count would reshuffle the list under the user's finger every time they
 * changed something else.
 */
function optionsFor(
  restaurants: readonly RestaurantView[],
  key: "neighborhood" | "cuisine",
): FacetOption[] {
  const totals = new Map<string, number>();
  for (const r of restaurants) {
    const value = r[key];
    if (value) totals.set(value, (totals.get(value) ?? 0) + 1);
  }

  return [...totals]
    .map(([value, total]) => ({ value, total }))
    .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
}

export function neighborhoodOptions(restaurants: readonly RestaurantView[]): FacetOption[] {
  return optionsFor(restaurants, "neighborhood");
}

export function cuisineOptions(restaurants: readonly RestaurantView[]): FacetOption[] {
  return optionsFor(restaurants, "cuisine");
}

/**
 * Price keeps its canonical cheap-to-expensive order rather than being sorted
 * by count like the data-derived facets â money has an order of its own, and
 * shuffling `$$$` above `$` because more places land there would be nonsense.
 */
export function priceOptions(restaurants: readonly RestaurantView[]): FacetOption[] {
  const totals = new Map<string, number>();
  for (const r of restaurants) {
    const band = r.priceBand;
    if (band) totals.set(band, (totals.get(band) ?? 0) + 1);
  }
  return PRICE_VALUES.map((value) => ({ value, total: totals.get(value) ?? 0 }));
}

/**
 * Every category, ordered by how many restaurants earn it â the same rule the
 * neighbourhood and cuisine lists follow, and the one the rail depends on now
 * that it shows only the first few rows before "show more". Ordering by the
 * *unfiltered* total keeps it from reshuffling under the user's finger as they
 * change something else.
 *
 * Options with nothing behind them are kept rather than dropped, and render
 * disabled with a 0 â "nobody has praised the drinks anywhere" is information.
 */
export function aspectOptions(aspects: StrongAspects | null): FacetOption[] {
  const totals = new Map<string, number>();
  if (aspects) {
    for (const scored of aspects.values()) {
      for (const aspect of scored.keys()) totals.set(aspect, (totals.get(aspect) ?? 0) + 1);
    }
  }
  return BEST_AT_LABELS.map((value) => ({ value, total: totals.get(value) ?? 0 })).sort(
    (a, b) => b.total - a.total || a.value.localeCompare(b.value),
  );
}

/* --- Counts ----------------------------------------------------------- */

export type FacetCounts = {
  /** What picking this neighbourhood would return, given the other filters. */
  neighborhood: Map<string, number>;
  cuisine: Map<string, number>;
  price: Map<string, number>;
  aspect: Map<string, number>;
  /** What *adding* this toggle would return; for one already on, the total. */
  quick: Record<QuickFilter, number>;
  /** The "any" rows: this dimension cleared, everything else held. */
  anyNeighborhood: number;
  anyCuisine: number;
  anyPrice: number;
  anyAspect: number;
  /**
   * What Nearby would return. Null until there are coordinates to measure
   * from â the row prints nothing rather than a number it can't stand behind.
   */
  nearby: number | null;
};

/**
 * Counts each option against the other filters but not against its own
 * dimension â otherwise every unselected neighbourhood reads 0 the moment one
 * is picked, which tells the user nothing about where else they could go.
 */
export function countFacets(
  restaurants: readonly RestaurantView[],
  f: DiscoverFilters,
  ctx: FilterContext,
): FacetCounts {
  // Nearby shares the "where" dimension with neighbourhood, so clearing that
  // dimension has to clear both â otherwise every neighbourhood row would be
  // counted inside the radius while Nearby is on.
  const exceptWhere: DiscoverFilters = { ...f, neighborhood: null, nearby: false };
  const exceptCuisine: DiscoverFilters = { ...f, cuisine: null };
  const exceptPrice: DiscoverFilters = { ...f, price: null };
  const exceptAspect: DiscoverFilters = { ...f, aspect: null };

  const neighborhood = new Map<string, number>();
  const cuisine = new Map<string, number>();
  const price = new Map<string, number>();
  const aspect = new Map<string, number>();
  let anyNeighborhood = 0;
  let anyCuisine = 0;
  let anyPrice = 0;
  let anyAspect = 0;
  let nearby = 0;

  for (const r of restaurants) {
    if (matchesFilters(r, exceptWhere, ctx)) {
      anyNeighborhood += 1;
      neighborhood.set(r.neighborhood, (neighborhood.get(r.neighborhood) ?? 0) + 1);
      if (
        ctx.here &&
        milesBetween(ctx.here, { lat: r.lat, lng: r.lng }) <= NEARBY_RADIUS_MI
      ) {
        nearby += 1;
      }
    }
    if (matchesFilters(r, exceptCuisine, ctx)) {
      anyCuisine += 1;
      // A row with no cuisine still counts toward "Any cuisine" â it is a
      // real result â but contributes to no option. It has nothing to say
      // about which bucket it belongs in, and inventing one is what the
      // vocabulary in data/cuisines.ts exists to stop.
      if (r.cuisine) cuisine.set(r.cuisine, (cuisine.get(r.cuisine) ?? 0) + 1);
    }
    if (matchesFilters(r, exceptPrice, ctx)) {
      anyPrice += 1;
      const band = r.priceBand;
      if (band) price.set(band, (price.get(band) ?? 0) + 1);
    }
    if (matchesFilters(r, exceptAspect, ctx)) {
      anyAspect += 1;
      for (const label of ctx.aspects?.get(r.id)?.keys() ?? []) {
        aspect.set(label, (aspect.get(label) ?? 0) + 1);
      }
    }
  }

  const quick = {} as Record<QuickFilter, number>;
  for (const value of QUICK_VALUES) {
    const next: DiscoverFilters = f.quick.includes(value)
      ? f
      : { ...f, quick: [...f.quick, value] };
    let n = 0;
    for (const r of restaurants) if (matchesFilters(r, next, ctx)) n += 1;
    quick[value] = n;
  }

  return {
    neighborhood,
    cuisine,
    price,
    aspect,
    quick,
    anyNeighborhood,
    anyCuisine,
    anyPrice,
    anyAspect,
    nearby: ctx.here ? nearby : null,
  };
}

/* --- URL -------------------------------------------------------------- */

export const NEIGHBORHOOD_PARAM = "neighborhood";
const NEARBY_PARAM = "nearby";
export const CUISINE_PARAM = "cuisine";
const PRICE_PARAM = "price";
const ASPECT_PARAM = "aspect";
const QUICK_PARAM = "quick";
export const QUERY_PARAM = "q";
export const DISH_PARAM = "dish";
/** Reads as `?q=cannonball&in=dish` — the scope is a preposition on the term,
 *  which is exactly what it is. */
export const SCOPE_PARAM = "in";

/**
 * The longest search term worth carrying. Past this it is not a search, it is
 * someone pasting a paragraph into the URL.
 *
 * Shared with lib/suggest.ts so the dropdown truncates a pasted paragraph at
 * exactly the point the URL would.
 */
export const MAX_QUERY = 60;

/**
 * Turns a search term that names a filter into that filter.
 *
 * The header search is one field over the whole product, so people type "Thai",
 * "North Park" and "$$" into it as readily as they type a restaurant's name.
 * Left as free text those would still return roughly the right places, but the
 * rail would sit there claiming no filters were on, the facet counts would
 * describe a text match rather than a cuisine, and there would be nothing on
 * screen to widen or step back from. Promoting the term gives the visitor the
 * same page they would have reached by clicking, which is the one they can then
 * keep browsing from.
 *
 * Only ever fills a dimension that is empty: `?q=Thai&cuisine=Mexican` is a
 * search *within* Mexican, and quietly overwriting the filter someone already
 * picked would be the rudest possible reading of it. Anything left unpromoted
 * stays free text.
 */
function promote(
  raw: string,
  base: DiscoverFilters,
  restaurants: readonly RestaurantView[],
): DiscoverFilters {
  const q = raw.toLowerCase();

  /*
   * A term that *is* a restaurant's whole name stays a search, whatever else it
   * also names. There is one such collision in the corpus today — a place
   * called "Pizza", against the cuisine Pizza — and without this it cannot be
   * reached by typing its name at all: the term promotes to `?cuisine=Pizza`
   * and the restaurant sits somewhere inside 400 pizza places instead of first.
   * As a search it is first, because a name match outranks everything (TIER in
   * lib/textMatch.ts).
   *
   * Deliberately *exact*, and not "matches a name" in the looser senses the
   * ranked search uses. 248 restaurants here begin with a cuisine word
   * ("Mexican Seafood & Grill", "Pizza Pal", "Italian Cucina") and 2,077
   * contain one, so a prefix or substring test would stop "mexican" promoting —
   * which is the case promotion exists for. Someone who typed a category word
   * and meant the category is served by the rail; someone who typed it and
   * meant a restaurant of that exact name now has the dropdown's Restaurants
   * group, which offers the place by name whichever way this resolves.
   */
  if (restaurants.some((r) => r.name.trim().toLowerCase() === q)) return { ...base, q: raw };

  // Null-safe on cuisine, which a restaurant may not have. A term only
  // promotes if some restaurant actually carries it, so the vocabulary in
  // data/cuisines.ts decides this for free: "tacos" names no cuisine any
  // more, so it stays free text and matches on the search tags instead â
  // which is the whole point of keeping the tags.
  const has = (key: "cuisine" | "neighborhood") =>
    restaurants.find((r) => r[key]?.toLowerCase() === q)?.[key] ?? null;

  const cuisine = has("cuisine");
  if (cuisine && !base.cuisine) return { ...base, cuisine };

  // Skipped while Nearby is on: the two share the "where" dimension, and a
  // search term must not silently cancel a radius the visitor asked for.
  const neighborhood = has("neighborhood");
  if (neighborhood && !base.neighborhood && !base.nearby) return { ...base, neighborhood };

  const price = PRICE_VALUES.find((b) => b === raw);
  if (price && !base.price) return { ...base, price };

  const aspect = BEST_AT_LABELS.find((a) => a.toLowerCase() === q);
  if (aspect && !base.aspect) return { ...base, aspect };

  const quick = QUICK_FILTERS.find((f) => f.label.toLowerCase() === q);
  if (quick && !base.quick.includes(quick.value)) {
    return { ...base, quick: [...base.quick, quick.value] };
  }

  return { ...base, q: raw };
}

/**
 * Values are checked against the real data on the way in, so a stale or
 * hand-edited link degrades to "no filter" rather than to an empty grid with
 * no visible cause.
 */
export function filtersFromSearch(
  search: string,
  restaurants: readonly RestaurantView[],
): DiscoverFilters {
  const params = new URLSearchParams(search);

  const neighborhood = params.get(NEIGHBORHOOD_PARAM);
  const cuisine = params.get(CUISINE_PARAM);
  const price = params.get(PRICE_PARAM);
  const aspect = params.get(ASPECT_PARAM);
  const requested = new Set((params.get(QUICK_PARAM) ?? "").split(","));

  const known = (key: "neighborhood" | "cuisine", value: string | null) =>
    value !== null && restaurants.some((r) => r[key] === value) ? value : null;

  const inNeighborhood = known("neighborhood", neighborhood);
  const query = (params.get(QUERY_PARAM) ?? "").trim().slice(0, MAX_QUERY);

  const filters: DiscoverFilters = {
    neighborhood: inNeighborhood,
    // A link can't grant location, so this only restores the intent; the
    // radius applies once the visitor allows the prompt. Dropped outright if
    // the same link also names a neighbourhood, which keeps the "these two are
    // exclusive" invariant true for hand-edited URLs too.
    nearby: params.get(NEARBY_PARAM) === "1" && inNeighborhood === null,
    cuisine: known("cuisine", cuisine),
    price: PRICE_VALUES.find((b) => b === price) ?? null,
    aspect: BEST_AT_LABELS.find((a) => a === aspect) ?? null,
    // Filtered from the canonical list rather than the URL's order, so the
    // same set of toggles always serialises to the same string.
    quick: QUICK_VALUES.filter((v) => requested.has(v)),
    q: null,
    /*
     * The one value here that cannot be checked against real data on the way
     * in, and deliberately not faked: the corpus this function is handed is
     * restaurants, and 187,183 dish names are not in it (nor should they be —
     * see dishesNamedExactly in lib/db.ts). So a `?dish=` naming nothing
     * survives as a filter and produces an empty grid *with the chip on
     * screen*, which is a result the visitor can see the cause of and remove.
     * Silently dropping it would produce a full grid that ignores the URL.
     */
    dish: (params.get(DISH_PARAM) ?? "").trim().slice(0, MAX_QUERY) || null,
    // Checked against the ladder's own vocabulary, so `?in=banana` degrades to
    // an unscoped search rather than to a grid that silently excludes
    // everything. Dropped without a term, because a scope is a narrowing of one
    // and there is nothing to narrow.
    scope: (query && QUERY_SCOPES.find((s) => s === params.get(SCOPE_PARAM))) || null,
  };

  /* Last, and against the filters already resolved above, so promotion can see
     which dimensions the URL had spoken for.

     A scoped term is never promoted, and that is the point of the scope. The
     visitor picked "cannonball, as a dish" off the dropdown; turning it into
     `?cuisine=` — or, for a term like "mexican", into the cuisine filter it
     names — would answer a question they explicitly did not ask. It keeps the
     term as free text instead, which is what `promote` would have done with it
     anyway once every dimension it could fill was ruled out.

     `in=all` is here for exactly that reason and not as an exception to it. It
     is the dropdown's first line, and picking it says "everything that matched,
     ranked" — so promoting "thai" to the cuisine filter would drop the 530
     places whose *menus* say thai, which is the narrowing that line exists to
     refuse. Enter still promotes: it picked nothing, so nothing was said. */
  if (!query) return filters;
  return filters.scope ? { ...filters, q: query } : promote(query, filters, restaurants);
}

/** Rewrites only our keys, so anything else on the URL survives. */
export function searchFromFilters(search: string, f: DiscoverFilters): string {
  const params = new URLSearchParams(search);

  const put = (key: string, value: string | null) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };

  put(NEIGHBORHOOD_PARAM, f.neighborhood);
  put(NEARBY_PARAM, f.nearby ? "1" : null);
  put(CUISINE_PARAM, f.cuisine);
  put(PRICE_PARAM, f.price);
  put(ASPECT_PARAM, f.aspect);
  put(QUICK_PARAM, f.quick.length > 0 ? f.quick.join(",") : null);
  // A promoted term leaves `q` null, which deletes the key â so the moment the
  // visitor touches any filter, `?q=Thai` is rewritten as the `?cuisine=Thai`
  // it actually resolved to and the URL stops describing a search it no longer
  // is.
  put(QUERY_PARAM, f.q);
  put(DISH_PARAM, f.dish);
  // Only ever alongside a term. Clearing the search therefore clears the scope
  // as well, without the callers having to remember to null both.
  put(SCOPE_PARAM, f.q ? f.scope : null);

  return params.toString();
}
