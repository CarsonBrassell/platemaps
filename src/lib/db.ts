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

export async function followUser(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) return;
  await sql`
    INSERT INTO follows (follower_id, following_id)
    VALUES (${followerId}, ${followingId})
    ON CONFLICT DO NOTHING
  `;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await sql`
    DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}
  `;
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const rows = await sql`SELECT following_id FROM follows WHERE follower_id = ${userId}`;
  return rows.map((r) => r.following_id as string);
}

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
  likePointsAwardedTo: string[];
  savedBy: string[];
  votedYesBy: string[];
  votedNoBy: string[];
  comments: Comment[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hydratePosts(postRows: any[]): Promise<Post[]> {
  if (postRows.length === 0) return [];
  const ids = postRows.map((r) => r.id as string);

  const [likeRows, saveRows, commentRows, commentLikeRows, voteRows] = await Promise.all([
    sql`SELECT post_id, user_id, liked, awarded_points FROM post_likes WHERE post_id = ANY(${ids})`,
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
    sql`SELECT post_id, user_id, vote FROM post_votes WHERE post_id = ANY(${ids})`,
  ]);

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
      dishName: row.dish_name ?? undefined,
      price: row.price ?? undefined,
      // NUMERIC comes back as a string over the HTTP driver.
      rating: row.rating === null || row.rating === undefined ? undefined : Number(row.rating),
      locationLabel: row.location_label ?? undefined,
      tags: (row.tags as string[] | null) ?? [],
      amenities: (row.amenities as string[] | null) ?? [],
      vibe: row.vibe ?? undefined,
      media: (row.media as PostMedia[] | null) ?? [],
      createdAt: new Date(row.created_at).toISOString(),
      likedBy: likeRows.filter((l) => l.post_id === postId && l.liked).map((l) => l.user_id as string),
      likePointsAwardedTo: likeRows
        .filter((l) => l.post_id === postId && l.awarded_points)
        .map((l) => l.user_id as string),
      savedBy: saveRows.filter((s) => s.post_id === postId).map((s) => s.user_id as string),
      votedYesBy: voteRows
        .filter((v) => v.post_id === postId && v.vote)
        .map((v) => v.user_id as string),
      votedNoBy: voteRows
        .filter((v) => v.post_id === postId && !v.vote)
        .map((v) => v.user_id as string),
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
         p.dish_name, p.price, p.rating, p.location_label, p.tags, p.media,
         p.amenities, p.vibe,
         u.name AS author_name, u.avatar_url AS author_avatar_url,
         u.points AS author_points
  FROM posts p
  JOIN users u ON u.id = p.user_id
`;

export async function getPosts(): Promise<Post[]> {
  const rows = await sql.query(`${POST_SELECT} ORDER BY p.created_at ASC`);
  return hydratePosts(rows);
}

export async function getPostById(id: string): Promise<Post | null> {
  const rows = await sql.query(`${POST_SELECT} WHERE p.id = $1`, [id]);
  const hydrated = await hydratePosts(rows);
  return hydrated[0] ?? null;
}

export async function createPost(data: {
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
  tags?: string[];
  amenities?: string[];
  vibe?: string;
  media?: PostMedia[];
}): Promise<Post> {
  const tags = data.tags ?? [];
  const amenities = data.amenities ?? [];
  const media = data.media ?? [];
  const rows = await sql`
    INSERT INTO posts (
      id, user_id, text, restaurant, dish_name, price, rating,
      location_label, tags, media, amenities, vibe
    )
    VALUES (
      ${data.id}, ${data.userId}, ${data.text}, ${data.restaurant ?? null},
      ${data.dishName ?? null}, ${data.price ?? null}, ${data.rating ?? null},
      ${data.locationLabel ?? null}, ${tags}, ${JSON.stringify(media)}::jsonb,
      ${amenities}, ${data.vibe ?? null}
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
    dishName: data.dishName,
    price: data.price,
    rating: data.rating,
    locationLabel: data.locationLabel,
    tags,
    amenities,
    vibe: data.vibe,
    media,
    createdAt: new Date(rows[0].created_at).toISOString(),
    likedBy: [],
    likePointsAwardedTo: [],
    savedBy: [],
    votedYesBy: [],
    votedNoBy: [],
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

export async function toggleLike(
  postId: string,
  userId: string
): Promise<{ liked: boolean; likeCount: number; firstTimeLike: boolean }> {
  const existingRows = await sql`
    SELECT liked, awarded_points FROM post_likes WHERE post_id = ${postId} AND user_id = ${userId}
  `;
  const existing = existingRows[0] as { liked: boolean; awarded_points: boolean } | undefined;
  const newLiked = !existing?.liked;
  const alreadyAwarded = existing?.awarded_points ?? false;
  const firstTimeLike = newLiked && !alreadyAwarded;
  const newAwarded = alreadyAwarded || firstTimeLike;

  await sql`
    INSERT INTO post_likes (post_id, user_id, liked, awarded_points)
    VALUES (${postId}, ${userId}, ${newLiked}, ${newAwarded})
    ON CONFLICT (post_id, user_id)
    DO UPDATE SET liked = ${newLiked}, awarded_points = ${newAwarded}
  `;

  const countRows = await sql`
    SELECT count(*)::int AS count FROM post_likes WHERE post_id = ${postId} AND liked = true
  `;

  return { liked: newLiked, likeCount: countRows[0].count as number, firstTimeLike };
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

/**
 * Records a "would you eat this" verdict. Tapping the same side again clears
 * it; tapping the other side switches. Reports whether this is the person's
 * first verdict on the post, which is what the points award keys off.
 */
export async function castVote(
  postId: string,
  userId: string,
  vote: boolean
): Promise<{ myVote: boolean | null; yes: number; no: number; firstVote: boolean }> {
  const existing = await sql`
    SELECT vote FROM post_votes WHERE post_id = ${postId} AND user_id = ${userId}
  `;
  const previous = existing[0]?.vote as boolean | undefined;

  if (previous === vote) {
    await sql`DELETE FROM post_votes WHERE post_id = ${postId} AND user_id = ${userId}`;
  } else {
    await sql`
      INSERT INTO post_votes (post_id, user_id, vote)
      VALUES (${postId}, ${userId}, ${vote})
      ON CONFLICT (post_id, user_id) DO UPDATE SET vote = ${vote}
    `;
  }

  const counts = await sql`
    SELECT
      count(*) FILTER (WHERE vote)::int AS yes,
      count(*) FILTER (WHERE NOT vote)::int AS no
    FROM post_votes WHERE post_id = ${postId}
  `;

  return {
    myVote: previous === vote ? null : vote,
    yes: counts[0].yes as number,
    no: counts[0].no as number,
    firstVote: previous === undefined,
  };
}
