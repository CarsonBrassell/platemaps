/**
 * "Your taste": the scorer behind the personal picks on Discover.
 *
 * Pure on purpose: no database, no React. The route feeds it the corpus and the
 * viewer's signals; the check script feeds it a snapshot. Spec of record is
 * probe/your-taste/DESIGN.md. Every weight lives in WEIGHTS below.
 *
 * What counts: cuisines the viewer picked, distinct places they have posted at
 * or marked "Been here", and where mutual friends have posted. What never
 * counts: ratings, likes, hearts, upvotes, saves. The reason on each pick
 * names only those inputs (picked, been to, posted).
 *
 * `scoreTaste` is the cuisine scorer every viewer gets. The accounts on
 * lib/forMeGate.ts are ranked dish by dish instead (lib/dishTaste.ts), which
 * borrows the building blocks below: the shrunk rating and its soft floor, the
 * budget term and the travel radius with its distance factor.
 *  - A shrunk rating. R' = (n*R + m*C) / (n+m) pulls a thin rating toward C, the
 *    mean of the rated places in the corpus (`meanRating`), with m =
 *    FORME_QUALITY.priorReviews. Fewer than minReviews reviews is unrated.
 *  - A soft floor, g, on the score: 1 from R' 4.2 up, 0.8 at 3.8, 0.65 at 3.5
 *    and below, linear between, 0.92 for an unrated place. A place with 15 or
 *    more reviews is judged on the lower of R' and its raw rating, so shrinking
 *    can only help a thin sample, never a well-reviewed place that is simply not
 *    good.
 *  - A budget term. B is the viewer's usual plate: the median price on their own
 *    posts (under $3 dropped, then anything over 2.5x the median of those kept),
 *    with the quartiles as its range, trusted from 3 plates and in full at 6.
 *    With fewer than 3, B is the median menu price of the places they have been
 *    (from 3 known, trusted at half at most); with both it is 0.6 plates + 0.4
 *    places. Inside the range the fit is 1, above it it falls off fast and below
 *    it slowly, and the score gains 100 * 0.06 * trust * (2 fit - 1). A place
 *    with no price, or a viewer with no B, gets exactly 0.
 *  - A travel radius. The viewer's history points are the places they have been
 *    or posted at (listed, with coordinates). R is how far they usually go: the
 *    75th percentile of the distances from the medoid (the point nearest all the
 *    others) pulled toward 7 mi by three places' worth of prior, R = (n*p75 +
 *    3*7) / (n+3), kept within 3 to 20 mi. Under 3 points R is 7 outright. A
 *    place within R of the anchor has D = 1; farther out D falls as
 *    1 / (1 + ((d-R)/R)^2), never under 0.55 (0.75 under 3 points).
 * The viewer's own ratings, likes, hearts, upvotes and saves feed none of it.
*/
import type { RestaurantView } from "@/data/restaurantTypes";
import type { PlateScore } from "@/lib/plateScore";
import { milesBetween, type Coords } from "@/lib/geo";
import { MIN_POSTS } from "@/lib/tasteMatch";

/** Your taste. */
export const WEIGHTS = {
  /** SCORE = 100 * (a*A + f*F + q*Q + n*N). */
  affinity: 0.5,
  friends: 0.2,
  quality: 0.2,
  neighborhood: 0.1,
  /** Inside A, when both an explicit pick and history exist. */
  pickInA: 0.6,
  histInA: 0.4,
  /** F = min(1, friends / friendsForFull). */
  friendsForFull: 2,
  /** Q with a ready plate score. */
  plateInQ: 0.6,
  sourceInQ: 0.4,
  /** Q without one. */
  sourceOnlyInQ: 0.8,
  /** Q for a place nobody sourced a rating for. */
  unratedQ: 0.3,
  /** Added to Q (then capped at 1) for a place with a posted plate photo. */
  photoInQ: 0.15,
  plateFloorPct: 60,
  plateSpanPct: 40,
  ratingFloor: 3.8,
  ratingSpan: 1.2,
  /** Review volume that earns the full sourceTerm, log10(1+n)/this. */
  reviewLogDivisor: 2.5,
  /** Share of the list one cuisine may take (when 2+ cuisines score). */
  cuisineCapShare: 0.4,
  minPicksToShow: 6,
  defaultLimit: 24,
  maxLimit: 24,
  maxLoves: 5,
  maxSkips: 5,
  maxMarks: 300,
} as const;

/** The budget term's reach: it moves a dish pick's score by at most 100 * this, either way. */
export const FORME_WEIGHTS = { budget: 0.06 } as const;

