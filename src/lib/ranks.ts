/**
 * The rank ladder — the title a person's Plate Points have earned them.
 *
 * It reads **lifetime** points, and that is not an approximation. Nothing in
 * this app ever subtracts from `users.points`: `awardPoints` in `lib/db.ts`
 * only ever adds, and the pay-once reasons mean that un-voting a post never
 * claws its award back. The stored total already *is* the lifetime figure, so a
 * rank is a derivation rather than a state — no column, no migration, nothing
 * to keep in sync. Move a threshold below and every title moves on the next
 * render.
 *
 * **"Rank" already means something else in this codebase and the two are
 * unrelated.** The leaderboard's rank is a *position* — `RANK() OVER (ORDER BY
 * points DESC)` in `lib/db.ts` — a number that changes when somebody else
 * posts, and that only exists relative to everyone else. This one is a *title*,
 * earned against a fixed threshold and never lost because a stranger overtook
 * you. Nothing here reads the leaderboard and the leaderboard reads nothing
 * here. Don't rename either to resolve the collision; renaming the leaderboard
 * would touch four queries to fix a word.
 *
 * The thresholds are set against the real numbers in `points.ts` rather than
 * against round-looking figures, because the ladder is only meaningful if each
 * step describes something a person actually did:
 *
 * - **Taster, 10** — exactly one published plate (`createPost` is +10). The
 *   first step up is "you posted", so nobody who has contributed anything at
 *   all is still wearing the newcomer badge.
 * - **Regular, 100** — ten plates, or fewer with some traction behind them.
 *   The point where posting has stopped being a one-off.
 * - **Local, 400** — around forty plates. Reachable in a season of steady
 *   posting; not reachable by accident.
 * - **Critic, 1,200** — on the order of a hundred plates plus the upvotes and
 *   comments they draw, or rather fewer if the posts land (a single 100-upvote
 *   milestone is +50 on top of the +1 each).
 * - **Institution, 4,000** — deliberately out of reach for a normal year. The
 *   top of a ladder that everybody reaches is not a top.
 *
 * A rank displays in exactly two places: on the public profile (see the
 * comment at the render site in `app/u/[id]/page.tsx`) and — since 2026-08,
 * at Calvin's request — on the owner's own points panel, as a title plus a
 * progress track toward the next rung (`PlatePointsPanel`'s `showRank`).
 * The second one is the owner reading their own progression, not a third
 * party sizing them up, which is why it lives with the points rather than
 * beside the avatar.
 *
 * ## The ladder also carries weight, and it is deliberately a small one
 *
 * Each rung has a `weight`, and it is how hard that person's dish rating pulls
 * on a plate's average — see `plateScore.ts` for the model it feeds and
 * `db.ts` for the three aggregates that apply it. A title stopped being purely
 * decorative the moment it did that, which is why the numbers below are argued
 * for rather than picked.
 *
 * **Regular is exactly 1.0, and that is the whole design.** It is the neutral
 * anchor: an ordinary established member — ten plates in, still here — counts
 * once, the way they always did. Everyone else is read *against* them. That
 * makes the scale say "trusted a little more than normal" and "a little less
 * than normal", which are claims worth making, instead of "everybody's opinion
 * inflates with tenure", which is what happens the moment the neutral point
 * drifts above 1 and the whole corpus quietly floats upward as it ages.
 *
 * **The spread is narrow on purpose — 0.8 to 1.2, a factor of one and a half
 * end to end.** The job is to tilt ties: when a plate's ratings disagree, the
 * people who have shown up for years lean on it slightly harder than someone
 * who signed up this morning. The job is *not* to let a handful of Critics
 * outvote a hundred ordinary people, and any wider spread starts doing exactly
 * that. Six Institutions at 1.2 still lose to seven Newcomers at 0.8. If this
 * ever needs to be stronger, that is a product decision about whose city this
 * is, not a tuning exercise — widen it knowing what it buys.
 *
 * Newcomer sits below 1.0 rather than at it because zero points means literally
 * nothing has been contributed yet, and a brand-new account is also what a
 * throwaway one looks like. It is still 0.8 and not 0.2: a first rating from a
 * real person is real, and the confidence damping in `plateScore.ts` already
 * handles the thin-sample half of this problem far better than a punitive
 * weight would.
 */

export type RankKey = "newcomer" | "taster" | "regular" | "local" | "critic" | "institution";

export type Rank = {
  key: RankKey;
  /** Shown to the reader. The insignia's accessible name comes from it too. */
  title: string;
  /** Lifetime Plate Points at which this title is earned. */
  minPoints: number;
  /**
   * How hard a rating from this rung pulls on a plate's average. Regular is
   * 1.0 and everything is read against it; see the note above before moving
   * any of these, because the *spacing* is the argument, not the values.
   */
  weight: number;
};

/** Ascending by `minPoints`. `rankFor` and `nextRankFor` both rely on that. */
export const RANKS: readonly Rank[] = [
  { key: "newcomer", title: "Newcomer", minPoints: 0, weight: 0.8 },
  { key: "taster", title: "Taster", minPoints: 10, weight: 0.9 },
  { key: "regular", title: "Regular", minPoints: 100, weight: 1.0 },
  { key: "local", title: "Local", minPoints: 400, weight: 1.05 },
  { key: "critic", title: "Critic", minPoints: 1200, weight: 1.1 },
  { key: "institution", title: "Institution", minPoints: 4000, weight: 1.2 },
];

/**
 * The title `points` has earned. Negative input clamps to Newcomer — the
 * economy cannot produce a negative total today, but this is called with a
 * column value, and a badge is not the place to find out that one went wrong.
 */
export function rankFor(points: number): Rank {
  const earned = Math.max(0, points);
  let earnedRank = RANKS[0];
  for (const rank of RANKS) {
    if (earned < rank.minPoints) break;
    earnedRank = rank;
  }
  return earnedRank;
}

/** The title above this one, or null at the top of the ladder. */
export function nextRankFor(points: number): Rank | null {
  return RANKS.find((rank) => rank.minPoints > Math.max(0, points)) ?? null;
}

/**
 * Points still owed on the next title, or null once there isn't one.
 *
 * Exported because it falls straight out of the table and the first person to
 * want a "34 to go" line should not re-derive it by hand against thresholds
 * that may have moved. Nothing renders it today, on purpose: a progress bar
 * turns a title into a chore, and the profile only states where somebody is.
 */
export function pointsToNextRank(points: number): number | null {
  const next = nextRankFor(points);
  return next ? next.minPoints - Math.max(0, points) : null;
}

/**
 * The pull a rating from someone with this lifetime total carries.
 *
 * Goes through `rankFor` rather than walking the thresholds again, so the
 * ladder is read in exactly one place and a moved threshold cannot mean one
 * thing to a badge and another to a score.
 *
 * The database does not call this — it cannot reach TypeScript mid-aggregate,
 * so `db.ts` compiles the same table down to a SQL `CASE` from `RANKS`. This is
 * the function for everywhere else: a preview script, a "what would this do"
 * check, anything scoring rows already in memory.
 */
export function ratingWeightFor(points: number): number {
  return rankFor(points).weight;
}

/**
 * The row for a key. Falls back to Newcomer rather than returning undefined so
 * callers rendering a badge never have to hold a null branch for a key that,
 * by the type, cannot be missing.
 */
export function rankByKey(key: RankKey): Rank {
  return RANKS.find((rank) => rank.key === key) ?? RANKS[0];
}
