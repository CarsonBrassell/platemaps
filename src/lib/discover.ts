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
  activeFilterCount,
  aspectOptions,
  cuisineOptions,
  filtersFromSearch,
  neighborhoodOptions,
  priceOptions,
  scoreMatches,
  strongAspectsFrom,
  type DiscoverFilters,
  type FacetCounts,
  type FacetOption,
  type FilterContext,
  type StrongAspect,
  PAGE_SIZE,
  MAX_SHOWN,
} from "@/lib/discoverFilters";
// Both used to live here; callers that still import them from this module
// keep working. New code should take them from discoverFilters directly.
export { PAGE_SIZE, parseShown } from "@/lib/discoverFilters";
import type { FeedPlace } from "@/lib/feedFilters";
import { formatMiles, formatWalk, milesBetween, type Coords } from "@/lib/geo";
import { walkingFor } from "@/lib/walking";
import type { RestaurantView } from "@/data/restaurantTypes";
import {
  dishMatchesFor,
  dishesNamedExactly,
  getAllRestaurantAspectTallies,
  getAllRestaurantPlateScores,
  getDishesByRestaurant,
  getProfileTraitRows,
  getRestaurants,
} from "@/lib/db";
import { after } from "next/server";
import { EMPTY_PLATE_SCORE, type PlateScore } from "@/lib/plateScore";
import { traitIndexFor, type ProfileTraitRow, type TraitIndex } from "@/lib/profileTraits";
import { normalize, rungOf } from "@/lib/textMatch";
import type { ForMeInfo, ForMeProfile, ForMeReason } from "@/lib/discoverWire";
import { meanRating } from "@/lib/taste";
// The For me wire types live in discoverWire.ts so client components can import
// them; they are re-exported here for server code that already has this module.
export type { ForMeInfo, ForMeReason } from "@/lib/discoverWire";

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
   * How far this restaurant is from the visitor, when the request carried a
   * position. Absent otherwise — and then `distance` is still the seeded
   * string measured from a fixed downtown origin (see lib/nearby.ts), which a
   * card should not present as "from you".
   */
  milesAway?: number;
  /**
   * The restaurant's plate score, attached for the same reason as above: the
   * card prints it, and the browser has no way to derive it. Always present, and
   * carries its own null percent for a restaurant with too few rated plates —
   * the card says so rather than falling back to a borrowed number.
   */
  plateScore: PlateScore;
  /**
   * A routed walk in meters, when this row is within walking range (3 mi) of
   * `here` and lib/walking.ts managed to price it — routed or estimated
   * either way. Absent for anything farther out, which keeps `distance` as
   * the straight-line string `withDistance` already produces for those rows.
   */
  walkMeters?: number;
  /** True when `walkMeters` is a straight-line guess standing
      in for a routed answer — see lib/walking.ts's `estimateFor`. */
  walkEstimated?: boolean;
  /**
   * For me only: the one-line reason this place is on the list ("Because you
   * went to Tajima Ramen", "Ana and Ben have been"), plus the friends who have
   * been when the reason is about something else. Attached to the page slice
   * from the viewer's own signals, so it exists only on the private POST's answer.
   */
  reason?: ForMeReason;
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
  /**
   * Present only when the request asked for For me (the private POST). Says what
   * the list was built from and where the matches end and the tail begins. The
   * public GET never sets it.
   */
  forMe?: ForMeInfo;
};

/**
 * The personal half of a For me request: how to order the rows and which to
 * leave out. `rankTaste`'s result (lib/taste.ts) satisfies it as it stands and
 * the For me POST hands it in whole, because this module reads the corpus and
 * the viewer's taste is not its business. See probe/for-me/PLAN.md section 3.
 */
export type ForMeSetup = ForMeOrder & {
  /**
   * Visited, hidden and skipped-cuisine ids. Removed from the pool right after
   * the filters run, so `total` and the facet counts both describe the list the
   * viewer can actually see.
   */
  exclude: ReadonlySet<string>;
  basis: ForMeInfo["basis"];
  seeds: number;
  /** What the "Tuned to you" line says; passed through to the answer as it is. */
  profile?: ForMeProfile;
  /**
   * The same order worked out over just these ids, which is what a filtered
   * request asks for: the rows the filters left. Without it a chain's best
   * branch, or one of two twin menus, outside the filter would still hold the
   * slot in the full order and push the only one inside it down to the tail
   * of a list that contains no better branch. Absent, the order above is used
   * as it stands (it is then the full corpus's order, filtered).
   */
  rankAmong?: (ids: ReadonlySet<string>) => ForMeOrder;
};

