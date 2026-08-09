/** Tags a poster can attach to a plate. Order is the order shown in the composer. */
export const FOOD_TAGS = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Dessert",
  "Coffee",
  "Fast Food",
  "Fine Dining",
  "Hidden Gem",
  "Under $15",
  "Late Night",
] as const;

export type FoodTag = (typeof FOOD_TAGS)[number];

/**
 * Every tag wears the same tan — the one-accent rule leaves no room for a
 * rainbow of chip colors, and a row of identical pills reads calmer anyway.
 */
export function tagAccent(_tag: string) {
  return "bg-pm-grey-tint text-pm-grey-text";
}
