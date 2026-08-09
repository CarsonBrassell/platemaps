import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

const sql = neon(process.env.DATABASE_URL!);

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  points: number;
  monthlyPoints: number;
  monthlyPointsMonth: string;
  avatarUrl?: string;
  /** Off by default — posting a photo is friends-only until this is flipped on. */
  sharePhotosPublicly: boolean;
  favoriteCuisine?: string;
  favoriteRestaurantId?: string;
};

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function effectiveMonthlyPoints(user: User): number {
  return user.monthlyPointsMonth === currentMonthKey() ? user.monthlyPoints : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    points: row.points,
    monthlyPoints: row.monthly_points,
    monthlyPointsMonth: row.monthly_points_month,
    avatarUrl: row.avatar_url ?? undefined,
    sharePhotosPublicly: row.share_photos_publicly ?? false,
    favoriteCuisine: row.favorite_cuisine ?? undefined,
    favoriteRestaurantId: row.favorite_restaurant_id ?? undefined,
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE lower(email) = lower(${email})`;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function createUser(data: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}): Promise<User> {
  const rows = await sql`
    INSERT INTO users (id, name, email, password_hash)
    VALUES (${data.id}, ${data.name}, ${data.email}, ${data.passwordHash})
    RETURNING *
  `;
  return rowToUser(rows[0]);
}

export async function updateUserAvatar(id: string, avatarUrl: string): Promise<User | null> {
  const rows = await sql`
    UPDATE users SET avatar_url = ${avatarUrl} WHERE id = ${id} RETURNING *
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

/**
 * Writes one row to the point ledger and folds the same amount into the
 * cached totals on `users`. Every award in the app goes through here so the
 * windowed leaderboards stay consistent with users.points.
 *
 * `reason` is free-form except for milestone bonuses, which must be
 * "milestone:<postId>:<likes>" — a partial unique index on that prefix is
 * what guarantees a bonus pays out at most once.
 */
export async function awardPoints(
  userId: string,
  amount: number,
  reason: string
): Promise<User | null> {
  if (amount === 0) return getUserById(userId);

  if (reason.startsWith("milestone:")) {
    const inserted = await sql`
      INSERT INTO point_events (id, user_id, amount, reason)
      VALUES (${randomUUID()}, ${userId}, ${amount}, ${reason})
      ON CONFLICT (reason) WHERE reason LIKE 'milestone:%' DO NOTHING
      RETURNING id
    `;
    // Already paid out — leave totals untouched.
    if (inserted.length === 0) return getUserById(userId);
  } else {
    await sql`
      INSERT INTO point_events (id, user_id, amount, reason)
      VALUES (${randomUUID()}, ${userId}, ${amount}, ${reason})
    `;
  }

  const monthKey = currentMonthKey();
  const rows = await sql`
    UPDATE users
    SET
      points = points + ${amount},
      monthly_points = CASE WHEN monthly_points_month = ${monthKey}
        THEN monthly_points + ${amount} ELSE ${amount} END,
      monthly_points_month = ${monthKey}
    WHERE id = ${userId}
    RETURNING *
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export type LeaderboardWindow = "today" | "week" | "month" | "all";

export type LeaderboardEntry = {
  id: string;
  name: string;
  avatarUrl?: string;
  points: number;
  rank: number;
  postCount: number;
  /** Places gained (+) or lost (-) vs the preceding window; null for all-time. */
  rankChange: number | null;
};

/**
 * Start of the requested window, and of the equal-length window before it —
 * the second is what makes rank movement computable. All-time has neither.
 */
function windowBounds(w: LeaderboardWindow): { start: Date; prevStart: Date } | null {
  if (w === "all") return null;
  const start = new Date();
  if (w === "today") {
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCDate(start.getUTCDate() - (w === "week" ? 7 : 30));
  }
  const spanMs = Date.now() - start.getTime();
  return { start, prevStart: new Date(start.getTime() - spanMs) };
}

export async function getLeaderboard(
  window: LeaderboardWindow = "week",
  limit = 10
): Promise<LeaderboardEntry[]> {
  const bounds = windowBounds(window);

  if (!bounds) {
    const rows = await sql`
      SELECT u.id, u.name, u.avatar_url, u.points AS pts,
             RANK() OVER (ORDER BY u.points DESC)::int AS rnk,
             (SELECT count(*) FROM posts po WHERE po.user_id = u.id)::int AS post_count
      FROM users u
      WHERE u.points > 0
      ORDER BY u.points DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      avatarUrl: (r.avatar_url as string | null) ?? undefined,
      points: r.pts as number,
      rank: r.rnk as number,
      postCount: r.post_count as number,
      rankChange: null,
    }));
  }

  const rows = await sql`
    WITH cur AS (
      SELECT user_id, SUM(amount)::int AS pts
      FROM point_events WHERE created_at >= ${bounds.start.toISOString()}
      GROUP BY user_id
    ),
    prev AS (
      SELECT user_id, SUM(amount)::int AS pts
      FROM point_events
      WHERE created_at >= ${bounds.prevStart.toISOString()}
        AND created_at < ${bounds.start.toISOString()}
      GROUP BY user_id
    ),
    cur_ranked AS (
      SELECT user_id, pts, RANK() OVER (ORDER BY pts DESC)::int AS rnk FROM cur
    ),
    prev_ranked AS (
      SELECT user_id, RANK() OVER (ORDER BY pts DESC)::int AS rnk FROM prev
    )
    SELECT u.id, u.name, u.avatar_url, c.pts, c.rnk, p.rnk AS prev_rnk,
           (SELECT count(*) FROM posts po
             WHERE po.user_id = u.id
               AND po.created_at >= ${bounds.start.toISOString()})::int AS post_count
    FROM cur_ranked c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN prev_ranked p ON p.user_id = c.user_id
    WHERE c.pts > 0
    ORDER BY c.rnk ASC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    avatarUrl: (r.avatar_url as string | null) ?? undefined,
    points: r.pts as number,
    rank: r.rnk as number,
    postCount: r.post_count as number,
    // Unranked last window means "new to the board", not a fall.
    rankChange: r.prev_rnk === null ? null : (r.prev_rnk as number) - (r.rnk as number),
  }));
}

export type UserRank = {
  rank: number | null;
  points: number;
  /** Points needed to catch the person one place above; null when already #1. */
  pointsToNext: number | null;
};

export async function getUserRank(
  userId: string,
  window: LeaderboardWindow = "week"
): Promise<UserRank> {
  const bounds = windowBounds(window);

  const rows = bounds
    ? await sql`
        WITH cur AS (
          SELECT user_id, SUM(amount)::int AS pts
          FROM point_events WHERE created_at >= ${bounds.start.toISOString()}
          GROUP BY user_id HAVING SUM(amount) > 0
        )
        SELECT pts, rnk, (
          SELECT MIN(c2.pts) FROM cur c2 WHERE c2.pts > r.pts
        ) AS next_pts
        FROM (SELECT user_id, pts, RANK() OVER (ORDER BY pts DESC)::int AS rnk FROM cur) r
        WHERE r.user_id = ${userId}
      `
    : await sql`
        SELECT pts, rnk, (
          SELECT MIN(u2.points) FROM users u2 WHERE u2.points > r.pts
        ) AS next_pts
        FROM (
          SELECT id, points AS pts, RANK() OVER (ORDER BY points DESC)::int AS rnk
          FROM users WHERE points > 0
        ) r
        WHERE r.id = ${userId}
      `;

  const row = rows[0];
  if (!row) return { rank: null, points: 0, pointsToNext: null };

  const points = row.pts as number;
  const nextPts = row.next_pts as number | null;
  return {
    rank: row.rnk as number,
    points,
    pointsToNext: nextPts === null ? null : nextPts - points,
  };
}

// One-directional follows (followUser/unfollowUser/getFollowingIds) are
// retired — the spec is explicit that one-directional follows aren't
// supported. Mutual friend requests (below) replace them. The `follows`
// table itself is left in place, same as post_likes/post_votes, rather than
// dropped.

export async function getSessionUserId(token: string): Promise<string | null> {
  const rows = await sql`SELECT user_id FROM sessions WHERE token = ${token}`;
  return (rows[0]?.user_id as string | undefined) ?? null;
}

export async function createSession(token: string, userId: string): Promise<void> {
  await sql`INSERT INTO sessions (token, user_id) VALUES (${token}, ${userId})`;
}

export async function deleteSession(token: string): Promise<void> {
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

export type Comment = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  createdAt: string;
  likedBy: string[];
};

export type PostMedia = {
  url: string;
  type: "image" | "video";
  alt?: string;
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
  /**
   * A restaurant review's star count (1-5) or a dish review's percent
   * (0-100) — which one `ratingKind` says. Undefined `ratingKind` on a row
   * that still has a `rating` means the row predates this split: it's a
   * flattened 0-10 number from the old single-scale scheme, kept rendering
   * that way rather than reinterpreted.
   */
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  locationLabel?: string;
  tags: string[];
  amenities: string[];
  vibe?: string;
  media: PostMedia[];
  /**
   * Snapshot of the author's share-photos toggle at the moment this post was
   * created — not a live read of users.share_photos_publicly. That's what
   * keeps flipping the toggle on non-retroactive: this stays whatever it was
   * born as regardless of later account changes.
   */
  photosPublic: boolean;
  createdAt: string;
  /**
   * Public, ranks Discover. The full upvoter list has no privacy reason to
   * exist — anyone can already see the count — so this is just a total.
   */
  upvoteCount: number;
  /** Whether the requesting viewer has upvoted this post. False with no viewer. */
  upvotedByMe: boolean;
  /**
   * Whether the requesting viewer has hearted this post. Deliberately NOT a
   * full heartedBy list — the author-only "who hearted this" view is a
   * separate, access-checked function (getHeartsForAuthor), never folded into
   * the shape every viewer of a post receives.
   */
  heartedByMe: boolean;
  savedBy: string[];
  comments: Comment[];
};

/**
 * `includeHearts` defaults true for getPosts/getPostById/getFriendsFeed,
 * where heartedByMe is legitimate per-viewer state. getDiscoverFeed passes
 * false: Discover's PostActions has no heart control at all (its
 * PostActionsProps variant doesn't even have a `hearted` field), so there is
 * no use for the value there — and this is what makes "getDiscoverFeed never
 * touches post_hearts" a literal, mechanical fact about this function's own
 * call graph, not just a true-in-practice observation about an unused field.
 */
async function hydratePosts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postRows: any[],
  viewerId: string | null = null,
  includeHearts = true,
): Promise<Post[]> {
  if (postRows.length === 0) return [];
  const ids = postRows.map((r) => r.id as string);

  const [saveRows, commentRows, commentLikeRows, upvoteCountRows, myUpvoteRows, myHeartRows] =
    await Promise.all([
      sql`SELECT post_id, user_id FROM post_saves WHERE post_id = ANY(${ids})`,
      sql`
        SELECT c.id, c.post_id, c.user_id, c.text, c.created_at,
               u.name AS author_name, u.avatar_url AS author_avatar_url
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.post_id = ANY(${ids})
        ORDER BY c.created_at ASC
      `,
      sql`
        SELECT cl.comment_id, cl.user_id
        FROM comment_likes cl
        JOIN comments c ON c.id = cl.comment_id
        WHERE c.post_id = ANY(${ids})
      `,
      sql`
        SELECT post_id, count(*)::int AS count
        FROM post_upvotes WHERE post_id = ANY(${ids})
        GROUP BY post_id
      `,
      // Scoped to the viewer's own row only — never the full upvoter list's
      // counterpart for hearts, and upvotes are public anyway so this is just
      // a convenience, not a privacy boundary.
      viewerId
        ? sql`SELECT post_id FROM post_upvotes WHERE post_id = ANY(${ids}) AND user_id = ${viewerId}`
        : Promise.resolve([]),
      // The privacy boundary: this is the ONLY heart data hydratePosts ever
      // reads, and it is scoped to "did this one viewer heart it" — never the
      // full list of who did. getHeartsForAuthor is the only place that list
      // exists, and it is access-checked there. Skipped entirely when the
      // caller is Discover — see includeHearts above.
      viewerId && includeHearts
        ? sql`SELECT post_id FROM post_hearts WHERE post_id = ANY(${ids}) AND user_id = ${viewerId}`
        : Promise.resolve([]),
    ]);

  const upvoteCounts = new Map(upvoteCountRows.map((r) => [r.post_id as string, r.count as number]));
  const myUpvotes = new Set(myUpvoteRows.map((r) => r.post_id as string));
  const myHearts = new Set(myHeartRows.map((r) => r.post_id as string));

  return postRows.map((row) => {
    const postId = row.id as string;
    return {
      id: postId,
      userId: row.user_id,
      authorName: row.author_name,
      authorAvatarUrl: row.author_avatar_url ?? undefined,
      authorPoints: row.author_points ?? 0,
      text: row.text,
      restaurant: row.restaurant ?? undefined,
      restaurantId: row.restaurant_id ?? undefined,
      restaurantLat: row.restaurant_lat === null ? undefined : Number(row.restaurant_lat),
      restaurantLng: row.restaurant_lng === null ? undefined : Number(row.restaurant_lng),
      dishName: row.dish_name ?? undefined,
      price: row.price ?? undefined,
      // NUMERIC comes back as a string over the HTTP driver.
      rating: row.rating === null || row.rating === undefined ? undefined : Number(row.rating),
      ratingKind: row.rating_kind ?? undefined,
      locationLabel: row.location_label ?? undefined,
      tags: (row.tags as string[] | null) ?? [],
      amenities: (row.amenities as string[] | null) ?? [],
      vibe: row.vibe ?? undefined,
      media: (row.media as PostMedia[] | null) ?? [],
      photosPublic: row.photos_public ?? false,
      createdAt: new Date(row.created_at).toISOString(),
      upvoteCount: upvoteCounts.get(postId) ?? 0,
      upvotedByMe: myUpvotes.has(postId),
      heartedByMe: myHearts.has(postId),
      savedBy: saveRows.filter((s) => s.post_id === postId).map((s) => s.user_id as string),
      comments: commentRows
        .filter((c) => c.post_id === postId)
        .map((c) => ({
          id: c.id as string,
          userId: c.user_id as string,
          authorName: c.author_name as string,
          authorAvatarUrl: (c.author_avatar_url as string | null) ?? undefined,
          text: c.text as string,
          createdAt: new Date(c.created_at as string).toISOString(),
          likedBy: commentLikeRows
            .filter((cl) => cl.comment_id === c.id)
            .map((cl) => cl.user_id as string),
        })),
    };
  });
}

const POST_SELECT = `
  SELECT p.id, p.user_id, p.text, p.restaurant, p.created_at,
         p.restaurant_id, p.restaurant_lat, p.restaurant_lng,
         p.dish_name, p.price, p.rating, p.rating_kind, p.location_label, p.tags, p.media,
         p.amenities, p.vibe, p.photos_public,
         u.name AS author_name, u.avatar_url AS author_avatar_url,
         u.points AS author_points
  FROM posts p
  JOIN users u ON u.id = p.user_id