/** One arrangement of the For me list; see `ForMeSetup.rankAmong`. */
export type ForMeOrder = {
  /**
   * Place id to position in the For me order (0 is first), matches and then
   * the tail in one list. It wins over distance; an id missing from it sorts
   * after every id that is in it.
   */
  rank: ReadonlyMap<string, number>;
  /**
   * Size of the matches block: ranks below this are matches, the rest of `rank`
   * is the "Also well rated" tail. Counted over the ids the order was built
   * over; the page's own `forMe.matched` is the count among the rows shown.
   */
  matched: number;
  /**
   * The reason line for a place, or null. Asked only for the rows on the
   * returned page, so the other few thousand are never worded.
   */
  reasonOf: (id: string) => ForMeReason | null;
  header: string;
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
export type Corpus = {
  restaurants: RestaurantView[];
  aspects: ReturnType<typeof strongAspectsFrom>;
  plates: Record<string, PlateScore>;
  /**
   * C for For me's shrunk rating: the mean rating of the rated places above.
   * Computed here, once per load, so a request never scans for it. Null when
   * nothing is rated.
   */
  ratingMean: number | null;
};

const CORPUS_TTL_MS = 60_000;
/**
 * How old a copy may be and still be handed out while a fresh one is read
 * behind it. Past this the request waits for the read: an instance that sat
 * idle for a quarter of an hour should not answer with what it had before.
 */
const CORPUS_STALE_MAX_MS = 10 * 60_000;
let cached: { at: number; value: Promise<Corpus> } | null = null;
let refreshing: Promise<Corpus> | null = null;

function readCorpus(): Promise<Corpus> {
  return (async (): Promise<Corpus> => {
    const [restaurants, plates, tallies] = await Promise.all([
      getRestaurants(),
      getAllRestaurantPlateScores(),
      getAllRestaurantAspectTallies(),
    ]);
    return {
      restaurants,
      aspects: strongAspectsFrom(tallies),
      plates,
      ratingMean: meanRating(restaurants),
    };
  })();
}

/**
 * Keeps the function instance alive until the background read settles.
 * `after` only works inside a request; the probe scripts call loadCorpus
 * from plain Node, where it throws, and there the promise just runs.
 */
function keepAlive(task: Promise<unknown>): void {
  try {
    after(() => task);
  } catch {
    /* not in a request scope */
  }
}

/**
 * The corpus behind the 60s cache, for callers that need the rows rather than
 * a page of them — the search suggest endpoint is the one (lib/suggest.ts).
 *
 * Stale-while-revalidate (probe/PERF-PLAN.md #1). The read is the single
 * most expensive thing the app does — every listed row plus two aggregates
 * over posts, 3.5 MB — and it used to be paid *by a visitor*: the first
 * request after the minute rolled over waited on it, on every instance. Now
 * a copy inside CORPUS_TTL_MS is returned as before; a copy older than that
 * is still returned immediately and one refresh is started behind it, so
 * after an instance's very first request no visitor waits on this read.
 * Only a copy older than CORPUS_STALE_MAX_MS is refused.
 */
export function loadCorpus(): Promise<Corpus> {
  const now = Date.now();
  if (cached && now - cached.at < CORPUS_TTL_MS) return cached.value;

  if (cached && now - cached.at < CORPUS_STALE_MAX_MS) {
    if (!refreshing) {
      const next = readCorpus();
      refreshing = next;
      const settled = next.then(
        () => {
          cached = { at: Date.now(), value: next };
        },
        () => {
          /* keep serving the stale copy; the next stale hit retries */
        },
      );
      settled.finally(() => {
        if (refreshing === next) refreshing = null;
      });
      keepAlive(settled);
    }
    return cached.value;
  }

  const value = readCorpus();

  // Stored before it resolves so concurrent requests share one read; dropped on
  // failure so an outage isn't cached for a minute.
  cached = { at: now, value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });

  return value;
}

