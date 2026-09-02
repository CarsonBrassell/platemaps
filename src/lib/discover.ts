/**
 * Discover's query, run on the server.
 *
 * ## Why this exists
 *
 * Discover used to receive every restaurant and filter in the browser. That was
 * the right call at 36 places and became the ceiling on the whole product: the
 * page server-rendered a card for every restaurant in the corpus, measured at
 * ~4KB each, so 5,000 restaurants meant a 19MB page. Someone landing on
 * `?cuisine=Thai` downloaded the entire city and then watched the client hide
 * almost all of it.
 *
 * The filtering now happens here and the browser receives a page of results.
 * Page weight is flat in the size of the table.
 *
 * ## Why it is still TypeScript and not SQL
 *
 * The predicate stays `matchesFilters` from lib/discoverFilters.ts — the exact
 * function the grid used to call, now called server-side. That module's own
 * header states the invariant this protects: facet counts have to use the same
 * predicate as the grid or the numbers lie. Porting the model to SQL would mean
 * two implementations of "open now" (which parses "Closes 2am" against Los
 * Angeles time, including the small-hours wraparound) and of the aspect-score
 * damping, and the first time they drifted the rail would confidently print
 * counts that no longer described the grid.
 *
 * So the corpus is loaded and scanned in memory, per request, behind a short
 * cache. That is a real cost and a real limit — it is linear in the table, it
 * is just linear somewhere that has a CPU instead of linear over a phone's
 * network. The seam to fix it later is this file's exported surface: the page
 * and the API route only know `getDiscoverPage`, so the day the scan becomes
 * the bottleneck, its body can become SQL without either caller changing.
 *
 * ## Server-only
 *
 * Imports db.ts, which constructs the Neon client at module scope. Nothing in
 * a client component may import this — same standing rule as db.ts itself, and
 * enforced the same way, by this comment.
 */

import {
  applyFilters,
  countFacets,
  aspectOptions,
  cuisineOptions,
  filtersFromSearch,
  neighborhoodOptions,
  priceOptions,
  strongAspectsFrom,
  type DiscoverFilters,
  type FacetCounts,
  type FacetOption,
  type FilterContext,
  type StrongAspect,
} from "@/lib/discoverFilters";
import type { FeedPlace } from "@/lib/feedFilters";
import type { Coords } from "@/lib/geo";
import type { RestaurantView } from "@/data/restaurantTypes";
import {
  dishMatchesFor,
  getAllRestaurantAspectTallies,
  getAllRestaurantPlateScores,
  getDishesByRestaurant,
  getRestaurants,
} from "@/lib/db";
import { EMPTY_PLATE_SCORE, type PlateScore } from "@/lib/plateScore";

/** How many cards a page of results holds. */
export const PAGE_SIZE = 24;

/**
 * The ceiling on `shown`, so a hand-edited or crawled URL can't ask for the
 * whole corpus and undo the reason this file exists.
 */
const MAX_SHOWN = 240;

/**
 * A restaurant on the grid, plus its score in the filtered category.
 *
 * Attached here rather than looked up in the browser because the browser no
 * longer has the aspect tallies — it used to fetch all of them on mount purely
 * so the rail could count, and that was another whole-corpus payload. The card
 * needs one number, so one number is what it is sent.
 */
export type DiscoverResult = RestaurantView & {
  aspectScore?: StrongAspect;
  /**
   * The restaurant's plate score, attached for the same reason as above: the
   * card prints it, and the browser has no way to derive it. Always present, and
   * carries its own null percent for a restaurant with too few rated plates —
   * the card says so rather than falling back to a borrowed number.
   */
  plateScore: PlateScore;
};

export type DiscoverPage = {
  /**
   * The filters actually in effect, resolved against the real data.
   *
   * Returned rather than parsed by the caller because resolving them needs the
   * corpus: an unknown neighbourhood degrades to "no filter" instead of an
   * empty grid with no visible cause, and only the row set knows which
   * neighbourhoods are real. The client renders its rail from this, so what is
   * highlighted is always what was applied.
   */
  filters: DiscoverFilters;
  /** Just this page of matches — never the whole result set. */
  results: DiscoverResult[];
  /** How many matched in total, which is what the "N places" line reports. */
  total: number;
  /** How many are on screen; `total > shown` is what reveals "Show more". */
  shown: number;
  counts: FacetCounts;
  options: {
    neighborhoods: FacetOption[];
    cuisines: FacetOption[];
    prices: FacetOption[];
    aspects: FacetOption[];
  };
  /** The curated strip. Two rows, computed here so the grid needn't hold the
      corpus just to find the promoted ones. Carries plate scores for the same
      reason the results do — the strip prints them. */
  picks: DiscoverResult[];
};