/** The quality model dish picks read: the shrunk rating and the soft floor. */
export const FORME_QUALITY = {
  /** Fewer reviews than this and a place reads as unrated. */
  minReviews: 10,
  /** m in R' = (n*R + m*C) / (n+m): reviews' worth of pull toward the corpus mean. */
  priorReviews: 50,
  /** g is 1 from this R' up... */
  floorFullFrom: 4.2,
  /** ...falls linearly to floorMidFactor here... */
  floorMidAt: 3.8,
  floorMidFactor: 0.8,
  /** ...and on to floorLowFactor here, where it stays for anything lower. */
  floorLowAt: 3.5,
  floorLowFactor: 0.65,
  /** g for a place with no usable rating. */
  floorUnrated: 0.92,
  /** From this many reviews g reads min(R', R): a big sample's raw rating is not softened. */
  rawGuardReviews: 15,
} as const;

/** The budget term: the viewer's usual plate, and how a place's price fits it. */
export const FORME_BUDGET = {
  /** A plate price under this is a side or a typo and says nothing about what they spend. */
  minPlate: 3,
  /** A price over this many times the median of the kept prices is a splurge, not their usual. */
  outlierRatio: 2.5,
  /** B from plates needs this many kept prices (fewer: no B from plates)... */
  minPlates: 3,
  /** ...and is fully trusted at this many. Trust is min(1, kept / platesForFull). */
  platesForFull: 6,
  /** Without plates, B is the median price of the places they have been, from this many known... */
  minPlaces: 3,
  /** ...and trusted at no more than this. */
  placeConfCap: 0.5,
  /** With both, B = plateInB * plates + (1 - plateInB) * places, in dollars. */
  plateInB: 0.6,
  /** The range is at least ln 1.3 above B, or half the quartile spread if that is wider... */
  upperFloor: Math.log(1.3),
  /** ...and ln 1.6 below it. Inside the range the fit is 1. */
  lower: Math.log(1.6),
  /** Above the range the fit is exp(-((x - upper) / upperWidth)^2), a fast fall... */
  upperWidth: 0.35,
  /** ...below it exp(-((-lower - x) / lowerWidth)), a slow one. */
  lowerWidth: 0.7,
} as const;

/** The travel radius: how far the viewer usually goes, and how a farther place is softened. */
export const FORME_RADIUS = {
  /** R is read off the history from this many points; under it R is priorMiles. */
  minPoints: 3,
  /** R = (n * p75 + priorPlaces * priorMiles) / (n + priorPlaces): a prior of this many places at priorMiles. */
  priorPlaces: 3,
  priorMiles: 7,
  /** R stays inside this range, in miles. */
  minMiles: 3,
  maxMiles: 20,
  /** Past R, D = 1 / (1 + ((d - R) / R)^2), and never under this (under minPoints points: floorFew). */
  floor: 0.55,
  floorFew: 0.75,
} as const;

export type TasteBasis = "history" | "starting" | "friends" | "none";
export type TasteReason = {
  kind: "friend" | "picked" | "favorite" | "history" | "neighborhood" | "dish" | "style" | "cuisine";
  text: string;
  short: string;
};
export type TastePick = {
  restaurant: RestaurantView;
  plateScore: PlateScore | null;
  reason: TasteReason;
};

/** Everything stored about a viewer's taste. Restaurant ids are TEXT. */
export type FullTastePrefs = {
  loves: string[];
  skips: string[];
  been: string[];
  hidden: string[];
};
export const EMPTY_PREFS: FullTastePrefs = { loves: [], skips: [], been: [], hidden: [] };

export type TasteOp = {
  kind: "love" | "unlove" | "skip" | "unskip" | "been" | "hide" | "unbeen" | "unhide" | "reset";
  value?: string;
};
export const TASTE_OP_KINDS: readonly TasteOp["kind"][] = [
  "love", "unlove", "skip", "unskip", "been", "hide", "unbeen", "unhide", "reset",
];

/** One mutual friend's hero post at a restaurant. */
export type FriendVisit = { restaurantId: string; friendId: string; name: string };

export type TasteInput = {
  restaurants: readonly RestaurantView[];
  plates: Readonly<Record<string, PlateScore>>;
  prefs: FullTastePrefs;
  /** Restaurants the viewer has posted at. */
  postedIds: readonly string[];
  /** users.favorite_cuisine; used only when it is a real corpus cuisine. */
  favoriteCuisine?: string | null;
  friendVisits: readonly FriendVisit[];
  limit?: number;
};

export type TasteResult = {
  basis: TasteBasis;
  header: string;
  shortHeader: string;
  picks: TastePick[];
  counts: { visited: number; picks: number };
};

/* ---------- prefs hygiene ---------- */

