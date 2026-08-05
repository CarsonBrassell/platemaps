/**
 * Every PM Point rule lives here. Changing a number in this file changes the
 * economy everywhere — the award logic in the API routes, the "How points
 * work" modal, and the copy shown on the composer all read from it.
 *
 * Points accrue to the person whose content earned them: the post author gets
 * the point when someone else likes or comments, not the person clicking.
 */
export const POINT_RULES = {
  /** Awarded to the author when they publish a post. */
  createPost: 10,
  /** Awarded to the author each time a different user likes their post. */
  receiveLike: 1,
  /** Awarded to the author each time someone comments on their post. */
  receiveComment: 2,
} as const;

/**
 * One-off bonuses for a post crossing a like count. Each fires at most once
 * per post (enforced by a unique index on the point_events reason string).
 * Keep sorted ascending by `likes`.
 */
export const LIKE_MILESTONES: ReadonlyArray<{ likes: number; bonus: number }> = [
  { likes: 25, bonus: 15 },
  { likes: 100, bonus: 50 },
  { likes: 500, bonus: 200 },
];

/** Human-readable rules, rendered by PointsInfoModal. */
export const POINT_RULE_COPY: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Post a plate", value: `+${POINT_RULES.createPost}` },
  { label: "Someone likes your post", value: `+${POINT_RULES.receiveLike}` },
  { label: "Someone comments on your post", value: `+${POINT_RULES.receiveComment}` },
  ...LIKE_MILESTONES.map((m) => ({
    label: `Your post hits ${m.likes} likes`,
    value: `+${m.bonus} bonus`,
  })),
];

/**
 * Which milestone (if any) a post crosses by moving to `likeCount`. Returns
 * null unless the count landed exactly on a threshold, so a post that gains
 * and loses the same like doesn't pay out twice.
 */
export function milestoneFor(likeCount: number) {
  return LIKE_MILESTONES.find((m) => m.likes === likeCount) ?? null;
}

/** "1,240" — points are shown grouped everywhere they appear. */
export function formatPoints(points: number) {
  return points.toLocaleString("en-US");
}
