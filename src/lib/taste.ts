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
 * Two consumers share one scan (`scoreAll`):
 *  - `scoreTaste`: the small "Your taste" strip. Affinity from history is the
 *    old cuisine share and needs MIN_POSTS places; unchanged.
 *  - `rankTaste`: "For me", every candidate in one ordered list. Affinity from
 *    history is item-to-item similarity over menu profiles (profileTraits.ts),
 *    so one place is already enough to go on. Spec: probe/for-me/PLAN.md.
 *
 * Everything below that only For me does is switched on by `traits` (the menu
 * index), so Your taste never sees it:
 *  - Its own weights, FORME_WEIGHTS (A 0.40, F 0.20, Q 0.30, N 0.10), and a
 *    budget term beside them (below), worth at most 0.06 either way.
 *  - A shrunk rating. R' = (n*R + m*C) / (n+m) pulls a thin rating toward C, the
 *    mean of the rated places in the corpus (`Corpus.ratingMean`, read once per
 *    corpus load), with m = FORME_QUALITY.priorReviews. Fewer than minReviews
 *    reviews is unrated. Q's source term is then the stars alone, with no
 *    review-volume factor: R' already says how much to trust the number. Unrated
 *    stays at unratedQ, so a missing rating is neither rewarded nor punished.
 *  - A soft floor, g, on the score (the matches' order, not the tail's): 1 from
 *    R' 4.2 up, 0.8 at 3.8, 0.65 at 3.5 and below, linear between, 0.92 for an
 *    unrated place. A place with 15 or more reviews is judged on the lower of R'
 *    and its raw rating, so shrinking can only help a thin sample, never a
 *    well-reviewed place that is simply not good.
 *  - The tail's reason reads R': "Well rated in {hood}" from 4.2, "Highly rated"
 *    from 4.5. The grid's quality line drops its tier word on those cards.
 *  - A cuisine profile, from 3 seeds, over everything the viewer has posted at
 *    or marked been (not only the 30 seeds). Each place weighs recency x repeat:
 *    0.5 per 120 days since their latest post there (floored at 0.4), times 1 +
 *    0.5 per further day they posted there (capped at 2); a "been" with no post
 *    is 1. A cuisine's share s(c) is its weight over the total, secondary
 *    cuisines at SECONDARY_CUISINE_WEIGHT. A candidate's Acuis is its best
 *    weighted s(c) over 0.25, at most 1, and Ahist' = 0.7 Ahist + 0.3 Acuis,
 *    so what the viewer eats a lot of counts beside what a menu resembles.
 *    Fewer seeds, or a place with no cuisine, leave Ahist as it was. The scan
 *    lists the top cuisines (up to 3 at a 0.10 share or more), and a match with
 *    nothing stronger to say reads "You eat a lot of {cuisine}" from a 0.20
 *    share over 3 places. Dates are of the viewer's own posts, as history; the
 *    posts' ratings, votes and the rest still feed none of it.
 *  - A budget term. B is the viewer's usual plate: the median price on their own
 *    posts (under $3 dropped, then anything over 2.5x the median of the rest),
 *    with the quartiles as its range, trusted from 3 plates and in full at 6.
 *    With fewer than 3, B is the median menu price of the places they have been
 *    (from 3 known, trusted at half at most); with both it is 0.6 plates + 0.4
 *    places. A candidate's price is its menu's median plate (from 4 priced
 *    items; the price band is not used, nothing is imputed). Inside the range
 *    the fit is 1, above it it falls off fast and below it slowly, and the
 *    score gains 100 * 0.06 * trust * (2 fit - 1), inside g. A place with no
 *    price, or a viewer with no B, gets exactly 0. A fit of 0.9 or more, at a
 *    trust of half or more, earns "Fits your usual $11–18 plate" when no like,
 *    pick, friend or cuisine line applies. Prices on the viewer's posts are
 *    history, as dates are; the posts' ratings, votes and the rest feed nothing.
 * The viewer's own ratings, likes, hearts, upvotes and saves feed none of it.
 */
import type { RestaurantView } from "@/data/restaurantTypes";
import type { PlateScore } from "@/lib/plateScore";
import {
  SECONDARY_CUISINE_WEIGHT,
  dishSetKey,
  similarity,
  similarityParts,
  traitsOf,
  type PlaceTraits,
  type TraitIndex,
} from "@/lib/profileTraits";
import type { ForMeInfo, ForMeReason } from "@/lib/discoverWire";
import { MIN_POSTS } from "@/lib/tasteMatch";

/** Your taste. For me reads FORME_WEIGHTS for the four terms below and the same rest. */
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
  /** Your taste only: review volume that earns the full sourceTerm, log10(1+n)/this. For me reads R' instead. */
  reviewLogDivisor: 2.5,
  /** Share of the list one cuisine may take (when 2+ cuisines score). */
  cuisineCapShare: 0.4,
  minPicksToShow: 6,
  defaultLimit: 24,
  maxLimit: 24,
  maxLoves: 5,
  maxSkips: 5,
  maxMarks: 300,

  /* For me (rankTaste). Starting values: there is no ground truth to tune on. */
  /** Ahist = conf(k) * (maxInAhist * best similarity + top3InAhist * mean of the best 3). */
  maxInAhist: 0.75,
  top3InAhist: 0.25,
  /** conf(k) = min(1, confBase + confStep * (k - 1)) for k seeds. */
  confBase: 0.6,
  confStep: 0.2,
  /** History counts from this many seeds (Your taste keeps MIN_POSTS). */
  minSeeds: 1,
  /** Seeds are the most recent places the viewer has been, at most this many. */
  maxSeeds: 30,
  /** A candidate is a match (block 1) at A >= this, or with any friend. */
  matchGate: 0.15,
  /** The tail (block 2) sorts by 100 * (qualityInTail * Q + hoodInTail * N). */
  qualityInTail: 0.2,
  hoodInTail: 0.1,
  /** In block 1 the cuisine cap starts at this position (1-based)... */
  capFromPosition: 6,
  /** ...and is waived when the best other-cuisine place scores under this share of the leader. */
  capRelaxRatio: 0.5,
  /** Longest reason line. "Because you went to " is 20 of these, so a seed name keeps 36. */
  reasonMaxChars: 56,
} as const;