/**
 * The menu profiles For me compares places with, behind their own cache.
 *
 * Kept apart from `loadCorpus` on purpose: the rows are ~0.5 MB and only the
 * personal order wants them, so ordinary Discover requests pay nothing for them
 * and the first For me request after the cache lapses is the one that reads.
 * Ten minutes, because profiles change when an enrichment run lands, not when a
 * visitor clicks.
 *
 * Never rejects. If the table is missing or the read fails, the answer is an
 * empty list, which `buildTraitIndex` turns into "every place imputed from its
 * cuisine" -- For me still works, on cuisine alone, and says nothing different
 * to the visitor. A failure is cached for a minute rather than ten, so a blip
 * heals and a missing table does not become one failed query per request.
 *
 * The array is the same object for the whole life of an entry, which is what
 * lets `traitIndexFor` build the index once per (corpus, rows) pair.
 */
const TRAITS_TTL_MS = 10 * 60_000;
const TRAITS_RETRY_MS = 60_000;
let traitsCached: { at: number; value: Promise<ProfileTraitRow[]> } | null = null;

export function loadProfileTraits(): Promise<ProfileTraitRow[]> {
  const now = Date.now();
  if (traitsCached && now - traitsCached.at < TRAITS_TTL_MS) return traitsCached.value;

  const entry = { at: now, value: Promise.resolve<ProfileTraitRow[]>([]) };
  entry.value = getProfileTraitRows().catch((): ProfileTraitRow[] => {
    // Back-dated so this entry lapses TRAITS_RETRY_MS after the failure.
    entry.at = Date.now() - (TRAITS_TTL_MS - TRAITS_RETRY_MS);
    return [];
  });
  traitsCached = entry;
  return entry.value;
}

/** The trait index over `restaurants` -- the corpus the ranking is run on. */
export async function loadTraitIndex(
  restaurants: readonly RestaurantView[],
): Promise<TraitIndex> {
  return traitIndexFor(restaurants, await loadProfileTraits());
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
 *
 * ## For me
 *
 * `forMe` is the one personal input, and only the private POST ever passes it.
 * `undefined` is an ordinary Discover query. A setup puts the page in the
 * viewer's order (`forMe.rankAmong` over the rows the filters left, so the
 * matches/tail split and the chain and menu dedupe are the filtered list's
 * own): `forMe.rank` replaces distance as the sort, `forMe.exclude`
 * leaves out what they have seen or ruled out, the photo-first partition of
 * the bare grid is skipped (the personal order is the order), and each row on
 * the page is given its reason. Every other filter composes with it exactly as
 * it does with distance (decision D3), so "Thai" under For me is the best Thai
 * for this viewer.
 *
 * Typed search is the exception: a name typed into the field is a question with
 * its own answer (`orderResults`, below), and ranking it by taste would bury
 * the place they named. Text wins -- the answer is plain relevance, nothing is
 * excluded, and `forMe.paused` is set so the client does not wait for a
 * personal order that is not coming. `forMe: null` is how a caller that has not
 * built a setup (because it saw the text first and skipped the work) asks for
 * the same thing; a setup arriving with text is treated alike, so the rule is
 * decided here and not trusted to the caller.
 */
