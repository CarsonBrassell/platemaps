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
  dishName?: string;
  price?: string;
  rating?: number;
  locationLabel?: string;
  tags: string[];
  amenities: string[];
  vibe?: string;
  media: PostMedia[];
  createdAt: string;
  likedBy: string[];
  savedBy: string[];
  votedYesBy: string[];
  votedNoBy: string[];
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

export type FeedTab = "for-you" | "following" | "map";
