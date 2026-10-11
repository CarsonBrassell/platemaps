/**
 * Taste match — how alike two people's plates are, by cuisine.
 *
 * Pure on purpose: no database, no React. `getTasteMatchForProfile` in lib/db.ts
 * fetches the rows and `TasteRadar` draws the result; everything that decides a
 * number lives here so `npm run tastematch:check` can pin it down.
 *
 * **Shares, not counts.** Each person's mix is the percent of *their own*
 * cuisine-tagged posts at each cuisine. Raw counts would let a heavy poster's
 * shape swamp a light poster's, and the match would mostly measure who posts
 * more.
 *
 * **The match is histogram overlap**: the sum, over every cuisine either person
 * has posted at, of min(yourShare, theirShare). Identical mixes score 100,
 * mixes with nothing in common score 0. It runs over all cuisines, not only the
 * drawn spokes — the radar is a picture of the top few, the number is about
 * everything.
 */

/** A person's posting history, already reduced to what the match needs. */
export type TasteInput = {
  /** Cuisine-tagged posts per cuisine. */
  counts: Record<string, number>;
  /** Per cuisine, the restaurant they posted at most (listed restaurants only,
   *  so the link can't land on a 404). */
  topPlaces: Record<string, { id: string; name: string; count: number }>;
};

export type TasteMatch = {
  /** Up to MAX_SPOKES cuisines, biggest combined share first. */
  spokes: string[];
  /** Percent (0–100) of the viewer's posts at each spoke, same order. */
  you: number[];
  /** Same for the friend. */
  them: number[];
  /** The chart's outer ring, in percent — rounded up so the shapes fill it. */
  axisMax: number;
  /** 0–100, whole number. */
  matchPct: number;
  /** The two cuisines where both shares are highest (min of the two). */
  bothLove: string[];
  /** The cuisine the friend over-indexes on most, and where they go for it. */
  tryPick: { cuisine: string; restaurantId: string; restaurantName: string } | null;
};

/** What the single-person "Your flavor profile" card needs. Same spokes, same
 *  shares, same ring as the two-person radar, just one series. */
export type FlavorProfile = {
  /** Up to MAX_SPOKES cuisines, biggest share first. */
  spokes: string[];
  /** Percent (0-100) of your posts at each spoke, same order. */
  you: number[];
  /** The chart's outer ring, in percent. */
  axisMax: number;
  /** Your three biggest cuisines, biggest first (always three: a profile
   *  needs at least three cuisines to exist). */
  topCuisines: string[];
  /** How many distinct cuisines you've posted at: all of them, not just the
   *  drawn spokes. */
  cuisineCount: number;
};

export const MAX_SPOKES = 8;
/** Below this many cuisine-tagged posts a person's mix is noise, not taste. */
export const MIN_POSTS = 3;
const MIN_SPOKES = 3;

function total(counts: Record<string, number>): number {
  let n = 0;
  for (const c of Object.values(counts)) n += c;
  return n;
}

/* Alphabetical tiebreak so equal shares can't reorder between renders. */
const byName = (a: { cuisine: string }, b: { cuisine: string }) =>
  a.cuisine.localeCompare(b.cuisine);

/** The chart's outer ring: the tallest drawn spoke rounded up to a 5, so the
 *  shapes fill the grid. Shared by both radars so they scale the same way. */
function axisMaxFor(peak: number): number {
  return Math.min(100, Math.max(10, Math.ceil(peak / 5) * 5));
}

/**
 * Null is the empty state: either person has too few cuisine-tagged posts, or
 * together they cover fewer than three cuisines (a radar needs a polygon).
 */
