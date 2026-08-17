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
 * A category score as it is shown: out of 5, one decimal.
 *
 * `aspectScores` computes on 0-100 because that is the scale of the thing it is
 * anchored to — the restaurant's plate score — and every threshold tuned against
 * it (`ASPECT_STRONG_SCORE`, `npm run aspects:preview`) is in those units. The
 * conversion is linear and lives only here, so the model keeps one set of units
 * and the display can wear another without either drifting.
 *
 * Out of 5 rather than a percent because a category is a judgement about the
 * place, and the page already has a percent that means something specific —
 * "this share of the plates' ratings". Service is not that, and giving it the
 * same sign invited it to be read as one.
 *
 * **Always print the denominator.** There are three numbers on a restaurant
 * page now — the plate percent, the sourced stars, and these — and two of them
 * are out of 5. `4.4` alone is ambiguous between this and the sourced rating;
 * `4.4/5` beside a labelled category is not.
 */
export const ASPECT_SCALE_MAX = 5;

export function aspectOutOfFive(score: number): string {
  return ((score / 100) * ASPECT_SCALE_MAX).toFixed(1);
}

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
 * The sourced 1-5 rating on the 0-100 scale everything else in the product uses.
 *
 * Exists for one job: giving `aspectScores` something to anchor to at a
 * restaurant whose plates aren't rated yet. It is NOT for display — a sourced
 * rating shown as a percent would be indistinguishable from a plate score, which
 * is the exact confusion `blendLabel` and its denominator exist to prevent.
 */
export function blendAsPercent(rating: number): number {
  return Math.max(0, Math.min(100, (rating / 5) * 100));
}

/**
 * What the per-category scores move away from: the restaurant's own plate score
 * when it has one, and the sourced rating rescaled when it doesn't.
 *
 * The fallback is what keeps the category block alive during cold start. Every
 * one of those votes is a real PlateMaps tap — someone naming what a place was
 * best at — and gating the block on a plate score meant 541 of them rendered
 * nowhere. The votes decide the *shape* (which categories lead, which drag);
 * the anchor only decides the height they sit at, so borrowing it is far less of
 * a claim than borrowing the verdict itself would be.
 *
 * It resolves to the plate score on its own the moment one exists, per
 * restaurant — the same handover as the display.
 */
export function aspectAnchor(platePercent: number | null, blendRating: number): number {
  return platePercent ?? blendAsPercent(blendRating);
}
