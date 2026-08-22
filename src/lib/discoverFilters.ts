/**
 * Discover's filter model: what the rail offers, what it matches, what each
 * option would return, and how the whole thing round-trips through the URL.
 *
 * It lives here rather than inside the components because three surfaces read
 * it — the desktop rail, the mobile sheet, and the grid — and because facet
 * counting has to use exactly the same predicate the grid does or the numbers
 * lie.
 */

import { BEST_AT_LABELS } from "@/data/reviewScales";
import { PRICE_BANDS, type PriceBand } from "@/data/priceBands";
import type { RestaurantView } from "@/data/restaurants";
import { aspectScores } from "@/lib/aspectScores";
import type { PlateScore } from "@/lib/plateScore";
import { SHOW_BLEND_STARS } from "@/lib/ratingDisplay";
// From lib/geo.ts, not lib/nearby.ts: this module is imported by the server
// (lib/discover.ts) as well as by client components, and nearby.ts is a React
// hook. See the note in geo.ts.
import { milesBetween, NEARBY_RADIUS_MI, type Coords } from "@/lib/geo";
import { openStateFor } from "@/lib/openState";

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
 * same switch the display reads — so the filter always measures what the cards
 * are actually showing. A visitor filtering to "Top rated" and then seeing the
 * stars on every result is coherent; filtering on a percent nine cards in ten
 * don't have is not.
 *
 * `TOP_RATED_PERCENT` is the end state and takes over the day the stars go. It
 * excludes a restaurant whose plates haven't cleared the plate-score floor,
 * because that restaurant is unrated rather than well-rated — which is why it
 * cannot be the live threshold yet, and why the flag decides.
 *
 * 4.5 is where this sat before the plate score existed, and it is calibrated
 * against the real blend. 85 is not calibrated against anything yet — re-check it
 * once there are real dish ratings behind it.
 */
export const TOP_RATED_STARS = 4.5;
export const TOP_RATED_PERCENT = 85;

const PRICE_VALUES = PRICE_BANDS.map((b) => b.value);

export type DiscoverFilters = {
  /**
   * Where, as one dimension with three states: everywhere (`neighborhood`
   * null, `nearby` false), within the radius, or one named neighbourhood.
   * Nearby and a neighbourhood are mutually exclusive — the setters below
   * enforce it, so nothing has to reason about "nearby, in North Park".
   */
  neighborhood: string | null;
  nearby: boolean;
  cuisine: string | null;
  price: PriceBand | null;
  /** A category label from BEST_AT — "Service", "Ambiance", "Drinks"… Never
      "Food": the plate score is the food rating, so it isn't a category. */
  aspect: string | null;
  quick: QuickFilter[];
  /**
   * Free text from the header search, matched against name, cuisine and
   * neighbourhood — the same three fields that search itself ranks on.
   *
   * It is what is *left* of a search after `filtersFromSearch` has taken out
   * anything the rail can express: a term naming a real cuisine, neighbourhood,
   * price band or category becomes that filter instead, so searching "Thai"
   * lands on Discover with Thai lit up in the rail rather than on a text match
   * that happens to return the same places. See `promote` below.
   */
  q: string | null;
};

export const NO_FILTERS: DiscoverFilters = {
  neighborhood: null,
  nearby: false,
  cuisine: null,
  price: null,
  aspect: null,
  quick: [],
  q: null,
};

/** How many separate choices are on — what the mobile bar's badge counts. */
export function activeFilterCount(f: DiscoverFilters): number {
  return (
    (f.neighborhood ? 1 : 0) +
    (f.nearby ? 1 : 0) +
    (f.cuisine ? 1 : 0) +
    (f.price ? 1 : 0) +
    (f.aspect ? 1 : 0) +
    (f.q ? 1 : 0) +
    f.quick.length
  );
}

/* --- Aspects ---------------------------------------------------------- */

/**
 * The rating a category has to clear to count as "rated well for" it — on the
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
 * `score` is null for a restaurant with no plate score — it qualified on votes
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
 * client components and db.ts constructs the Neon client at module scope —
 * the repo's standing rule (see CLAUDE.md) is to mirror the row shape rather
 * than risk dragging the driver into the browser bundle. Keep the two in step.
 */
export type AspectTally = {
  /** The restaurant's sourced rating on 1-5 — see lib/db.ts. */
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
       the restaurant's rating — a 4.6 restaurant would read "rated well for
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
 * for it — including while the tallies are still in flight, which is the same
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
 * do — the clock mounts (lib/clock.ts), the visitor grants location, the
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
   * Every restaurant's plate score, keyed by id — what "Top rated" reads. A
   * restaurant absent from the record has no rated plates; null is the whole
   * record still being in flight, and follows the same match-everything rule as
   * the other two.
   */
  plates: Record<string, PlateScore> | null;
};

export const NO_CONTEXT: FilterContext = {
  now: null,
  here: null,
  aspects: null,
  plates: null,
};

/**
 * The text a free-text query is matched against, lowercased once per row.
 *
 * `matchesFilters` runs six times per restaurant per request — once for the
 * grid and once for each facet dimension being counted — so building this
 * inline would lowercase the whole corpus six times over on every keystroke's
 * worth of navigation. Keyed on the row object, which lib/discover.ts holds for
 * the life of its 60s corpus cache; a `WeakMap` means the entries go when that
 * cache is replaced.
 */
