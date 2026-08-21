/**
 * Per-category ratings for a restaurant, out of 5, derived from signed votes
 * around the restaurant's own sourced rating.
 *
 * Rendered by src/components/RestaurantAspects.tsx. The model is also runnable
 * on its own against hand-built scenarios (`npm run aspects:preview`), which is
 * how it is tuned.
 *
 * ## The one input
 *
 * `base` is the restaurant's sourced rating (Yelp/Google, 1-5) and it is the
 * only outside number in here. The plate score is deliberately NOT used: a
 * category is a claim about the place, the plate score is a claim about its
 * food, and mixing them made the categories move whenever the menu did.
 *
 * ## What the votes decide
 *
 * Each review may name one category as the best thing about the place and —
 * optionally — one that let them down. The votes do not set a level; they set
 * **the order and the spacing**: which category people rate above the others,
 * and by how much.
 *
 *   net_i   = (praised_i - faulted_i) / reviews      unweighted, in [-1, +1]
 *   d_i     = net_i - mean(net)                      centred, so Sum(d) = 0
 *   a_i     = d_i < 0 ? d_i * FAULT_WEIGHT : d_i     complaints amplified
 *   b_i     = a_i rebalanced so Sum(b) = 0           positives scaled to match
 *   conf    = reviews / (reviews + CONFIDENCE_K)
 *   raw_i   = b_i * conf * SPREAD
 *   score_i = base + raw_i * fit
 *
 * ## Two rules that have to hold at once
 *
 * 1. **The five ratings average to `base` exactly.** The categories are a
 *    breakdown of the restaurant's own rating, not five opinions floating near
 *    it, so they have to add back up to it.
 * 2. **A category with no votes is never above `base`**, and is strictly below it
 *    whenever anything was praised. Silence is not evidence of quality — it is
 *    what a standout gets measured against, and what pays for it.
 *
 * Getting both took one non-obvious move. The natural place to weight a fault is
 * inside `net`, and that is where an earlier version put it — but a fault worth
 * three praises drags `mean(net)` below zero on any restaurant with a few
 * complaints, and subtracting a negative mean *lifts* every quiet category above
 * the rating. Five reviews at Costa Brava put Service and Ambiance at 4.48
 * against a 4.4 base on **zero votes each**. Flooring the shift at zero fixed
 * rule 2 and broke rule 1.
 *
 * So `net` is left unweighted, and the weighting moves one step later, onto the
 * centred deviations. That ordering is what makes both rules hold:
 *
 *  - `net` unweighted means `mean(net) >= 0` always. Every review picks exactly
 *    one praise and *optionally* one fault, so total praise can never trail total
 *    faults. A category with no votes therefore sits at `net = 0`, below a mean
 *    that is zero or positive — rule 2, by construction.
 *  - Amplifying only the negative deviations makes complaints bite, but breaks
 *    the balance. Scaling the positives back up until the two sides match
 *    restores `Sum(b) = 0` — rule 1, by construction. Complaints keep their extra
 *    weight *relative to* praise, which is the whole point of FAULT_WEIGHT.
 *
 * A category collecting complaints has a large negative `d` and drops hard —
 * further than praise ever lifts, for two reasons: praise tends to spread
 * across several categories while complaints concentrate on one, and a fault is
 * weighted more heavily than a praise to begin with (FAULT_WEIGHT).
 *
 * If nobody votes at all, every net is 0, every deviation is 0, and all five land
 * exactly on `base`. That is the right answer to "no signal": this restaurant's
 * rating, said five times.
 *
 * **This reverses an earlier version, deliberately.** That one scored each
 * category independently, so silence returned `base` and praise lifted a
 * category with nothing coming down — every category could sit above the
 * restaurant's own rating at once. Friendlier, and it did not add up. The trade
 * is chosen: a restaurant genuinely good at everything now shows a flat row near
 * its rating rather than five high numbers, because "good at everything" and
 * "better at this than that" are different claims and only the second is what a
 * vote records.
 *
 * ## Fitting inside 1-5
 *
 * `SPREAD` sets how many rating points a full unit of centred net is worth;
 * `conf` shrinks it on small samples so three reviews cannot spread a page. If
 * the widest deviation would push a category past 5 or under 1, **every**
 * deviation is scaled down by the same factor (`fit`) rather than clipping the
 * offender. Uniform scaling keeps Σd = 0, so the mean survives the bounds. A
 * clamp would not, and would quietly break the one property this model has.
 */

/**
 * An aspect is just its label — the same strings the BEST_AT chips in
 * data/reviewScales.ts already use.
 *
 * This module deliberately does NOT import that list. It is pure arithmetic
 * over whatever aspects it is handed, which keeps the vocabulary owned in one
 * place (reviewScales.ts), lets a caller score a subset, and leaves this file
 * dependency-free so `npm run aspects:preview` can run it under plain Node.
 */