/**
 * The corpus, memoised for a minute.
 *
 * Every filter click is now a request, and each one needs the same few thousand
 * rows to scan. Without this, clicking four filters in ten seconds means four
 * full reads over Neon's HTTP driver. A minute is short enough that an import
 * shows up promptly and long enough that a burst of filtering costs one read.
 *
 * Per server instance, deliberately: it is a cache, not a source of truth, and
 * a cold instance simply reads.
 */
type Corpus = {
  restaurants: RestaurantView[];
  aspects: ReturnType<typeof strongAspectsFrom>;
  plates: Record<string, PlateScore>;
};

const CORPUS_TTL_MS = 60_000;
let cached: { at: number; value: Promise<Corpus> } | null = null;

function loadCorpus(): Promise<Corpus> {
  const now = Date.now();
  if (cached && now - cached.at < CORPUS_TTL_MS) return cached.value;

  const value = (async (): Promise<Corpus> => {
    const [restaurants, plates, tallies] = await Promise.all([
      getRestaurants(),
      getAllRestaurantPlateScores(),
      getAllRestaurantAspectTallies(),
    ]);
    return { restaurants, aspects: strongAspectsFrom(tallies), plates };
  })();

  // Stored before it resolves so concurrent requests share one read; dropped on
  // failure so an outage isn't cached for a minute.
  cached = { at: now, value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });

  return value;
}

/**
 * Runs the filters and returns one page of what matched.
 *
 * `here` is passed separately from the filters rather than read off the URL.
 * Coordinates are personal data and do not belong in a query string that gets
 * shared, logged and put in a browser history — so the URL carries only the
 * *intent* (`nearby=1`, exactly as before) and the coordinates travel in a POST
 * body to /api/restaurants/discover. `filters.nearby` without `here` matches
 * everything, which is the same "can't evaluate that yet" rule the client used
 * while waiting for the permission prompt.
 */
export async function getDiscoverPage(
  search: string,
  { shown = PAGE_SIZE, here = null }: { shown?: number; here?: Coords | null } = {},
): Promise<DiscoverPage> {
  const { restaurants, aspects, plates } = await loadCorpus();
  const filters = filtersFromSearch(search, restaurants);

  // Evaluated against the server's clock rather than the browser's. The client
  // could only supply a time it had already been told, and "open now" in a San
  // Diego product is a question about San Diego — openStateFor does the zone
  // conversion either way.
  // The dish half of a free-text query, fetched once per request and only when
  // there is text to fetch it for. Browsing the grid, this is a skipped round
  // trip rather than a cheap one — see dishMatchesFor in lib/db.ts for why the
  // dish names are not simply held on the corpus alongside everything else.
  const dishes = filters.q ? await dishMatchesFor(filters.q) : null;

  const ctx: FilterContext = { now: new Date(), here, aspects, plates, dishes };

  const matched = applyFilters(restaurants, filters, ctx);
  const limit = Math.min(Math.max(shown, PAGE_SIZE), MAX_SHOWN);

  return {
    filters,
    results: matched.slice(0, limit).map((r) => {
      const score = filters.aspect ? aspects.get(r.id)?.get(filters.aspect) : undefined;
      const plate = plates[r.id] ?? EMPTY_PLATE_SCORE;
      // Attached to the page slice, not to the corpus rows: the matched dish
      // is a fact about *this query*, and the corpus outlives it by a minute.
      const dish = dishes?.get(r.id);
      const base = dish ? { ...r, matchedDish: dish } : r;
      return score === undefined
        ? { ...base, plateScore: plate }
        : { ...base, plateScore: plate, aspectScore: score };
    }),
    total: matched.length,
    shown: Math.min(limit, matched.length),
    counts: countFacets(restaurants, filters, ctx),
    options: {
      neighborhoods: neighborhoodOptions(restaurants),
      cuisines: cuisineOptions(restaurants),
      prices: priceOptions(restaurants),
      aspects: aspectOptions(aspects),
    },
    picks: restaurants
      .filter((r) => r.trending)
      .slice(0, 2)
      .map((r) => ({ ...r, plateScore: plates[r.id] ?? EMPTY_PLATE_SCORE })),
  };
}

/* --- The feed's share of the corpus ------------------------------------ */

