import { parsePrice } from "@/data/priceBands";
import type { RestaurantView } from "@/data/restaurantTypes";
import { milesBetween } from "@/lib/geo";
import type { PlateScore } from "@/lib/plateScore";
import {
  budgetOf,
  budgetPoints,
  chainKey,
  distanceFactor,
  priceFit,
  qualityFloor,
  radiusOf,
  shortPlaceName,
  shrunkRating,
  type FullTastePrefs,
  type TastePick,
} from "@/lib/taste";

/**
 * Dish-level picks for Your taste: new places that serve what the viewer's own
 * posts say they eat.
 *
 * Pure: the data comes in as arguments (`lib/db.ts` reads it, `loadDishIndex` in
 * lib/dishIndex.ts caches it), so the tests feed it fixtures and the route owns
 * every read. Personal, like the rest of Your taste: use it only inside a
 * private, uncached response.
 *
 * What counts as the viewer's taste is what they chose to post: the dish they
 * named, the restaurant, its cuisine, the plate's price. Their ratings, likes,
 * hearts, upvotes and saves never enter, and a missing input is neutral.
 *
 * How a place scores:
 * - Each posted dish is a seed. Its terms (words and word pairs from the dish
 *   name, and from the menu's own description of it) are weighed by how rare
 *   they are across restaurants, so "hot honey" says something and "chicken"
 *   does not. A newer post weighs more, down to a floor, and a term the viewer
 *   keeps coming back to weighs a little more.
 * - A candidate place matches a seed when one of its menu items shares a
 *   telling name term with it. M is the best such match, plus a quarter of the
 *   next one from a different seed and dish.
 * - Score is g * (100 * (0.45 M D + 0.20 C D + 0.35 Q) + budget):
 *   C the share of the viewer's history in the place's cuisine, Q its
 *   rating, D the distance factor from the middle of where they post, g the
 *   soft floor on a low rating.
 * - Places they posted at, marked been or hid, and every branch of their
 *   chains, are never picked.
 */

export const DISH_TASTE = {
  /** Half-life of a post's weight, in days, and the least it falls to. */
  halfLifeDays: 120,
  weightFloor: 0.4,
  /** A term served by more than this share of restaurants, or fewer than `minDf`, says nothing. */
  maxDfShare: 0.12,
  minDf: 3,
  minIdf: 1.5,
  /** A name term must be at least this rare to make a match; a single shared term must clear `loneIdf`. */
  hitIdf: 3,
  loneIdf: 4,
  /** A match on one word and nothing else counts this much of a full one. */
  loneHit: 0.6,
  /** A seed whose own terms are this weak falls back to its place's styles. */
  weakSeedIdf: 3.5,
  descWeight: 0.5,
  styleWeight: 0.7,
  /** A match through a place's styles (no dish) counts a little less than a dish. */
  styleHit: 0.85,
  drinkHit: 0.7,
  gate: 0.4,
  wM: 0.45,
  wC: 0.2,
  wQ: 0.35,
  /** C is the cuisine's share of history over this, capped at 1. */
  cuisineFull: 0.25,
  unratedQ: 0.3,
  minQ: 0.4,
  minD: 0.5,
  /** Never farther than this many times the viewer's range, nor under `minCapMiles`. */
  capRadii: 2,
  minCapMiles: 12,
  minSeeds: 3,
  limit: 12,
  perCuisine: 4,
  perSeed: 2,
  perDrinks: 2,
  textChars: 96,
  shortChars: 56,
} as const;

/** One menu item as the loader reads it. */
export type DishRow = {
  rid: string;
  name: string;
  description: string | null;
  price: string | number | null;
  section: string | null;
};

/** What a place's menu profile says: its service styles and dish types, and its median price. */
export type ProfileRow = {
  rid: string;
  styles: readonly string[];
  dishTypes: readonly string[];
  median: number | null;
};

/** One of the viewer's posts, with the menu's own line for the dish when the loader found it. */
export type ViewerPost = {
  restaurantId: string;
  dishName: string | null;
  /** The name the post carries, for a place that has left the corpus. */
  restaurantName?: string | null;
  /** Epoch milliseconds. */
  at: number;
  price: string | null;
  dishDescription: string | null;
  dishSection: string | null;
};

