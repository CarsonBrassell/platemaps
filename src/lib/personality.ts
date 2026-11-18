/**
 * The food personality wheel: eight eater types around a circle, opposites
 * across from each other (Adventurer/Regular, Foodie/Quick Bite,
 * Wellness/Classic American, Sweet Tooth/Spice Chaser). Agreed with Calvin
 * 2026-11-17; the research and the tagging run are in
 * probe/for-me/personality/ and probe/RESUME.md (UPDATE 4-10).
 *
 * Where each spoke comes from:
 *  - Dish tags (AI read of every menu dish, table `dish_flavor`):
 *    s = Spice Chaser, w = Wellness, d = Sweet Tooth, c = Classic American.
 *    Pizza counts as Classic American, sweet drinks as Sweet Tooth; sushi,
 *    poke and juice are not Wellness.
 *  - Restaurant kind (table `restaurant_kind`): Quick Bite = counter-service
 *    visits; Foodie = visits to places on outside best-of lists (Michelin,
 *    James Beard, Eater, local critics) or upscale places.
 *  - The person's own log: Adventurer = cuisine variety, Regular = repeat
 *    visits to the same place.
 *
 * Every spoke is a lift against the average eater, shrunk toward average
 * with K pseudo-visits so three posts can't max a spoke, then drawn on a log
 * scale: average sits on the dashed ring, 2x average is 0.3 further out.
 * Pure functions only; the query lives in db.ts (`getFlavorProfile`).
 */

export const PERSONALITY_SPOKES = [
  "Adventurer",
  "Foodie",
  "Wellness",
  "Sweet Tooth",
  "Regular",
  "Quick Bite",
  "Classic American",
  "Spice Chaser",
] as const;
export type PersonalityType = (typeof PERSONALITY_SPOKES)[number];

/** Fewer posts than this and the card shows its empty state. */
export const PERSONALITY_MIN_POSTS = 3;
/** Pseudo-observations at the average rate added to every spoke. */
export const SHRINK_K = 5;
/** Radius of the average eater's ring, and of a spoke with lift 1. */
export const AVERAGE_RING = 0.4;
const PER_DOUBLING = 0.3;
const MIN_RADIUS = 0.06;

/**
 * The average eater, per spoke. Dish shares are occurrence-weighted across the
 * whole tagged corpus (probe/for-me/personality/me-scored.json `corpusShare`);
 * Quick Bite and Foodie are the share of live places of that kind (4,501 and
 * ~310 of 8,625). Adventurer and Regular have no corpus to measure against
 * yet, so they start from plain estimates: about one new cuisine per three
 * visits, about one visit in four a return.
 */
export const BASELINE: Record<PersonalityType, number> = {
  Adventurer: 0.35,
  Foodie: 0.036,
  Wellness: 0.076,
  "Sweet Tooth": 0.143,
  Regular: 0.25,
  "Quick Bite": 0.52,
  "Classic American": 0.153,
  "Spice Chaser": 0.034,
};

/** One post as the query returns it, already joined to its tag and place kind. */
export type PersonalityPost = {
  /** Dish tag letters from `dish_flavor` ("", "s", "cd" ...), null when the dish wasn't found or the post has no dish. */
  tag: string | null;
  hasDish: boolean;
  /** Stable key for the place: restaurant id, or the folded free-text name. */
  placeKey: string;
  /** Local day of the post, YYYY-MM-DD; same place + same day is one visit. */
  day: string;
  cuisine: string | null;
  kind: "q" | "t" | "u" | null;
  foodie: boolean;
};

export type PersonalityStats = {
  posts: number;
  dishPosts: number;
  tags: { s: number; w: number; d: number; c: number };
  visits: number;
  places: number;
  quickVisits: number;
  foodieVisits: number;
  cuisines: number;
};

export type PersonalityProfile = {
  spokes: PersonalityType[];
  /** Radius per spoke, 0..1, the same order as `spokes`. */
  you: number[];
  /** Lift against the average eater per spoke (1 = average). */
  lift: number[];
  /** Always 1: `you` is already a radius. Lets TasteRadar draw it unchanged. */
  axisMax: number;
  average: number;
  /** The one or two strongest types, the card's headline. */
  top: PersonalityType[];
  /** The weakest type. */
  least: PersonalityType;
  stats: PersonalityStats;
};

/** Same fold the tagging run used for its keys: lowercase, no accents, alphanumerics and single spaces. */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Exact key in `dish_flavor`: folded name, then the first 140 chars of the description folded and cut to 100. */
export function dishKey(name: string, description: string | null | undefined): string {
  return `${foldText(name)}|${foldText((description ?? "").slice(0, 140)).slice(0, 100)}`;
}

/** Fallback key: the name alone, stored only when its corpus variants agree on one tag at least 80% of the time. */
export function dishNameKey(name: string): string {
  return `${foldText(name)}|*`;
}