`;

export async function getPosts(viewerId: string | null = null): Promise<Post[]> {
  const rows = await sql.query(`${POST_SELECT} ORDER BY p.created_at ASC`);
  return hydratePosts(rows, viewerId);
}

export async function getPostById(id: string, viewerId: string | null = null): Promise<Post | null> {
  const rows = await sql.query(`${POST_SELECT} WHERE p.id = $1`, [id]);
  const hydrated = await hydratePosts(rows, viewerId);
  return hydrated[0] ?? null;
}

/**
 * Discover feed: every post, ranked by recency with steep time decay and
 * upvotes as a secondary factor. Same curve as the old client-side hotScore
 * (`(votes + 1) / (ageHours + 2)^1.5`), moved server-side because it now has
 * to join post_upvotes.
 *
 * This function — and only this function plus getUpvoteCounts below — is
 * allowed to touch post_upvotes for ranking/counting purposes. It must never
 * be extended to join post_hearts; that is the one invariant this whole
 * feature exists to hold. If you're adding a signal to this query, it does
 * not belong here unless it is public.
 *
 * Photo privacy is enforced here, not trusted to the client: a post whose
 * photos_public is false has its media stripped from the payload entirely,
 * so a private photo's URL never reaches a Discover response in the first
 * place.
 */
export async function getDiscoverFeed(viewerId: string | null, limit = 30): Promise<Post[]> {
  const rows = await sql`
    SELECT p.id, p.user_id, p.text, p.restaurant, p.created_at,
           p.restaurant_id, p.restaurant_lat, p.restaurant_lng,
           p.dish_name, p.price, p.rating, p.rating_kind, p.location_label, p.tags, p.media,
           p.amenities, p.vibe, p.photos_public,
           u.name AS author_name, u.avatar_url AS author_avatar_url,
           u.points AS author_points,
           COALESCE(uv.count, 0)::int AS upvote_count
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, count(*) AS count FROM post_upvotes GROUP BY post_id
    ) uv ON uv.post_id = p.id
    ORDER BY
      (COALESCE(uv.count, 0) + 1)
        / POWER(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600 + 2, 1.5) DESC
    LIMIT ${limit}
  `;
  const posts = await hydratePosts(rows, viewerId, /* includeHearts */ false);
  // hydratePosts already computed upvoteCount from a fresh count; the ranking
  // query's own count was only needed for ORDER BY and is discarded here.
  return posts.map((p) => ({
    ...p,
    media: p.photosPublic ? p.media : [],
  }));
}

/**
 * Friends tab: strictly chronological, only mutual friends, every post
 * appears. No ranking math, no engagement join — the spec is explicit that
 * this feed does not sort by engagement at all. Photos always show for a
 * friend's post regardless of photosPublic; that flag only gates Discover.
 */
export async function getFriendsFeed(viewerId: string, limit = 60): Promise<Post[]> {
  const rows = await sql`
    ${sql.unsafe(POST_SELECT)}
    WHERE p.user_id IN (
      SELECT CASE WHEN f.user_a = ${viewerId} THEN f.user_b ELSE f.user_a END
      FROM friendships f
      WHERE f.user_a = ${viewerId} OR f.user_b = ${viewerId}
    )
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `;
  return hydratePosts(rows, viewerId);
}

export async function createPost(data: {
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
  /** Native units — a 1-5 star count with ratingKind "restaurant", or a
      0-100 percent with ratingKind "dish". Never a pre-converted /10 value;
      the API route is what enforces that pairing before this is called. */
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  locationLabel?: string;
  tags?: string[];
  amenities?: string[];
  vibe?: string;
  media?: PostMedia[];
  /**
   * The author's share-photos setting AT THIS MOMENT — the caller reads
   * users.share_photos_publicly and passes it in, rather than this function
   * reading it live, so the value gets frozen onto the row exactly once and
   * never drifts if the setting changes later.
   */
  photosPublic: boolean;
}): Promise<Post> {
  const tags = data.tags ?? [];
  const amenities = data.amenities ?? [];
  const media = data.media ?? [];
  const rows = await sql`
    INSERT INTO posts (
      id, user_id, text, restaurant, restaurant_id, restaurant_lat, restaurant_lng,
      dish_name, price, rating, rating_kind, location_label, tags, media, amenities, vibe,
      photos_public
    )
    VALUES (
      ${data.id}, ${data.userId}, ${data.text}, ${data.restaurant ?? null},
      ${data.restaurantId ?? null}, ${data.restaurantLat ?? null}, ${data.restaurantLng ?? null},
      ${data.dishName ?? null}, ${data.price ?? null}, ${data.rating ?? null}, ${data.ratingKind ?? null},
      ${data.locationLabel ?? null}, ${tags}, ${JSON.stringify(media)}::jsonb,
      ${amenities}, ${data.vibe ?? null}, ${data.photosPublic}
    )
    RETURNING created_at
  `;
  return {
    id: data.id,
    userId: data.userId,
    authorName: data.authorName,
    authorAvatarUrl: data.authorAvatarUrl,
    authorPoints: data.authorPoints,
    text: data.text,
    restaurant: data.restaurant,
    restaurantId: data.restaurantId,
    restaurantLat: data.restaurantLat,
    restaurantLng: data.restaurantLng,
    dishName: data.dishName,
    price: data.price,
    rating: data.rating,
    ratingKind: data.ratingKind,
    locationLabel: data.locationLabel,
    tags,
    amenities,
    vibe: data.vibe,
    media,
    photosPublic: data.photosPublic,
    createdAt: new Date(rows[0].created_at).toISOString(),
    upvoteCount: 0,
    upvotedByMe: false,
    heartedByMe: false,
    savedBy: [],
    comments: [],
  };
}

export async function deletePost(id: string): Promise<void> {
  await sql`DELETE FROM posts WHERE id = ${id}`;
}

export async function addComment(
  postId: string,
  data: { id: string; userId: string; text: string }
): Promise<Comment> {
  const rows = await sql`
    INSERT INTO comments (id, post_id, user_id, text)
    VALUES (${data.id}, ${postId}, ${data.userId}, ${data.text})
    RETURNING created_at
  `;
  const user = await getUserById(data.userId);
  return {
    id: data.id,
    userId: data.userId,
    authorName: user?.name ?? "",
    authorAvatarUrl: user?.avatarUrl,
    text: data.text,
    createdAt: new Date(rows[0].created_at).toISOString(),
    likedBy: [],
  };
}

export async function toggleCommentLike(
  commentId: string,
  userId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const existing = await sql`
    SELECT 1 FROM comment_likes WHERE comment_id = ${commentId} AND user_id = ${userId}
  `;
  if (existing.length > 0) {
    await sql`DELETE FROM comment_likes WHERE comment_id = ${commentId} AND user_id = ${userId}`;
  } else {
    await sql`INSERT INTO comment_likes (comment_id, user_id) VALUES (${commentId}, ${userId})`;
  }
  const rows = await sql`
    SELECT count(*)::int AS count FROM comment_likes WHERE comment_id = ${commentId}
  `;
  return { liked: existing.length === 0, likeCount: rows[0].count as number };
}

/**
 * Discover's upvote. Public — the count this returns is exactly what every
 * viewer of the post sees, including the requester's own toggle. Mirrors the
 * old toggleLike, which this replaces: post_likes is retired, not this
 * function's shape.
 */
export async function toggleUpvote(
  postId: string,
  userId: string
): Promise<{ upvoted: boolean; upvoteCount: number; firstTimeUpvote: boolean }> {
  const existing = await sql`
    SELECT 1 FROM post_upvotes WHERE post_id = ${postId} AND user_id = ${userId}
  `;
  const firstTimeUpvote = existing.length === 0;

  if (firstTimeUpvote) {
    await sql`INSERT INTO post_upvotes (post_id, user_id) VALUES (${postId}, ${userId})`;
  } else {
    await sql`DELETE FROM post_upvotes WHERE post_id = ${postId} AND user_id = ${userId}`;
  }

  const countRows = await sql`
    SELECT count(*)::int AS count FROM post_upvotes WHERE post_id = ${postId}
  `;

  return { upvoted: firstTimeUpvote, upvoteCount: countRows[0].count as number, firstTimeUpvote };
}

/**
 * Friends' heart. Deliberately returns no count — see getHeartsForAuthor for
 * the one place a heart count is ever computed, and its access check. Any
 * function that could hand a heart count to an arbitrary caller is exactly
 * the leak this feature exists to prevent, so this one doesn't have the
 * option.
 */
export async function toggleHeart(postId: string, userId: string): Promise<{ hearted: boolean }> {
  const existing = await sql`
    SELECT 1 FROM post_hearts WHERE post_id = ${postId} AND user_id = ${userId}
  `;
  const nowHearted = existing.length === 0;

  if (nowHearted) {
    await sql`INSERT INTO post_hearts (post_id, user_id) VALUES (${postId}, ${userId})`;
  } else {
    await sql`DELETE FROM post_hearts WHERE post_id = ${postId} AND user_id = ${userId}`;
  }

  return { hearted: nowHearted };
}

export type HeartedBy = { userId: string; name: string; avatarUrl?: string };

/**
 * "Who hearted this" — the one place a post's full heart list is ever
 * materialized, and the access check lives inside the function rather than
 * trusted to callers: this throws unless `requesterId` is the post's own
 * author, so there is no code path in the app that can hand this list to
 * anyone else, including by future-developer mistake at a call site.
 */
export async function getHeartsForAuthor(
  postId: string,
  requesterId: string
): Promise<HeartedBy[]> {
  const postRows = await sql`SELECT user_id FROM posts WHERE id = ${postId}`;
  const authorId = postRows[0]?.user_id as string | undefined;
  if (!authorId || authorId !== requesterId) {
    throw new Error("Only a post's author can see who hearted it.");
  }

  const rows = await sql`
    SELECT u.id, u.name, u.avatar_url
    FROM post_hearts h
    JOIN users u ON u.id = h.user_id
    WHERE h.post_id = ${postId}
    ORDER BY h.created_at DESC
  `;
  return rows.map((r) => ({
    userId: r.id as string,
    name: r.name as string,
    avatarUrl: (r.avatar_url as string | null) ?? undefined,
  }));
}

export async function toggleSave(postId: string, userId: string): Promise<boolean> {
  const existing = await sql`
    SELECT 1 FROM post_saves WHERE post_id = ${postId} AND user_id = ${userId}
  `;
  if (existing.length > 0) {
    await sql`DELETE FROM post_saves WHERE post_id = ${postId} AND user_id = ${userId}`;
    return false;
  }
  await sql`INSERT INTO post_saves (post_id, user_id) VALUES (${postId}, ${userId})`;
  return true;
}

// castVote ("would you eat this?") is gone — post_votes fed the up/down arrow
// pair that toggleUpvote/toggleHeart just replaced. See the note above
// post_votes in migrate.mjs: the table is left in place with its data, this
// function just no longer exists to write to it.

// --- Friends: mutual friend requests ------------------------------------

export type FriendStatus = "none" | "friends" | "requested" | "incoming";

/**
 * Where two users stand relative to each other, from `viewerId`'s point of
 * view — "requested" (viewer sent it, awaiting the other side) and
 * "incoming" (the other side sent it, awaiting viewer) are deliberately
 * distinct so a Friend button can render "Request sent" vs "Accept" instead
 * of a single ambiguous "Pending".
 */
export async function getFriendStatus(viewerId: string, otherId: string): Promise<FriendStatus> {
  if (viewerId === otherId) return "none";

  const [a, b] = viewerId < otherId ? [viewerId, otherId] : [otherId, viewerId];
  const friendRows = await sql`
    SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}
  `;
  if (friendRows.length > 0) return "friends";

  const requestRows = await sql`
    SELECT requester_id FROM friend_requests
    WHERE status = 'pending'
      AND ((requester_id = ${viewerId} AND recipient_id = ${otherId})
        OR (requester_id = ${otherId} AND recipient_id = ${viewerId}))
  `;
  const requesterId = requestRows[0]?.requester_id as string | undefined;
  if (!requesterId) return "none";
  return requesterId === viewerId ? "requested" : "incoming";
}

/**
 * Sends a request, or — if the other person already sent one — accepts it
 * outright instead of creating a second pending row. Two people requesting
 * each other independently becomes friends immediately rather than needing
 * either of them to separately hit "accept" on a request that says what they
 * already asked for.
 */
export async function sendFriendRequest(
  requesterId: string,
  recipientId: string
): Promise<FriendStatus> {
  if (requesterId === recipientId) return "none";

  const reciprocal = await sql`
    SELECT id FROM friend_requests
    WHERE requester_id = ${recipientId} AND recipient_id = ${requesterId} AND status = 'pending'
  `;
  if (reciprocal.length > 0) {
    await acceptFriendRequest(reciprocal[0].id as string, requesterId);
    return "friends";
  }

  await sql`
    INSERT INTO friend_requests (id, requester_id, recipient_id)
    VALUES (${randomUUID()}, ${requesterId}, ${recipientId})
    ON CONFLICT (requester_id, recipient_id) DO UPDATE SET status = 'pending'
  `;
  return "requested";
}

/**
 * `respondingUserId` must be the request's recipient — a requester accepting
 * their own outgoing request would let one person will a friendship into
 * existence unilaterally, exactly what "both people must accept" rules out.
 */
export async function acceptFriendRequest(requestId: string, respondingUserId: string): Promise<void> {
  const rows = await sql`
    SELECT requester_id, recipient_id FROM friend_requests WHERE id = ${requestId}
  `;
  const request = rows[0] as { requester_id: string; recipient_id: string } | undefined;
  if (!request || request.recipient_id !== respondingUserId) {
    throw new Error("Only the recipient of a friend request can accept it.");
  }

  const [a, b] =
    request.requester_id < request.recipient_id
      ? [request.requester_id, request.recipient_id]
      : [request.recipient_id, request.requester_id];

  await sql`
    INSERT INTO friendships (user_a, user_b) VALUES (${a}, ${b})
    ON CONFLICT DO NOTHING
  `;
  await sql`DELETE FROM friend_requests WHERE id = ${requestId}`;
}

export async function declineFriendRequest(requestId: string, respondingUserId: string): Promise<void> {
  const rows = await sql`
    SELECT recipient_id FROM friend_requests WHERE id = ${requestId}
  `;
  if (rows[0]?.recipient_id !== respondingUserId) {
    throw new Error("Only the recipient of a friend request can decline it.");
  }
  await sql`DELETE FROM friend_requests WHERE id = ${requestId}`;
}

/** Removes an existing friendship. Either side can end it. */
export async function unfriend(userId: string, otherId: string): Promise<void> {
  const [a, b] = userId < otherId ? [userId, otherId] : [otherId, userId];
  await sql`DELETE FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
}