/* ---------- text ---------- */

const STOP = new Set(
  (
    "and with or the a an of in on to for from your our you served choice house made fresh topped over comes come " +
    "two three one side extra add w per each any all can its it is are as at by plus style number combo special " +
    "plate platter classic original signature meal build create"
  ).split(" "),
);

const SYNONYMS: Record<string, string> = {
  parmigiana: "parm",
  parmagiana: "parm",
  parmigiano: "parm",
};

const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[®™©]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Light stemming: plurals only, so "wings" and "wing" meet and "glass" stays. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * The words and adjacent word pairs of a dish name or description, folded and
 * stemmed. A pair never spans a comma, bracket or other break, so "ribs, slaw"
 * does not make "rib slaw".
 */
export function termsOf(text: string): string[] {
  const out = new Set<string>();
  for (const segment of text.split(/[,.;:()|+\n]+/)) {
    const kept = fold(segment)
      .split(" ")
      .filter(Boolean)
      .map((w) => {
        const t = SYNONYMS[w] ?? stem(w);
        return t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t) ? t : "";
      });
    for (let i = 0; i < kept.length; i++) {
      if (!kept[i]) continue;
      out.add(kept[i]);
      if (kept[i + 1]) out.add(`${kept[i]} ${kept[i + 1]}`);
    }
  }
  return [...out];
}

/** 30 bits of FNV-1a: terms are kept as numbers, since a menu corpus has millions of them. */
function termId(term: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < term.length; i++) {
    h ^= term.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 2;
}

const SIDE_SECTION = /\b(sides?|extras?|add ?ons?|toppings?|condiments?|kids?|dips?|sauces?)\b/;
const SIDE_NAME = /^(side|extra|add|additional|sub|substitute|no |upgrade)\b|\bside of\b/;
const DRINK_SECTION =
  /drink|beverage|coffee|tea\b|espresso|smoothie|juice|refresher|latte|beer|wine|cocktail|soda|shake|bar menu/;
const DRINK_NAME =
  /\b(latte|matcha|refresher|coffee|tea|lemonade|smoothie|cold brew|espresso|cappuccino|juice|mocha|americano|soda|agua fresca|horchata|wine|ipa|lager|stout|cabernet|merlot|chardonnay|pinot|syrah|sauvignon|prosecco|champagne)\b/;

const FOOD = 0;
const DRINK = 1;
const kindOf = (name: string, section: string): number =>
  DRINK_SECTION.test(section) || DRINK_NAME.test(name) ? DRINK : FOOD;

const priceOf = (p: string | number | null | undefined): number | null => {
  if (p == null) return null;
  const v = parsePrice(String(p));
  return v != null && v < 400 ? v : null;
};

/* ---------- the index ---------- */

/**
 * What every listed place's menu says, boiled down to what matching needs and
 * shared by every viewer: which items carry which rare terms. The same for
 * everyone, so it is cached by the loader and nothing in it is personal.
 */
export type DishIndex = {
  rids: readonly string[];
  ridIndex: ReadonlyMap<string, number>;
  /** idf of every term that passed the df filters; any other term is absent. */
  idf: ReadonlyMap<number, number>;
  itemRid: Int32Array;
  itemKind: Uint8Array;
  itemPrice: Float32Array;
  itemName: readonly string[];
  /** term -> [start, end) in `postings`; each posting is `(item << 1) | inName`. */
  spans: ReadonlyMap<number, readonly [number, number]>;
  postings: Int32Array;
  /** The styles and dish types of each place, as term ids, and term -> places that have it. */
  styleSets: ReadonlyMap<number, ReadonlySet<number>>;
  styleSpans: ReadonlyMap<number, readonly number[]>;
  styles: ReadonlyMap<number, readonly string[]>;
  median: ReadonlyMap<number, number>;
};

export type DishIndexBuilder = {
  add(rows: readonly DishRow[]): void;
  finish(profiles: readonly ProfileRow[]): DishIndex;
};

/**
 * Builds the index from menu rows fed in pages (so no one query has to carry
 * the whole menu). Sides and add-ons are left out. A term is kept when 3 or
 * more places serve it and under `maxDfShare` of places do.
 */
