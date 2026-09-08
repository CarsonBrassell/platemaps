import type { MatchedDish } from "@/data/restaurantTypes";

/**
 * Where a restaurant card goes.
 *
 * The plain answer is the restaurant page, and for a card that arrived by name,
 * cuisine or neighbourhood that is the whole answer. A card that arrived by
 * *dish* is a different question: the visitor typed a food, the card is on the
 * page because one menu item matched it, and the card says which one on its
 * face. Landing that tap on the top of a menu with two hundred rows makes the
 * reader find the dish a second time, by hand, having already been shown it.
 *
 * So when the row carries a matched dish the link carries `?dish=` — the same
 * parameter the feed's post cards already produce, read by RestaurantDetail and
 * PhoneDetailScreen, which open that dish's sheet on arrival. Unknown ids are
 * ignored there rather than erroring, so a stale link degrades to the plain
 * page.
 *
 * `base` is the surface: `/restaurant` on the web, `/m/restaurant` on the
 * phone. One function for both because which dish a card opens is a fact about
 * the search, not about the layout.
 */
export function restaurantHref(
  base: "/restaurant" | "/m/restaurant",
  restaurant: { id: string; matchedDish?: MatchedDish },
): string {
  const page = `${base}/${restaurant.id}`;
  return restaurant.matchedDish
    ? `${page}?dish=${encodeURIComponent(restaurant.matchedDish.id)}`
    : page;
}
