/**
 * Ranked matching over the restaurant list.
 *
 * Matches name, cuisine, cuisine tags and neighbourhood so "thai", "tacos",
 * "little italy" and "landini" all land somewhere. Ranked so a name match
 * beats a cuisine match — typing "pizza" should reach Bronx Pizza before every
 * pizzeria in the city.
 *
 * Callers rank whatever the server sent for *this* query rather than the whole
 * city. `/api/restaurants?q=` narrows on the same fields, so the ordering
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
  cuisine: string | null;
  /**
   * The specific labels behind the canonical cuisine, joined — see
   * data/cuisines.ts. Ranked below the cuisine itself but above the
   * neighbourhood: someone typing "tacos" wants taco shops before they want
   * a neighbourhood that happens to contain the letters.
   *
   * Optional because one caller ranks a projection that predates the column.
   */
  cuisineTags?: string;
  /**
   * Set when a dish on this restaurant's menu matched the term — see
   * searchRestaurants in lib/db.ts. Its presence *is* the match, so the
   * ranking never re-tests the string.
   */
  matchedDish?: { name: string } | null;
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
      const cuisine = (r.cuisine ?? "").toLowerCase();
      const tags = (r.cuisineTags ?? "").toLowerCase();
      const hood = r.neighborhood.toLowerCase();

      let score = 0;
      if (name.startsWith(q)) score = 100;
      else if (name.includes(q)) score = 80;
      else if (cuisine.startsWith(q)) score = 60;
      else if (cuisine.includes(q)) score = 50;
      // Below cuisine, above the tags and the neighbourhood. Typing a dish is
      // a specific question and deserves to beat a neighbourhood that happens
      // to share the letters — but "pizza" should still reach pizzerias
      // before it reaches every menu in the city with a pizza on it.
      else if (r.matchedDish) score = 48;
      else if (tags.includes(q)) score = 45;
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