export async function getDiscoverPage(
  search: string,
  {
    shown = PAGE_SIZE,
    here = null,
    forMe,
  }: { shown?: number; here?: Coords | null; forMe?: ForMeSetup | null } = {},
): Promise<DiscoverPage> {
  const { restaurants, aspects, plates } = await loadCorpus();
  const filters = filtersFromSearch(search, restaurants);
  // The setup in force: absent for a plain query, and for a paused one.
  const personal = forMe && !filters.q ? forMe : null;

  // Evaluated against the server's clock rather than the browser's. The client
  // could only supply a time it had already been told, and "open now" in a San
  // Diego product is a question about San Diego — openStateFor does the zone
  // conversion either way.
  // The dish half of a free-text query, fetched once per request and only when
  // there is text to fetch it for. Browsing the grid, this is a skipped round
  // trip rather than a cheap one — see dishMatchesFor in lib/db.ts for why the
  // dish names are not simply held on the corpus alongside everything else.
  // Two dish lookups, asking two different questions, so both go out at once
  // rather than one after the other — a request carrying `?q=thai&dish=pad thai`
  // pays for one round trip, not two. `dishMatchesFor` is the loose half of the
  // text search; `dishesNamedExactly` is the filter behind a dish the visitor
  // picked off the dropdown.
  const [dishes, namedDish] = await Promise.all([
    filters.q ? dishMatchesFor(filters.q) : null,
    // Folded with the same `normalize` the browser folds a typed query with, so
    // "Chef's Special" in the URL finds the row stored as "Chefs Special".
    filters.dish ? dishesNamedExactly(normalize(filters.dish)) : null,
  ]);

  // Scored once for the whole corpus, before anything filters. `matchesFilters`
  // runs six times per row from here — once for the grid, once per facet
  // dimension — and the relevance of a row to the query is the one thing that
  // does not change between those passes. It is also what `orderResults` sorts
  // on, so the grid's order and the rail's counts come off one calculation.
  const scores = filters.q ? scoreMatches(restaurants, filters.q, dishes) : null;

  const ctx: FilterContext = {
    now: new Date(),
    here,
    aspects,
    plates,
    dishes,
    scores,
    namedDish,
  };

  // What For me leaves out comes off the pool before anything counts it, so the
  // grid, `total` and every facet are measured over the same rows. Filters were
  // resolved above against the whole corpus (a neighbourhood the viewer has
  // exhausted is still a real neighbourhood), and the option lists below stay
  // whole too; only the numbers describe what is left.
  const exclude = personal?.exclude;
  const pool = exclude?.size ? restaurants.filter((r) => !exclude.has(r.id)) : restaurants;

  const filtered = applyFilters(pool, filters, ctx);
  // The personal order is worked out over the rows the filters left, not the
  // whole corpus and then filtered: with a neighbourhood picked, the only
  // branch of a chain inside it is that chain's best branch, whatever a branch
  // elsewhere would have scored. The unfiltered case is the full order.
  const order: ForMeOrder | null = personal
    ? (personal.rankAmong?.(new Set(filtered.map((r) => r.id))) ?? personal)
    : null;
  const ordered = orderResults(filtered, filters, here, scores, order?.rank ?? null);
  // The bare grid (no search text, no filter of any kind) puts every restaurant
  // with a photo ahead of every one without. A stable partition: each half
  // keeps the order `orderResults` gave it. "Has a photo" is exactly what the
  // tile draws -- `RestaurantPhoto` shows its fallback when `photo` is falsy.
  // Any query or filter leaves the order untouched, and so does For me: the
  // personal order is the point, and a photo is not a reason to lift a place
  // over one the viewer would like better.
  const matched =
    activeFilterCount(filters) === 0 && !personal
      ? [...ordered.filter((r) => r.photo), ...ordered.filter((r) => !r.photo)]
      : ordered;
  const limit = Math.min(Math.max(shown, PAGE_SIZE), MAX_SHOWN);
  // Sort order stays straight-line (orderResults, above, is untouched) — only
  // the printed distance on this page's rows gets upgraded to a routed walk.
  const shownRows = matched.slice(0, limit);
  // Priced against exactly the rows this response is about to show, never the
  // whole `matched` set: walkingFor's cost is per-restaurant, and a page the
  // visitor never scrolls to has no business spending an ORS call. Only when
  // `here` is set — the same guard withDistance already uses below.
  const walking = here ? await walkingFor(here, shownRows) : null;

  return {
    filters,
    results: shownRows.map((r) => {
      const score = filters.aspect ? aspects.get(r.id)?.get(filters.aspect) : undefined;
      const plate = plates[r.id] ?? EMPTY_PLATE_SCORE;
      // Attached to the page slice, not to the corpus rows: the matched dish
      // is a fact about *this query*, and the corpus outlives it by a minute.
      // The named dish wins when both are present: `?dish=` is why the row is
      // on the page at all, and `q` only decided where in the order it landed.
      const dish = namedDish?.get(r.id) ?? dishes?.get(r.id);
      const withDish = dish ? { ...r, matchedDish: dish } : r;
      const base = here ? withDistance(withDish, here) : withDish;
      // A routed walk replaces the straight-line `distance` string wholesale
      // (formatWalk, not formatMiles) — beyond 3 mi, or when walkingFor found
      // nothing for this id, `base.distance` from withDistance stands as-is.
      const walk = walking?.get(r.id);
      const withWalk = walk
        ? {
            ...base,
            distance: formatWalk(walk.meters, walk.estimated),
            walkMeters: walk.meters,
            walkEstimated: walk.estimated,
          }
        : base;
      const row =
        score === undefined
          ? { ...withWalk, plateScore: plate }
          : { ...withWalk, plateScore: plate, aspectScore: score };
      const reason = order?.reasonOf(r.id);
      return reason ? { ...row, reason } : row;
    }),
    total: matched.length,
    shown: Math.min(limit, matched.length),
    counts: countFacets(pool, filters, ctx),
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
    ...(forMe !== undefined && { forMe: forMeInfo(personal, order, matched) }),
  };
}

