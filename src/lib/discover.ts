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
import type { Coords } from "@/lib/geo";
import type { RestaurantView } from "@/data/restaurants";
import {
  getAllRestaurantAspectTallies,
  getAllRestaurantPlateScores,
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
  const ctx: FilterContext = { now: new Date(), here, aspects, plates };

  const matched = applyFilters(restaurants, filters, ctx);
  const limit = Math.min(Math.max(shown, PAGE_SIZE), MAX_SHOWN);

  return {
    filters,
    results: matched.slice(0, limit).map((r) => {
      const score = filters.aspect ? aspects.get(r.id)?.get(filters.aspect) : undefined;
      const plate = plates[r.id] ?? EMPTY_PLATE_SCORE;
      return score === undefined
        ? { ...r, plateScore: plate }
        : { ...r, plateScore: plate, aspectScore: score };
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

/** Clamps `?shown=` off a URL to something this module will honour. */
export function parseShown(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value)) return PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(value), PAGE_SIZE), MAX_SHOWN);
}
