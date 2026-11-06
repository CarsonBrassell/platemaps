/**
 * Profile traits: what a place serves, read from its menu profile, and how
 * alike two places are.
 *
 * The "For me" ranking (probe/for-me/PLAN.md, section 3) scores a candidate by
 * how close it is to the places the viewer has been. "Close" used to mean the
 * same cuisine label; it now also means the same dishes and the same kind of
 * service. This file is the pure half of that: normalize the raw dish terms,
 * weigh them by rarity, and compare two places. No database, no React; the
 * rows come from `getProfileTraitRows()` in lib/db.ts and the caller caches
 * them.
 *
 *   sim(a, b) = 0.55 D + 0.30 K + 0.15 V
 *
 *   D  IDF-weighted Jaccard of the normalized dish terms (tacos and burritos
 *      count for little, birria and gyoza for a lot).
 *   K  weighted Jaccard of cuisines: the main cuisine counts 1.0, each
 *      secondary 0.4.
 *   V  service style: 1 for the same, 0.5 for a neighbour (counter and
 *      fast casual), else 0.
 *
 * About a fifth of the listed places have no usable profile (no row, or a
 * "hold" row). They are imputed from their cuisine: D reads the cuisine's
 * centroid (its most characteristic dish terms among profiled places), K uses
 * the main cuisine alone, V is 0, and the whole similarity is scaled by 0.8.
 * An imputed place never reports shared dishes, so no reason line can claim
 * a menu overlap it did not have.
 *
 * Every constant here is a starting value with no ground truth behind it; the
 * check script pins the shape, not the numbers.
 */
import type { RestaurantView } from "@/data/restaurantTypes";

/* ---------- constants ---------- */

export const SIM_WEIGHTS = {
  dish: 0.55,
  cuisine: 0.3,
  service: 0.15,
} as const;

/** Multiplier on the whole similarity when either side is imputed. */
export const IMPUTED_FACTOR = 0.8;
/** Weight of a secondary cuisine inside K (the main cuisine is 1.0). */
export const SECONDARY_CUISINE_WEIGHT = 0.4;
/** Dish terms a cuisine centroid keeps. */
export const CENTROID_TERMS = 8;
/** A cuisine needs this many profiled places before it gets a centroid. */
export const MIN_CENTROID_PROFILES = 3;
/** V for services that are neighbours but not the same. */
export const NEAR_SERVICE_SCORE = 0.5;

/* ---------- row shape ---------- */

/**
 * One usable (status = 'ok') row of restaurant_profiles, as
 * `getProfileTraitRows()` returns it. `dishTypes` is the raw, lowercase,
 * plural-noun list from the enrichment (most central first); `service` is the
 * profile's `service` field.
 */
export type ProfileTraitRow = {
  restaurantId: string;
  dishTypes: string[];
  service: string | null;
};

/** The three RestaurantView fields the traits need. */
export type TraitPlace = Pick<RestaurantView, "id" | "cuisine" | "cuisineSecondary">;

/* ---------- normalizing dish terms ---------- */

/**
 * Menu-structure words, not dishes. They would match half the corpus and say
 * nothing, so they are dropped rather than down-weighted. Compared after
 * stemming, so "appetizers" and "entrees" are covered by the singular.
 */
const GENERIC_TERMS: ReadonlySet<string> = new Set([
  "appetizer",
  "entree",
  "dessert",
  "side",
  "special",
  "beverage",
  "drink",
  "starter",
  "main",
  "main course",
  "main dish",
  "side dish",
  "combo",
  "combination",
  "plate",
  "platter",
  "combo plate",
  "combination plate",
  "small plate",
  "shared plate",
]);

/** Spelling variants that mean the same dish, applied after stemming. */
const SYNONYMS: ReadonlyMap<string, string> = new Map([
  ["french fry", "fry"],
  ["omelette", "omelet"],
  ["doughnut", "donut"],
  ["hamburger", "burger"],
  ["stirfry", "stir fry"],
  ["eggs benedict", "benedict"],
  ["chicken wing", "wing"],
  ["sub sandwich", "sub"],
]);

/** Plurals the suffix rules below would get wrong. */
const IRREGULAR_PLURALS: ReadonlyMap<string, string> = new Map([
  ["pies", "pie"],
  ["quiches", "quiche"],
  ["brioches", "brioche"],
  ["cliches", "cliche"],
]);

/**
 * Singular of the last word of a term. Suffix rules only, tuned to a menu
 * vocabulary: sandwiches, pastries, tomatoes, burritos, nachos. Words that end
 * in -ss, -us or -is are left alone (hummus, swiss). A trailing -ie becomes -y
 * so cookie and cookies, smoothie and smoothies land on the same key; the key
 * is internal, `termLabel` gives the form a person sees.
 */