/**
 * The `forMe` block of an answer. Counts the matches over the rows that
 * survived the filters and the exclusions, which is what the grid shows: the
 * leading run is the matches, and the divider before the tail goes after them.
 * A paused answer carries no matches and no header, so nothing personal can
 * be printed above a list of search results.
 */
function forMeInfo(
  personal: ForMeSetup | null,
  order: ForMeOrder | null,
  matched: readonly RestaurantView[],
): ForMeInfo {
  if (!personal || !order) return { basis: "none", header: "", seeds: 0, matched: 0, paused: true };
  const end = order.matched;
  let matches = 0;
  for (const r of matched) {
    if ((order.rank.get(r.id) ?? Infinity) < end) matches += 1;
  }
  return {
    basis: personal.basis,
    header: order.header,
    seeds: personal.seeds,
    matched: matches,
    ...(personal.profile && { profile: personal.profile }),
  };
}

/**
 * Most relevant first; nearest first among equals.
 *
 * A name typed into the field is a question, and the answer is ordered by how
 * *literally* each row answers it, on the ladder in lib/textMatch.ts — a
 * literal cuisine match outranks a soft name match (Calvin, 2026-09-13,
 * reversing 2026-09-07: see the TIER comment there for why "breakfast" must
 * not put a distant Breakfast Republic above the Breakfast & Brunch place next
 * door). This used to sort purely by distance, which is why one misspelled
 * restaurant name returned a wall of nearby menus with the restaurant itself
 * somewhere in them: every row that survived the filter was equal, so the
 * closest taco shop outranked the place the visitor had actually typed.
 *
 * Distance is still the tiebreak, and it is the *reason* the tiers are 100
 * apart: when six taco shops answer to a term equally well, the one you can
 * walk to is the answer. It can only reorder rows inside a band, never lift a
 * dish match past a name match. A picked neighbourhood turns it off entirely —
 * that is the reader saying where they mean, and re-sorting North Park by how
 * far it is from Oceanside answers a question nobody asked.
 *
 * ## What "among equals" means, and why it had to be widened twice
 *
 * As written first, "equals" meant *identical scores*, and asking for a
 * question to be answered nearest-first was therefore usually a no-op:
 *
 * 1. **Two rungs carry a 0-99 bonus**, so rows on the same rung rarely tie.
 *    Searching "pizza", `Bronx Pizza` scores 800+50 and `Buona Forchetta Pizza
 *    Napoletana` 800+25 — one of two name words matched against one of four —
 *    and the 25-point gap, which measures how long the sign is, was enough to
 *    put a place across the county above one across the street. `rungOf` in
 *    lib/textMatch.ts is what this now compares: the rung, with the coverage
 *    bonus dropped and the fuzzy bonus kept but coarsened to 0.1 of measured
 *    similarity, because *there* the bonus is a real signal about spelling.
 *    The raw score is still the last comparison, so nothing that used to be
 *    ordered is left arbitrary — it is only ordered after distance.
 *
 * 2. **A cuisine typed into the field never reaches `q` at all.** `promote` in
 *    lib/discoverFilters.ts turns "thai" into `?cuisine=Thai`, which is the
 *    right answer to the term and left the results in corpus order: `f.q` was
 *    null, so no distance was measured. Any filter at all now earns the
 *    ordering, not just free text.
 *
 *    The bare unfiltered grid used to keep corpus order outright — "no
 *    filter" meant "no question to answer nearest-first". Calvin
 *    (2026-09-15) changed that: the grid orders by distance with nothing
 *    picked at all, the moment there is a position to measure from, so the
 *    front page reads as "near you" instead of a fixed `sort_order`. This
 *    adds no permission prompt of its own — `here` only shows up once
 *    lib/nearby.ts already has a fix, either from a permission granted
 *    earlier or from a filter's own prompt — it only changes what the corpus
 *    falls back to once a position is already in hand. `sort_order` is what
 *    is still shown before that: no position yet, denied, or unsupported.
 *
 * `sort` is stable, so rows that tie on everything stay in corpus order.
 */