/** Folds the joined posts into counts. Visits are distinct place + day. */
export function personalityStats(posts: PersonalityPost[]): PersonalityStats {
  const tags = { s: 0, w: 0, d: 0, c: 0 };
  let dishPosts = 0;
  const visits = new Map<string, PersonalityPost>();
  const cuisines = new Set<string>();
  for (const p of posts) {
    if (p.hasDish) {
      dishPosts++;
      for (const ch of p.tag ?? "") if (ch in tags) tags[ch as keyof typeof tags]++;
    }
    if (p.cuisine) cuisines.add(p.cuisine);
    const v = `${p.placeKey}|${p.day}`;
    if (!visits.has(v)) visits.set(v, p);
  }
  const vs = [...visits.values()];
  return {
    posts: posts.length,
    dishPosts,
    tags,
    visits: vs.length,
    places: new Set(vs.map((v) => v.placeKey)).size,
    quickVisits: vs.filter((v) => v.kind === "q").length,
    foodieVisits: vs.filter((v) => v.foodie || v.kind === "u").length,
    cuisines: cuisines.size,
  };
}

function radius(lift: number): number {
  return Math.max(MIN_RADIUS, Math.min(1, AVERAGE_RING + PER_DOUBLING * Math.log2(lift)));
}

/** Shrunk lift: (hits + K*base) / (n + K), over base. n = 0 gives exactly average. */
function lift(hits: number, n: number, base: number): number {
  return (hits + SHRINK_K * base) / (n + SHRINK_K) / base;
}

/** Null is the empty state: too few posts to say anything. */
export function computePersonality(stats: PersonalityStats): PersonalityProfile | null {
  if (stats.posts < PERSONALITY_MIN_POSTS) return null;
  const { dishPosts: n, visits: v, tags } = stats;
  const hits: Record<PersonalityType, [number, number]> = {
    /* New cuisines per visit, capped by visits so a cuisine-less log can't go over. */
    Adventurer: [Math.min(stats.cuisines, v), v],
    Foodie: [stats.foodieVisits, v],
    Wellness: [tags.w, n],
    "Sweet Tooth": [tags.d, n],
    Regular: [v - stats.places, v],
    "Quick Bite": [stats.quickVisits, v],
    "Classic American": [tags.c, n],
    "Spice Chaser": [tags.s, n],
  };
  const lifts = PERSONALITY_SPOKES.map((s) => lift(hits[s][0], hits[s][1], BASELINE[s]));
  const order = PERSONALITY_SPOKES.map((s, i) => ({ s, l: lifts[i] })).sort(
    (a, b) => b.l - a.l || a.s.localeCompare(b.s),
  );
  /* A second headline type only when it is also well above average. */
  const top = [order[0].s];
  if (order[1].l >= 1.5 && order[1].l >= order[0].l * 0.7) top.push(order[1].s);
  return {
    spokes: [...PERSONALITY_SPOKES],
    you: lifts.map(radius),
    lift: lifts,
    axisMax: 1,
    average: AVERAGE_RING,
    top,
    least: order[order.length - 1].s,
    stats,
  };
}

/** "3.7x", "0.8x" — for the chart's text summary. */
export function formatLift(l: number): string {
  return `${l >= 10 ? Math.round(l) : l.toFixed(1)}x`;
}

/** A friend's wheel against yours, for the Taste match card on their profile. */
export type PersonalityComparison = {
  /** 0-100: 100 when the two shapes coincide, falling with the average gap between them. */
  similarity: number;
  /** Types both of you are well above average on, strongest shared first, at most three. */
  both: PersonalityType[];
  /** The type you two differ on most, when one of you is at least twice the other. */
  diff: { type: PersonalityType; you: number; them: number } | null;
};

/** Average radius gap at which similarity reaches 0; the gap from average to a 3x spoke is about 0.48. */
const SIMILARITY_ZERO_GAP = 0.5;
const SHARED_LIFT = 1.25;

export function comparePersonality(you: PersonalityProfile, them: PersonalityProfile): PersonalityComparison {
  const gap = you.you.reduce((sum, r, i) => sum + Math.abs(r - them.you[i]), 0) / you.you.length;
  const similarity = Math.max(0, Math.min(100, Math.round(100 * (1 - gap / SIMILARITY_ZERO_GAP))));
  const both = you.spokes
    .map((s, i) => ({ s, m: Math.min(you.lift[i], them.lift[i]) }))
    .filter((x) => x.m >= SHARED_LIFT)
    .sort((a, b) => b.m - a.m || a.s.localeCompare(b.s))
    .slice(0, 3)
    .map((x) => x.s);
  let diff: PersonalityComparison["diff"] = null;
  let widest = 1;
  you.spokes.forEach((s, i) => {
    const d = Math.abs(Math.log2(you.lift[i] / them.lift[i]));
    if (d >= widest) {
      widest = d;
      diff = { type: s, you: you.lift[i], them: them.lift[i] };
    }
  });
  return { similarity, both, diff };
}
