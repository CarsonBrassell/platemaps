/**
 * Per-aspect star scores for a restaurant, derived from signed aspect votes.
 *
 * Rendered by src/components/RestaurantAspects.tsx on every restaurant page.
 * The model is also runnable on its own against hand-built scenarios
 * (`npm run aspects:preview`), which is how it was tuned.
 *
 * ## What it measures
 *
 * Each restaurant review may name one aspect as the best thing about the
 * place, and — optionally — one aspect that let them down. Both are single
 * taps and both are skippable. That gives every aspect a signed tally rather
 * than a share of a fixed pool.
 *
 * An aspect's score starts at the restaurant's own overall rating and moves
 * toward 5 on praise or toward 1 on complaints, scaled by how much room the
 * restaurant's own rating leaves in that direction:
 *
 *   net  = (praised - faulted) / reviews        in [-1, +1]
 *   up   = overall + (5 - overall) * net        when net >= 0
 *   down = overall + (overall - 1) * net        when net <  0
 *
 * ## Why signed, and not "share of the best-at vote"
 *
 * A share-of-votes model has to divide 100% across the aspects, so the
 * average share is always exactly the benchmark, and at least one aspect is
 * always below it. A restaurant that is genuinely good at all four things
 * cannot express that — the dominance of one aspect manufactures the failure
 * of the rest, and an aspect nobody mentioned lands near 1/5 purely from
 * silence.
 *
 * Counting praise and complaints separately removes the fixed pool. Silence
 * now means net 0, which returns the restaurant's own rating — the honest
 * reading of "no signal", not an accusation. And every aspect can be positive
 * at once, which is what lets a genuinely good place look good.
 *
 * ## Confidence damping
 *
 * Raw `net` hits its extremes on tiny samples: one review praising the food
 * gives net = +1.0 and pins food at 5.0 off a single tap. `net` is therefore
 * shrunk toward 0 — that is, toward the restaurant's overall rating — by
 * `reviews / (reviews + CONFIDENCE_K)`, so early scores stay close to the
 * overall until enough people agree to move them.
 *
 * ## Why there is no per-aspect star picker
 *
 * There was going to be one, and it earned nothing. Someone naming an aspect
 * the best thing about a place will rate it 4 or 5 every time, and someone
 * naming it a letdown will rate it 1 or 2 — the star adds a tap and repeats
 * what the chip already said.
 *
 * The magnitude comes from the count instead: 18 of 20 reviews calling the
 * food best is a much stronger claim than 2 of 20, and no single reviewer's
 * star rating could carry that. So a review contributes at most one +1 and
 * one −1, both by tapping a chip, and the population supplies the scale.
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
 * How many reviews it takes for an aspect to carry roughly half its raw
 * weight. Higher = more conservative, scores hug the overall rating longer.
 * At K=5: 1 review moves 17% of the way, 5 moves 50%, 20 moves 80%.
 */
export const CONFIDENCE_K = 5;

/** The bounds a star score can occupy. 1 is the floor because a 0-star rating
    isn't selectable in the picker — see StarPicker. */
const MIN_STARS = 1;
const MAX_STARS = 5;

/**
 * Two tap-counts. No stars — see "Why there is no per-aspect star picker".
 */
export type AspectVotes = {
  /** Reviews naming this aspect the best thing about the place. */
  praised: number;
  /** Reviews naming this aspect as the thing that let them down. */
  faulted: number;
};

export type AspectScore = {
  aspect: Aspect;
  /** Null when there are no reviews at all — an honest gap, not a 0. */
  stars: number | null;
  praised: number;
  faulted: number;
  /** Signed vote balance before damping, in [-1, +1]. */
  net: number;
  /** What fraction of `net` actually reached the score, given the sample. */
  confidence: number;
  /** True when nobody voted either way — the score is the overall rating. */
  unremarked: boolean;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * One aspect's score. `overall` is the restaurant's own average star rating
 * from its PlateMaps reviews; `reviewCount` is how many reviews that average
 * is drawn from.
 */
export function aspectScore(
  aspect: Aspect,
  overall: number,
  votes: AspectVotes,
  reviewCount: number,
  k: number = CONFIDENCE_K,
): AspectScore {
  const base = {
    aspect,
    praised: votes.praised,
    faulted: votes.faulted,
    unremarked: votes.praised === 0 && votes.faulted === 0,
  };

  if (reviewCount <= 0) {
    return { ...base, stars: null, net: 0, confidence: 0, unremarked: true };
  }

  // Each review can praise at most one aspect and fault at most one, so this
  // is already in range; clamped anyway so bad data can't push a score out of
  // bounds silently.
  const net = clamp((votes.praised - votes.faulted) / reviewCount, -1, 1);
  const confidence = reviewCount / (reviewCount + k);
  const moved = net * confidence;

  // Scale by the room the restaurant's own rating leaves in that direction,
  // so praise can never push an aspect past 5 and complaints can never push
  // one below 1 — and a 3-star place can't have a 4.9 aspect on vote share
  // alone.
  const stars =
    moved >= 0
      ? overall + (MAX_STARS - overall) * moved
      : overall + (overall - MIN_STARS) * moved;

  return { ...base, stars: clamp(stars, MIN_STARS, MAX_STARS), net, confidence };
}

/**
 * Every aspect's score for one restaurant, in the order given. Aspects with no
 * votes come back flagged `unremarked` rather than omitted, so the caller can
 * decide whether to name them as unrated or leave them out.
 */
export function aspectScores(
  aspects: readonly Aspect[],
  overall: number,
  votes: Partial<Record<Aspect, AspectVotes>>,
  reviewCount: number,
  k: number = CONFIDENCE_K,
): AspectScore[] {
  return aspects.map((aspect) =>
    aspectScore(aspect, overall, votes[aspect] ?? { praised: 0, faulted: 0 }, reviewCount, k),
  );
}

/**
 * The aspect a restaurant is best at — derived rather than asked, since the
 * highest-scoring aspect is exactly what "best at" meant. Null when nothing
 * was ever voted on, so the caller can say so instead of naming a winner
 * chosen by tie-break.
 */
export function bestAspect(scores: AspectScore[]): AspectScore | null {
  const voted = scores.filter((s) => !s.unremarked && s.stars !== null);
  if (voted.length === 0) return null;
  return voted.reduce((best, s) => (s.stars! > best.stars! ? s : best));
}

/** The aspect most often called out as a letdown, if anyone did. */
export function weakestAspect(scores: AspectScore[]): AspectScore | null {
  const faulted = scores.filter((s) => s.faulted > 0 && s.stars !== null);
  if (faulted.length === 0) return null;
  return faulted.reduce((worst, s) => (s.stars! < worst.stars! ? s : worst));
}
