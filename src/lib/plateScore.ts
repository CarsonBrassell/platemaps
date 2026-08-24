/**
 * A restaurant's score, derived from the plates people rated there.
 *
 * This is the only place a restaurant-level number is computed, and it replaced
 * the 1–5 star scale that used to live beside it. There is now one rating scale
 * in the product: a percent, given to a dish. A restaurant's percent is not a
 * separate thing anyone enters — it is what its plates add up to.
 *
 * Pure arithmetic, no imports, same as src/lib/aspectScores.ts — so it can be
 * exercised under plain Node and so the model stays readable without a database
 * in the picture.
 *
 * ## Why not a flat average over every rating
 *
 * The obvious implementation is `AVG(rating)` across every dish rating at the
 * place. That is a *rating*-weighted mean, and it lets one heavily-reviewed
 * plate become the restaurant: forty ratings on the burger and three across
 * everything else means the burger's score IS the score, and the kitchen's
 * range disappears.
 *
 * The other obvious implementation is a flat mean of each dish's own average,
 * every plate counting once. That fails the other way: a single 100% rating on
 * an off-menu dessert lands with the same force as a 40-rating entrée.
 *
 * So each dish is weighted by how much its own average can be trusted:
 *
 *   weight_i  = ratings_i / (ratings_i + CONFIDENCE_K)
 *   percent   = Σ(average_i * weight_i) / Σ(weight_i)
 *
 * A thinly-rated plate is still counted, just quietly, and it earns its way up
 * to a full vote as people agree with it. This is deliberately the same damping
 * shape `aspectScores` already uses, so there is one idea about small samples in
 * this codebase rather than two.
 *
 * ## The other weight: whose rating it is
 *
 * The formula above is not the whole model any more, and this file only holds
 * half of it. `average_i` arrives already weighted: inside a single plate's
 * ratings, each one pulls by the rank its author has earned — 0.8 for a
 * Newcomer through 1.2 for an Institution, off the ladder in `lib/ranks.ts`,
 * with Regular at exactly 1.0 as the neutral point everything is read against.
 * The three aggregates in `lib/db.ts` do it, because it has to happen while the
 * rows are still individual ratings with an author attached; by the time a
 * `RatedDish` reaches this function the raters have been folded away.
 *
 * So a rating's total pull is two weights multiplied:
 *
 *   pull  =  (how much this dish's average can be trusted)
 *            ×  (how much this person's rating is trusted)
 *
 * They compose rather than compete because they are answers to different
 * questions, and neither one can answer the other's. Confidence asks *how
 * well-attested is this plate* — a number about the sample. Rank asks *who is
 * saying it* — a number about a person. A plate with forty Newcomer ratings is
 * extremely well attested; a single Critic rating is one opinion no matter
 * whose it is, and the confidence damping still quiets it to a quarter of a
 * vote. Nothing about knowing the rater makes a sample of one larger.
 *
 * That composition is also what keeps the rank weight honest. Its range is a
 * factor of 1.5 end to end and it is applied *within* a plate, so it can tilt a
 * disagreement and it cannot manufacture a score: raising a plate materially
 * still means getting more people to agree, which is the behaviour worth
 * rewarding. `ratings` in `RatedDish` is a raw headcount for exactly this
 * reason — it is a count of people, never of accumulated weight, and the
 * thresholds below mean what they say.
 *
 * ## Why there is a floor at all
 *
 * A derived number is only worth printing once it describes the restaurant
 * rather than the first person through the door. Below the floor there is no
 * percent — callers get `null` and say how many plates have been rated instead.
 * Inventing a confident-looking 45% from one rating of a side salad is the
 * failure mode this exists to prevent.
 */

/**
 * How many ratings a single dish needs before its average carries roughly half
 * its full weight. At K=3: 1 rating counts a quarter, 3 count half, 12 count
 * 80%.
 */
export const CONFIDENCE_K = 3;

/** Distinct rated dishes required before a restaurant shows a percent. */
export const MIN_RATED_DISHES = 3;

/** Total dish ratings required before a restaurant shows a percent. */
export const MIN_TOTAL_RATINGS = 8;

/**
 * One dish's contribution: its own mean percent and how many ratings produced
 * it. Declared structurally rather than as a row type — the database aggregate
 * and the preview scenarios hold different shapes and this has no opinion about
 * the fields it doesn't read.
 */
export type RatedDish = {
  /** Rank-weighted mean of this dish's ratings, 0–100. */
  average: number;
  /**
   * How many people that mean is drawn from — a headcount, deliberately not the
   * weight behind it. Zero-rating dishes are ignored.
   */
  ratings: number;
};

export type PlateScore = {
  /**
   * The restaurant's percent, 0–100, or null when the floor above is not met.
   * Null is a real answer — "not enough plates yet" — not a zero and not a gap
   * to paper over with the Yelp blend.
   */
  percent: number | null;
  /** Distinct dishes with at least one rating. */
  dishCount: number;
  /** Total dish ratings behind the score. */
  ratingCount: number;
  /**
   * False when the floor isn't met. Separate from `percent === null` so a caller
   * can distinguish "no ratings at all" (dishCount 0) from "some, not enough"
   * without re-deriving the thresholds.
   */
  ready: boolean;
};

/**
 * The score of a restaurant nobody has rated a plate at. Exported so callers
 * holding a sparse record can substitute it for a missing key rather than
 * hand-rolling the same four fields — a restaurant absent from an aggregate and
 * one with no ratings are the same restaurant.
 */
export const EMPTY_PLATE_SCORE: PlateScore = {
  percent: null,
  dishCount: 0,
  ratingCount: 0,
  ready: false,
};

/**
 * Score one restaurant from its rated dishes. Order is irrelevant and dishes
 * with no ratings may be passed in — they are skipped rather than counted as
 * zeroes, which would drag every score toward 0 in proportion to menu length.
 */
export function plateScore(
  dishes: readonly RatedDish[],
  k: number = CONFIDENCE_K,
): PlateScore {
  const rated = dishes.filter((d) => d.ratings > 0);
  if (rated.length === 0) return EMPTY_PLATE_SCORE;

  const ratingCount = rated.reduce((sum, d) => sum + d.ratings, 0);
  const dishCount = rated.length;
  const ready = dishCount >= MIN_RATED_DISHES && ratingCount >= MIN_TOTAL_RATINGS;

  if (!ready) return { percent: null, dishCount, ratingCount, ready: false };

  let weighted = 0;
  let weight = 0;
  for (const d of rated) {
    const w = d.ratings / (d.ratings + k);
    weighted += d.average * w;
    weight += w;
  }

  // `weight` cannot be 0 here: every remaining dish has ratings > 0, so every
  // weight is strictly positive.
  const percent = Math.round(clamp(weighted / weight, 0, 100));
  return { percent, dishCount, ratingCount, ready: true };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * How a restaurant's score reads when it has one, and what to say instead when
 * it doesn't. Shared so the grid card, the detail header and the map bubble
 * cannot drift into three different ways of admitting the same gap.
 */
export function plateScoreLabel(score: PlateScore): string {
  if (score.percent !== null) return `${score.percent}%`;
  if (score.dishCount === 0) return "No plates rated yet";
  return score.dishCount === 1 ? "1 plate rated" : `${score.dishCount} plates rated`;
}
