export type MapComment = {
  id: string;
  restaurantId: string;
  text: string;
  score?: number;
  upvotes?: number;
  /** Whether the signed-in user has already upvoted the underlying post. */
  upvotedByMe?: boolean;
  /** Downvote twin of upvotedByMe — never true at the same time. */
  downvotedByMe?: boolean;
  /** Whether the signed-in user has already hearted the underlying post —
      only meaningful when the map is showing Friends-sourced data. */
  heartedByMe?: boolean;
  createdAt?: string;
  /** Poster's handle, shown in the bubble's mono meta row (`@DANNYQ`). */
  author?: string;
  /** The poster's user id — where tapping the handle goes (`/u/[id]`). */
  authorId?: string;
  rating?: string | null;
  dishPrefix?: string | null;
  /** Replies on the underlying post. */
  commentCount?: number;
  postId?: string;
  /** The dish this bubble is about, by name. */
  dishName?: string;
  dishId?: string;
  /**
   * The post's first image, for the photo drawer on its bubble. Only ever set
   * from `Post.media`, which hydratePosts has already gated (author, mutual
   * friend, or photos_public) — a photo the viewer may not see never reaches
   * here, so a bubble never offers one.
   */
  photoUrl?: string;
};