function stemWord(w: string): string {
  const irregular = IRREGULAR_PLURALS.get(w);
  if (irregular) return irregular;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ie") && w.length > 4) return `${w.slice(0, -2)}y`;
  if (/(?:ch|sh|x|ss|zz)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (/(?:ss|us|is)$/.test(w)) return w;
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/**
 * One raw dish term to its comparison key, or null when nothing is left
 * (blank, or a generic menu-structure word). Lower-case, accents folded,
 * punctuation to spaces, last word singular, synonyms merged:
 * "Stir-Fries" and "stir fry" are one key, "phở" and "pho" are one key.
 */
export function normalizeDish(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const flat = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!flat) return null;
  const words = flat.split(" ");
  words[words.length - 1] = stemWord(words[words.length - 1]);
  const stemmed = words.join(" ");
  const key = SYNONYMS.get(stemmed) ?? stemmed;
  return GENERIC_TERMS.has(key) ? null : key;
}

/** A profile's dish list, normalized and de-duplicated, order kept. */
export function normalizeDishes(raws: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of raws ?? []) {
    const key = normalizeDish(raw);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/* ---------- service ---------- */

/** The profile's `service` vocabulary (enrich-2026-10-27/BRIEF.md), minus unknown. */
const SERVICES: ReadonlySet<string> = new Set([
  "full_service",
  "fast_casual",
  "counter",
  "cafe",
  "bakery",
  "bar",
  "brewery_winery",
  "food_truck",
  "market_deli",
  "fine_dining",
  "buffet",
]);

/** The service key, or null for unknown, blank or unrecognized values. */
export function normalizeService(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  return SERVICES.has(s) ? s : null;
}

const NEAR_SERVICES: ReadonlySet<string> = new Set([
  "counter|fast_casual",
  "bakery|cafe",
  "fine_dining|full_service",
  "bar|full_service",
]);

/**
 * V: 1 for the same service, 0.5 for a neighbour, 0 otherwise. A missing or
 * unknown service on either side is no evidence, so it scores 0 (two unknowns
 * are not "the same style").
 */
export function serviceMatch(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return NEAR_SERVICES.has(a < b ? `${a}|${b}` : `${b}|${a}`) ? NEAR_SERVICE_SCORE : 0;
}

/* ---------- idf ---------- */

/**
 * idf = ln(N / df) over a set of documents (each a de-duplicated term list).
 * A term in every document weighs 0; a term in one weighs ln(N).
 */
export function computeIdf(docs: readonly (readonly string[])[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) for (const t of doc) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(n / d));
  return idf;
}

/* ---------- the index ---------- */

export type PlaceTraits = {
  id: string;
  /** Normalized dish terms, most central first. For an imputed place: its cuisine's centroid. */
  dishes: readonly string[];
  /** idf of each entry of `dishes`, same order. */
  dishWeights: readonly number[];
  /** Sum of `dishWeights`. */
  dishMass: number;
  dishSet: ReadonlySet<string>;
  /** Cuisine to weight: the main cuisine 1.0, each secondary 0.4 (imputed: main only). */
  cuisines: ReadonlyMap<string, number>;
  /** Normalized service key, null when unknown. */
  service: string | null;
  /** No usable profile: dishes come from the cuisine centroid, service is unknown. */
  imputed: boolean;
  /** Nothing to compare on (no cuisine, no profile): similarity to anything is 0. */
  empty: boolean;
};

export type TraitIndex = {
  /** Places with a usable profile; the N in idf = ln(N / df). */
  profiled: number;
  places: ReadonlyMap<string, PlaceTraits>;
  idf: ReadonlyMap<string, number>;
  /** Main cuisine to its characteristic dish terms. */
  centroids: ReadonlyMap<string, readonly string[]>;
  /** Normalized key to the form a person sees ("sandwiches", "pho"). */
  labels: ReadonlyMap<string, string>;
};

/**
 * Builds the idf table, the cuisine centroids and one PlaceTraits per place.
 * `places` is the whole listed corpus (not a filtered page): the idf and the
 * centroids are only meaningful over every place. Rows for ids that are not in
 * `places` are ignored. A row whose terms all normalize away (only generics)
 * counts as no profile.
 *
 * With no rows at all (table missing, query failed) every place is imputed from
 * its cuisine alone; `similarity` then degrades to scaled cuisine overlap.
 */
export function buildTraitIndex(
  places: readonly TraitPlace[],
  rows: readonly ProfileTraitRow[],
): TraitIndex {
  const byId = new Map<string, TraitPlace>();
  for (const p of places) byId.set(p.id, p);

  // 1. Usable profiles, and the commonest raw spelling of each key for display.
  const profiles = new Map<string, { dishes: string[]; service: string | null }>();
  const spellings = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!byId.has(row.restaurantId) || profiles.has(row.restaurantId)) continue;
    const dishes = normalizeDishes(row.dishTypes);
    if (dishes.length === 0) continue;
    profiles.set(row.restaurantId, { dishes, service: normalizeService(row.service) });
    for (const raw of row.dishTypes) {
      const key = normalizeDish(raw);
      if (!key) continue;
      const shown = raw.trim().toLowerCase();
      let m = spellings.get(key);
      if (!m) spellings.set(key, (m = new Map()));
      m.set(shown, (m.get(shown) ?? 0) + 1);
    }
  }

  // 2. idf over the usable profiles.
  const idf = computeIdf([...profiles.values()].map((p) => p.dishes));
  const unseenIdf = Math.log(Math.max(2, profiles.size));
  const weightOf = (t: string) => idf.get(t) ?? unseenIdf;

  // 3. Cuisine centroids: per main cuisine, the terms with the highest
  //    (profiles of that cuisine using the term) x idf. Frequent AND distinctive.
  const perCuisine = new Map<string, { n: number; counts: Map<string, number> }>();
  for (const [id, prof] of profiles) {
    const cuisine = byId.get(id)?.cuisine;
    if (!cuisine) continue;
    let c = perCuisine.get(cuisine);
    if (!c) perCuisine.set(cuisine, (c = { n: 0, counts: new Map() }));
    c.n++;
    for (const t of prof.dishes) c.counts.set(t, (c.counts.get(t) ?? 0) + 1);
  }
  const centroids = new Map<string, readonly string[]>();
  for (const [cuisine, c] of perCuisine) {
    if (c.n < MIN_CENTROID_PROFILES) continue;
    const ranked = [...c.counts]
      .map(([t, count]) => ({ t, s: count * weightOf(t) }))
      .sort((a, b) => b.s - a.s || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    centroids.set(cuisine, ranked.slice(0, CENTROID_TERMS).map((x) => x.t));
  }

  // 4. One PlaceTraits per place.
  const out = new Map<string, PlaceTraits>();
  for (const p of places) {
    const prof = profiles.get(p.id);
    const cuisines = new Map<string, number>();
    if (p.cuisine) cuisines.set(p.cuisine, 1);
    if (prof) {
      for (const s of p.cuisineSecondary ?? []) {
        if (s && !cuisines.has(s)) cuisines.set(s, SECONDARY_CUISINE_WEIGHT);
      }
    }
    const dishes: readonly string[] = prof
      ? prof.dishes
      : p.cuisine
        ? (centroids.get(p.cuisine) ?? [])
        : [];
    const dishWeights = dishes.map(weightOf);
    out.set(p.id, {
      id: p.id,
      dishes,
      dishWeights,
      dishMass: dishWeights.reduce((s, w) => s + w, 0),
      dishSet: new Set(dishes),
      cuisines,
      service: prof ? prof.service : null,
      imputed: !prof,
      empty: dishes.length === 0 && cuisines.size === 0,
    });
  }

  // Display labels: the commonest raw spelling, ties to the shorter then alphabetical.
  const labels = new Map<string, string>();
  for (const [key, m] of spellings) {
    let best = key;
    let bestN = -1;
    for (const [shown, n] of m) {
      if (
        n > bestN ||
        (n === bestN && (shown.length < best.length || (shown.length === best.length && shown < best)))
      ) {
        best = shown;
        bestN = n;
      }
    }
    labels.set(key, best);
  }

  return { profiled: profiles.size, places: out, idf, centroids, labels };
}

