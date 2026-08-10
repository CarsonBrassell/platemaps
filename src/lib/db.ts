import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import type { Restaurant, RestaurantView } from "@/data/restaurants";
import type { Dish } from "@/data/dishes";
import { bandFor } from "@/data/priceBands";

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
  /**
   * Public too, and the other half of the pair Discover ranks on. Shown to
   * readers only as the net score (upvotes minus downvotes) — the card never
   * prints "12 people disliked this" next to someone's dinner.
   */
  downvoteCount: number;
  /** Whether the requesting viewer has upvoted this post. False with no viewer. */
  upvotedByMe: boolean;
  /** Whether the requesting viewer has downvoted it. Never true alongside upvotedByMe. */
  downvotedByMe: boolean;
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

  const [
    saveRows,
    commentRows,
    commentLikeRows,
    upvoteCountRows,
    downvoteCountRows,
    myUpvoteRows,
    myDownvoteRows,
    myHeartRows,
  ] = await Promise.all([
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
    sql`
      SELECT post_id, count(*)::int AS count
      FROM post_downvotes WHERE post_id = ANY(${ids})
      GROUP BY post_id
    `,
    // Scoped to the viewer's own row only — never the full upvoter list's
    // counterpart for hearts, and upvotes are public anyway so this is just
    // a convenience, not a privacy boundary.
    viewerId
      ? sql`SELECT post_id FROM post_upvotes WHERE post_id = ANY(${ids}) AND user_id = ${viewerId}`
      : Promise.resolve([]),
    viewerId
      ? sql`SELECT post_id FROM post_downvotes WHERE post_id = ANY(${ids}) AND user_id = ${viewerId}`
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
  const downvoteCounts = new Map(
    downvoteCountRows.map((r) => [r.post_id as string, r.count as number]),
  );
  const myUpvotes = new Set(myUpvoteRows.map((r) => r.post_id as string));
  const myDownvotes = new Set(myDownvoteRows.map((r) => r.post_id as string));
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
      downvoteCount: downvoteCounts.get(postId) ?? 0,
      upvotedByMe: myUpvotes.has(postId),
      downvotedByMe: myDownvotes.has(postId),
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
 * Discover feed: every post, ranked by recency with steep time decay and the
 * net vote score as a secondary factor. Same curve as the old client-side
 * hotScore (`(votes + 1) / (ageHours + 2)^1.5`), moved server-side because it
 * now has to join the vote tables.
 *
 * The numerator is floored at zero: a heavily downvoted plate should sink to
 * "as if nobody voted", not sort *below* older neutral posts by going
 * negative and inverting the age decay.
 *
 * This function — and only this function — is allowed to touch post_upvotes
 * and post_downvotes for ranking/counting purposes. It must never
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
           u.points AS author_points
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, count(*) AS count FROM post_upvotes GROUP BY post_id
    ) uv ON uv.post_id = p.id
    LEFT JOIN (
      SELECT post_id, count(*) AS count FROM post_downvotes GROUP BY post_id
    ) dv ON dv.post_id = p.id
    ORDER BY
      (GREATEST(COALESCE(uv.count, 0) - COALESCE(dv.count, 0), 0) + 1)
        / POWER(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600 + 2, 1.5) DESC
    LIMIT ${limit}
  `;
  const posts = await hydratePosts(rows, viewerId, /* includeHearts */ false);
  // hydratePosts recounts both directions itself; the ranking query's counts
  // were only ever needed for ORDER BY, so they aren't selected at all.
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
  /** The aspect this review called the best thing about the place. */
  bestAspect?: string;
  /** The aspect that let them down, if they named one. */
  worstAspect?: string;
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

  /* One row per aspect the review had an opinion about. Written after the
     post so the FK holds, and guarded so a client that sends the same aspect
     as both its best and its worst can't write a self-cancelling pair — the
     table's PK would reject the second row anyway, but failing quietly here
     is better than surfacing a constraint error for a nonsense input. */
  const aspectVotes: Array<[string, "praise" | "fault"]> = [];
  if (data.bestAspect) aspectVotes.push([data.bestAspect, "praise"]);
  if (data.worstAspect && data.worstAspect !== data.bestAspect) {
    aspectVotes.push([data.worstAspect, "fault"]);
  }
  for (const [aspect, sentiment] of aspectVotes) {
    await sql`
      INSERT INTO post_aspect_votes (post_id, aspect, sentiment)
      VALUES (${data.id}, ${aspect}, ${sentiment})
      ON CONFLICT DO NOTHING
    `;
  }

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
    downvoteCount: 0,
    upvotedByMe: false,
    downvotedByMe: false,
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

/** Which way a viewer voted on a post, or null for no vote at all. */
export type VoteDirection = "up" | "down";

/**
 * Discover's vote. Public in every direction — the counts this returns are
 * exactly what every viewer of the post sees, including the requester's own
 * state. Mirrors the old toggleLike, which this replaces: post_likes is
 * retired, not this function's shape.
 *
 * Three-state, not two toggles: pressing the direction you already hold
 * clears your vote, pressing the other one switches sides. The opposite row
 * is deleted before the new one is written, which is what keeps "nobody is
 * both up and down on a post" true — the two tables can't express that
 * constraint themselves.
 */
export async function castVote(
  postId: string,
  userId: string,
  direction: VoteDirection,
): Promise<{
  myVote: VoteDirection | null;
  upvoteCount: number;
  downvoteCount: number;
  firstTimeUpvote: boolean;
}> {
  const [hadUp, hadDown] = await Promise.all([
    sql`SELECT 1 FROM post_upvotes WHERE post_id = ${postId} AND user_id = ${userId}`,
    sql`SELECT 1 FROM post_downvotes WHERE post_id = ${postId} AND user_id = ${userId}`,
  ]);
  const held: VoteDirection | null =
    hadUp.length > 0 ? "up" : hadDown.length > 0 ? "down" : null;

  // Pressing what you already hold is "take it back".
  const myVote = held === direction ? null : direction;

  await sql`DELETE FROM post_upvotes WHERE post_id = ${postId} AND user_id = ${userId}`;
  await sql`DELETE FROM post_downvotes WHERE post_id = ${postId} AND user_id = ${userId}`;
  if (myVote === "up") {
    await sql`INSERT INTO post_upvotes (post_id, user_id) VALUES (${postId}, ${userId})`;
  } else if (myVote === "down") {
    await sql`INSERT INTO post_downvotes (post_id, user_id) VALUES (${postId}, ${userId})`;
  }

  const [upRows, downRows] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM post_upvotes WHERE post_id = ${postId}`,
    sql`SELECT count(*)::int AS count FROM post_downvotes WHERE post_id = ${postId}`,
  ]);

  return {
    myVote,
    upvoteCount: upRows[0].count as number,
    downvoteCount: downRows[0].count as number,
    // Only an upvote that wasn't already there pays the author — switching
    // away from a downvote counts, re-pressing an upvote you already had
    // doesn't, and a downvote never does.
    firstTimeUpvote: myVote === "up" && held !== "up",
  };
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

