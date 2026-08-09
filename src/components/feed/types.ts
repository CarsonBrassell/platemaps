/** Client-side mirror of the `Post` row shape returned by /api/posts. */
export type PostMedia = {
  url: string;
  type: "image" | "video";
  alt?: string;
};

export type Comment = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  createdAt: string;
  likedBy: string[];
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
  dishName?: string;
  price?: string;
  /** Native scale: 1-5 stars with ratingKind "restaurant", 0-100% with
      ratingKind "dish". No ratingKind on a row that still has a rating means
      the row predates the split — a flattened /10 number, kept rendering
      that way rather than reinterpreted. */
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  locationLabel?: string;
  tags: string[];
  amenities: string[];
  vibe?: string;
  media: PostMedia[];
  /** Snapshot of the author's share-photos setting at post time — see lib/db.ts. */
  photosPublic: boolean;
  createdAt: string;
  /** Public, ranks Discover. */
  upvoteCount: number;
  upvotedByMe: boolean;
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

export type FeedTab = "discover" | "friends" | "map";