/**
 * SCORE for For me = g * (100 * (a*A + f*F + q*Q + n*N) + budget points), the
 * weights of `WEIGHTS` for Your taste left alone. Dials: the four sum to 1, so a
 * perfect place scores 100 before the budget term, which moves it by at most
 * 100 * `budget` points either way (see FORME_BUDGET).
 */
export const FORME_WEIGHTS = {
  affinity: 0.4,
  friends: 0.2,
  quality: 0.3,
  neighborhood: 0.1,
  budget: 0.06,
} as const;

/** The quality model For me reads: the shrunk rating, the soft floor and the tail wording. */
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
  /** A tail reason says "Well rated" from this R'... */
  wellRatedFrom: 4.2,
  /** ..."Highly rated" from this one. */
  highlyRatedFrom: 4.5,
} as const;

/** The cuisine profile For me reads: how a place weighs, and how it joins Ahist. */
export const FORME_CUISINE = {
  /** A place's weight halves every this many days since the viewer's latest post there... */
  halfLifeDays: 120,
  /** ...and never falls below this. A `been` with no post date weighs 1. */
  recencyFloor: 0.4,
  /** Each further day the viewer posted at the same place adds this to its weight... */
  repeatStep: 0.5,
  /** ...up to this. */
  repeatCap: 2,
  /** A cuisine at this share of the viewer's history is full affinity for a candidate. */
  fullShare: 0.25,
  /** Ahist' = (1 - cuisineInAhist) * Ahist + cuisineInAhist * Acuis. */
  cuisineInAhist: 0.3,
  /** The profile counts from this many seeds; fewer and Ahist is left as it was. */
  minSeeds: 3,
  /** `topCuisines` lists at most this many, each with at least this share. */
  topCount: 3,
  topMinShare: 0.1,
  /** "You eat a lot of X" needs X at this share, over at least this many distinct places. */
  reasonShare: 0.2,
  reasonPlaces: 3,
} as const;

/** The budget term For me reads: the viewer's usual plate, and how a place's price fits it. */
export const FORME_BUDGET = {
  /** A plate price under this is a side or a typo and says nothing about what they spend. */
  minPlate: 3,
  /** A price over this many times the median of the rest is a splurge, not their usual. */
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
  /** The reason line needs a fit of at least this, at a trust of at least reasonConf. */
  reasonFit: 0.9,
  reasonConf: 0.5,
} as const;

/**
 * When, and how often, the viewer posted at one restaurant: the latest post
 * (epoch milliseconds) and the number of distinct days they posted there.
 * `postedSignalsBy` in lib/db.ts reads it; a place missing from the list, or
 * with no usable date, weighs as a plain `been` does.
 */
export type PostedSignal = { restaurantId: string; lastAt: number; days: number };

/** A cuisine the viewer eats a lot of: its share of their weighted history. */
export type CuisineShare = { cuisine: string; share: number; places: number };

export type TasteBasis = "history" | "starting" | "friends" | "none";
export type TasteReason = {
  kind: "friend" | "picked" | "favorite" | "history" | "neighborhood";
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
 * taste). `secondary: true` adds its secondary cuisines at 0.4 (For me), so a
 * loved cuisine reaches the places that also file under it.
 */
