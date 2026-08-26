/**
 * Every Plate Point rule lives here. Changing a number in this file changes the
 * economy everywhere — the award logic in the API routes, the "How points
 * work" modal, and the copy shown on the composer all read from it.
 *
 * Points accrue to the person whose content earned them: the post author gets
 * the point when someone else likes or comments, not the person clicking.
 */
export const POINT_RULES = {
  /**
   * Publishing pays nothing, and that is the anti-spam design.
   *
   * It used to be +10 — the largest single award in the table, and the only one
   * you could collect by yourself. That is exactly backwards: it made the
   * cheapest possible act the most reliably profitable one, so the way to farm
   * points was to post as much as possible and never mind whether any of it was
   * worth reading.
   *
   * Every remaining rule requires *somebody else to act* — an upvote, a
   * comment, a comment upvote, a milestone. None of them can be self-dealt, so
   * a post nobody values earns nothing no matter how many of them there are,
   * while a post that lands earns far more than the flat 10 ever did. The
   * encouragement is the upside, not the participation trophy.
   *
   * `awardPoints` returns early on a zero amount, so nothing is written to the
   * ledger and no `point_events` row is created for publishing.
   */
  createPost: 0,
  /**
   * Awarded to the author each time a different user upvotes their post.
   * Discover-only, matching upvotes themselves — hearts earn nothing, since
   * they're meant as pure acknowledgment between friends, not currency.
   */
  receiveUpvote: 1,
  /** Awarded to the author each time someone comments on their post. */
  receiveComment: 2,
  /**
   * Awarded to a comment's author each time a different user upvotes it —
   * worth the same as an upvote on a post. A comment is cheaper to write than
   * a plate, but it is also worth far less to write badly: the thread ranks on
   * the same score, so a reply nobody upvotes earns nothing at all.
   */
  receiveCommentUpvote: 1,
} as const;

/**
 * One-off bonuses for a post crossing an upvote count. Each fires at most
 * once per post (enforced by a unique index on the point_events reason
 * string). Keep sorted ascending by `upvotes`.
 */
export const UPVOTE_MILESTONES: ReadonlyArray<{ upvotes: number; bonus: number }> = [
  { upvotes: 25, bonus: 15 },
  { upvotes: 100, bonus: 50 },
  { upvotes: 500, bonus: 200 },
];

/** Human-readable rules, rendered by PointsInfoModal. */
export const POINT_RULE_COPY: ReadonlyArray<{ label: string; value: string }> = [
  /* No "Post a plate" row. It would read "+0", which is worse than silent —
     a zero in a table of rewards looks like a bug or a punishment, when the
     actual message is that points come from what a post earns, not from
     making one. The rows below say that on their own. */
  { label: "Someone upvotes your post", value: `+${POINT_RULES.receiveUpvote}` },
  { label: "Someone comments on your post", value: `+${POINT_RULES.receiveComment}` },
  { label: "Someone upvotes your comment", value: `+${POINT_RULES.receiveCommentUpvote}` },
  ...UPVOTE_MILESTONES.map((m) => ({
    label: `Your post hits ${m.upvotes} upvotes`,
    value: `+${m.bonus} bonus`,
  })),
];

/**
 * Which milestone (if any) a post crosses by moving to `upvoteCount`. Returns
 * null unless the count landed exactly on a threshold, so a post that gains
 * and loses the same upvote doesn't pay out twice.
 */
export function milestoneFor(upvoteCount: number) {
  return UPVOTE_MILESTONES.find((m) => m.upvotes === upvoteCount) ?? null;
}

/** "1,240" — points are shown grouped everywhere they appear. */
export function formatPoints(points: number) {
  return points.toLocaleString("en-US");
}
