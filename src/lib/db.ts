import { neon } from "@neondatabase/serverless";

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

export async function addPointsToUser(id: string, amount: number): Promise<User | null> {
  const monthKey = currentMonthKey();
  const rows = await sql`
    UPDATE users
    SET
      points = points + ${amount},
      monthly_points = CASE WHEN monthly_points_month = ${monthKey}
        THEN monthly_points + ${amount} ELSE ${amount} END,
      monthly_points_month = ${monthKey}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getLeaderboard(limit = 10) {
  const monthKey = currentMonthKey();
  const rows = await sql`
    SELECT id, name, avatar_url, monthly_points
    FROM users
    WHERE monthly_points_month = ${monthKey} AND monthly_points > 0
    ORDER BY monthly_points DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    avatarUrl: (r.avatar_url as string | null) ?? undefined,
    monthlyPoints: r.monthly_points as number,
  }));
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
  text: string;
  createdAt: string;
};

export type Post = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  restaurant?: string;
  createdAt: string;
  likedBy: string[];
  likePointsAwardedTo: string[];
  savedBy: string[];
  comments: Comment[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hydratePosts(postRows: any[]): Promise<Post[]> {
  if (postRows.length === 0) return [];
  const ids = postRows.map((r) => r.id as string);

  const [likeRows, saveRows, commentRows] = await Promise.all([
    sql`SELECT post_id, user_id, liked, awarded_points FROM post_likes WHERE post_id = ANY(${ids})`,
    sql`SELECT post_id, user_id FROM post_saves WHERE post_id = ANY(${ids})`,
    sql`
      SELECT c.id, c.post_id, c.user_id, c.text, c.created_at, u.name AS author_name
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ANY(${ids})
      ORDER BY c.created_at ASC
    `,
  ]);

  return postRows.map((row) => {
    const postId = row.id as string;
    return {
      id: postId,
      userId: row.user_id,
      authorName: row.author_name,
      authorAvatarUrl: row.author_avatar_url ?? undefined,
      text: row.text,
      restaurant: row.restaurant ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      likedBy: likeRows.filter((l) => l.post_id === postId && l.liked).map((l) => l.user_id as string),
      likePointsAwardedTo: likeRows
        .filter((l) => l.post_id === postId && l.awarded_points)
        .map((l) => l.user_id as string),
      savedBy: saveRows.filter((s) => s.post_id === postId).map((s) => s.user_id as string),
      comments: commentRows
        .filter((c) => c.post_id === postId)
        .map((c) => ({
          id: c.id as string,
          userId: c.user_id as string,
          authorName: c.author_name as string,
          text: c.text as string,
          createdAt: new Date(c.created_at as string).toISOString(),
        })),
    };
  });
}

const POST_SELECT = `
  SELECT p.id, p.user_id, p.text, p.restaurant, p.created_at,
         u.name AS author_name, u.avatar_url AS author_avatar_url
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
  text: string;
  restaurant?: string;
}): Promise<Post> {
  const rows = await sql`
    INSERT INTO posts (id, user_id, text, restaurant)
    VALUES (${data.id}, ${data.userId}, ${data.text}, ${data.restaurant ?? null})
    RETURNING created_at
  `;
  return {
    id: data.id,
    userId: data.userId,
    authorName: data.authorName,
    authorAvatarUrl: data.authorAvatarUrl,
    text: data.text,
    restaurant: data.restaurant,
    createdAt: new Date(rows[0].created_at).toISOString(),
    likedBy: [],
    likePointsAwardedTo: [],
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
    text: data.text,
    createdAt: new Date(rows[0].created_at).toISOString(),
  };
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
