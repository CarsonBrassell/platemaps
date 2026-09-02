import type { RestaurantView } from "@/data/restaurants";

/**
 * What shape a restaurant's photo gets on a card, and how the cards stack.
 *
 * Discover used to crop every photo into the same 128px band. That is what made
 * the grid scannable — scores landing at the same height across a row — and
 * also what made it monotonous: a tall plated dish and a wide dining room
 * arrived as the same letterbox, and nothing on a page of 4,793 places told you
 * where to look. Keeping each photo's own proportions is the trade, and the
 * measured corpus says it is worth making: 57% landscape, 29% portrait, 13%
 * square, ratios running 0.39 to 2.74.
 *
 * Two things live here because both the web grid and the phone grid need them
 * and neither can own them: the ratio a card should ask for, and the packing
 * that turns one ordered list into balanced columns.
 */

/**
 * The median ratio in the corpus, and what a photo of unknown size gets.
 *
 * Twelve photos never resolved (dead Yelp URLs, mostly) and every newly
 * imported restaurant has no measurement until `npm run photos:size` next runs,
 * so this is a live path rather than a defensive one. The median is the right
 * guess precisely because it is the shape the crop is least wrong about.
 */
const FALLBACK_RATIO = 4 / 3;

/**
 * The shape a restaurant with no photo at all gets.
 *
 * **Not reachable from Discover, and that is not an accident.** `listed` is the
 * readiness gate, and a row without a photo never passes it — all 4,793 listed
 * restaurants have one, while the ~860 that don't are held back entirely rather
 * than shown as a card with a hole in it. This exists for callers outside that
 * gate, and so the function has a defined answer for every input.
 *
 * Deliberately one fixed ratio rather than a spread: a tone block is an honest
 * statement that there is no picture, and giving those cards invented variety
 * would dress an absence up as content.
 */
const EMPTY_RATIO = 3 / 2;

/**
 * How far from square a card is allowed to get.
 *
 * The extremes are real photos, not bad data — a 0.39 is somebody's portrait
 * shot of a menu board — but a card five times taller than its neighbours stops
 * being rhythm and becomes a column of its own. Past the clamp the photo is
 * cropped by `object-cover` rather than the card being stretched, which is the
 * same thing the fixed band did to every photo, just far less often.
 */
const MIN_RATIO = 0.62;
const MAX_RATIO = 1.9;

/** The width/height a card's photo box should use. Always a usable number. */
export function photoRatio(restaurant: {
  photo?: string;
  photoW?: number;
  photoH?: number;
}): number {
  if (!restaurant.photo) return EMPTY_RATIO;
  const { photoW: w, photoH: h } = restaurant;
  if (!w || !h) return FALLBACK_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, w / h));
}

/**
 * Everything under a card's photo, as a fraction of the column's width.
 *
 * Only ever used to guess which column a card should go in, never to size
 * anything — the browser lays out the real heights. So it does not have to be
 * right, only close enough that the columns end up roughly level, and being
 * wrong costs a slightly ragged bottom edge on a layout whose entire appeal is
 * a ragged bottom edge.
 */
const BODY_HEIGHT_RATIO = 0.3;

/**
 * Deals an ordered list into `count` columns, shortest column first.
 *
 * ## Why not `column-count`
 *
 * CSS multicol does this in one line, and gets two things wrong that matter
 * here. It fills top-to-bottom then across, so the order the server ranked the
 * results in is not the order they are read in. And it rebalances every column
 * when the list grows, so "Show more" makes cards you had already looked at
 * jump to a different column.
 *
 * This is a left fold, which fixes both: reading order is preserved down each
 * column, and the packing of the first N items does not depend on what comes
 * after them. Adding another page appends to the columns instead of reshuffling
 * them, and the cards already on screen stay put.
 */
export function packColumns<T extends { photo?: string; photoW?: number; photoH?: number }>(
  items: readonly T[],
  count: number,
): T[][] {
  if (count <= 1) return [items.slice()];

  const columns: T[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);

  for (const item of items) {
    let shortest = 0;
    for (let i = 1; i < count; i++) if (heights[i] < heights[shortest]) shortest = i;
    columns[shortest].push(item);
    heights[shortest] += 1 / photoRatio(item) + BODY_HEIGHT_RATIO;
  }

  return columns;
}

/** Convenience for the common call — the grid always packs `RestaurantView`s. */
export type PackableRestaurant = Pick<RestaurantView, "photo" | "photoW" | "photoH">;
