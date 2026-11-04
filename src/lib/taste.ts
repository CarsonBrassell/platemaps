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
 */
import type { RestaurantView } from "@/data/restaurantTypes";
import type { PlateScore } from "@/lib/plateScore";
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
 * Enrichment seam. v1: a restaurant is its one cuisine. When menu enrichment
 * lands this returns the main cuisine at 1.0 plus secondaries at 0.4 and
 * affinity becomes the max of weight * A(cuisine).
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

/* ---------- the scorer ---------- */

type Scored = {
  r: RestaurantView;
  index: number;
  score: number;
  A: number;
  F: number;
  N: number;
  friends: string[];
};

export function scoreTaste(input: TasteInput): TasteResult {
  const { restaurants, plates, prefs } = input;
  const limit = Math.max(
    1,
    Math.min(WEIGHTS.maxLimit, Math.floor(input.limit ?? WEIGHTS.defaultLimit)),
  );

  const byId = new Map<string, RestaurantView>();
  const cuisineSet = new Set<string>();
  for (const r of restaurants) {
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
  const hidden = new Set(prefs.hidden);

  // History: distinct places per cuisine / neighborhood, never per post.
  const cuisineVisits = new Map<string, number>();
  const hoodVisits = new Map<string, number>();
  let visitedWithCuisine = 0;
  for (const id of visitedIds) {
    const r = byId.get(id)!;
    if (r.cuisine) {
      visitedWithCuisine++;
      cuisineVisits.set(r.cuisine, (cuisineVisits.get(r.cuisine) ?? 0) + 1);
    }
    if (r.neighborhood) hoodVisits.set(r.neighborhood, (hoodVisits.get(r.neighborhood) ?? 0) + 1);
  }
  const maxCuisine = Math.max(0, ...cuisineVisits.values());
  const maxHood = Math.max(0, ...hoodVisits.values());
  const historyActive = visitedWithCuisine >= MIN_POSTS;
  const picksActive = effectiveLoves.size > 0;

  // Friends: distinct friends per restaurant.
  const friendsAt = new Map<string, Map<string, string>>();
  for (const v of input.friendVisits) {
    let m = friendsAt.get(v.restaurantId);
    if (!m) friendsAt.set(v.restaurantId, (m = new Map()));
    if (!m.has(v.friendId)) m.set(v.friendId, v.name);
  }

  const scored: Scored[] = [];
  for (let index = 0; index < restaurants.length; index++) {
    const r = restaurants[index];
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
    if (!(A > 0) && !(F > 0)) continue;

    const N = maxHood > 0 && r.neighborhood ? (hoodVisits.get(r.neighborhood) ?? 0) / maxHood : 0;
    const Q = qualityOf(r, plates[r.id]);
    const score =
      100 *
      (WEIGHTS.affinity * A + WEIGHTS.friends * F + WEIGHTS.quality * Q + WEIGHTS.neighborhood * N);
    scored.push({ r, index, score, A, F, N, friends: names });
  }

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
  const visited = visitedIds.size;
  const pickCount = effectiveLoves.size;
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