export function createDishIndexBuilder(restaurantIds: readonly string[]): DishIndexBuilder {
  const c = DISH_TASTE;
  const ridIndex = new Map<string, number>();
  restaurantIds.forEach((id, i) => ridIndex.set(id, i));

  const itemRid: number[] = [];
  const itemKind: number[] = [];
  const itemPrice: number[] = [];
  const itemName: string[] = [];
  // Per item: (term << 1) | inName. Dropped once the postings are built.
  let itemTerms: Int32Array[] = [];

  return {
    add(rows) {
      for (const d of rows) {
        const rid = ridIndex.get(d.rid);
        const name = fold(d.name ?? "");
        const section = fold(d.section ?? "");
        if (rid === undefined || !name || SIDE_SECTION.test(section) || SIDE_NAME.test(name)) continue;
        const t = new Map<number, number>();
        for (const x of termsOf(d.description ?? "")) t.set(termId(x), 0);
        for (const x of termsOf(d.name)) t.set(termId(x), 1);
        const packed = new Int32Array(t.size);
        let i = 0;
        for (const [id, inName] of t) packed[i++] = (id << 1) | inName;
        itemRid.push(rid);
        itemKind.push(kindOf(name, section));
        const price = priceOf(d.price);
        itemPrice.push(price ?? 0);
        itemName.push(d.name);
        itemTerms.push(packed);
      }
    },

    finish(profiles) {
      const n = itemRid.length;
      const styleSets = new Map<number, Set<number>>();
      const styles = new Map<number, string[]>();
      const median = new Map<number, number>();
      for (const p of profiles) {
        const rid = ridIndex.get(p.rid);
        if (rid === undefined) continue;
        const set = new Set<number>();
        for (const x of [...p.styles, ...p.dishTypes]) for (const y of termsOf(x)) set.add(termId(y));
        styleSets.set(rid, set);
        styles.set(rid, [...p.styles]);
        if (p.median != null && Number.isFinite(p.median) && p.median > 0) median.set(rid, p.median);
      }

      // Document frequency over restaurants: an item's terms and the place's styles, each once per place.
      const first = new Int32Array(restaurantIds.length + 1);
      for (let i = 0; i < n; i++) first[itemRid[i] + 1]++;
      for (let r = 0; r < restaurantIds.length; r++) first[r + 1] += first[r];
      const order = new Int32Array(n);
      const cursor = first.slice(0, restaurantIds.length);
      for (let i = 0; i < n; i++) order[cursor[itemRid[i]]++] = i;

      const df = new Map<number, number>();
      let places = 0;
      for (let r = 0; r < restaurantIds.length; r++) {
        const seen = new Set<number>(styleSets.get(r));
        for (let k = first[r]; k < first[r + 1]; k++) for (const p of itemTerms[order[k]]) seen.add(p >>> 1);
        if (seen.size === 0) continue;
        places++;
        for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
      }

      const idf = new Map<number, number>();
      for (const [t, d] of df) {
        if (d < c.minDf || d / places > c.maxDfShare) continue;
        const v = Math.log(places / d);
        if (v >= c.minIdf) idf.set(t, v);
      }

      // Postings for the terms that count, packed into one array.
      const count = new Map<number, number>();
      for (let i = 0; i < n; i++) for (const p of itemTerms[i]) if (idf.has(p >>> 1)) count.set(p >>> 1, (count.get(p >>> 1) ?? 0) + 1);
      const spans = new Map<number, readonly [number, number]>();
      let total = 0;
      const fill = new Map<number, number>();
      for (const [t, k] of count) {
        spans.set(t, [total, total + k]);
        fill.set(t, total);
        total += k;
      }
      const postings = new Int32Array(total);
      for (let i = 0; i < n; i++) {
        for (const p of itemTerms[i]) {
          const t = p >>> 1;
          const at = fill.get(t);
          if (at === undefined) continue;
          postings[at] = (i << 1) | (p & 1);
          fill.set(t, at + 1);
        }
      }
      itemTerms = [];

      const styleSpans = new Map<number, number[]>();
      for (const [rid, set] of styleSets) {
        for (const t of set) {
          if (!idf.has(t)) continue;
          const list = styleSpans.get(t);
          if (list) list.push(rid);
          else styleSpans.set(t, [rid]);
        }
      }

      return {
        rids: restaurantIds,
        ridIndex,
        idf,
        itemRid: Int32Array.from(itemRid),
        itemKind: Uint8Array.from(itemKind),
        itemPrice: Float32Array.from(itemPrice),
        itemName,
        spans,
        postings,
        styleSets,
        styleSpans,
        styles,
        median,
      };
    },
  };
}