export function computeTasteMatch(you: TasteInput, them: TasteInput): TasteMatch | null {
  const youTotal = total(you.counts);
  const themTotal = total(them.counts);
  if (youTotal < MIN_POSTS || themTotal < MIN_POSTS) return null;

  const cuisines = [...new Set([...Object.keys(you.counts), ...Object.keys(them.counts)])];
  const rows = cuisines.map((cuisine) => {
    const y = ((you.counts[cuisine] ?? 0) / youTotal) * 100;
    const t = ((them.counts[cuisine] ?? 0) / themTotal) * 100;
    return { cuisine, y, t, shared: Math.min(y, t), gap: t - y };
  });

  const drawn = [...rows]
    .sort((a, b) => b.y + b.t - (a.y + a.t) || byName(a, b))
    .slice(0, MAX_SPOKES);
  if (drawn.length < MIN_SPOKES) return null;

  const matchPct = Math.round(rows.reduce((sum, r) => sum + r.shared, 0));

  const bothLove = rows
    .filter((r) => r.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.y + b.t - (a.y + a.t) || byName(a, b))
    .slice(0, 2)
    .map((r) => r.cuisine);

  /* Walk down the gaps until one has a restaurant to point at — a cuisine the
     friend loves only at an unlisted place would otherwise be a dead end. */
  let tryPick: TasteMatch["tryPick"] = null;
  const byGap = rows.filter((r) => r.gap > 0).sort((a, b) => b.gap - a.gap || b.t - a.t || byName(a, b));
  for (const r of byGap) {
    const place = them.topPlaces[r.cuisine];
    if (place) {
      tryPick = { cuisine: r.cuisine, restaurantId: place.id, restaurantName: place.name };
      break;
    }
  }

  const peak = Math.max(...drawn.map((r) => Math.max(r.y, r.t)));
  const axisMax = axisMaxFor(peak);

  return {
    spokes: drawn.map((r) => r.cuisine),
    you: drawn.map((r) => r.y),
    them: drawn.map((r) => r.t),
    axisMax,
    matchPct,
    bothLove,
    tryPick,
  };
}

/**
 * Your own cuisine mix, for the "Your flavor profile" card. Null is the empty
 * state, by the same two rules as `computeTasteMatch`: too few cuisine-tagged
 * posts, or fewer than three cuisines (a radar needs a polygon).
 */
export function computeFlavorProfile(input: TasteInput): FlavorProfile | null {
  const t = total(input.counts);
  if (t < MIN_POSTS) return null;

  const rows = Object.entries(input.counts)
    .filter(([, count]) => count > 0)
    .map(([cuisine, count]) => ({ cuisine, share: (count / t) * 100 }))
    .sort((a, b) => b.share - a.share || byName(a, b));
  if (rows.length < MIN_SPOKES) return null;

  const drawn = rows.slice(0, MAX_SPOKES);
  return {
    spokes: drawn.map((r) => r.cuisine),
    you: drawn.map((r) => r.share),
    axisMax: axisMaxFor(drawn[0].share),
    topCuisines: rows.slice(0, 3).map((r) => r.cuisine),
    cuisineCount: rows.length,
  };
}

/** One row of the grouped query: a person's posts at one restaurant. */
export type CuisineCountRow = {
  userId: string;
  cuisine: string;
  restaurantId: string;
  restaurantName: string;
  listed: boolean;
  count: number;
};

/** Folds the query's rows into one TasteInput for `userId`. */
export function tasteInputFor(rows: CuisineCountRow[], userId: string): TasteInput {
  const input: TasteInput = { counts: {}, topPlaces: {} };
  for (const r of rows) {
    if (r.userId !== userId) continue;
    input.counts[r.cuisine] = (input.counts[r.cuisine] ?? 0) + r.count;
    if (!r.listed) continue;
    const best = input.topPlaces[r.cuisine];
    /* Ties go to the lower id so the pick is stable across requests. */
    if (!best || r.count > best.count || (r.count === best.count && r.restaurantId < best.id)) {
      input.topPlaces[r.cuisine] = { id: r.restaurantId, name: r.restaurantName, count: r.count };
    }
  }
  return input;
}