/*
 * Memo keyed on the identity of both inputs: the corpus array is replaced when
 * it refreshes and the rows array when their own cache expires, so a new copy
 * of either simply builds a new index and the old one is collected with it.
 */
const memo = new WeakMap<object, WeakMap<object, TraitIndex>>();

/** `buildTraitIndex`, built once per (corpus, rows) pair. */
export function traitIndexFor(
  places: readonly TraitPlace[],
  rows: readonly ProfileTraitRow[],
): TraitIndex {
  let byRows = memo.get(places);
  if (!byRows) memo.set(places, (byRows = new WeakMap()));
  let index = byRows.get(rows);
  if (!index) byRows.set(rows, (index = buildTraitIndex(places, rows)));
  return index;
}

/** The traits of one place, or undefined when it is not in the indexed corpus. */
export function traitsOf(index: TraitIndex, id: string): PlaceTraits | undefined {
  return index.places.get(id);
}

/** What a person reads for a normalized key: "sandwiches", "pho". Unseen keys read as themselves. */
export function termLabel(index: TraitIndex, term: string): string {
  return index.labels.get(term) ?? term;
}

/**
 * A stable key for "the same menu": the sorted dish terms of a profiled place.
 * An imputed place gets a key of its own, so places that merely share a cuisine
 * centroid are never mistaken for chain branches on one menu.
 */