/** The index built in one go, for tests and small corpora. */
export function buildDishIndex(
  restaurantIds: readonly string[],
  dishes: readonly DishRow[],
  profiles: readonly ProfileRow[],
): DishIndex {
  const b = createDishIndexBuilder(restaurantIds);
  b.add(dishes);
  return b.finish(profiles);
}

/* ---------- seeds ---------- */

type Seed = {
  dish: string;
  place: string;
  kind: number;
  /** Recency weight, `weightFloor` to 1. */
  w: number;
  /** term -> weight (1 for the dish name, descWeight for its description, styleWeight for a style). */
  terms: Map<string, number>;
  /** Terms from the dish's own name (or the place's styles): the ones a match must share. */
  core: Set<string>;
  placeLevel: boolean;
};

const DAY_MS = 86_400_000;

function recency(at: number, now: number): number {
  const days = Math.max(0, (now - at) / DAY_MS);
  return Math.max(DISH_TASTE.weightFloor, 0.5 ** (days / DISH_TASTE.halfLifeDays));
}

/** A hit: how well one place's item (or, with no item, its styles) matches one seed. */
type Hit = { seed: number; v: number; item: string; price: number | null; term: string; style: boolean };

const DRINKY = /coffee|tea|bakery|dessert|juice|smoothie|boba/i;

/** "Pasta (GF)", "12. Bucatini" read as "Pasta", "Bucatini". */
function cleanItem(name: string): string {
  return name
    .replace(/\([^)]*\)/g, "")
    .replace(/^[A-Za-z]{0,2}\d+[.)]\s*/, "")
    .replace(/\b(GF|DF|VG|V)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[-,&+]$/, "")
    .trim();
}