export type FriendRequestSummary = {
  id: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
};

export async function getFriendIds(userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT CASE WHEN user_a = ${userId} THEN user_b ELSE user_a END AS friend_id
    FROM friendships WHERE user_a = ${userId} OR user_b = ${userId}
  `;
  return rows.map((r) => r.friend_id as string);
}

/** Incoming (need this user's response) and outgoing (awaiting the other side). */
export async function getPendingFriendRequests(
  userId: string
): Promise<{ incoming: FriendRequestSummary[]; outgoing: FriendRequestSummary[] }> {
  const [incomingRows, outgoingRows] = await Promise.all([
    sql`
      SELECT fr.id, u.id AS user_id, u.name, u.avatar_url, fr.created_at
      FROM friend_requests fr
      JOIN users u ON u.id = fr.requester_id
      WHERE fr.recipient_id = ${userId} AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `,
    sql`
      SELECT fr.id, u.id AS user_id, u.name, u.avatar_url, fr.created_at
      FROM friend_requests fr
      JOIN users u ON u.id = fr.recipient_id
      WHERE fr.requester_id = ${userId} AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `,
  ]);

  const toSummary = (r: (typeof incomingRows)[number]): FriendRequestSummary => ({
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    avatarUrl: (r.avatar_url as string | null) ?? undefined,
    createdAt: new Date(r.created_at as string).toISOString(),
  });

  return { incoming: incomingRows.map(toSummary), outgoing: outgoingRows.map(toSummary) };
}

// --- Profile favorites -----------------------------------------------------

/**
 * Structured references, not free text — `cuisine` is validated by the
 * caller against `cuisines` from data/restaurants.ts (there's no cuisines
 * table to constrain against here), and `restaurantId` is just stored as
 * given; the profile page resolves it against the static restaurants array
 * the same way findDishId already resolves dish references.
 */
export async function updateFavorites(
  userId: string,
  data: { cuisine?: string | null; restaurantId?: string | null }
): Promise<void> {
  if (data.cuisine !== undefined) {
    await sql`UPDATE users SET favorite_cuisine = ${data.cuisine} WHERE id = ${userId}`;
  }
  if (data.restaurantId !== undefined) {
    await sql`UPDATE users SET favorite_restaurant_id = ${data.restaurantId} WHERE id = ${userId}`;
  }
}

export async function updatePhotoSharing(userId: string, enabled: boolean): Promise<void> {
  await sql`UPDATE users SET share_photos_publicly = ${enabled} WHERE id = ${userId}`;
}

export type PublicProfile = {
  id: string;
  name: string;
  avatarUrl?: string;
  points: number;
  favoriteCuisine?: string;
  favoriteRestaurantId?: string;
};

/**
 * What a profile page is allowed to show, by construction: this selects
 * exactly the columns the spec lists (name, avatar, favorites, points) and
 * nothing that could be used to browse a post history — there is no posts
 * join here at all, not even one that's filtered down to "empty."
 */
export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const rows = await sql`
    SELECT id, name, avatar_url, points, favorite_cuisine, favorite_restaurant_id
    FROM users WHERE id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    avatarUrl: (row.avatar_url as string | null) ?? undefined,
    points: row.points as number,
    favoriteCuisine: (row.favorite_cuisine as string | null) ?? undefined,
    favoriteRestaurantId: (row.favorite_restaurant_id as string | null) ?? undefined,
  };
}