function orderResults(
  matched: RestaurantView[],
  f: DiscoverFilters,
  here: Coords | null,
  scores: Map<string, number> | null,
  rank: ReadonlyMap<string, number> | null = null,
): RestaurantView[] {
  // For me: the viewer's order replaces both of the below. `rank` is one
  // position per place (ties are already broken in `rankTaste`), so distance
  // is only the tiebreak for ids the ranking did not know -- which share the
  // last position. `rank` and `scores` never arrive together: typed search
  // pauses For me before this is called.
  if (rank) {
    const last = Number.MAX_SAFE_INTEGER;
    const near =
      here && !f.neighborhood
        ? new Map(matched.map((r) => [r.id, milesBetween(here, r)]))
        : null;
    return [...matched].sort((a, b) => {
      const byRank = (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last);
      if (byRank !== 0) return byRank;
      return near ? (near.get(a.id) ?? 0) - (near.get(b.id) ?? 0) : 0;
    });
  }

  // A picked neighbourhood still turns this off outright — see above. Every
  // other case, including the bare grid, measures distance the moment there
  // is a position; `scores`, when present, is compared first below and this
  // is only its tiebreak (or, with no scores at all, the whole order).
  const miles =
    here && !f.neighborhood
      ? new Map(matched.map((r) => [r.id, milesBetween(here, r)]))
      : null;
  if (!scores && !miles) return matched;

  return [...matched].sort((a, b) => {
    if (scores) {
      const byRung = rungOf(scores.get(b.id) ?? 0) - rungOf(scores.get(a.id) ?? 0);
      if (byRung !== 0) return byRung;
    }
    if (miles) {
      const byMiles = (miles.get(a.id) ?? 0) - (miles.get(b.id) ?? 0);
      if (byMiles !== 0) return byMiles;
    }
    if (scores) return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    return 0;
  });
}

/**
 * The seeded `distance` is measured from a fixed downtown origin. With a real
 * position in hand it is replaced by the real number, in the same format, so
 * every card that prints it prints the truth without knowing anything changed.
 */
function withDistance<T extends RestaurantView>(r: T, here: Coords): T & { milesAway: number } {
  const milesAway = milesBetween(here, r);
  return { ...r, milesAway, distance: formatMiles(milesAway) };
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
  T extends {
    restaurantId?: string;
    restaurant?: string;
    dishName?: string;
    courses?: { dishName?: string; dishId?: string }[];
  },
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
    if (!post.dishName?.trim() && !post.courses?.length) continue;
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

    const idFor = (name?: string) =>
      name?.trim() ? dishIds.get(dishKey(place.id, name)) : undefined;
    const dishId = idFor(post.dishName);
    // A meal's other plates resolve the same way, so each tile in the
    // collage can open its own dish.
    const withCourses = post.courses
      ? { ...post, courses: post.courses.map((c) => ({ ...c, dishId: idFor(c.dishName) })) }
      : post;

    return dishId
      ? { ...withCourses, placeId: place.id, dishId }
      : { ...withCourses, placeId: place.id };
  });

  return { posts: resolved, places };
}