/**
 * Resolves what each post *refers to* — its restaurant, and the dish on that
 * restaurant's menu — so the feed can search by cuisine and link its subject
 * line at the two records behind it.
 *
 * A post row carries a restaurant name, a soft restaurant id, and a dish name
 * typed as free text. None of those is a link and none says what cuisine the
 * place serves. This turns them into ids, against the same corpus Discover
 * scans and off the same 60s cache.
 *
 * It lives here rather than in lib/db.ts because that is where the corpus cache
 * is, and because db.ts must not import this module — this one imports db.ts.
 *
 * ## Two ways a post finds its restaurant, in order
 *
 * 1. `restaurant_id`, which is what every post written through the composer
 *    carries.
 * 2. The restaurant's name, case-insensitively. `posts.restaurant_id` is a soft
 *    reference by design (see CLAUDE.md — an FK would turn a data refresh into a
 *    cascade through everyone's reviews), so a post written before an id space
 *    was rewritten still names the place correctly while pointing at nothing.
 *
 * The resolved id goes onto the post as `placeId` rather than overwriting
 * `restaurantId`, so the card can decide for itself which claim it is willing
 * to hang a link on.
 *
 * ## The dish
 *
 * `posts.dish_name` is free text — there is no `dish_id` column, and the
 * composer has never written one. So the dish is matched by name against that
 * restaurant's menu, which is exactly what `findDishId` already does for the
 * map's bubbles; this is the same rule moved to the server so the card doesn't
 * need the dish table in the browser to draw a link.
 *
 * One extra query, scoped to the restaurants this page of the feed actually
 * touches — a few dozen menus, not the ~24,800-row table — and skipped
 * entirely when no post on the page names a dish. An unmatched name resolves to
 * nothing and the card falls back to linking the restaurant, which is the
 * honest answer: the dish was typed, not chosen.
 */
export type PostPlaces = Record<string, FeedPlace>;

/** Keys the dish index. `\0` cannot occur in a name, so it cannot collide. */
function dishKey(restaurantId: string, name: string): string {
  return `${restaurantId}\0${name.trim().toLowerCase()}`;
}

export async function resolvePostRefs<
  T extends { restaurantId?: string; restaurant?: string; dishName?: string },
>(
  posts: readonly T[],
): Promise<{ posts: (T & { placeId?: string; dishId?: string })[]; places: PostPlaces }> {
  if (posts.length === 0) return { posts: [], places: {} };

  const { restaurants } = await loadCorpus();
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const byName = new Map(restaurants.map((r) => [r.name.toLowerCase(), r]));

  const placeFor = (post: T) =>
    (post.restaurantId ? byId.get(post.restaurantId) : undefined) ??
    (post.restaurant ? byName.get(post.restaurant.toLowerCase()) : undefined);

  // Only the restaurants whose menus a post on this page actually asks about.
  const menusWanted = new Set<string>();
  for (const post of posts) {
    if (!post.dishName?.trim()) continue;
    const place = placeFor(post);
    if (place) menusWanted.add(place.id);
  }

  const dishIds = new Map<string, string>();
  if (menusWanted.size > 0) {
    const menus = await getDishesByRestaurant([...menusWanted]);
    for (const [restaurantId, dishes] of Object.entries(menus)) {
      for (const dish of dishes) {
        // First writer wins, so a menu listing the same name twice resolves to
        // the earlier one in menu order rather than to whichever came back last.
        const key = dishKey(restaurantId, dish.name);
        if (!dishIds.has(key)) dishIds.set(key, dish.id);
      }
    }
  }

  const places: PostPlaces = {};
  const resolved = posts.map((post) => {
    const place = placeFor(post);
    if (!place) return post;

    places[place.id] ??= {
      id: place.id,
      name: place.name,
      cuisine: place.cuisine,
      // So the feed answers "tacos" for the same places Discover does — the
      // filter vocabulary is deliberately blunt and the tags are where the
      // detail went. See data/cuisines.ts.
      cuisineTags: place.cuisineTags,
      neighborhood: place.neighborhood,
    };

    const dishId = post.dishName?.trim()
      ? dishIds.get(dishKey(place.id, post.dishName))
      : undefined;

    return dishId ? { ...post, placeId: place.id, dishId } : { ...post, placeId: place.id };
  });

  return { posts: resolved, places };
}

/** Clamps `?shown=` off a URL to something this module will honour. */
export function parseShown(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value)) return PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(value), PAGE_SIZE), MAX_SHOWN);
}