export function dishSetKey(t: PlaceTraits): string {
  return t.imputed ? `imputed:${t.id}` : [...t.dishes].sort().join("|");
}

/* ---------- similarity ---------- */

export type Similarity = {
  /** 0..1 */
  score: number;
  dish: number;
  cuisine: number;
  service: number;
  /** Either side lacked a usable profile; the score carries the 0.8 factor. */
  imputed: boolean;
  /** Dish terms both profiles list, rarest first. Always empty when imputed. */
  shared: string[];
  /** Cuisines both places carry, the viewer-facing ones first (main on either side). */
  sharedCuisines: string[];
};

function dishOverlap(a: PlaceTraits, b: PlaceTraits): number {
  if (a.dishes.length === 0 || b.dishes.length === 0) return 0;
  // Walk the shorter list; callers hand the pair in a canonical order, so the
  // same pair always sums in the same order.
  const small = a.dishes.length <= b.dishes.length ? a : b;
  const big = small === a ? b : a;
  let inter = 0;
  for (let i = 0; i < small.dishes.length; i++) {
    if (big.dishSet.has(small.dishes[i])) inter += small.dishWeights[i];
  }
  const union = a.dishMass + b.dishMass - inter;
  return union > 0 ? inter / union : 0;
}

function cuisineOverlap(a: PlaceTraits, b: PlaceTraits): number {
  let lo = 0;
  let hi = 0;
  for (const [c, wa] of a.cuisines) {
    const wb = b.cuisines.get(c) ?? 0;
    lo += wa < wb ? wa : wb;
    hi += wa > wb ? wa : wb;
  }
  for (const [c, wb] of b.cuisines) if (!a.cuisines.has(c)) hi += wb;
  return hi > 0 ? lo / hi : 0;
}

/**
 * sim(a, b) in 0..1. Symmetric, and 1 for a place with itself (unless it has
 * nothing to compare on). Either side imputed: V is 0 and the score is scaled
 * by IMPUTED_FACTOR. That pulls imputed places down on average (about 0.30
 * against 0.38 for same-cuisine pairs on the live corpus) but not on every
 * pair: a centroid is a typical menu, so it can out-match a profiled place
 * with an unusual one. The ceiling is firm: an imputed place cannot pass
 * 0.8 * (0.55 + 0.30) = 0.68.
 */
export function similarity(a: PlaceTraits, b: PlaceTraits): number {
  if (a.id === b.id) return a.empty ? 0 : 1;
  if (a.id > b.id) return similarity(b, a);
  const imputed = a.imputed || b.imputed;
  const v = imputed ? 0 : serviceMatch(a.service, b.service);
  const s =
    SIM_WEIGHTS.dish * dishOverlap(a, b) +
    SIM_WEIGHTS.cuisine * cuisineOverlap(a, b) +
    SIM_WEIGHTS.service * v;
  return imputed ? s * IMPUTED_FACTOR : s;
}

/**
 * The same number as `similarity` with its parts and the terms behind it, for
 * building a reason line. Slower (allocates); use it on the few places that are
 * shown, not on every candidate.
 */
export function similarityParts(index: TraitIndex, a: PlaceTraits, b: PlaceTraits): Similarity {
  const imputed = a.imputed || b.imputed;
  const [x, y] = a.id <= b.id ? [a, b] : [b, a];
  const same = a.id === b.id;
  const dish = same ? (a.empty ? 0 : 1) : dishOverlap(x, y);
  const cuisine = same ? (a.empty ? 0 : 1) : cuisineOverlap(x, y);
  const service = imputed ? 0 : same ? 1 : serviceMatch(a.service, b.service);

  const shared: string[] = [];
  if (!imputed) {
    for (const t of a.dishes) if (b.dishSet.has(t)) shared.push(t);
    shared.sort(
      (p, q) =>
        (index.idf.get(q) ?? 0) - (index.idf.get(p) ?? 0) || (p < q ? -1 : p > q ? 1 : 0),
    );
  }
  const sharedCuisines: string[] = [];
  for (const c of a.cuisines.keys()) if (b.cuisines.has(c)) sharedCuisines.push(c);
  sharedCuisines.sort((p, q) => {
    const wp = Math.max(a.cuisines.get(p) ?? 0, b.cuisines.get(p) ?? 0);
    const wq = Math.max(a.cuisines.get(q) ?? 0, b.cuisines.get(q) ?? 0);
    return wq - wp || (p < q ? -1 : p > q ? 1 : 0);
  });

  return {
    score: similarity(a, b),
    dish,
    cuisine,
    service,
    imputed,
    shared,
    sharedCuisines,
  };
}