export function restaurantTraits(
  r: RestaurantView,
  opts: { secondary?: boolean } = {},
): { cuisine: string; weight: number }[] {
  if (!r.cuisine) return [];
  const out = [{ cuisine: r.cuisine, weight: 1 }];
  if (opts.secondary) {
    for (const c of r.cuisineSecondary ?? []) {
      if (c && !out.some((t) => t.cuisine === c)) {
        out.push({ cuisine: c, weight: SECONDARY_CUISINE_WEIGHT });
      }
    }
  }
  return out;
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
 * g, the soft floor on a For me score: 1 from R' 4.2, linear to 0.8 at 3.8 and
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

/**
 * The stars part of Q. `shrunk` is the For me switch: undefined is Your taste
 * (raw rating, scaled by review volume), null is a For me place with no usable
 * rating, a number is its R' (stars alone, the volume already inside R').
 */
function sourceTerm(r: RestaurantView, shrunk?: number | null): number {
  if (shrunk !== undefined) {
    if (shrunk === null) return WEIGHTS.unratedQ;
    return clamp01((shrunk - WEIGHTS.ratingFloor) / WEIGHTS.ratingSpan);
  }
  if (r.rating == null) return WEIGHTS.unratedQ;
  const stars = clamp01((r.rating - WEIGHTS.ratingFloor) / WEIGHTS.ratingSpan);
  const volume = Math.min(1, Math.log10(1 + (r.reviewCount ?? 0)) / WEIGHTS.reviewLogDivisor);
  return stars * volume;
}

function qualityOf(
  r: RestaurantView,
  plate: PlateScore | undefined,
  shrunk?: number | null,
): number {
  const base = baseQuality(r, plate, shrunk);
  return r.photo ? Math.min(1, base + WEIGHTS.photoInQ) : base;
}

function baseQuality(
  r: RestaurantView,
  plate: PlateScore | undefined,
  shrunk?: number | null,
): number {
  const src = sourceTerm(r, shrunk);
  if (plate?.ready && plate.percent != null) {
    const p = clamp01((plate.percent - WEIGHTS.plateFloorPct) / WEIGHTS.plateSpanPct);
    return WEIGHTS.plateInQ * p + WEIGHTS.sourceInQ * src;
  }
  if (shrunk !== undefined ? shrunk === null : r.rating == null) return WEIGHTS.unratedQ;
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
  /**
   * Your taste: 100 * (0.5 A + 0.2 F + 0.2 Q + 0.1 N).
   * For me: G * (100 * (0.4 A + 0.2 F + 0.3 Q + 0.1 N) + budgetPts).
   */
  score: number;
  /** 100 * (0.2 Q + 0.1 N): how the "also well rated" tail is ordered. */
  tail: number;
  A: number;
  /** The explicit-pick and history parts of A. For me only; 0 in the cuisine-share mode. */
  Apick: number;
  /** With the cuisine profile in, from 3 seeds: 0.7 * menu similarity + 0.3 * Acuis. */
  Ahist: number;
  /** For me: the candidate's affinity to the viewer's cuisine profile; null when it does not apply. */
  Acuis: number | null;
  F: number;
  Q: number;
  N: number;
  /** For me: the shrunk rating R', null when unrated. Always null in the cuisine-share mode. */
  Rs: number | null;
  /** For me: the soft floor on `score`. Always 1 in the cuisine-share mode. */
  G: number;
  /** Plate percent when ready, else -1: a tiebreak that never invents a number. */
  plate: number;
  friends: string[];
  /** For me: index into `TasteScan.seeds` of the most similar seed, -1 for none. */
  seed: number;
  /** For me: similarity to that seed. */
  sim: number;
  /** For me: shares a chainKey with a place the viewer has been. */
  sibling: boolean;
  /** For me: the place's median plate price, null when unknown. Always null in the cuisine-share mode. */
  Pr: number | null;
  /** For me: how well Pr fits the viewer's usual plate, 0 to 1; null when either is unknown. */
  Pf: number | null;
  /** For me: the budget term in score points, exactly 0 when Pf is null. Always 0 in the cuisine-share mode. */
  budgetPts: number;
};

export type ScanInput = TasteInput & {
  /**
   * The whole listed corpus, when `restaurants` is only the candidates (a
   * filtered Discover result). Seeds, real cuisines and exclusions are read
   * from here. Defaults to `restaurants`.
   */
  corpus?: readonly RestaurantView[];
  /**
   * Present: affinity from history is similarity to the viewer's seeds, from
   * one place (For me). Absent: the cuisine share, from MIN_POSTS places
   * (Your taste).
   */
  traits?: TraitIndex;
  /**
   * For me: C in the shrunk rating, the mean rating of the rated places in the
   * corpus (`Corpus.ratingMean`). Null: nothing is rated, so no rating is
   * shrunk. Absent: read off `corpus` here, which a caller holding the cached
   * corpus never needs, because it passes the one computed with it.
   */
  ratingMean?: number | null;
  /**
   * For me: when and how often the viewer posted at each place, for the cuisine
   * profile's weights. Absent or empty: every visited place weighs 1.
   */
  postedSignals?: readonly PostedSignal[];
  /**
   * For me: the prices on the viewer's own posts (`parsePrice`, one per post), for
   * the budget term. Junk and outliers are dropped here. Absent or empty: no B
   * from plates.
   */
  platePrices?: readonly number[];
  /** For me: the clock the recency decay reads, in epoch milliseconds. Defaults to now. */
  now?: number;
};

export type TasteScan = {
  mode: "cuisine" | "similarity";
  /** Every candidate that was not excluded, in input order. Nothing is gated or capped. */
  scored: Scored[];
  /** Ids in the corpus that never show: visited, hidden, skipped cuisine. */
  exclude: Set<string>;
  /** Similarity mode: the places history is read from, most recent first. */
  seeds: RestaurantView[];
  historyActive: boolean;
  picksActive: boolean;
  explicitLoves: ReadonlySet<string>;
  favorite: string | null;
  effectiveLoves: ReadonlySet<string>;
  cuisineVisits: ReadonlyMap<string, number>;
  /** Distinct places the viewer has posted at or marked been. */
  visited: number;
  /** Similarity mode: each cuisine's share of the viewer's history. Empty under 3 seeds. */
  cuisineShare: ReadonlyMap<string, number>;
  /** Similarity mode: the viewer's biggest cuisines, largest first. Empty under 3 seeds. */
  topCuisines: CuisineShare[];
  /** Similarity mode: the viewer's usual plate in whole dollars, null when there is not enough to say. */
  budget: UsualPlate | null;
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

/** How far to trust history from `k` seeds: 1 seed 0.6, 2 seeds 0.8, 3 or more 1. */
export function historyConfidence(k: number): number {
  return Math.min(1, WEIGHTS.confBase + WEIGHTS.confStep * (k - 1));
}

const DAY_MS = 86_400_000;

/**
 * How much one visited place counts in the cuisine profile: recency x repeat,
 * read off the viewer's own posts there. A place with no post to read (a
 * `been`, or a post without a usable date) weighs 1, so missing data adds
 * nothing and takes nothing away.
 */
export function placeWeight(p: PostedSignal | undefined, now: number): number {
  if (!p) return 1;
  const c = FORME_CUISINE;
  const ageDays = Number.isFinite(p.lastAt) && Number.isFinite(now) ? Math.max(0, (now - p.lastAt) / DAY_MS) : 0;
  const recency = Math.max(c.recencyFloor, 0.5 ** (ageDays / c.halfLifeDays));
  const days = Number.isFinite(p.days) ? Math.max(1, p.days) : 1;
  return recency * Math.min(c.repeatCap, 1 + c.repeatStep * (days - 1));
}

/**
 * Each cuisine's share of the viewer's history, summing to 1: every visited
 * place adds its weight to its main cuisine and `SECONDARY_CUISINE_WEIGHT` of it
 * to each secondary one. Empty when nothing visited has a cuisine.
 */
function cuisineShares(
  sig: Signals,
  signals: readonly PostedSignal[],
  now: number,
): Map<string, number> {
  const posted = new Map<string, PostedSignal>();
  for (const p of signals) posted.set(p.restaurantId, p);
  const sum = new Map<string, number>();
  let total = 0;
  // Sorted, because a float sum depends on its order and the profile must not
  // depend on the order the places arrived in.
  for (const id of [...sig.visitedIds].sort()) {
    const w = placeWeight(posted.get(id), now);
    for (const t of restaurantTraits(sig.byId.get(id)!, { secondary: true })) {
      sum.set(t.cuisine, (sum.get(t.cuisine) ?? 0) + w * t.weight);
      total += w * t.weight;
    }
  }
  const out = new Map<string, number>();
  if (total > 0) for (const [cuisine, v] of sum) out.set(cuisine, v / total);
  return out;
}

/**
 * Acuis: the candidate's best cuisine against the share that earns full
 * affinity. A secondary cuisine counts at its weight, as it does for a pick. A
 * place with no cuisine has nothing to compare, so it gets null, not 0.
 */
function cuisineAffinity(r: RestaurantView, share: ReadonlyMap<string, number>): number | null {
  const traits = restaurantTraits(r, { secondary: true });
  if (traits.length === 0) return null;
  let best = 0;
  for (const t of traits) best = Math.max(best, t.weight * (share.get(t.cuisine) ?? 0));
  return Math.min(1, best / FORME_CUISINE.fullShare);
}

/** The viewer's usual plate: B and its quartile range in dollars, and how far to trust it (0 to 1). */
export type Budget = { median: number; lo: number; hi: number; conf: number };

/** `Budget` in whole dollars, for a line that says it. Trust is as it was. */
export type UsualPlate = Budget;

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
 * the rest; 3 or more left give B with trust min(1, kept / 6). Failing that,
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

/** Whole dollars, never under 1, so a line never says "$0". */
const wholeDollars = (v: number) => Math.max(1, Math.round(v));

/** The biggest cuisines, largest first (ties by name), each with the places behind it. */
function topCuisinesOf(
  share: ReadonlyMap<string, number>,
  visits: ReadonlyMap<string, number>,
): CuisineShare[] {
  const c = FORME_CUISINE;
  return [...share]
    .filter(([, v]) => v >= c.topMinShare)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, c.topCount)
    .map(([cuisine, v]) => ({ cuisine, share: v, places: visits.get(cuisine) ?? 0 }));
}

/**
 * The seeds For me reads history from: places the viewer marked "been" (newest
 * first; the list is oldest-first) and places they posted at (in the order
 * given). Only places with something to compare on count, at most `maxSeeds`.
 *
 * While both fit, the been run comes first and the posts follow. Over the cap
 * the two take turns, been first, so a long been list cannot push every post
 * out of the seeds (nor the other way round): each source gets half the
 * places, and whichever has fewer leaves its unused share to the other.
 */
function seedsOf(sig: Signals, input: ScanInput, index: TraitIndex) {
  type Seed = { place: RestaurantView; traits: PlaceTraits };
  const taken = new Set<string>();
  const lane = (order: readonly string[]): Seed[] => {
    const out: Seed[] = [];
    for (const id of order) {
      if (taken.has(id) || !sig.visitedIds.has(id)) continue;
      const traits = traitsOf(index, id);
      const place = sig.byId.get(id);
      if (!traits || traits.empty || !place) continue;
      taken.add(id);
      out.push({ place, traits });
    }
    return out;
  };
  const been = lane(input.prefs.been.slice().reverse());
  const posted = lane(input.postedIds);

  const max = WEIGHTS.maxSeeds;
  let picked: Seed[];
  if (been.length + posted.length <= max) {
    picked = [...been, ...posted];
  } else {
    picked = [];
    for (let i = 0; picked.length < max; i++) {
      if (i < been.length) picked.push(been[i]);
      if (picked.length < max && i < posted.length) picked.push(posted[i]);
    }
  }
  return { places: picked.map((s) => s.place), traits: picked.map((s) => s.traits) };
}

/**
 * Scores every candidate, uncapped. Callers decide what to do with the result:
 * `scoreTaste` gates, caps and interleaves it for the Your taste strip;
 * `rankTaste` orders all of it for For me.
 */
export function scoreAll(input: ScanInput): TasteScan {
  const { restaurants, plates } = input;
  const sig = signalsOf(input);
  const { visitedIds, hidden, skips, effectiveLoves } = sig;
  const index = input.traits;
  // For me carries its own weights and its own quality model; Your taste keeps
  // WEIGHTS and the raw rating. `ratingMean` is only read when `index` is set.
  const W = index ? FORME_WEIGHTS : WEIGHTS;
  const ratingMean = index
    ? input.ratingMean !== undefined
      ? input.ratingMean
      : meanRating(sig.universe)
    : null;

  // History: distinct places per cuisine / neighborhood, never per post.
  const cuisineVisits = new Map<string, number>();
  const hoodVisits = new Map<string, number>();
  let visitedWithCuisine = 0;
  const visitedChains = new Set<string>();
  for (const id of visitedIds) {
    const r = sig.byId.get(id)!;
    if (r.cuisine) {
      visitedWithCuisine++;
      cuisineVisits.set(r.cuisine, (cuisineVisits.get(r.cuisine) ?? 0) + 1);
    }
    if (r.neighborhood) hoodVisits.set(r.neighborhood, (hoodVisits.get(r.neighborhood) ?? 0) + 1);
    if (index) visitedChains.add(chainKey(r));
  }
  const maxCuisine = Math.max(0, ...cuisineVisits.values());
  const maxHood = Math.max(0, ...hoodVisits.values());
  const picksActive = effectiveLoves.size > 0;

  let seeds: RestaurantView[] = [];
  let seedTraits: PlaceTraits[] = [];
  let historyActive = visitedWithCuisine >= MIN_POSTS;
  if (index) {
    const s = seedsOf(sig, input, index);
    seeds = s.places;
    seedTraits = s.traits;
    historyActive = seedTraits.length >= WEIGHTS.minSeeds;
  }
  const conf = historyConfidence(seedTraits.length);
  const mixed = picksActive && historyActive;
  // The budget: B from the viewer's own plate prices, else from the menu prices
  // of the places they have been. Sorted, because a float sum depends on order.
  let budget: Budget | null = null;
  if (index) {
    const places: number[] = [];
    for (const id of [...visitedIds].sort()) {
      const p = index.prices.get(id);
      if (p != null) places.push(p);
    }
    budget = budgetOf(input.platePrices ?? [], places);
  }
  // The cuisine profile reads the whole of the viewer's history, not just the
  // seeds, and only once there are enough of them to say what they eat a lot of.
  const cuisineShare: ReadonlyMap<string, number> =
    index && seedTraits.length >= FORME_CUISINE.minSeeds
      ? cuisineShares(sig, input.postedSignals ?? [], input.now ?? Date.now())
      : new Map();

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
    let Apick = 0;
    let Ahist = 0;
    let Acuis: number | null = null;
    let seed = -1;
    let sim = 0;
    if (index) {
      for (const t of restaurantTraits(r, { secondary: true })) {
        if (effectiveLoves.has(t.cuisine)) Apick = Math.max(Apick, t.weight);
      }
      const traits = historyActive ? traitsOf(index, r.id) : undefined;
      if (traits && !traits.empty) {
        // The best 3 are summed in a fixed order, so the same candidate scores
        // the same whatever order the seeds came in. The best seed (the one
        // the reason names) is the same whatever the order too: seeds that tie
        // on similarity are told apart by id, not by who came first.
        let t1 = 0;
        let t2 = 0;
        let t3 = 0;
        for (let k = 0; k < seedTraits.length; k++) {
          const v = similarity(traits, seedTraits[k]);
          if (v > t1) {
            t3 = t2;
            t2 = t1;
            t1 = v;
            seed = k;
          } else {
            if (v === t1 && seed >= 0 && seeds[k].id < seeds[seed].id) seed = k;
            if (v > t2) {
              t3 = t2;
              t2 = v;
            } else if (v > t3) {
              t3 = v;
            }
          }
        }
        sim = t1;
        const top = Math.min(3, seedTraits.length);
        Ahist = clamp01(conf * (WEIGHTS.maxInAhist * t1 + (WEIGHTS.top3InAhist * (t1 + t2 + t3)) / top));
      }
      // A place with no cuisine, or a viewer with too little history, leaves
      // Ahist exactly as the menu comparison made it.
      if (cuisineShare.size > 0) {
        Acuis = cuisineAffinity(r, cuisineShare);
        if (Acuis != null) {
          Ahist = (1 - FORME_CUISINE.cuisineInAhist) * Ahist + FORME_CUISINE.cuisineInAhist * Acuis;
        }
      }
      if (mixed) A = WEIGHTS.pickInA * Apick + WEIGHTS.histInA * Ahist;
      else if (picksActive) A = Apick;
      else if (historyActive) A = Ahist;
    } else {
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
    }

    const fm = friendsAt.get(r.id);
    const names = fm ? [...fm.values()].sort((a, b) => a.localeCompare(b)) : [];
    const F = Math.min(1, names.length / WEIGHTS.friendsForFull);
    const N = maxHood > 0 && r.neighborhood ? (hoodVisits.get(r.neighborhood) ?? 0) / maxHood : 0;
    // Your taste: Rs null, G 1, so `score` is the sum it always was.
    const Rs = index ? shrunkRating(r.rating, r.reviewCount, ratingMean) : null;
    const G = index ? qualityFloor(Rs, r.rating, r.reviewCount) : 1;
    const Q = qualityOf(r, plates[r.id], index ? Rs : undefined);
    const plate = plates[r.id];
    const sum = 100 * (W.affinity * A + W.friends * F + W.quality * Q + W.neighborhood * N);
    // No price or no B: no fit and exactly 0 points, so the score is what it was.
    const Pr = index ? (index.prices.get(r.id) ?? null) : null;
    const Pf = budget && Pr != null ? priceFit(Pr, budget) : null;
    const budgetPts = budget && Pf != null ? budgetPoints(Pf, budget.conf) : 0;
    scored.push({
      r,
      index: i,
      score: index ? G * (sum + budgetPts) : sum,
      tail: 100 * (WEIGHTS.qualityInTail * Q + WEIGHTS.hoodInTail * N),
      A,
      Apick,
      Ahist,
      Acuis,
      F,
      Q,
      N,
      Rs,
      G,
      plate: plate?.ready && plate.percent != null ? plate.percent : -1,
      friends: names,
      seed,
      sim,
      sibling: visitedChains.size > 0 && visitedChains.has(chainKey(r)),
      Pr,
      Pf,
      budgetPts,
    });
  }

  return {
    mode: index ? "similarity" : "cuisine",
    scored,
    exclude: excludedIds(sig),
    seeds,
    historyActive,
    picksActive,
    explicitLoves: sig.explicitLoves,
    favorite: sig.favorite,
    effectiveLoves,
    cuisineVisits,
    visited: visitedIds.size,
    cuisineShare,
    topCuisines: topCuisinesOf(cuisineShare, cuisineVisits),
    budget: budget
      ? {
          median: wholeDollars(budget.median),
          lo: wholeDollars(budget.lo),
          hi: wholeDollars(budget.hi),
          conf: budget.conf,
        }
      : null,
  };
}