export type Aspect = string;

/**
 * How many reviews it takes for the spacing to carry roughly half its full
 * width. Higher = more conservative, categories hug the restaurant's rating
 * longer. At K=5: 1 review moves 17% of the way, 5 moves 50%, 20 moves 80%.
 */
export const CONFIDENCE_K = 5;

/**
 * Rating points per full unit of centred net, before damping.
 *
 * Raising this widens every gap on every restaurant at once — it is the knob for
 * how opinionated the block looks, and it moves praise and complaints together.
 * At 2.0 a category four people fault at a 36-review restaurant lands around
 * 3.6 against a 4.1 base, and one a third of the room praises lands around 4.9.
 *
 * It cannot be raised to punish complaints alone. The row's mean is pinned to
 * `base`, so every point a faulted category loses is a point the others gain —
 * see FAULT_WEIGHT for the lever that changes what a complaint is *worth*, and
 * the note there for why even that does not break the coupling.
 */
export const SPREAD = 2.0;

/**
 * How many praises a single fault cancels.
 *
 * At 1 the two were symmetric, and complaints barely moved anything: four
 * people faulting the menu at a 36-review restaurant is 11% of the room, which
 * netted -0.11 and dropped the category about a quarter of a point. That reads
 * as "slightly below average" when what the votes actually say is "several
 * people went out of their way to name this as the problem".
 *
 * Complaining is the rarer act. A reviewer has one praise to give and one
 * optional fault, and most skip the fault entirely — so a fault that does get
 * cast is the stronger signal and is weighted accordingly. At 3, four faults
 * carry the weight of twelve praises.
 *
 * This does NOT break the mean. The weighting changes each category's `net`,
 * and the deviations are centred *after* that, so Σd is still 0 and the row
 * still averages to `base`. What it changes is the spacing: complained-about
 * categories fall further, and because the mean net drops with them, the
 * categories nobody faulted rise to match.
 */
export const FAULT_WEIGHT = 3;

/** The scale categories are reported on — the same 1-5 the sourced rating uses. */
export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/**
 * The most of the available room the widest deviation may use.
 *
 * At 1.0 the top category lands on exactly 5.00 whenever the row wants more room
 * than it has — which was happening on most restaurants, because rebalancing
 * scales the positive side up by roughly FAULT_WEIGHT and a high `base` leaves
 * little headroom (4.4 has only 0.6). A category pinned at a flat 5.00 reads as a
 * cap being hit rather than a rating, and every other category gets compressed
 * behind it.
 *
 * At 0.85 the same row tops out near 4.9, which is legible as a real figure. It
 * does not remove the underlying squeeze — a 4.4 restaurant genuinely cannot
 * spread its categories as far as a 3.5 one, because the mean is pinned to `base`
 * and there is only so much room above it — but it stops the scale's edge from
 * being mistaken for a verdict.
 */
export const MAX_REACH = 0.85;

/**
 * How many rated reviews a restaurant needs before its categories get ratings.
 *
 * Below this, no score is returned. Five reviews were enough to produce a
 * confident-looking five-category row where three of the five ratings rested on
 * one or two taps — Menu variety at 5.00 off two votes, Value 1.15 points down
 * off two. The confidence term shrinks a deviation but then the fit scales it
 * back, so damping alone never restrained it.
 *
 * 12 is deliberately close to the plate score's own floor in spirit (3 plates, 8
 * ratings): enough that no single voter decides a category, and low enough that a
 * restaurant with genuine local interest clears it in a few weeks. Callers show
 * the vote counts below the floor — the votes are real, only the ranking of them
 * isn't yet.
 */
export const MIN_REVIEWS = 12;

export type AspectVotes = {
  /** Reviews naming this aspect the best thing about the place. */
  praised: number;
  /** Reviews naming this aspect as the thing that let them down. */
  faulted: number;
};