function clip(text: string, max: number): string {
  const t = text.normalize("NFC");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function reasonOf(hit: Hit | null, seeds: readonly Seed[], cuisine: string | null): TastePick["reason"] {
  const c = DISH_TASTE;
  if (!hit) {
    const text = `${cuisine}, a cuisine you eat`;
    return { kind: "cuisine", text: clip(text, c.textChars), short: clip(text, c.shortChars) };
  }
  const s = seeds[hit.seed];
  const place = shortPlaceName(s.place);
  if (hit.style) {
    const text = `Known for ${hit.term} — like ${place}`;
    return { kind: "style", text: clip(text, c.textChars), short: clip(text, c.shortChars) };
  }
  const item = cleanItem(hit.item);
  const text = s.placeLevel ? `${item} — like ${place}` : `${item} — like your ${s.dish} at ${place}`;
  return {
    kind: "dish",
    text: clip(text, c.textChars),
    short: clip(`${item} — like your ${s.dish}`, c.shortChars),
  };
}

/* ---------- ranking ---------- */

export type DishRankInput = {
  index: DishIndex;
  restaurants: readonly RestaurantView[];
  plates: Readonly<Record<string, PlateScore>>;
  /** C for the shrunk rating (`Corpus.ratingMean`). */
  ratingMean: number | null;
  posts: readonly ViewerPost[];
  prefs: FullTastePrefs;
  /** Epoch milliseconds; a parameter so a run is repeatable. */
  now: number;
  limit?: number;
};

type Cand = {
  r: RestaurantView;
  hit: Hit | null;
  score: number;
};

/**
 * The viewer's picks, best first, or null when there is not enough to go on
 * (under `minSeeds` posted dishes the caller keeps its ordinary picks).
 */
export function rankDishes(input: DishRankInput): TastePick[] | null {
  const c = DISH_TASTE;
  const { index, restaurants, posts, prefs, now } = input;
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const idfOf = (term: string): number => index.idf.get(termId(term)) ?? 0;

  const seeds: Seed[] = [];
  for (const p of posts) {
    if (!p.dishName) continue;
    const place = byId.get(p.restaurantId);
    const rid = index.ridIndex.get(p.restaurantId);
    const name = fold(p.dishName);
    const own = new Set(fold(place?.name ?? "").split(" ").map(stem));
    // A term that is only the place's own name ("Pho Hoa" for a pho dish at Pho Hoa) says nothing about the dish.
    const usable = (x: string) => idfOf(x) > 0 && !x.split(" ").every((w) => own.has(w));
    const terms = new Map<string, number>();
    const desc = termsOf(p.dishDescription ?? "")
      .filter(usable)
      .sort((a, b) => idfOf(b) - idfOf(a))
      .slice(0, 4);
    for (const x of desc) terms.set(x, c.descWeight);
    const core = new Set<string>();
    for (const x of termsOf(p.dishName)) {
      if (!usable(x)) continue;
      terms.set(x, 1);
      core.add(x);
    }
    let strength = 0;
    for (const [x, w] of terms) strength += idfOf(x) * w;
    let placeLevel = false;
    if (strength < c.weakSeedIdf && rid !== undefined) {
      // The dish says little (a house special, a plain "burger"): borrow what the place is known for.
      const known = new Set<string>();
      for (const s of index.styles.get(rid) ?? []) for (const y of termsOf(s)) known.add(y);
      const top = [...known]
        .filter((x) => idfOf(x) >= c.weakSeedIdf && !x.includes(" "))
        .sort((a, b) => idfOf(b) - idfOf(a))
        .slice(0, 2);
      for (const x of top) {
        terms.set(x, c.styleWeight);
        core.add(x);
      }
      placeLevel = top.length > 0;
    }
    seeds.push({
      dish: p.dishName,
      place: place?.name ?? p.restaurantName ?? "",
      kind: kindOf(name, fold(p.dishSection ?? "")),
      w: recency(p.at, now),
      terms,
      core,
      placeLevel,
    });
  }
  if (seeds.length < c.minSeeds) return null;

  // A term the viewer keeps ordering counts for more, up to +80%.
  const shared = new Map<string, number>();
  for (const s of seeds) for (const x of s.terms.keys()) shared.set(x, (shared.get(x) ?? 0) + s.w);
  const strengthOf = (s: Seed, x: string): number =>
    idfOf(x) * (s.terms.get(x) ?? 0) * (1 + 0.4 * Math.min(2, (shared.get(x) ?? 0) - s.w));

  // Where the viewer posts: places, weights, cuisines, range and budget.
  type Visit = { last: number; days: Set<string> };
  const visits = new Map<string, Visit>();
  for (const p of posts) {
    const v = visits.get(p.restaurantId) ?? { last: 0, days: new Set<string>() };
    v.last = Math.max(v.last, p.at);
    v.days.add(new Date(p.at).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }));
    visits.set(p.restaurantId, v);
  }
  const cuisineWeight = new Map<string, number>();
  // Cuisines of places he actually posted at; secondary tags only tint the score.
  const eaten = new Set<string>();
  let cuisineTotal = 0;
  const bump = (cuisine: string, w: number) => {
    cuisineWeight.set(cuisine, (cuisineWeight.get(cuisine) ?? 0) + w);
    cuisineTotal += w;
  };
  for (const [id, v] of visits) {
    const r = byId.get(id);
    if (!r?.cuisine) continue;
    const w = recency(v.last, now) * Math.min(2, 1 + 0.5 * (v.days.size - 1));
    bump(r.cuisine, w);
    eaten.add(r.cuisine);
    for (const s of r.cuisineSecondary ?? []) bump(s, w * 0.4);
  }
  const cuisineAffinity = (cuisine: string | null): number =>
    cuisine && cuisineTotal > 0 ? Math.min(1, (cuisineWeight.get(cuisine) ?? 0) / cuisineTotal / c.cuisineFull) : 0;

  const plates = posts.map((p) => priceOf(p.price)).filter((v): v is number => v != null);
  const placeMedians: number[] = [];
  const history = [];
  for (const id of visits.keys()) {
    const rid = index.ridIndex.get(id);
    const m = rid === undefined ? undefined : index.median.get(rid);
    if (m !== undefined) placeMedians.push(m);
    const r = byId.get(id);
    if (r) history.push({ id: r.id, lat: r.lat, lng: r.lng });
  }
  const budget = budgetOf(plates, placeMedians);
  const radius = radiusOf(history);
  const capMiles = Math.max(c.minCapMiles, c.capRadii * radius.miles);

  // Never recommend what they have been to, or a branch of it.
  const seen = new Set<string>([...visits.keys(), ...prefs.been, ...prefs.hidden]);
  const skipped = new Set(prefs.skips);
  const seenChains = new Set<string>();
  for (const id of seen) {
    const r = byId.get(id);
    if (r) seenChains.add(chainKey(r));
  }

  // Match every seed against every item that shares one of its terms.
  const best = new Map<number, Hit[]>();
  const keep = (rid: number, hit: Hit) => {
    const list = best.get(rid) ?? [];
    const own = list.find((h) => h.seed === hit.seed);
    if (!own) list.push(hit);
    else if (hit.v > own.v && (!own.item || hit.item)) Object.assign(own, hit);
    best.set(rid, list);
  };
  seeds.forEach((s, si) => {
    let total = 0;
    for (const x of s.core) total += strengthOf(s, x);
    if (total <= 0) for (const x of s.terms.keys()) total += strengthOf(s, x);
    if (total <= 0) return;
    const acc = new Map<number, { v: number; shared: number; names: number; top: number; term: string; tv: number }>();
    const stylesAcc = new Map<number, { v: number; term: string; tv: number }>();
    for (const x of s.terms.keys()) {
      const tid = termId(x);
      const sw = strengthOf(s, x);
      const span = index.spans.get(tid);
      if (span) {
        for (let k = span[0]; k < span[1]; k++) {
          const posting = index.postings[k];
          const item = posting >> 1;
          const inName = (posting & 1) === 1;
          if (index.itemKind[item] !== s.kind) continue;
          if (s.placeLevel && !index.styleSets.get(index.itemRid[item])?.has(tid)) continue;
          const e = acc.get(item) ?? { v: 0, shared: 0, names: 0, top: 0, term: "", tv: 0 };
          e.v += sw * (inName ? 1 : c.descWeight);
          e.shared++;
          if (inName && s.core.has(x) && idfOf(x) >= c.hitIdf) {
            e.names++;
            e.top = Math.max(e.top, idfOf(x));
            if (sw > e.tv) {
              e.tv = sw;
              e.term = x;
            }
          }
          acc.set(item, e);
        }
      }
      for (const rid of index.styleSpans.get(tid) ?? []) {
        const e = stylesAcc.get(rid) ?? { v: 0, term: x, tv: 0 };
        e.v += sw * c.styleWeight;
        if (sw > e.tv) {
          e.tv = sw;
          e.term = x;
        }
        stylesAcc.set(rid, e);
      }
    }
    for (const [item, e] of acc) {
      // A lone shared word needs company: "naughty" alone is a brand's adjective, not a taste.
      if (e.names === 0 || (e.names === 1 && e.top < c.loneIdf)) continue;
      // "Bucatini or Rigatoni" is a choice line, not a dish he would recognise.
      if (e.names === 1 && /\bor\b/i.test(index.itemName[item])) continue;
      const price = index.itemPrice[item] > 0 ? index.itemPrice[item] : null;
      const lone = e.names === 1 && e.shared < 2 ? c.loneHit : 1;
      const v = Math.min(1, e.v / total) * s.w * lone * (s.kind === DRINK ? c.drinkHit : 1);
      keep(index.itemRid[item], { seed: si, v, item: index.itemName[item], price, term: e.term, style: false });
    }
    for (const [rid, e] of stylesAcc) {
      const v = Math.min(1, e.v / total) * s.w * c.styleHit * (s.kind === DRINK ? c.drinkHit : 1);
      keep(rid, { seed: si, v, item: "", price: null, term: e.term, style: true });
    }
  });

  const cands: { cand: Cand; M: number; Q: number; D: number; Cc: number }[] = [];
  for (const r of restaurants) {
    if (seen.has(r.id) || seenChains.has(chainKey(r)) || (r.cuisine && skipped.has(r.cuisine))) continue;
    const rid = index.ridIndex.get(r.id);
    const hits = (rid === undefined ? [] : (best.get(rid) ?? [])).slice().sort((a, b) => b.v - a.v);
    const h1 = hits[0] ?? null;
    const h2 = h1 ? hits.find((h) => h.seed !== h1.seed && h.item !== h1.item) : undefined;
    const M = Math.min(1, (h1?.v ?? 0) + 0.25 * (h2?.v ?? 0));
    const shrunk = shrunkRating(r.rating, r.reviewCount, input.ratingMean);
    const Q = shrunk == null ? c.unratedQ : Math.max(0, Math.min(1, (shrunk - 3.8) / 1.2));
    const g = qualityFloor(shrunk, r.rating, r.reviewCount);
    const miles = radius.anchor ? milesBetween(radius.anchor, { lat: r.lat, lng: r.lng }) : null;
    if (miles != null && miles > capMiles) continue;
    const D = miles == null ? 1 : distanceFactor(miles, radius.miles, radius.floor);
    const price = h1?.price ?? (rid === undefined ? null : (index.median.get(rid) ?? null));
    const bonus = budget && price ? budgetPoints(priceFit(price, budget), budget.conf) : 0;
    const Cc = cuisineAffinity(r.cuisine);
    const score = g * (100 * (c.wM * M * D + c.wC * Cc * D + c.wQ * Q) + bonus);
    cands.push({ cand: { r, hit: h1, score }, M, Q, D, Cc });
  }

  const drinkOk = (cand: Cand) =>
    !(cand.hit && seeds[cand.hit.seed].kind === DRINK && !DRINKY.test(cand.r.cuisine ?? ""));
  const matched = cands
    .filter((x) => x.M >= c.gate && x.D >= c.minD && x.Q >= c.minQ && drinkOk(x.cand))
    .map((x) => x.cand)
    .sort((a, b) => b.score - a.score);
  // Below the gate a match says nothing true, so these picks stand on cuisine alone.
  const fallback = cands
    .filter((x) => x.M < c.gate && x.Cc > 0 && x.cand.r.cuisine && eaten.has(x.cand.r.cuisine))
    .map((x): Cand => ({ ...x.cand, hit: null }))
    .sort((a, b) => b.score - a.score);

  const limit = input.limit ?? c.limit;
  const out: Cand[] = [];
  const chains = new Set<string>();
  const perCuisine = new Map<string, number>();
  const count = (pred: (x: Cand) => boolean) => out.filter(pred).length;
  const take = (pool: readonly Cand[]) => {
    for (const pass of [1, 2]) {
      for (const cand of pool) {
        if (out.length >= limit) return;
        if (out.includes(cand)) continue;
        const ck = chainKey(cand.r);
        const cuisine = cand.r.cuisine ?? "";
        if (chains.has(ck) || (perCuisine.get(cuisine) ?? 0) >= c.perCuisine) continue;
        const hit = cand.hit;
        if (hit) {
          if (count((o) => o.hit?.seed === hit.seed) >= (pass === 1 ? 1 : c.perSeed)) continue;
          const words = hit.term.split(" ");
          if (count((o) => o.hit != null && o.hit.term.split(" ").some((w) => words.includes(w))) >= c.perSeed) continue;
          if (seeds[hit.seed].kind === DRINK && count((o) => o.hit != null && seeds[o.hit.seed].kind === DRINK) >= c.perDrinks) continue;
        }
        chains.add(ck);
        perCuisine.set(cuisine, (perCuisine.get(cuisine) ?? 0) + 1);
        out.push(cand);
      }
    }
  };
  take(matched);
  take(fallback);

  return out
    .sort((a, b) => b.score - a.score)
    .map((x) => ({
      restaurant: x.r,
      plateScore: input.plates[x.r.id] ?? null,
      reason: reasonOf(x.hit, seeds, x.r.cuisine),
    }));
}