/* ---------- Your taste ---------- */

export function scoreTaste(input: TasteInput): TasteResult {
  const { restaurants, plates, prefs } = input;
  const limit = Math.max(
    1,
    Math.min(WEIGHTS.maxLimit, Math.floor(input.limit ?? WEIGHTS.defaultLimit)),
  );

  // No traits: the cuisine share, gated at MIN_POSTS places. Unchanged.
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

/* ---------- For me ---------- */

export type ForMeBasis = ForMeInfo["basis"];

export type RankInput = ScanInput & { traits: TraitIndex };

/**
 * One arrangement of the For me list: the candidates it was built over, split
 * into matches and tail, with the header and the reasons that go with that
 * split. `rankTaste` builds one over every candidate; `rankAmong` builds one
 * over the rows a filter left, so the split is the filtered list's own.
 */
export type ForMeArrangement = {
  /** One line for the grid header. */
  header: string;
  /** Size of block 1, the matches. The rest of `order` is the "also well rated" tail. */
  matched: number;
  /** Every candidate in this arrangement: matches in diversity order, then the tail. */
  order: string[];
  /** Id to position in `order`: the map `orderResults` sorts by. */
  rank: Map<string, number>;
  /**
   * The one-line reason for a card, built on first ask and kept. Null for an id
   * that is not in `order`. Names the viewer's own places, so it belongs only in
   * a private response.
   */
  reasonOf: (id: string) => ForMeReason | null;
};

export type ForMeRank = ForMeArrangement & {
  /** What the list is read from. "none" can still carry matches: places friends have been. */
  basis: ForMeBasis;
  /** Places history is read from (those with something to compare on, at most 30). */
  seeds: number;
  /** Ids in the corpus that never show: visited, hidden, skipped cuisine. */
  exclude: Set<string>;
  /**
   * What the viewer eats a lot of: up to FORME_CUISINE.topCount cuisines at a
   * share of FORME_CUISINE.topMinShare or more, largest first. Empty under
   * FORME_CUISINE.minSeeds seeds.
   */
  topCuisines: CuisineShare[];
  /**
   * The viewer's usual plate in whole dollars (lo and hi are the quartiles) and
   * how far it is trusted; null when there is not enough to say. Private to the
   * viewer: it is never sent for anyone else, and only on the private POST.
   */
  budget: UsualPlate | null;
  /**
   * The arrangement over just these ids (the rows a filter left). Sorting the
   * full list and then filtering it is not the same thing: a chain's best
   * branch, or a menu's twin, can sit outside the filter and have pushed the
   * only one inside it down to the tail. Here the dedupe, the cuisine cap and
   * the header are decided among the ids given. A set that covers every
   * candidate returns the full arrangement as it stands. Ids that are not
   * candidates are ignored. Siblings of a place the viewer has been stay out of
   * the matches, and the seeds and exclusions stay the corpus's own: neither
   * depends on the filter.
   */
  rankAmong: (ids: ReadonlySet<string>) => ForMeArrangement;
};

const byScore = (a: Scored, b: Scored) =>
  b.score - a.score || b.plate - a.plate || (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0);
const byTail = (a: Scored, b: Scored) =>
  b.tail - a.tail || b.plate - a.plate || (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0);

/**
 * "For me": every candidate in one list, best fit first.
 *
 * Block 1 (matches) is the candidates with A >= matchGate or a friend, minus
 * siblings of a place the viewer has been (same chain), one branch per chain,
 * and one place per menu in a cuisine. It is ordered by score, with a cap so no
 * cuisine holds more than 40% of the prefix (waived when the best alternative
 * scores under half of the leader). Block 2 is everything else, including what
 * the diversity rules set aside, ordered by quality: the grid is never blank.
 *
 * One pass over the whole list with a total order (ties break on plate score,
 * then id), so the first 24 of a 48-result run are the 24-result run, and the
 * order does not depend on the order candidates arrive in.
 */
export function rankTaste(input: RankInput): ForMeRank {
  const scan = scoreAll(input);
  const index = input.traits;
  const basis: ForMeBasis = scan.historyActive ? "history" : scan.picksActive ? "picks" : "none";

  // Sorted once. Every arrangement is built from a subsequence of this, so a
  // filtered one is ordered exactly as the full one is.
  const sorted = scan.scored.slice().sort(byScore);
  const full = arrange(sorted, scan, index, basis);

  return {
    ...full,
    basis,
    seeds: scan.seeds.length,
    exclude: scan.exclude,
    topCuisines: scan.topCuisines,
    budget: scan.budget,
    rankAmong: (ids) => {
      let all = true;
      for (const s of sorted) {
        if (!ids.has(s.r.id)) {
          all = false;
          break;
        }
      }
      if (all) return full;
      return arrange(
        sorted.filter((s) => ids.has(s.r.id)),
        scan,
        index,
        basis,
      );
    },
  };
}

/** Splits `sorted` (in `byScore` order) into matches and tail, and words both. */
function arrange(
  sorted: readonly Scored[],
  scan: TasteScan,
  index: TraitIndex,
  basis: ForMeBasis,
): ForMeArrangement {
  const matches: Scored[] = [];
  const rest: Scored[] = [];
  for (const s of sorted) {
    if ((s.A >= WEIGHTS.matchGate || s.F > 0) && !s.sibling) matches.push(s);
    else rest.push(s);
  }

  // One branch per chain, one place per menu in a cuisine; the best scores keep
  // the slot and the others drop to the tail.
  const chains = new Set<string>();
  const menus = new Set<string>();
  const kept: Scored[] = [];
  for (const s of matches) {
    const ck = chainKey(s.r);
    const t = traitsOf(index, s.r.id);
    const mk = t && !t.empty && !t.imputed ? `${dishSetKey(t)}|${s.r.cuisine ?? ""}` : null;
    if (chains.has(ck) || (mk && menus.has(mk))) {
      rest.push(s);
      continue;
    }
    chains.add(ck);
    if (mk) menus.add(mk);
    kept.push(s);
  }

  const block1 = capCuisines(kept, scan.effectiveLoves);
  rest.sort(byTail);
  const order = [...block1, ...rest].map((s) => s.r.id);
  const rank = new Map<string, number>();
  order.forEach((id, i) => rank.set(id, i));

  const header = forMeHeader(basis, scan.seeds.length, [...scan.effectiveLoves], block1.length);

  const byId = new Map<string, Scored>();
  for (const s of sorted) byId.set(s.r.id, s);
  const made = new Map<string, ForMeReason>();
  const reasonOf = (id: string): ForMeReason | null => {
    const hit = made.get(id);
    if (hit) return hit;
    const s = byId.get(id);
    if (!s) return null;
    const reason = forMeReason(s, scan, index, (rank.get(id) ?? Infinity) < block1.length);
    made.set(id, reason);
    return reason;
  };

  return { header, matched: block1.length, order, rank, reasonOf };
}

/**
 * Orders block 1 so no cuisine holds more than `cuisineCapShare` of the prefix
 * from position `capFromPosition` on. `kept` arrives in score order. At each
 * step the leader is the best remaining place; if its cuisine is over the cap
 * the best place of a cuisine with room goes instead, unless that one scores
 * under `capRelaxRatio` of the leader (then diversity is not worth a weak pick).
 * With a single cuisine, or whenever nothing else has room, the leader goes.
 *
 * "Cuisine" here is `capGroupOf`, not always the main one: a place filed under a
 * loved cuisine only as a secondary counts with that cuisine. Otherwise an
 * American bar that lists Mexican would read as variety against the Mexican the
 * viewer asked for, and the cap would hand it the slots a real taqueria earned.
 */
function capCuisines(kept: readonly Scored[], loves: ReadonlySet<string>): Scored[] {
  const groups = new Map<string, { items: Scored[]; at: number; taken: number }>();
  for (const s of kept) {
    const c = capGroupOf(s.r, loves);
    const g = groups.get(c);
    if (g) g.items.push(s);
    else groups.set(c, { items: [s], at: 0, taken: 0 });
  }
  if (groups.size < 2) return kept.slice();

  const lists = [...groups.values()];
  const out: Scored[] = [];
  while (out.length < kept.length) {
    const length = out.length + 1;
    const room = (g: { taken: number }) =>
      g.taken + 1 <= WEIGHTS.cuisineCapShare * length + 1e-9;
    let lead: (typeof lists)[number] | null = null;
    for (const g of lists) {
      if (g.at < g.items.length && (!lead || byScore(g.items[g.at], lead.items[lead.at]) < 0)) {
        lead = g;
      }
    }
    let pick = lead!;
    if (length >= WEIGHTS.capFromPosition && !room(pick)) {
      let alt: (typeof lists)[number] | null = null;
      for (const g of lists) {
        if (g === pick || g.at >= g.items.length || !room(g)) continue;
        if (!alt || byScore(g.items[g.at], alt.items[alt.at]) < 0) alt = g;
      }
      if (alt && alt.items[alt.at].score >= WEIGHTS.capRelaxRatio * pick.items[pick.at].score) {
        pick = alt;
      }
    }
    out.push(pick.items[pick.at++]);
    pick.taken++;
  }
  return out;
}

/**
 * The cuisine a place counts toward in the cap: its main cuisine, unless that is
 * not a loved one and a secondary is (the first, in the order the place lists
 * them), which is the cuisine its pick score rests on.
 */
function capGroupOf(r: RestaurantView, loves: ReadonlySet<string>): string {
  const main = r.cuisine ?? "";
  if (loves.has(main)) return main;
  for (const c of r.cuisineSecondary ?? []) if (loves.has(c)) return c;
  return main;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

function forMeHeader(
  basis: ForMeBasis,
  seeds: number,
  loves: readonly string[],
  matched: number,
): string {
  const plus = loves.length ? `, plus ${joinNames(loves)}` : "";
  if (basis === "history") {
    if (seeds >= 3) return `From the ${plural(seeds, "place", "places")} you've been${plus}`;
    return `Based on ${plural(seeds, "place", "places")} so far${plus}; post more to sharpen this`;
  }
  if (basis === "picks") return `Based on your picks: ${joinNames(loves)}`;
  return matched > 0 ? "Where your friends eat" : "Pick what you like to tune this";
}

/* ---------- For me reasons ---------- */

const clipReason = (text: string): string => {
  const t = text.normalize("NFC");
  const max = WEIGHTS.reasonMaxChars;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

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

/**
 * "Because you went to {name}", trimmed to fit. The dishes the two places share
 * used to ride along ("slices, pizzas"); they were generic, so the line now names
 * only the place the viewer has actually been.
 */
function likeText(name: string): string {
  return clipReason(`Because you went to ${shortPlaceName(name)}`);
}

/**
 * Friends by first name, in `Scored.friends` order, each once. The same first
 * names Your taste already prints ("Sam posted here"); never a count of friends.
 */
function friendsLine(s: Scored): string | null {
  const names: string[] = [];
  for (const full of s.friends) {
    const first = firstName(full).normalize("NFC");
    if (!names.includes(first)) names.push(first);
  }
  if (names.length === 0) return null;
  if (names.length === 1) return clipReason(`${names[0]} has been`);
  if (names.length === 2) return clipReason(`${names[0]} and ${names[1]} have been`);
  return clipReason(`${names[0]}, ${names[1]} and others have been`);
}

/**
 * The line that says why a place is on the list, plus, when the line is not
 * about friends but a friend has been, who. Without friends the key is absent
 * rather than undefined, so the object stays exactly what it was.
 */
function forMeReason(
  s: Scored,
  scan: TasteScan,
  index: TraitIndex,
  matched: boolean,
): ForMeReason {
  const reason = chooseReason(s, scan, index, matched);
  if (reason.kind === "friends") return reason;
  const friends = friendsLine(s);
  return friends ? { ...reason, friends } : reason;
}

/** `matched`: the place is in block 1. The tail never says why it fits, only that it is well rated. */
function chooseReason(
  s: Scored,
  scan: TasteScan,
  index: TraitIndex,
  matched: boolean,
): ForMeReason {
  if (matched) {
    // The biggest contributor to the score speaks first; plan order breaks ties.
    const mixed = scan.picksActive && scan.historyActive;
    const wHist = mixed ? WEIGHTS.histInA : scan.historyActive ? 1 : 0;
    const wPick = mixed ? WEIGHTS.pickInA : scan.picksActive ? 1 : 0;
    const kinds = [
      { kind: "like" as const, pts: FORME_WEIGHTS.affinity * wHist * s.Ahist, rank: 0 },
      { kind: "pick" as const, pts: FORME_WEIGHTS.affinity * wPick * s.Apick, rank: 1 },
      { kind: "friends" as const, pts: FORME_WEIGHTS.friends * s.F, rank: 2 },
    ]
      .filter((k) => k.pts > 0)
      .sort((a, b) => b.pts - a.pts || a.rank - b.rank);
    for (const { kind } of kinds) {
      const reason =
        kind === "like"
          ? likeReason(s, scan, index)
          : kind === "pick"
            ? pickReason(s, scan)
            : friendsReason(s);
      if (reason) return reason;
    }
    const eats = cuisineShareReason(s, scan);
    if (eats) return eats;
    const more = cuisineReason(s, scan, index);
    if (more) return more;
  }
  // The tail's price line goes ahead of its rating line: it says something about
  // this viewer, the rating line only about the place.
  const usual = priceReason(s, scan);
  if (usual) return usual;
  // A claim about the rating is made off R', the number the score reads: a thin
  // rating has been pulled toward the mean and a place with none says nothing.
  // The card's quality line drops its own tier word whenever this one speaks
  // (`forMeQualityNote`, on kind "rated"), so no card says it twice.
  if (s.Rs != null && s.Rs >= FORME_QUALITY.wellRatedFrom) {
    const word = s.Rs >= FORME_QUALITY.highlyRatedFrom ? "Highly rated" : "Well rated";
    return {
      kind: "rated",
      text: s.r.neighborhood ? clipReason(`${word} in ${s.r.neighborhood}`) : word,
    };
  }
  // "Different from your usual" is a claim about this place, so it is made only
  // for one that really is: nothing in its fit (below the match gate), no friend
  // behind it, and not another branch of a chain the viewer has been to. A
  // place that missed the matches for any other reason (a twin menu, a second
  // branch, the cuisine cap) fits fine and is simply not claimed to be unusual.
  const unusual =
    (scan.historyActive || scan.picksActive) && !s.sibling && s.F === 0 && s.A < WEIGHTS.matchGate;
  return { kind: "rated", text: unusual ? "Different from your usual" : "Worth a look" };
}

/**
 * "Fits your usual $11–18 plate": the place's price sits inside the range they
 * spend in (a fit of reasonFit or more), and that range is trusted at half or
 * more. The dollars are the scan's rounded quartiles. It never says a place is
 * too dear or too cheap: a poor fit is simply not claimed.
 */
function priceReason(s: Scored, scan: TasteScan): ForMeReason | null {
  const u = scan.budget;
  if (!u || s.Pr == null || s.Pf == null) return null;
  if (u.conf < FORME_BUDGET.reasonConf || s.Pf < FORME_BUDGET.reasonFit) return null;
  const range = u.lo === u.hi ? `$${u.lo}` : `$${u.lo}\u2013${u.hi}`;
  return { kind: "price", text: clipReason(`Fits your usual ${range} plate`) };
}

/** Needs a profile on both sides: a place without one never claims shared dishes. */
function likeReason(s: Scored, scan: TasteScan, index: TraitIndex): ForMeReason | null {
  if (s.seed < 0) return null;
  const seed = scan.seeds[s.seed];
  const a = traitsOf(index, s.r.id);
  const b = traitsOf(index, seed.id);
  if (!a || !b) return null;
  const parts = similarityParts(index, a, b);
  if (parts.imputed) return null;
  // Something real in common (a dish, or failing that a cuisine) is what earns
  // the line; what it is no longer gets printed.
  if (parts.shared.length > 0 || parts.sharedCuisines.length > 0) {
    return { kind: "like", text: likeText(seed.name) };
  }
  return null;
}

/**
 * Says what the pick score rests on, strongest first: the main cuisine (picked,
 * then favorite) at full strength, then a secondary at `SECONDARY_CUISINE_WEIGHT`.
 * A place that is only filed under the cuisine as a secondary says "Also serves",
 * never "You picked": the viewer did not pick a bar that happens to list tacos.
 */
function pickReason(s: Scored, scan: TasteScan): ForMeReason | null {
  const main = s.r.cuisine;
  if (main && scan.explicitLoves.has(main)) return { kind: "pick", text: clipReason(`You picked ${main}`) };
  if (main && main === scan.favorite) return { kind: "pick", text: clipReason(`Your favorite: ${main}`) };
  const others = (s.r.cuisineSecondary ?? []).filter((c) => c && c !== main);
  const also = others.find((c) => scan.explicitLoves.has(c)) ?? others.find((c) => c === scan.favorite);
  if (also) return { kind: "pick", text: clipReason(`Also serves ${also}`) };
  return null;
}

function friendsReason(s: Scored): ForMeReason | null {
  const text = friendsLine(s);
  return text ? { kind: "friends", text } : null;
}

/**
 * A match whose own cuisine is a big part of what the viewer eats: at least
 * FORME_CUISINE.reasonShare of their history, over at least reasonPlaces places
 * they have been. Spoken only when nothing stronger (a like, a pick, a friend)
 * could be, and it claims the place's main cuisine, never a secondary one.
 */
function cuisineShareReason(s: Scored, scan: TasteScan): ForMeReason | null {
  const cuisine = s.r.cuisine;
  if (!cuisine) return null;
  const c = FORME_CUISINE;
  if ((scan.cuisineShare.get(cuisine) ?? 0) < c.reasonShare) return null;
  if ((scan.cuisineVisits.get(cuisine) ?? 0) < c.reasonPlaces) return null;
  return { kind: "cuisine", text: clipReason(`You eat a lot of ${cuisine}`) };
}

/**
 * A match that rests on cuisine alone (an imputed profile on either side).
 * "More X" is a claim that the viewer has been to X, so X is a cuisine the place
 * shares with its best seed. A place with no seed (a match on a picked cuisine)
 * is its own cuisine by definition. A place whose seed shares no cuisine with it
 * has nothing to name, so it says only that it is similar.
 */
function cuisineReason(s: Scored, scan: TasteScan, index: TraitIndex): ForMeReason | null {
  if (s.A <= 0) return null;
  if (s.seed < 0) {
    return s.r.cuisine ? { kind: "cuisine", text: clipReason(`More ${s.r.cuisine}`) } : null;
  }
  const a = traitsOf(index, s.r.id);
  const b = traitsOf(index, scan.seeds[s.seed].id);
  const shared = a && b ? similarityParts(index, a, b).sharedCuisines[0] : undefined;
  return shared
    ? { kind: "cuisine", text: clipReason(`More ${shared}`) }
    : { kind: "cuisine", text: "Similar to places you've been" };
}
