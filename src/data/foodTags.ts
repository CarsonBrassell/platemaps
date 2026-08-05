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
 * A few tags carry their own accent so the eye can pick them out of a row of
 * otherwise-neutral chips. Everything unlisted falls back to the warm grey.
 */
const TAG_ACCENTS: Record<string, string> = {
  "Hidden Gem": "bg-pm-orange-tint text-pm-orange-text ring-pm-orange-border",
  "Under $15": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Fine Dining": "bg-amber-50 text-amber-800 ring-amber-200",
  "Late Night": "bg-indigo-50 text-indigo-800 ring-indigo-200",
};

export function tagAccent(tag: string) {
  return TAG_ACCENTS[tag] ?? "bg-pm-grey-tint text-pm-grey-text ring-zinc-200";
}
