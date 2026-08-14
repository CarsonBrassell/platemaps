/**
 * A price band per restaurant, derived from the menu prices the app already
 * shows rather than stored as a fact about the business.
 *
 * Yelp's own `price` field was never fetched — `scripts/fetch-restaurants.mjs`
 * doesn't request it and `Restaurant` has no column for it — so there is no
 * authoritative $$-style rating to read. What does exist is `dishesByRestaurant`:
 * the same prices `FullMenu` and `DishSheet` already put on screen. Banding
 * those is a summary of what the visitor can see for themselves, not a new
 * claim about the place.
 *
 * The consequence, and it is deliberate: **a restaurant with no menu has no
 * band**, so any price filter excludes it. 17 of the 36 have no menu today.
 * Inventing a band for them from cuisine or star rating would be exactly the
 * fabrication PRODUCT.md's third principle rules out — the gap stays a gap,
 * and the facet counts show it (the four bands don't add up to the total).
 *
 * This file used to build a whole-corpus map at module load and answer
 * `priceBandFor(id)` from it. Menus live in Postgres now, so there is no map to
 * build in the browser: `bandFor` is exported as plain arithmetic, `db.ts`
 * calls it per restaurant while assembling rows, and the band arrives on the
 * restaurant itself. What is left here imports nothing at runtime, which is
 * what keeps it safe for the client components that read `PRICE_BANDS`.
 */

export type PriceBand = "$" | "$$" | "$$$" | "$$$$";

export const PRICE_BANDS: ReadonlyArray<{ value: PriceBand; hint: string }> = [
  { value: "$", hint: "under $12" },
  { value: "$$", hint: "$12–20" },
  { value: "$$$", hint: "$20–30" },
  { value: "$$$$", hint: "$30+" },
];

/**
 * Sections that aren't the thing you came to eat. A place is priced by its
 * entrées: fold in the $3 horchata and the $4 edamame and every restaurant
 * drifts a band cheaper than anyone actually pays.
 *
 * Matched case-insensitively against whatever `section` strings the menu
 * extraction produced, and only used when it leaves something behind — a
 * taqueria listing everything under "Starters" is still priced on its food.
 */
const SIDE_SECTIONS = new Set(["starters", "sides", "desserts", "drinks", "salads"]);

/** Median, not mean: one $36 filet on a $14 menu shouldn't move the band. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parsePrice(price: string): number | null {
  const amount = Number.parseFloat(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * The two fields banding actually reads. Narrower than `Dish` on purpose, so
 * `db.ts` can price a restaurant from a two-column query instead of hydrating
 * every menu it owns.
 */
export type PricedItem = { price: string; section: string };

/** Null when there is no menu to price — an honest gap, not a "$". */
export function bandFor(dishes: readonly PricedItem[]): PriceBand | null {
  const mains = dishes.filter((d) => !SIDE_SECTIONS.has(d.section.toLowerCase()));
  const prices = (mains.length > 0 ? mains : dishes)
    .map((d) => parsePrice(d.price))
    .filter((p): p is number => p !== null);

  if (prices.length === 0) return null;

  const typical = median(prices);
  if (typical < 12) return "$";
  if (typical < 20) return "$$";
  if (typical < 30) return "$$$";
  return "$$$$";
}