const SEARCHABLE_TEXT = new WeakMap<RestaurantView, string>();

function searchable(r: RestaurantView): string {
  let text = SEARCHABLE_TEXT.get(r);
  if (text === undefined) {
    text = `${r.name} ${r.cuisine} ${r.neighborhood}`.toLowerCase();
    SEARCHABLE_TEXT.set(r, text);
  }
  return text;
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
  // Name, cuisine, neighbourhood — the same three fields the header search
  // ranks on and /api/restaurants?q= narrows on, so a term that found a place
  // in the dropdown still finds it here. Substring rather than ranked: this is
  // a filter, and a filter either includes a row or doesn't.
  if (f.q && !searchable(r).includes(f.q.toLowerCase())) return false;
  // A restaurant with no menu has no band and so matches no price — see the
  // note in data/priceBands.ts about why it isn't given a guessed one.
  if (f.price && r.priceBand !== f.price) return false;
  if (f.aspect && ctx.aspects) {
    if (!ctx.aspects.get(r.id)?.has(f.aspect)) return false;
  }
  if (f.quick.includes("top-rated")) {
    if (SHOW_BLEND_STARS) {
      if (r.rating < TOP_RATED_STARS) return false;
    } else if (ctx.plates) {
      // An unrated restaurant fails this, and so does one whose plates haven't
      // cleared the plate-score floor — see TOP_RATED_PERCENT.
      const percent = ctx.plates[r.id]?.percent ?? null;
      if (percent === null || percent < TOP_RATED_PERCENT) return false;
    }
  }
  if (f.quick.includes("trending") && !r.trending) return false;
  if (f.quick.includes("open-now") && ctx.now) {
    /*
     * Only a restaurant known to be open passes. This tested `kind === "closed"`
     * and so let "unknown" through — every restaurant whose hours had not been
     * fetched counted as open, and at 5,699 rows that was thousands of them:
     * "Open now" quietly meant "everything we cannot rule out", and its count
     * said 905 of 991.
     *
     * Asking to see what is open is a question about restaurants, not about the
     * completeness of our data, and the honest answer for one we know nothing
     * about is to leave it out. This is also now the only place in the product
     * that judges open or closed — the cards print hours and make no claim.
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

/* --- Options ---------------------------------------------------------- */

export type FacetOption = {
  value: string;
  /** Count with no filters at all — fixes the display order (see below). */
  total: number;
};

/**
 * Options come from the restaurants themselves, never from a hand-kept list.
 *
 * The rail used to offer `neighborhoods` from data/restaurants.ts, which is
 * derived from `neighborhoodCenters` — the map's zone centroids, which that
 * file documents as deliberately independent of where restaurants actually
 * are. Twenty-two of its thirty-seven entries matched nothing, and five
 * neighbourhoods that do hold restaurants (Liberty Station, Del Mar,
 * University Heights, Spring Valley, Scripps Ranch — eight places between
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
  for (const r of restaurants) totals.set(r[key], (totals.get(r[key]) ?? 0) + 1);

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
 * by count like the data-derived facets — money has an order of its own, and
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
 * Every category, ordered by how many restaurants earn it — the same rule the
 * neighbourhood and cuisine lists follow, and the one the rail depends on now
 * that it shows only the first few rows before "show more". Ordering by the
 * *unfiltered* total keeps it from reshuffling under the user's finger as they
 * change something else.
 *
 * Options with nothing behind them are kept rather than dropped, and render
 * disabled with a 0 — "nobody has praised the drinks anywhere" is information.
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
   * from — the row prints nothing rather than a number it can't stand behind.
   */
  nearby: number | null;
};

/**
 * Counts each option against the other filters but not against its own
 * dimension — otherwise every unselected neighbourhood reads 0 the moment one
 * is picked, which tells the user nothing about where else they could go.
 */
export function countFacets(
  restaurants: readonly RestaurantView[],
  f: DiscoverFilters,
  ctx: FilterContext,
): FacetCounts {
  // Nearby shares the "where" dimension with neighbourhood, so clearing that
  // dimension has to clear both — otherwise every neighbourhood row would be
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
      cuisine.set(r.cuisine, (cuisine.get(r.cuisine) ?? 0) + 1);
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

const NEIGHBORHOOD_PARAM = "neighborhood";
const NEARBY_PARAM = "nearby";
const CUISINE_PARAM = "cuisine";
const PRICE_PARAM = "price";
const ASPECT_PARAM = "aspect";
const QUICK_PARAM = "quick";
export const QUERY_PARAM = "q";

/**
 * The longest search term worth carrying. Past this it is not a search, it is
 * someone pasting a paragraph into the URL.
 */
const MAX_QUERY = 60;

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
  const has = (key: "cuisine" | "neighborhood") =>
    restaurants.find((r) => r[key].toLowerCase() === q)?.[key] ?? null;

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
  };

  // Last, and against the filters already resolved above, so promotion can see
  // which dimensions the URL had spoken for.
  return query ? promote(query, filters, restaurants) : filters;
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
  // A promoted term leaves `q` null, which deletes the key — so the moment the
  // visitor touches any filter, `?q=Thai` is rewritten as the `?cuisine=Thai`
  // it actually resolved to and the URL stops describing a search it no longer
  // is.
  put(QUERY_PARAM, f.q);

  return params.toString();
}