function uniq(list: unknown, max: number, allow?: ReadonlySet<string>): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== "string" || v.length === 0 || v.length > 80 || seen.has(v)) continue;
    if (allow && !allow.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  // Newest are last, so over the cap the oldest fall off.
  return out.length > max ? out.slice(out.length - max) : out;
}

/**
 * Validates untrusted prefs against the corpus: cuisines must be real, ids must
 * exist, loves and skips are disjoint (a love wins), arrays are capped.
 */
export function sanitizePrefs(
  raw: unknown,
  cuisines: ReadonlySet<string>,
  ids: ReadonlySet<string>,
): FullTastePrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const loves = uniq(r.loves, WEIGHTS.maxLoves, cuisines);
  const loveSet = new Set(loves);
  const skips = uniq(
    (Array.isArray(r.skips) ? r.skips : []).filter((s) => !loveSet.has(s as string)),
    WEIGHTS.maxSkips,
    cuisines,
  );
  const hidden = uniq(r.hidden, WEIGHTS.maxMarks, ids);
  const hiddenSet = new Set(hidden);
  const been = uniq(
    (Array.isArray(r.been) ? r.been : []).filter((s) => !hiddenSet.has(s as string)),
    WEIGHTS.maxMarks,
    ids,
  );
  return { loves, skips, been, hidden };
}

export function isEmptyPrefs(p: FullTastePrefs): boolean {
  return !p.loves.length && !p.skips.length && !p.been.length && !p.hidden.length;
}

/** Applies one op to a prefs object. Pure; returns a new object. */
export function applyOpToPrefs(
  prefs: FullTastePrefs,
  op: TasteOp,
  cuisines: ReadonlySet<string>,
  ids: ReadonlySet<string>,
): FullTastePrefs {
  if (op.kind === "reset") return { loves: [], skips: [], been: [], hidden: [] };
  const v = typeof op.value === "string" ? op.value : "";
  const without = (list: string[]) => list.filter((x) => x !== v);
  const next = { ...prefs };
  switch (op.kind) {
    case "love":
      if (!cuisines.has(v)) return prefs;
      if (!prefs.loves.includes(v) && prefs.loves.length >= WEIGHTS.maxLoves) return prefs;
      next.loves = [...without(prefs.loves), v];
      next.skips = without(prefs.skips);
      break;
    case "unlove":
      next.loves = without(prefs.loves);
      break;
    case "skip":
      if (!cuisines.has(v)) return prefs;
      if (!prefs.skips.includes(v) && prefs.skips.length >= WEIGHTS.maxSkips) return prefs;
      next.skips = [...without(prefs.skips), v];
      next.loves = without(prefs.loves);
      break;
    case "unskip":
      next.skips = without(prefs.skips);
      break;
    case "been":
      if (!ids.has(v)) return prefs;
      next.been = [...without(prefs.been), v].slice(-WEIGHTS.maxMarks);
      next.hidden = without(prefs.hidden);
      break;
    case "hide":
      if (!ids.has(v)) return prefs;
      next.hidden = [...without(prefs.hidden), v].slice(-WEIGHTS.maxMarks);
      next.been = without(prefs.been);
      break;
    case "unbeen":
      next.been = without(prefs.been);
      break;
    case "unhide":
      next.hidden = without(prefs.hidden);
      break;
  }
  return next;
}

/* ---------- identity helpers ---------- */

/**
 * The cuisines a restaurant counts as, with weights; affinity is the max of
 * weight * A(cuisine). By default a restaurant is its one main cuisine (Your
 * taste).
 */
export function restaurantTraits(r: RestaurantView): { cuisine: string; weight: number }[] {
  return r.cuisine ? [{ cuisine: r.cuisine, weight: 1 }] : [];
}

/**
 * Branches of one chain collapse to one key: the first two name tokens (minus
 * a leading "the"), plus the cuisine. Rubio's Baja Grill, Tajima Ramen East
 * Village / Convoy, Mendocino Farms.
 */