export type ActivityKind = "comment" | "heart" | "upvote";

export type ActivityEvent = {
  /**
   * Unique across all three kinds. Built from the comment id, or from
   * post + actor for a heart — and from post + timestamp for an upvote, whose
   * actor id must not appear even in a React key.
   */
  id: string;
  kind: ActivityKind;
  createdAt: string;
  /**
   * Who did it — absent on every `upvote` row, and absent there in the SQL
   * itself, not blanked afterwards. An upvote is anonymous to the author.
   */
  actorId?: string;
  actorName?: string;
  actorAvatarUrl?: string;
  postId: string;
  postRestaurant?: string;
  /** Static-array id, so the reference line can link to the restaurant page. */
  postRestaurantId?: string;
  postDishName?: string;
  postText: string;
  /** The comment body. Only ever set on kind "comment". */
  text?: string;
};

/**
 * What other people did to YOUR plates — comments, hearts and upvotes in one
 * chronological list, for the activity section on /account.
 *
 * Same access rule as getHeartsForAuthor, enforced the same way: by
 * construction rather than by trusting the caller. The `mine` CTE is the only
 * source of post ids in this query, and it is filtered to `user_id = userId`,
 * so every branch below can only ever reach reactions on posts this user
 * wrote. There is no argument that widens it — pass someone else's id and you
 * get their activity for their posts, never a mix.
 *
 * That makes this the second place a full heart list is materialized, after
 * getHeartsForAuthor. Both are author-only; if you add a third, it must be
 * too. It is NOT a heart count for anyone else, and nothing here feeds
 * Discover's ranking — getDiscoverFeed still never names post_hearts.
 *
 * Upvotes are anonymous even here — the whole point of the up/down pair is
 * that it is a verdict on a plate, and a verdict people have to sign is a
 * different, more social thing than the one Discover ranks on. So the upvote
 * branch below has no `users` join at all: there is no name to leak because
 * the query never reads one, and its event id is post + timestamp rather than
 * post + user so the actor's id can't ride along in a key either. Hearts, the
 * friends-only reaction, do name the person — that asymmetry is the feature,
 * not an oversight. Do not add a join to the upvote branch.
 *
 * Your own reactions to your own posts are excluded from every branch: this
 * list answers "what did other people do", and self-activity is noise in it.
 */