export type AspectScore = {
  aspect: Aspect;
  /** 1-5, or null when the restaurant is below `MIN_REVIEWS` — an honest gap,
      not a 0. The counts and `net` are still populated. */
  score: number | null;
  praised: number;
  faulted: number;
  /** This category's raw vote balance, in [-1, +1]. */
  net: number;
  /** Its net minus the shift — the figure that actually moves it. Never
      positive for a category with no votes. */
  deviation: number;
  /** What fraction of the spacing the sample size allows. */
  confidence: number;
  /** True when nobody voted either way on this category. */
  unremarked: boolean;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Every category's rating for one restaurant, in the order given.
 *
 * Scored as a set rather than one at a time, because the centring and the fit
 * both need the whole row — which is why there is no single-aspect export any
 * more. Pass every category the product offers: one left out of the set is left
 * out of the mean, and the mean is the point.
 *
 * `base` is the restaurant's sourced rating on 1-5. `reviewCount` is how many
 * rated reviews the votes could have come from.
 */
export function aspectScores(
  aspects: readonly Aspect[],
  base: number,
  votes: Partial<Record<Aspect, AspectVotes>>,
  reviewCount: number,
  k: number = CONFIDENCE_K,
  spread: number = SPREAD,
  faultWeight: number = FAULT_WEIGHT,
): AspectScore[] {
  const rows = aspects.map((aspect) => {
    const v = votes[aspect] ?? { praised: 0, faulted: 0 };
    return { aspect, praised: v.praised, faulted: v.faulted };
  });

  /* Not enough evidence to rank five categories against each other. The counts
     still come back — see MIN_REVIEWS. */
  if (reviewCount < MIN_REVIEWS || rows.length === 0) {
    return rows.map((r) => ({
      ...r,
      score: null,
      net: 0,
      deviation: 0,
      confidence: 0,
      unremarked: true,
    }));
  }

  /* A fault counts for `faultWeight` praises — see FAULT_WEIGHT. Clamped
     because the weighting can push a heavily-faulted category past -1 (20
     faults at weight 3 across 40 reviews is -1.5), and a net outside [-1, +1]
     would let one category dominate the centring. */
  /* Unweighted on purpose — the fault weighting comes later, onto the centred
     deviations. Weighting here would drag `mean(net)` negative and lift the
     unvoted categories above `base`; see the two rules above. */
  const nets = rows.map((r) => clamp((r.praised - r.faulted) / reviewCount, -1, 1));
  const meanNet = nets.reduce((a, b) => a + b, 0) / nets.length;
  const confidence = reviewCount / (reviewCount + k);

  /* Centred: sums to zero, and a category with no votes sits at `-meanNet`,
     which is never positive because total praise never trails total faults. */
  const centred = nets.map((n) => n - meanNet);

  /* Complaints bite harder than praise lifts. Amplifying only the negative side
     unbalances the row, so the positive side is scaled back up until the two
     match — which keeps the amplification *relative* while restoring the sum to
     zero, and so the mean to `base`. */
  const amplified = centred.map((d) => (d < 0 ? d * faultWeight : d));
  const negativeSum = amplified.reduce((sum, a) => (a < 0 ? sum + a : sum), 0);
  const positiveSum = amplified.reduce((sum, a) => (a > 0 ? sum + a : sum), 0);
  const positiveScale = positiveSum > 0 ? -negativeSum / positiveSum : 1;
  const deviations = amplified.map((a) => (a > 0 ? a * positiveScale : a));

  const raw = deviations.map((d) => d * confidence * spread);

  /* Fit the whole row inside 1-5 by scaling every deviation equally. Clipping
     only the offender would break Σd = 0 and with it the mean — the one thing
     this model guarantees. `fit` is 1 whenever nothing is near a bound, which is
     the ordinary case. */
  const headroom = (MAX_SCORE - base) * MAX_REACH;
  const legroom = (base - MIN_SCORE) * MAX_REACH;
  const highest = Math.max(0, ...raw);
  const lowest = Math.min(0, ...raw);
  const fit = Math.min(
    1,
    highest > 0 ? headroom / highest : 1,
    lowest < 0 ? legroom / -lowest : 1,
  );

  return rows.map((r, i) => ({
    ...r,
    score: clamp(base + raw[i] * fit, MIN_SCORE, MAX_SCORE),
    net: nets[i],
    deviation: deviations[i],
    confidence,
    unremarked: r.praised === 0 && r.faulted === 0,
  }));
}

/**
 * The category a restaurant is best at — derived rather than asked, since the
 * highest-scoring category is exactly what "best at" meant. Null when nothing
 * was ever voted on, so the caller can say so instead of naming a winner chosen
 * by tie-break.
 */
export function bestAspect(scores: AspectScore[]): AspectScore | null {
  const voted = scores.filter((s) => !s.unremarked && s.score !== null);
  if (voted.length === 0) return null;
  return voted.reduce((best, s) => (s.score! > best.score! ? s : best));
}

/** The category most often called out as a letdown, if anyone did. */
export function weakestAspect(scores: AspectScore[]): AspectScore | null {
  const faulted = scores.filter((s) => s.faulted > 0 && s.score !== null);
  if (faulted.length === 0) return null;
  return faulted.reduce((worst, s) => (s.score! < worst.score! ? s : worst));
}

/**
 * The mean of a scored row — equal to `base` by construction. Exported so a
 * caller (or the preview script) can assert that rather than trust it. Null below
 * `MIN_REVIEWS`, where there are no scores to average.
 */
export function meanScore(scores: AspectScore[]): number | null {
  const scored = scores.filter((s) => s.score !== null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, s) => sum + s.score!, 0) / scored.length;
}