export function chainKey(r: Pick<RestaurantView, "name" | "cuisine">): string {
  const tokens = r.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (tokens[0] === "the" && tokens.length > 1) tokens.shift();
  return `${tokens.slice(0, 2).join(" ")}|${r.cuisine ?? ""}`;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * The mean rating of the rated places in `places`: the C a thin rating is pulled
 * toward. Rated means FORME_QUALITY.minReviews reviews or more, the same line
 * `shrunkRating` draws. Null when nothing is rated, which `shrunkRating` reads
 * as "nothing to shrink toward" and leaves a rating as it is.
 *
 * Read once per corpus load (`Corpus.ratingMean`), never per request.
 */
export function meanRating(places: readonly RestaurantView[]): number | null {
  let sum = 0;
  let count = 0;
  for (const r of places) {
    if (r.rating == null || !Number.isFinite(r.rating)) continue;
    if (!((r.reviewCount ?? 0) >= FORME_QUALITY.minReviews)) continue;
    sum += r.rating;
    count++;
  }
  return count > 0 ? sum / count : null;
}

/**
 * R' = (n*R + m*C) / (n+m): a rating, pulled toward the corpus mean in
 * proportion to how few reviews it stands on. Null for an unrated place (no
 * rating, or fewer than minReviews reviews). With no corpus mean there is
 * nothing to pull toward and the rating is returned as it is.
 */
export function shrunkRating(
  rating: number | null | undefined,
  reviews: number | null | undefined,
  mean: number | null,
): number | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  const n = reviews ?? 0;
  if (!(n >= FORME_QUALITY.minReviews)) return null;
  if (mean == null || !Number.isFinite(mean)) return rating;
  const m = FORME_QUALITY.priorReviews;
  return (n * rating + m * mean) / (n + m);
}

/**
 * g, the soft floor on a dish pick's score: 1 from R' 4.2, linear to 0.8 at 3.8 and
 * on to 0.65 at 3.5, flat 0.65 below, 0.92 for an unrated place. From
 * rawGuardReviews reviews it reads min(R', R), so a big sample's raw rating
 * can only lower it. Continuous everywhere and never above 1, so a missing
 * rating costs a little and a bad one costs more, and no input makes it NaN.
 */
export function qualityFloor(
  shrunk: number | null,
  rating: number | null | undefined,
  reviews: number | null | undefined,
): number {
  const f = FORME_QUALITY;
  if (shrunk == null) return f.floorUnrated;
  const judged =
    rating != null && Number.isFinite(rating) && (reviews ?? 0) >= f.rawGuardReviews
      ? Math.min(shrunk, rating)
      : shrunk;
  if (judged >= f.floorFullFrom) return 1;
  if (judged >= f.floorMidAt) {
    const t = (judged - f.floorMidAt) / (f.floorFullFrom - f.floorMidAt);
    return f.floorMidFactor + (1 - f.floorMidFactor) * t;
  }
  if (judged > f.floorLowAt) {
    const t = (judged - f.floorLowAt) / (f.floorMidAt - f.floorLowAt);
    return f.floorLowFactor + (f.floorMidFactor - f.floorLowFactor) * t;
  }
  return f.floorLowFactor;
}

function sourceTerm(r: RestaurantView): number {
  if (r.rating == null) return WEIGHTS.unratedQ;
  const stars = clamp01((r.rating - WEIGHTS.ratingFloor) / WEIGHTS.ratingSpan);
  const volume = Math.min(1, Math.log10(1 + (r.reviewCount ?? 0)) / WEIGHTS.reviewLogDivisor);
  return stars * volume;
}

function qualityOf(r: RestaurantView, plate: PlateScore | undefined): number {
  const base = baseQuality(r, plate);
  return r.photo ? Math.min(1, base + WEIGHTS.photoInQ) : base;
}

function baseQuality(r: RestaurantView, plate: PlateScore | undefined): number {
  const src = sourceTerm(r);
  if (plate?.ready && plate.percent != null) {
    const p = clamp01((plate.percent - WEIGHTS.plateFloorPct) / WEIGHTS.plateSpanPct);
    return WEIGHTS.plateInQ * p + WEIGHTS.sourceInQ * src;
  }
  if (r.rating == null) return WEIGHTS.unratedQ;
  return WEIGHTS.sourceOnlyInQ * src;
}

