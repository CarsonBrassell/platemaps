import { dishStats, type Dish } from "@/data/dishes";
import { dishRatingKey } from "@/lib/dishRatingKey";
import type { RatedDish } from "@/lib/plateScore";

/**
 * One plate's rating at one restaurant, plus the name people gave it — the
 * shape `getDishRatingsForRestaurant` returns, keyed by `dishRatingKey`.
 * `name` is a display spelling of that key, needed because a rated plate is not
 * always a menu row (see `platesWithStats`) and the key is lowercased.
 */
export type RatedPlate = RatedDish & { name: string };

export type PlateWithStats = Dish & {
  /** How many people the percent came from. */
  total: number;
  pct: number | null;
  /**
   * True for a plate that has ratings but no row on the extracted menu. It
   * exists only as a hit — it has no section, no price and no description, and
   * `FullMenu` must not list it.
   */
  offMenu: boolean;
};

/**
 * Every plate the page can show a number for: the menu, then any rated plate
 * the menu does not have.
 *
 * A plate someone has actually rated shows **its rating average** — the same
 * numbers the header's percent is the average of, so the page adds up. A plate
 * nobody has rated falls back to the older "would you eat this?" yes/no tally,
 * which is the only signal those rows have.
 *
 * The fallback is transitional and not something to build on: the two are
 * different questions ("how good was this, 0-100" against "what share would
 * order it again") wearing the same percent sign, and only the first is on the
 * product's rating scale. It exists so restaurants whose plates aren't rated
 * yet keep a populated menu instead of going blank overnight. **It is
 * read-only.** The dish sheet's yes/no buttons were the only way to cast one
 * and they are gone, so these counts are whatever the import left.
 *
 * **Rated plates that are not on the menu still count.** The post composer
 * takes the dish name as free text, and most ratings name something the menu
 * extraction never saw — "Churros" at a place whose menu lists "Churro Bites",
 * a seasonal latte, or any plate at the ~3,700 listed restaurants with no menu
 * at all. Until this they had no row to land on, so a restaurant with one
 * rating showed no hits and `Rated by 1 locals` never printed. Each such plate
 * becomes a row of its own, flagged `offMenu`, with the spelling its raters
 * used. Its id is namespaced so it can never collide with a menu row's.
 */
export function platesWithStats(
  dishes: readonly Dish[],
  dishRatings: Record<string, RatedPlate>,
): PlateWithStats[] {
  const seen = new Set<string>();
  const plates: PlateWithStats[] = dishes.map((dish) => {
    const key = dishRatingKey(dish.name);
    const rated = dishRatings[key];
    if (rated) {
      seen.add(key);
      return { ...dish, total: rated.ratings, pct: Math.round(rated.average), offMenu: false };
    }
    const { total, pct } = dishStats(dish.yesVotes, dish.noVotes);
    return { ...dish, total, pct, offMenu: false };
  });

  for (const [key, rated] of Object.entries(dishRatings)) {
    if (seen.has(key) || !key) continue;
    plates.push({
      id: `rated:${key}`,
      name: rated.name,
      price: "",
      section: "",
      yesVotes: 0,
      noVotes: 0,
      total: rated.ratings,
      pct: Math.round(rated.average),
      offMenu: true,
    });
  }

  return plates;
}

/**
 * The hits: plates with a number, menu plates first.
 *
 * A plate on the menu always outranks one that is not, whatever the scores —
 * an off-menu plate only fills slots the menu cannot. The composer takes the
 * dish name as free text, so an off-menu plate is as likely to be a typo or a
 * mis-tagged post as a real dish; one that keeps collecting ratings gets
 * reviewed and added to the menu, and from then on it competes on its score.
 */
export function topPlates(plates: readonly PlateWithStats[], count: number): PlateWithStats[] {
  return plates
    .filter((plate) => plate.total > 0)
    .sort(
      (a, b) =>
        Number(a.offMenu) - Number(b.offMenu) ||
        (b.pct ?? 0) - (a.pct ?? 0) ||
        b.total - a.total,
    )
    .slice(0, count);
}