export async function getActivityForAuthor(
  userId: string,
  limit = 40
): Promise<ActivityEvent[]> {
  const rows = await sql`
    WITH mine AS (
      SELECT id, restaurant, restaurant_id, dish_name, text
      FROM posts WHERE user_id = ${userId}
    )
    SELECT 'comment' AS kind,
           'comment:' || c.id AS event_id,
           c.created_at,
           c.text AS body,
           u.id AS actor_id, u.name AS actor_name, u.avatar_url AS actor_avatar_url,
           m.id AS post_id, m.restaurant, m.restaurant_id, m.dish_name,
           m.text AS post_text
    FROM comments c
    JOIN mine m ON m.id = c.post_id
    JOIN users u ON u.id = c.user_id
    WHERE c.user_id <> ${userId}

    UNION ALL

    SELECT 'heart',
           'heart:' || h.post_id || ':' || h.user_id,
           h.created_at,
           NULL::text,
           u.id, u.name, u.avatar_url,
           m.id, m.restaurant, m.restaurant_id, m.dish_name, m.text
    FROM post_hearts h
    JOIN mine m ON m.id = h.post_id
    JOIN users u ON u.id = h.user_id
    WHERE h.user_id <> ${userId}

    UNION ALL

    SELECT 'upvote',
           'upvote:' || v.post_id || ':' || EXTRACT(EPOCH FROM v.created_at)::text,
           v.created_at,
           NULL::text,
           NULL::text, NULL::text, NULL::text,
           m.id, m.restaurant, m.restaurant_id, m.dish_name, m.text
    FROM post_upvotes v
    JOIN mine m ON m.id = v.post_id
    WHERE v.user_id <> ${userId}

    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    id: r.event_id as string,
    kind: r.kind as ActivityKind,
    createdAt: new Date(r.created_at as string).toISOString(),
    actorId: (r.actor_id as string | null) ?? undefined,
    actorName: (r.actor_name as string | null) ?? undefined,
    actorAvatarUrl: (r.actor_avatar_url as string | null) ?? undefined,
    postId: r.post_id as string,
    postRestaurant: (r.restaurant as string | null) ?? undefined,
    postRestaurantId: (r.restaurant_id as string | null) ?? undefined,
    postDishName: (r.dish_name as string | null) ?? undefined,
    postText: r.post_text as string,
    text: (r.body as string | null) ?? undefined,
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

// The old "would you eat this?" verdict wrote to post_votes. Nothing does
// anymore — see the note above post_votes in migrate.mjs, the table is left in
// place with its data. The up/down pair came back with castVote above, but it
// writes post_upvotes/post_downvotes; do not repoint it at post_votes, whose
// rows mean a different question.

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

export type FriendSummary = {
  id: string;
  name: string;
  avatarUrl?: string;
  points: number;
};

/**
 * The same people getFriendIds returns, but as rows a list can render.
 *
 * Kept separate from getFriendIds rather than folded into it: that one is
 * called on every feed load to decide button states across a whole page of
 * posts, and it stays a bare id list precisely so it doesn't drag a users
 * join along a hot path.
 *
 * Ordered by name so the list doesn't reshuffle between loads. Nothing here
 * returns a total, and callers must not render one — friend counts never
 * display anywhere in this product.
 */
export async function getFriends(userId: string): Promise<FriendSummary[]> {
  const rows = await sql`
    SELECT u.id, u.name, u.avatar_url, u.points
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a = ${userId} THEN f.user_b ELSE f.user_a END
    WHERE f.user_a = ${userId} OR f.user_b = ${userId}
    ORDER BY u.name ASC
  `;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    avatarUrl: (r.avatar_url as string | null) ?? undefined,
    points: r.points as number,
  }));
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

// --- Per-aspect verdicts ---------------------------------------------------

export type RestaurantAspectTally = {
  /** Average star rating across this restaurant's own PlateMaps reviews. */
  overall: number;
  /** How many restaurant-kind reviews that average is drawn from. */
  reviewCount: number;
  /** praised / faulted counts, keyed by aspect. Aspects nobody voted on are absent. */
  votes: Record<string, { praised: number; faulted: number }>;
};

/**
 * Everything src/lib/aspectScores.ts needs to score one restaurant: its own
 * average rating, how many reviews that came from, and the signed aspect
 * tallies.
 *
 * Scoped to `rating_kind = 'restaurant'` on purpose. A dish review's rating is
 * a percentage about one plate, not a verdict on the place, so folding it into
 * the overall would mix two different measurements — and it's the restaurant
 * reviews that carry the aspect votes anyway.
 */
export async function getRestaurantAspectTally(
  restaurantId: string,
): Promise<RestaurantAspectTally> {
  const [summaryRows, voteRows] = await Promise.all([
    sql`
      SELECT COALESCE(AVG(rating), 0)::float AS overall, count(*)::int AS review_count
      FROM posts
      WHERE restaurant_id = ${restaurantId}
        AND rating_kind = 'restaurant'
        AND rating IS NOT NULL
    `,
    sql`
      SELECT v.aspect,
             count(*) FILTER (WHERE v.sentiment = 'praise')::int AS praised,
             count(*) FILTER (WHERE v.sentiment = 'fault')::int   AS faulted
      FROM post_aspect_votes v
      JOIN posts p ON p.id = v.post_id
      WHERE p.restaurant_id = ${restaurantId}
        AND p.rating_kind = 'restaurant'
      GROUP BY v.aspect
    `,
  ]);

  const votes: Record<string, { praised: number; faulted: number }> = {};
  for (const row of voteRows) {
    votes[row.aspect as string] = {
      praised: row.praised as number,
      faulted: row.faulted as number,
    };
  }

  return {
    overall: summaryRows[0]?.overall ?? 0,
    reviewCount: summaryRows[0]?.review_count ?? 0,
    votes,
  };
}

/**
 * The same tally as above, for every restaurant at once, keyed by id.
 *
 * Discover's "Rated well for" filter needs all 36 before it can decide which
 * cards to show or print a single facet count, and 36 round trips to do it
 * would be absurd — this is the same two aggregates grouped by restaurant
 * instead of filtered to one.
 *
 * Restaurants nobody has reviewed are simply absent from the result rather
 * than present with zeroes; a caller filtering on an aspect wants "no signal"
 * and "no match" to look the same from the outside, and aspectScores already
 * reports a 0-review tally as an honest null.
 */
export async function getAllRestaurantAspectTallies(): Promise<
  Record<string, RestaurantAspectTally>
> {
  const [summaryRows, voteRows] = await Promise.all([
    sql`
      SELECT restaurant_id,
             COALESCE(AVG(rating), 0)::float AS overall,
             count(*)::int AS review_count
      FROM posts
      WHERE rating_kind = 'restaurant'
        AND rating IS NOT NULL
        AND restaurant_id IS NOT NULL
      GROUP BY restaurant_id
    `,
    sql`
      SELECT p.restaurant_id,
             v.aspect,
             count(*) FILTER (WHERE v.sentiment = 'praise')::int AS praised,
             count(*) FILTER (WHERE v.sentiment = 'fault')::int   AS faulted
      FROM post_aspect_votes v
      JOIN posts p ON p.id = v.post_id
      WHERE p.rating_kind = 'restaurant'
        AND p.restaurant_id IS NOT NULL
      GROUP BY p.restaurant_id, v.aspect
    `,
  ]);

  const tallies: Record<string, RestaurantAspectTally> = {};
  for (const row of summaryRows) {
    tallies[row.restaurant_id as string] = {
      overall: row.overall as number,
      reviewCount: row.review_count as number,
      votes: {},
    };
  }

  // Votes can only belong to a post that carries a rating of its own, so a
  // vote row without a summary row means a review with aspect taps and no
  // star — skipped rather than given a zeroed tally, which would score every
  // aspect against an overall of 0.
  for (const row of voteRows) {
    const tally = tallies[row.restaurant_id as string];
    if (!tally) continue;
    tally.votes[row.aspect as string] = {
      praised: row.praised as number,
      faulted: row.faulted as number,
    };
  }

  return tallies;
}

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

/* --- Restaurants and menus ---------------------------------------------- */

/*
 * These used to be `import { restaurants } from "@/data/restaurants"` in
 * twenty files, several of them client components — so the whole array shipped
 * to the browser. The array is seed input now (loaded by
 * `npm run restaurants:import`) and every read goes through here.
 *
 * The `Restaurant` and `Dish` types still live in src/data/ rather than moving
 * here with the queries, which inverts this file's usual rule that db.ts owns
 * row shapes. That rule exists to keep client components from importing this
 * module and dragging the Neon driver into the bundle; a type-only import
 * pointing the other way costs nothing at runtime, and those two types are
 * shared vocabulary between the seed files, the fetch scripts and the UI.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRestaurant(row: any): Restaurant {
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    neighborhood: row.neighborhood,
    distance: row.distance,
    walkTime: row.walk_time,
    closingTime: row.closing_time,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    statusLabel: row.status_label,
    rating: row.rating,
    reviewCount: row.review_count,
    yelpRating: row.yelp_rating ?? undefined,
    yelpReviewCount: row.yelp_review_count ?? undefined,
    googleRating: row.google_rating ?? undefined,
    googleReviewCount: row.google_review_count ?? undefined,
    trending: row.trending ?? false,
    photo: row.photo ?? undefined,
    photoAlt: row.photo_alt ?? undefined,
    yelpUrl: row.yelp_url ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDish(row: any): Dish {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    price: row.price,
    section: row.section,
    yesVotes: row.yes_votes,
    noVotes: row.no_votes,
  };
}

/**
 * Every restaurant, each carrying the price band derived from its menu.
 *
 * The band is computed here rather than stored, for the reason data/priceBands.ts
 * gives: it is a summary of the prices the app already shows, not a fact about
 * the business, so it has to follow the menu automatically. That costs a second
 * query for the price columns of every dish — cheap at this size, and the
 * obvious thing to turn into a column maintained by the import script when the
 * dish table is large enough to notice.
 */
export async function getRestaurants(): Promise<RestaurantView[]> {
  const [restaurantRows, dishRows] = await Promise.all([
    // Seed-file order, not id order — `id` is TEXT, so ordering by it would
    // put "10" ahead of "2" and reshuffle the grid. See the sort_order note in
    // scripts/migrate.mjs.
    sql`SELECT * FROM restaurants ORDER BY sort_order, id`,
    sql`SELECT restaurant_id, price, section FROM dishes`,
  ]);

  const menus = new Map<string, { price: string; section: string }[]>();
  for (const row of dishRows) {
    const id = row.restaurant_id as string;
    const menu = menus.get(id);
    const dish = { price: row.price as string, section: row.section as string };
    if (menu) menu.push(dish);
    else menus.set(id, [dish]);
  }

  return restaurantRows.map((row) => ({
    ...rowToRestaurant(row),
    priceBand: bandFor(menus.get(row.id as string) ?? []),
  }));
}

export async function getRestaurantById(id: string): Promise<Restaurant | null> {
  const rows = await sql`SELECT * FROM restaurants WHERE id = ${id}`;
  return rows[0] ? rowToRestaurant(rows[0]) : null;
}

/** A restaurant's menu, in the order the menu itself listed it. */
export async function getDishesForRestaurant(restaurantId: string): Promise<Dish[]> {
  const rows = await sql`
    SELECT * FROM dishes WHERE restaurant_id = ${restaurantId} ORDER BY sort_order
  `;
  return rows.map(rowToDish);
}

/**
 * Menus for several restaurants at once, keyed by restaurant id — the shape
 * the old `dishesByRestaurant` map had, for the two surfaces that genuinely
 * need many menus at a time (the composer's dish picker and the feed map).
 */
export async function getDishesByRestaurant(
  restaurantIds?: readonly string[],
): Promise<Record<string, Dish[]>> {
  if (restaurantIds && restaurantIds.length === 0) return {};

  const rows = restaurantIds
    ? await sql`
        SELECT * FROM dishes
        WHERE restaurant_id = ANY(${restaurantIds as string[]})
        ORDER BY restaurant_id, sort_order
      `
    : await sql`SELECT * FROM dishes ORDER BY restaurant_id, sort_order`;

  const byRestaurant: Record<string, Dish[]> = {};
  for (const row of rows) {
    const id = row.restaurant_id as string;
    (byRestaurant[id] ??= []).push(rowToDish(row));
  }
  return byRestaurant;
}

/**
 * The distinct cuisines and neighbourhoods, for the pickers that offer them as
 * options. Derived from the rows rather than kept as a list, which is what
 * data/restaurants.ts did — the difference is that the database does the
 * grouping instead of the browser doing it over the whole array.
 */
export async function getRestaurantFacets(): Promise<{
  cuisines: string[];
  neighborhoods: string[];
}> {
  const [cuisineRows, neighborhoodRows] = await Promise.all([
    sql`SELECT DISTINCT cuisine FROM restaurants ORDER BY cuisine`,
    sql`SELECT DISTINCT neighborhood FROM restaurants ORDER BY neighborhood`,
  ]);
  return {
    cuisines: cuisineRows.map((r) => r.cuisine as string),
    neighborhoods: neighborhoodRows.map((r) => r.neighborhood as string),
  };
}
