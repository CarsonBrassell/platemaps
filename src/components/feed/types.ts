/** Client-side mirror of the `Post` row shape returned by /api/posts. */
export type PostMedia = {
  url: string;
  type: "image" | "video";
  alt?: string;
};

export type Comment = {
  id: string;
  /** Null on a top-level comment; the comment this replies to otherwise. The
      thread is assembled from these client-side — see CommentsScreen. */
  parentId: string | null;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  createdAt: string;
  /** Public counts, shown only as the net score. Voters are never named. */
  upvoteCount: number;
  downvoteCount: number;
  /** This viewer's vote, or null. Never both directions — see castCommentVote. */
  myVote: "up" | "down" | null;
};

export type Post = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  authorPoints: number;
  text: string;
  restaurant?: string;
  restaurantId?: string;
  restaurantLat?: number;
  restaurantLng?: number;
  /**
   * The listed restaurant this post resolved to, as a key into the `places` map
   * the feed routes send beside the posts. Set by `placesForPosts` in
   * lib/discover.ts, absent when nothing in the corpus matched.
   *
   * Deliberately not the same field as `restaurantId`: that one is what the
   * card links to, and this one can come from a name match. See the note on
   * `placesForPosts`.
   */
  placeId?: string;
  /**
   * The dish on that restaurant's menu, when `dishName` matched a line on it.
   * Also set by `resolvePostRefs`; what the card's dish link points at through
   * `/restaurant/<id>?dish=<dishId>`.
   *
   * Often absent, and that is not a fault: `posts.dish_name` is free text with
   * no id column behind it, so a dish only resolves when what someone typed
   * matches the menu. The card falls back to linking the restaurant.
   */
  dishId?: string;
  dishName?: string;
  price?: string;
  /** Native scale: 1-5 stars with ratingKind "restaurant", 0-100% with
      ratingKind "dish". No ratingKind on a row that still has a rating means
      the row predates the split — a flattened /10 number, kept rendering
      that way rather than reinterpreted. */
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  locationLabel?: string;
  vibe?: string;
  media: PostMedia[];
  /** Snapshot of the author's share-photos setting at post time — see lib/db.ts. */
  photosPublic: boolean;
  createdAt: string;
  /** Public, ranks Discover. Shown as the net score, never on its own. */
  upvoteCount: number;
  downvoteCount: number;
  upvotedByMe: boolean;
  /** Never true at the same time as upvotedByMe — see castVote in lib/db.ts. */
  downvotedByMe: boolean;
  /** Private acknowledgment. Never a count — see lib/db.ts's getHeartsForAuthor. */
  heartedByMe: boolean;
  savedBy: string[];
  comments: Comment[];
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  avatarUrl?: string;
  points: number;
  rank: number;
  postCount: number;
  rankChange: number | null;
};

export type UserRank = {
  rank: number | null;
  points: number;
  pointsToNext: number | null;
};

export type LeaderboardWindow = "today" | "week" | "month" | "all";

/**
 * The three feeds on /feed. They are genuinely three different queries, not
 * one list sliced three ways — and the friend feed is the one that changes the
 * card itself: likes instead of votes, no counts, no points.
 */
export type FeedTab = "discover" | "friends" | "map";

/**
 * Which surface the feed is showing. Named for the nav that used to switch
 * between them; that nav is archived (see archive/nav), but the feed still
 * uses "home" vs "saved" to pick which list it fetches, so the type outlived
 * the rail it was written for.
 */
export type NavKey = "home" | "explore" | "leaderboard" | "saved" | "profile";
