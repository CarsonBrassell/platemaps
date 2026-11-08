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
  /** Review volume that earns the full sourceTerm: log10(1+n)/this. */
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
  /** A tail reason says "well rated" at Q >= this. */
  wellRatedQ: 0.6,
  /** Longest reason line. "Because you went to " is 20 of these, so a seed name keeps 36. */
  reasonMaxChars: 56,
} as const;

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
  /** 100 * (0.2 Q + 0.1 N): how the "also well rated" tail is ordered. */
  tail: number;
  A: number;
  /** The explicit-pick and history parts of A. For me only; 0 in the cuisine-share mode. */
  Apick: number;
  Ahist: number;
  F: number;
  Q: number;
  N: number;
  /** Plate percent when ready, else -1: a tiebreak that never invents a number. */
  plate: number;
  friends: string[];
  /** For me: index into `TasteScan.seeds` of the most similar seed, -1 for none. */
  seed: number;
  /** For me: similarity to that seed. */
  sim: number;
  /** For me: shares a chainKey with a place the viewer has been. */
  sibling: boolean;
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
    const Q = qualityOf(r, plates[r.id]);
    const plate = plates[r.id];
    scored.push({
      r,
      index: i,
      score:
        100 *
        (WEIGHTS.affinity * A + WEIGHTS.friends * F + WEIGHTS.quality * Q + WEIGHTS.neighborhood * N),
      tail: 100 * (WEIGHTS.qualityInTail * Q + WEIGHTS.hoodInTail * N),
      A,
      Apick,
      Ahist,
      F,
      Q,
      N,
      plate: plate?.ready && plate.percent != null ? plate.percent : -1,
      friends: names,
      seed,
      sim,
      sibling: visitedChains.size > 0 && visitedChains.has(chainKey(r)),
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
      { kind: "like" as const, pts: WEIGHTS.affinity * wHist * s.Ahist, rank: 0 },
      { kind: "pick" as const, pts: WEIGHTS.affinity * wPick * s.Apick, rank: 1 },
      { kind: "friends" as const, pts: WEIGHTS.friends * s.F, rank: 2 },
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
    const more = cuisineReason(s, scan, index);
    if (more) return more;
  }
  if (s.Q >= WEIGHTS.wellRatedQ) {
    return {
      kind: "rated",
      text: s.r.neighborhood ? clipReason(`Well rated in ${s.r.neighborhood}`) : "Well rated",
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
