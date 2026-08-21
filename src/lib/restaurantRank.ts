/**
 * Ranked matching over the restaurant list.
 *
 * Matches name, cuisine and neighbourhood so "thai", "little italy" and
 * "landini" all land somewhere. Ranked so a name match beats a cuisine match
 * — typing "pizza" should reach Bronx Pizza before every pizzeria in the city.
 *
 * Callers rank whatever the server sent for *this* query rather than the whole
 * city. `/api/restaurants?q=` narrows on the same three fields, so the ordering
 * below is unchanged — it just never needs the corpus in the browser to
 * produce it.
 *
 * Shared rather than copied: two dropdowns offer restaurants by name now (the
 * header's, which navigates, and the map's, which moves the camera) and a
 * reader who learns that "pizza" reaches Bronx Pizza first in one expects the
 * same six in the same order in the other. Two implementations would drift on
 * the first tweak to a weight.
 */

/**
 * The four fields the ordering reads, declared structurally rather than as
 * `Restaurant`. The two callers hold different projections — `/api/restaurants`
 * actually returns `RestaurantView` — and the ranking has no opinion about the
 * fields it doesn't look at, so naming a concrete row type here would only
 * force a cast at one of the call sites.
 */
export type Rankable = {
  name: string;
  cuisine: string;
  neighborhood: string;
  /** Optional: an unrated restaurant still matches, it just cannot win a tie. */
  rating?: number;
};

/**
 * The top six matches, best first. Six because this feeds a dropdown, which is
 * a shortcut to *one* place — a longer list is a result page, and neither
 * caller is one.
 */
export function rank<T extends Rankable>(query: string, candidates: readonly T[]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return candidates
    .map((r) => {
      const name = r.name.toLowerCase();
      const cuisine = r.cuisine.toLowerCase();
      const hood = r.neighborhood.toLowerCase();

      let score = 0;
      if (name.startsWith(q)) score = 100;
      else if (name.includes(q)) score = 80;
      else if (cuisine.startsWith(q)) score = 60;
      else if (cuisine.includes(q)) score = 50;
      else if (hood.startsWith(q)) score = 40;
      else if (hood.includes(q)) score = 30;

      // Rating breaks ties so the better-reviewed place surfaces first. An
      // unrated restaurant contributes nothing to the tiebreak rather than
      // being ranked as if it scored zero stars — the match quality above is
      // what actually put it in the list.
      return { r, score: score === 0 ? 0 : score + (r.rating ?? 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.r);
}
