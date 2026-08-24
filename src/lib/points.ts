/**
 * Every Plate Point rule lives here. Changing a number in this file changes the
 * economy everywhere — the award logic in the API routes, the "How points
 * work" modal, and the copy shown on the composer all read from it.
 *
 * Points accrue to the person whose content earned them: the post author gets
 * the point when someone else likes or comments, not the person clicking.
 */
export const POINT_RULES = {
  /** Awarded to the author when they publish a post. */
  createPost: 10,
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
  { label: "Post a plate", value: `+${POINT_RULES.createPost}` },
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
