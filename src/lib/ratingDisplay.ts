/**
 * How a restaurant's two numbers are shown, and the one switch that retires the
 * older of them.
 *
 * A restaurant carries two figures right now, and they are not the same kind of
 * claim:
 *
 *  - **The plate score** — ours. The average of every dish rating people have
 *    left there, weighted by how many ratings each plate has
 *    (src/lib/plateScore.ts). This is the number the product is actually about,
 *    and it is null until enough plates have been rated to describe the kitchen.
 *  - **The blend** — `restaurants.rating`, a review-count-weighted mean of
 *    Yelp's and Google's stars (scripts/blend-ratings.mjs). Someone else's
 *    number, on a 1-5 scale, and the only signal that exists for a restaurant
 *    nobody here has rated yet.
 *
 * Both are displayed because at launch the second is all there is: a corpus of
 * ~700 restaurants with a handful of dish ratings between them would otherwise
 * be a wall of "No plates rated yet", which tells a visitor nothing and gives
 * them no reason to come back. The blend carries the cold start; the plate score
 * takes over per restaurant as its plates fill in.
 *
 * ## Retiring the stars
 *
 * That is the intended end state, and it is one edit: set `SHOW_BLEND_STARS` to
 * false. Every surface that prints stars reads this flag, so flipping it removes
 * them everywhere at once and leaves the plate score — and the honest gap where
 * there isn't one — as the whole answer. Discover's "Top rated" follows too: the
 * predicate in lib/discoverFilters.ts switches from `TOP_RATED_STARS` to
 * `TOP_RATED_PERCENT` off this same flag, so the filter never measures a scale
 * the cards aren't showing.
 *
 * Flip it when dish coverage is deep enough that most restaurants clear the
 * plate-score floor. Until then the stars are load-bearing, not decoration.
 *
 * When that day comes, these are also then dead and can go: `StarRating`, the
 * `yelpRating`/`googleRating` columns' only reader, and `npm run ratings:blend`.
 */
export const SHOW_BLEND_STARS = true;

/**
 * The scale categories are reported on, for the `/5` a caller prints beside one.
 *
 * There is no conversion helper any more: `aspectScores` works natively in 1-5
 * because its base is the sourced rating, which is already on that scale. What
 * remains is the display rule.
 *
 * **Always print the denominator.** A restaurant page carries the plate percent,
 * the sourced stars, and these — and two of the three are out of 5. `4.4` alone
 * is ambiguous between a category and the sourced rating; `4.4/5` sitting
 * against a category label is not.
 */
export const ASPECT_SCALE_MAX = 5;

/**
 * What the plate score is, in words, wherever there is room to say it.
 *
 * Shown next to the percent rather than left implicit because the two numbers
 * sit side by side: without this, a reader has no way to tell that one is the
 * restaurant being rated and the other is its plates being averaged. Stops being
 * necessary the day the stars go, but stays correct either way.
 */
export const PLATE_SCORE_CAPTION = "average of all dish ratings";

/**
 * How the blend reads, always with its denominator.
 *
 * The scale is named every time it appears. Two numbers on one card is exactly
 * the situation where a bare `4.1` beside an `88%` invites being read as the
 * wrong one, and the denominator is what makes the pair legible at a glance.
 */
export function blendLabel(rating: number): string {
  return `${rating.toFixed(1)}/5`;
}

/**
 * Where the stars come from, in the product's own voice — the two strings a
 * reader actually sees.
 *
 * Deliberately does not name Yelp or Google, or the word "blend": that is how
 * the number is *built*, not what it *is* to someone reading a restaurant page,
 * and naming two specific companies in the copy reads as a partnership the
 * product doesn't have. "Sourced from across the web" is the accurate short
 * answer and stays accurate if a third source is added, which is the other
 * reason not to enumerate them.
 *
 * The mechanics are still written down, just not in the UI — see
 * scripts/blend-ratings.mjs for the weighting and the per-source columns it
 * keeps so any displayed figure can be traced back.
 *
 * What the copy must keep doing is separating these from PlateMaps ratings.
 * That is the whole reason the line exists, and it is not the same claim as
 * naming the sources. Yelp's own display requirements are met by the photo
 * credit and the link back to the business, which sit beside this.
 */
export const BLEND_CAPTION = "sourced from the web";

/** The one-line disclosure under the metadata pills. */
export const BLEND_DISCLOSURE =
  "Star ratings are sourced from across the web, not PlateMaps ratings.";

/**
 * Why the conversion and anchor helpers are gone.
 *
 * This module used to own three: `aspectOutOfFive` (0-100 → x/5),
 * `blendAsPercent` (the sourced 1-5 → 0-100) and `aspectAnchor`, which picked
 * the restaurant's plate score when it had one and the rescaled sourced rating
 * when it did not. All three existed to move a category between two scales and
 * two possible anchors.
 *
 * `aspectScores` now works natively in 1-5 around a single base — the sourced
 * rating, supplied by `getAllRestaurantAspectTallies` in lib/db.ts — so there is
 * no conversion left to do and no per-restaurant choice left to make. The plate
 * score is deliberately not the base: a category is a claim about the place, the
 * plate score is a claim about its food, and anchoring one to the other made the
 * categories move whenever the menu did.
 *
 * What that costs this module's job. Under the old fallback the sourced rating
 * set category heights only where plates were unrated; it now sets them
 * everywhere, so a number labelled as ours is positioned at a Yelp/Google
 * altitude on every restaurant — which is exactly what the disclosure above is
 * for, and why `RestaurantAspects` prints "averages to <base>" against the
 * counts. The five ratings are a breakdown of that number and the page says so.
 * Below `MIN_REVIEWS` it shows the vote counts and no ratings at all.
 */