function firstName(full: string): string {
  const t = full.trim().split(/\s+/)[0];
  return t || "A friend";
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/* ---------- the scan ---------- */

/** One candidate with every part of its score. */
export type Scored = {
  r: RestaurantView;
  /** Position in the candidates handed in. */
  index: number;
  /** 100 * (0.5 A + 0.2 F + 0.2 Q + 0.1 N). */
  score: number;
  A: number;
  F: number;
  Q: number;
  N: number;
  /** Plate percent when ready, else -1: a tiebreak that never invents a number. */
  plate: number;
  friends: string[];
};

export type ScanInput = TasteInput & {
  /**
   * The whole listed corpus, when `restaurants` is only the candidates (a
   * filtered Discover result). Real cuisines and exclusions are read from
   * here. Defaults to `restaurants`.
   */
  corpus?: readonly RestaurantView[];
};

export type TasteScan = {
  /** Every candidate that was not excluded, in input order. Nothing is gated or capped. */
  scored: Scored[];
  /** Ids in the corpus that never show: visited, hidden, skipped cuisine. */
  exclude: Set<string>;
  historyActive: boolean;
  picksActive: boolean;
  explicitLoves: ReadonlySet<string>;
  favorite: string | null;
  effectiveLoves: ReadonlySet<string>;
  cuisineVisits: ReadonlyMap<string, number>;
  /** Distinct places the viewer has posted at or marked been. */
  visited: number;
};

type Signals = {
  universe: readonly RestaurantView[];
  byId: Map<string, RestaurantView>;
  skips: Set<string>;
  explicitLoves: Set<string>;
  favorite: string | null;
  effectiveLoves: Set<string>;
  visitedIds: Set<string>;
  hidden: Set<string>;
};

type SignalInput = Pick<
  ScanInput,
  "restaurants" | "corpus" | "prefs" | "postedIds" | "favoriteCuisine"
>;

function signalsOf(input: SignalInput): Signals {
  const { prefs } = input;
  const universe = input.corpus ?? input.restaurants;
  const byId = new Map<string, RestaurantView>();
  const cuisineSet = new Set<string>();
  for (const r of universe) {
    byId.set(r.id, r);
    if (r.cuisine) cuisineSet.add(r.cuisine);
  }

  const skips = new Set(prefs.skips.filter((c) => cuisineSet.has(c)));
  const explicitLoves = new Set(prefs.loves.filter((c) => cuisineSet.has(c) && !skips.has(c)));
  const favorite =
    input.favoriteCuisine &&
    cuisineSet.has(input.favoriteCuisine) &&
    !skips.has(input.favoriteCuisine)
      ? input.favoriteCuisine
      : null;
  const effectiveLoves = new Set(explicitLoves);
  if (favorite) effectiveLoves.add(favorite);

  const visitedIds = new Set<string>();
  for (const id of input.postedIds) if (byId.has(id)) visitedIds.add(id);
  for (const id of prefs.been) if (byId.has(id)) visitedIds.add(id);
  return {
    universe,
    byId,
    skips,
    explicitLoves,
    favorite,
    effectiveLoves,
    visitedIds,
    hidden: new Set(prefs.hidden),
  };
}

function excludedIds(sig: Signals): Set<string> {
  const out = new Set<string>();
  for (const r of sig.universe) {
    if (sig.visitedIds.has(r.id) || sig.hidden.has(r.id) || (r.cuisine && sig.skips.has(r.cuisine))) {
      out.add(r.id);
    }
  }
  return out;
}

/**
 * Ids that never show for this viewer: places they have been or posted at,
 * hidden places, and places of a skipped cuisine. Cheap (no scoring), so the
 * Discover pipeline can drop them right after the filters, before totals and
 * facets are counted.
 */
export function tasteExclusions(input: SignalInput): Set<string> {
  return excludedIds(signalsOf(input));
}

/** The viewer's usual plate: B and its quartile range in dollars, and how far to trust it (0 to 1). */
export type Budget = { median: number; lo: number; hi: number; conf: number };

const ascending = (a: number, b: number) => a - b;

/** A quantile of a sorted, non-empty list, linear between neighbours. */
function quantile(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

function quartiles(sorted: readonly number[]): Pick<Budget, "median" | "lo" | "hi"> {
  return { median: quantile(sorted, 0.5), lo: quantile(sorted, 0.25), hi: quantile(sorted, 0.75) };
}

/**
 * B, the viewer's usual plate price, from the prices on their own posts
 * (`plates`) and the median menu prices of the places they have been (`places`).
 * Null when neither is enough: a missing B is neutral, never a guess. Plates
 * under minPlate are dropped, then any over outlierRatio times the median of
 * those kept; 3 or more left give B with trust min(1, kept / 6). Failing that,
 * 3 or more known places give B at a trust of half at most. With both, B is
 * plateInB plates and the rest places, at the plates' trust.
 */
export function budgetOf(plates: readonly number[], places: readonly number[]): Budget | null {
  const c = FORME_BUDGET;
  const kept = plates.filter((v) => Number.isFinite(v) && v >= c.minPlate).sort(ascending);
  const cut = kept.length > 0 ? c.outlierRatio * quantile(kept, 0.5) : 0;
  const rest = kept.filter((v) => v <= cut);
  const fromPlates: Budget | null =
    rest.length >= c.minPlates
      ? { ...quartiles(rest), conf: Math.min(1, rest.length / c.platesForFull) }
      : null;
  const known = places.filter((v) => Number.isFinite(v) && v > 0).sort(ascending);
  const fromPlaces: Budget | null =
    known.length >= c.minPlaces
      ? { ...quartiles(known), conf: Math.min(c.placeConfCap, known.length / c.platesForFull) }
      : null;
  if (fromPlates && fromPlaces) {
    const w = c.plateInB;
    const mix = (a: number, b: number) => w * a + (1 - w) * b;
    return {
      median: mix(fromPlates.median, fromPlaces.median),
      lo: mix(fromPlates.lo, fromPlaces.lo),
      hi: mix(fromPlates.hi, fromPlaces.hi),
      conf: Math.max(fromPlates.conf, fromPlaces.conf),
    };
  }
  return fromPlates ?? fromPlaces;
}

/**
 * How well a place's price `price` fits B, 0 to 1. With x = ln(price / B): 1 inside
 * the viewer's range (upperFloor, or half the quartile spread if wider, above;
 * `lower` below), a fast fall above it, a slow one below it. Continuous, and
 * defined for any positive price and B.
 */
export function priceFit(price: number, b: Budget): number {
  const c = FORME_BUDGET;
  const x = Math.log(price / b.median);
  const upper = Math.max(c.upperFloor, 0.5 * Math.log(b.hi / b.lo));
  if (x > upper) return Math.exp(-(((x - upper) / c.upperWidth) ** 2));
  if (x < -c.lower) return Math.exp(-((-c.lower - x) / c.lowerWidth));
  return 1;
}

/** The budget term in score points: 100 * 0.06 * trust * (2 fit - 1), so it runs from a penalty to a bonus. */
export function budgetPoints(fit: number, conf: number): number {
  return 100 * FORME_WEIGHTS.budget * conf * (2 * fit - 1);
}

/** A place in the viewer's history, as a point: an id to break ties on, and where it is. */
export type HistoryPoint = Coords & { id: string };

/** How far the viewer goes, and from where we measure it. */
export type Radius = {
  /** R, in miles, before any rounding. */
  miles: number;
  /** The least D falls to. */
  floor: number;
  /** History points R was read from. Under FORME_RADIUS.minPoints, R is the prior. */
  points: number;
  /** Where distance is measured from; null when there is neither `here` nor a history. */
  anchor: Coords | null;
  /** `here`: the viewer's position; `medoid`: the middle of their history. */
  source: "here" | "medoid" | null;
};

/**
 * The point with the smallest summed distance to the others, ties to the lower id
 * so the same history gives the same medoid however it was ordered. One far-off
 * trip cannot drag it, which a mean would let it. Null for none; one point is
 * its own.
 */
export function medoidOf<P extends HistoryPoint>(points: readonly P[]): P | null {
  const ordered = points.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let best: P | null = null;
  let bestSum = Infinity;
  for (const a of ordered) {
    let sum = 0;
    for (const b of ordered) if (b !== a) sum += milesBetween(a, b);
    if (sum < bestSum - 1e-9) {
      best = a;
      bestSum = sum;
    }
  }
  return best;
}

/**
 * R and the anchor. From minPoints points, R = (n * p75 + 3 * 7) / (n + 3), p75
 * being the 75th percentile of the distances from the medoid to the other
 * points, kept within 3 to 20 mi; fewer points leave R at 7 with the softer
 * floor. The anchor is `here` when it is a real position, else the medoid.
 */
export function radiusOf(points: readonly HistoryPoint[], here?: Coords | null): Radius {
  const c = FORME_RADIUS;
  const medoid = medoidOf(points);
  let miles: number = c.priorMiles;
  let floor: number = c.floorFew;
  if (medoid && points.length >= c.minPoints) {
    const away = points.filter((p) => p !== medoid).map((p) => milesBetween(medoid, p)).sort(ascending);
    const n = points.length;
    const mix = (n * quantile(away, 0.75) + c.priorPlaces * c.priorMiles) / (n + c.priorPlaces);
    miles = Math.min(c.maxMiles, Math.max(c.minMiles, mix));
    floor = c.floor;
  }
  const standing = here && Number.isFinite(here.lat) && Number.isFinite(here.lng) ? here : null;
  const anchor = standing ?? medoid;
  return {
    miles,
    floor,
    points: points.length,
    anchor: anchor ? { lat: anchor.lat, lng: anchor.lng } : null,
    source: standing ? "here" : medoid ? "medoid" : null,
  };
}

/** D: 1 up to R, then 1 / (1 + ((d - R) / R)^2), never under the floor. Not a number: 1. */
export function distanceFactor(miles: number, radius: number, floor: number): number {
  if (!(miles > radius)) return 1;
  const x = (miles - radius) / radius;
  return Math.max(floor, 1 / (1 + x * x));
}

/**
 * Scores every candidate, uncapped. Callers decide what to do with the result:
 * `scoreTaste` gates, caps and interleaves it for the Your taste strip;
 * 
 */
export function scoreAll(input: ScanInput): TasteScan {
  const { restaurants, plates } = input;
  const sig = signalsOf(input);
  const { visitedIds, hidden, skips, effectiveLoves } = sig;

  // History: distinct places per cuisine / neighborhood, never per post.
  const cuisineVisits = new Map<string, number>();
  const hoodVisits = new Map<string, number>();
  let visitedWithCuisine = 0;
  for (const id of visitedIds) {
    const r = sig.byId.get(id)!;
    if (r.cuisine) {
      visitedWithCuisine++;
      cuisineVisits.set(r.cuisine, (cuisineVisits.get(r.cuisine) ?? 0) + 1);
    }
    if (r.neighborhood) hoodVisits.set(r.neighborhood, (hoodVisits.get(r.neighborhood) ?? 0) + 1);
  }
  const maxCuisine = Math.max(0, ...cuisineVisits.values());
  const maxHood = Math.max(0, ...hoodVisits.values());
  const picksActive = effectiveLoves.size > 0;
  const historyActive = visitedWithCuisine >= MIN_POSTS;

  // Friends: distinct friends per restaurant.
  const friendsAt = new Map<string, Map<string, string>>();
  for (const v of input.friendVisits) {
    let m = friendsAt.get(v.restaurantId);
    if (!m) friendsAt.set(v.restaurantId, (m = new Map()));
    if (!m.has(v.friendId)) m.set(v.friendId, v.name);
  }

  const scored: Scored[] = [];
  for (let i = 0; i < restaurants.length; i++) {
    const r = restaurants[i];
    if (visitedIds.has(r.id) || hidden.has(r.id)) continue;
    if (r.cuisine && skips.has(r.cuisine)) continue;

    let A = 0;
    for (const t of restaurantTraits(r)) {
      const pick = effectiveLoves.has(t.cuisine) ? 1 : 0;
      const hist =
        historyActive && maxCuisine > 0 ? (cuisineVisits.get(t.cuisine) ?? 0) / maxCuisine : 0;
      let a = 0;
      if (picksActive && historyActive) a = WEIGHTS.pickInA * pick + WEIGHTS.histInA * hist;
      else if (picksActive) a = pick;
      else if (historyActive) a = hist;
      A = Math.max(A, a * t.weight);
    }

    const fm = friendsAt.get(r.id);
    const names = fm ? [...fm.values()].sort((a, b) => a.localeCompare(b)) : [];
    const F = Math.min(1, names.length / WEIGHTS.friendsForFull);
    const N = maxHood > 0 && r.neighborhood ? (hoodVisits.get(r.neighborhood) ?? 0) / maxHood : 0;
    const Q = qualityOf(r, plates[r.id]);
    const plate = plates[r.id];
    scored.push({
      r,
      index: i,
      score: 100 * (WEIGHTS.affinity * A + WEIGHTS.friends * F + WEIGHTS.quality * Q + WEIGHTS.neighborhood * N),
      A,
      F,
      Q,
      N,
      plate: plate?.ready && plate.percent != null ? plate.percent : -1,
      friends: names,
    });
  }

  return {
    scored,
    exclude: excludedIds(sig),
    historyActive,
    picksActive,
    explicitLoves: sig.explicitLoves,
    favorite: sig.favorite,
    effectiveLoves,
    cuisineVisits,
    visited: visitedIds.size,
  };
}

/* ---------- Your taste ---------- */

export function scoreTaste(input: TasteInput): TasteResult {
  const { restaurants, plates, prefs } = input;
  const limit = Math.max(
    1,
    Math.min(WEIGHTS.maxLimit, Math.floor(input.limit ?? WEIGHTS.defaultLimit)),
  );

  // The cuisine share, gated at MIN_POSTS places.
  const scan = scoreAll({
    restaurants,
    plates,
    prefs,
    postedIds: input.postedIds,
    favoriteCuisine: input.favoriteCuisine,
    friendVisits: input.friendVisits,
  });
  const { explicitLoves, favorite, historyActive, cuisineVisits, effectiveLoves } = scan;

  const scored = scan.scored.filter((s) => s.A > 0 || s.F > 0);
  scored.sort(
    (a, b) =>
      b.score - a.score || Number(!!b.r.photo) - Number(!!a.r.photo) || a.index - b.index,
  );

  const scoringCuisines = new Set<string>();
  for (const s of scored) if (s.A > 0 && s.r.cuisine) scoringCuisines.add(s.r.cuisine);
  const capPerCuisine =
    scoringCuisines.size >= 2 ? Math.ceil(WEIGHTS.cuisineCapShare * limit) : Infinity;

  const chosen: Scored[] = [];
  const chains = new Set<string>();
  const perCuisine = new Map<string, number>();
  for (const s of scored) {
    if (chosen.length >= limit) break;
    const ck = chainKey(s.r);
    if (chains.has(ck)) continue;
    const c = s.r.cuisine ?? "";
    if ((perCuisine.get(c) ?? 0) >= capPerCuisine) continue;
    chains.add(ck);
    perCuisine.set(c, (perCuisine.get(c) ?? 0) + 1);
    chosen.push(s);
  }

  // Round-robin across cuisines so one cuisine never leads the whole list.
  // Groups keep score order inside and are ordered by their best pick.
  let ordered = chosen;
  if (scoringCuisines.size >= 2) {
    const groups = new Map<string, Scored[]>();
    for (const s of chosen) {
      const c = s.r.cuisine ?? "";
      const g = groups.get(c);
      if (g) g.push(s);
      else groups.set(c, [s]);
    }
    const lists = [...groups.values()];
    ordered = [];
    for (let i = 0; ordered.length < chosen.length; i++) {
      for (const g of lists) if (i < g.length) ordered.push(g[i]);
    }
  }

  const picks: TastePick[] = ordered.map((s) => ({
    restaurant: s.r,
    plateScore: plates[s.r.id] ?? null,
    reason: buildReason(s, { explicitLoves, favorite, historyActive, cuisineVisits }),
  }));

  // Basis: what actually drove the list, never more.
  const visited = scan.visited;
  const pickCount = effectiveLoves.size;
  const picksActive = scan.picksActive;
  let basis: TasteBasis = "none";
  if (picks.length > 0) {
    if (historyActive) basis = "history";
    else if (picksActive) basis = "starting";
    else if (picks.some((p) => p.reason.kind === "friend")) basis = "friends";
  }

  let header = "";
  let shortHeader = "";
  if (basis === "history") {
    const tail = pickCount ? ` and ${plural(pickCount, "pick", "picks")}` : "";
    header = `Based on ${plural(visited, "place", "places")} you've been${tail}`;
    shortHeader = `Based on ${plural(visited, "place", "places")}${tail}`;
  } else if (basis === "starting") {
    header = visited > 0 ? "Based on your picks and first plates" : "Based on your picks";
    shortHeader = "Based on your picks";
  } else if (basis === "friends") {
    header = "Where your friends eat";
    shortHeader = header;
  }

  return {
    basis,
    header,
    shortHeader,
    picks: basis === "none" ? [] : picks,
    counts: { visited, picks: pickCount },
  };
}

function buildReason(
  s: Scored,
  ctx: {
    explicitLoves: ReadonlySet<string>;
    favorite: string | null;
    historyActive: boolean;
    cuisineVisits: ReadonlyMap<string, number>;
  },
): TasteReason {
  const c = s.r.cuisine;
  if (s.friends.length > 0) {
    const lead = firstName(s.friends[0]);
    const more = s.friends.length - 1;
    return {
      kind: "friend",
      text:
        more > 0 ? `${lead} + ${plural(more, "friend", "friends")} posted here` : `${lead} posted here`,
      short: more > 0 ? `${lead} + ${more} posted here` : `${lead} posted here`,
    };
  }
  if (c && ctx.explicitLoves.has(c)) {
    return { kind: "picked", text: `You picked ${c}`, short: `You picked ${c}` };
  }
  if (c && ctx.favorite === c) {
    return { kind: "favorite", text: `Your favorite cuisine: ${c}`, short: `Your favorite: ${c}` };
  }
  if (c && ctx.historyActive && (ctx.cuisineVisits.get(c) ?? 0) > 0) {
    const n = ctx.cuisineVisits.get(c)!;
    return {
      kind: "history",
      text: `You've been to ${n} ${c} ${n === 1 ? "place" : "places"}`,
      short: `Been to ${n} ${c} ${n === 1 ? "place" : "places"}`,
    };
  }
  return {
    kind: "neighborhood",
    text: `In ${s.r.neighborhood}, where you eat`,
    short: `In ${s.r.neighborhood}`,
  };
}

/** Where a listing name stops being the name: "sweetgreen - Healthy Salads, Wraps, and Bowls". */
const NAME_SEPARATORS = [" - ", " – ", " — ", " | ", ": "] as const;

/**
 * The part of a place's name a person would say out loud. Business listings
 * carry a tagline or a location after the name ("Em Coffee House - Mission
 * Valley"); cut at the first separator and keep what is before it, unless that
 * leaves under 3 characters, when the full name is the safer thing to print.
 */
export function shortPlaceName(name: string): string {
  const full = name.normalize("NFC").trim();
  let cut = -1;
  for (const sep of NAME_SEPARATORS) {
    const at = full.indexOf(sep);
    if (at >= 0 && (cut < 0 || at < cut)) cut = at;
  }
  if (cut < 0) return full;
  const head = full.slice(0, cut).trim();
  return head.length >= 3 ? head : full;
}
