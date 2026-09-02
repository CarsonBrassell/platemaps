import { del } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import type { MatchedDish, Restaurant, RestaurantView } from "@/data/restaurants";
import type { Dish } from "@/data/dishes";
import type { PriceBand } from "@/data/priceBands";
import type { Hours } from "@/lib/openState";
import { plateScore, type PlateScore, type RatedDish } from "@/lib/plateScore";
import {
  FEED_SORT_DEFAULT,
  TRENDING_COMMENT_WEIGHT,
  TRENDING_GRAVITY,
  type FeedSort,
} from "@/lib/feedSort";
import { FEED_WINDOW_DAYS } from "@/lib/feedWindow";
import { RANKS, rankByKey } from "@/lib/ranks";
import { dishRatingKey } from "@/lib/dishRatingKey";
import { isStoredPhotoUrl } from "@/lib/photos";

/* Which driver this is depends on DATABASE_URL — see lib/sqlClient. */
import { sql } from "@/lib/sqlClient";

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
  /** When they checked the Terms/Privacy box at signup — server-stamped, see createUser. */
  agreedToTermsAt?: string;
  /**
   * The three privacy switches. Each is enforced in the query that would
   * otherwise expose the account — never in a component, and never by asking
   * the caller to remember: `getLeaderboard`/`getUserRank` for the first,
   * `searchUsers` for the second, `sendFriendRequest` for the third.
   */
  hideFromLeaderboard: boolean;
  discoverableByUsername: boolean;
  friendRequestsOpen: boolean;
  /**
   * When this address was proved reachable, or undefined if it never was.
   *
   * Undefined for every account made before verification existed, and that is
   * not a gap to be tidied away: nobody clicked anything, so nobody proved
   * anything. Anything that would let an address stand in for identity — a
   * password reset, mainly — has to read this and not `email`.
   */
  emailVerifiedAt?: string;
  /** An address asked for but not yet proved. Display only, never an identity. */
  pendingEmail?: string;
  /**
   * Whether the first-post photo notice has been shown — see its migration.
   * One-way: it is set when the notice is answered and never cleared, so
   * nobody is told the same thing twice.
   */
  photoNoticeSeen: boolean;
  /** Whether the first-run coach tour has run. One-way, like the flag above. */
  tourSeen: boolean;
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
    agreedToTermsAt: row.agreed_to_terms_at ?? undefined,
    // Defaults repeated here rather than trusted from the column, so a row read
    // before the migration lands behaves like the app did before it existed.
    hideFromLeaderboard: row.hide_from_leaderboard ?? false,
    discoverableByUsername: row.discoverable_by_username ?? true,
    friendRequestsOpen: row.friend_requests_open ?? true,
    emailVerifiedAt: row.email_verified_at ?? undefined,
    pendingEmail: row.pending_email ?? undefined,
    photoNoticeSeen: row.photo_notice_seen ?? false,
    tourSeen: row.tour_seen ?? false,
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE lower(email) = lower(${email})`;
  return rows[0] ? rowToUser(rows[0]) : null;
}

/** Case-insensitive, matching `idx_users_name_unique` — see its migration comment. */
export async function getUserByName(name: string): Promise<User | null> {
  const rows = await sql`SELECT * FROM users WHERE lower(name) = lower(${name})`;
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
  // agreed_to_terms_at is stamped here with the database's own clock, not a
  // value passed in from the request — the caller (the signup route) already
  // rejected the request if the checkbox wasn't checked, so reaching this
  // insert means consent happened right now, not whenever a client claims.
  const rows = await sql`
    INSERT INTO users (id, name, email, password_hash, agreed_to_terms_at)
    VALUES (${data.id}, ${data.name}, ${data.email}, ${data.passwordHash}, NOW())
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
 * `reason` is free-form except for the pay-once awards, where the string is
 * the idempotency key and a partial unique index on its prefix is what makes
 * it one:
 *
 * - "milestone:<postId>:<upvotes>" — a bonus fires at most once per post.
 * - "upvote:<postId>:<voterId>" and "comment-upvote:<commentId>:<voterId>" —
 *   one voter pays one author once per item. Without this, taking an upvote
 *   back and pressing it again paid out every single time, which turned the
 *   arrow into a coin press.
 *
 * Each `ON CONFLICT` below names its index by repeating that index's own
 * predicate; the wording has to match the CREATE UNIQUE INDEX in
 * scripts/migrate.mjs or Postgres can't infer which index is meant.
 *
 * `awarded` is false when a pay-once reason had already been paid. Callers
 * that report earnings back to the client must read it rather than assume the
 * award happened — otherwise the UI floats "+1 point" for a payout that the
 * database declined.
 */
export async function awardPoints(
  userId: string,
  amount: number,
  reason: string
): Promise<{ user: User | null; awarded: boolean }> {
  if (amount === 0) return { user: await getUserById(userId), awarded: false };

  /** Null for a free-form reason, which always writes. */
  let inserted: { id: string }[] | null = null;

  if (reason.startsWith("milestone:")) {
    inserted = (await sql`
      INSERT INTO point_events (id, user_id, amount, reason)
      VALUES (${randomUUID()}, ${userId}, ${amount}, ${reason})
      ON CONFLICT (reason) WHERE reason LIKE 'milestone:%' DO NOTHING
      RETURNING id
    `) as { id: string }[];
  } else if (reason.startsWith("upvote:") || reason.startsWith("comment-upvote:")) {
    inserted = (await sql`
      INSERT INTO point_events (id, user_id, amount, reason)
      VALUES (${randomUUID()}, ${userId}, ${amount}, ${reason})
      ON CONFLICT (reason)
        WHERE reason LIKE 'upvote:%' OR reason LIKE 'comment-upvote:%'
        DO NOTHING
      RETURNING id
    `) as { id: string }[];
  } else {
    await sql`
      INSERT INTO point_events (id, user_id, amount, reason)
      VALUES (${randomUUID()}, ${userId}, ${amount}, ${reason})
    `;
  }

  // Already paid out — leave the ledger and the totals exactly as they are.
  if (inserted && inserted.length === 0) {
    return { user: await getUserById(userId), awarded: false };
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
  return { user: rows[0] ? rowToUser(rows[0]) : null, awarded: true };
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
        AND NOT u.hide_from_leaderboard
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

  // Hidden users are excluded *before* RANK() runs, in both windows. Filtering
  // them out after ranking would leave holes in the numbering — a visible 1, 3,
  // 4 that tells everyone exactly how many people are hiding and roughly where
  // they sit, which is the thing the switch is for.
  const rows = await sql`
    WITH ranked_users AS (
      SELECT id FROM users WHERE NOT hide_from_leaderboard
    ),
    cur AS (
      SELECT user_id, SUM(amount)::int AS pts
      FROM point_events WHERE created_at >= ${bounds.start.toISOString()}
        AND user_id IN (SELECT id FROM ranked_users)
      GROUP BY user_id
    ),
    prev AS (
      SELECT user_id, SUM(amount)::int AS pts
      FROM point_events
      WHERE created_at >= ${bounds.prevStart.toISOString()}
        AND created_at < ${bounds.start.toISOString()}
        AND user_id IN (SELECT id FROM ranked_users)
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
            AND user_id IN (SELECT id FROM users WHERE NOT hide_from_leaderboard)
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
          SELECT MIN(u2.points) FROM users u2
          WHERE u2.points > r.pts AND NOT u2.hide_from_leaderboard
        ) AS next_pts
        FROM (
          SELECT id, points AS pts, RANK() OVER (ORDER BY points DESC)::int AS rnk
          FROM users WHERE points > 0 AND NOT hide_from_leaderboard
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

/**
 * End every session this account has, including the caller's.
 *
 * The counterpart to `deleteOtherSessions`, and the difference is the whole
 * reason both exist. Changing a password from inside the account keeps the
 * device you did it on. A password **reset** cannot: the reason someone is
 * resetting is usually that they lost control of the account, so the one
 * session that must not survive is whoever is already signed in on it.
 */
export async function deleteAllSessions(userId: string): Promise<void> {
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
}

/**
 * Erase an account and everything it produced. Irreversible — there is no soft
 * delete, no tombstone row and no recovery window, because App Store guideline
 * 5.1.1(v) asks for deletion rather than deactivation and this app has no email
 * channel to run a "we're deleting you in 30 days" window through.
 *
 * **One statement is the whole implementation, and that is on purpose.** Every
 * foreign key pointing at `users` in scripts/migrate.mjs is
 * `ON DELETE CASCADE` — sessions, posts, comments, the six vote tables, saves,
 * point_events, friend_requests, friendships, blocked_users — so the row going
 * away takes the graph with it, in one transaction, with no ordering to get
 * wrong. The single exception is `menu_lookups.requested_by`, which is
 * `ON DELETE SET NULL`: a menu lookup is money already spent and its result is
 * cached for everyone, so the cache survives and only the name of who asked is
 * forgotten. That is the correct outcome, not an oversight.
 *
 * **If you add a table that references `users`, it must cascade**, or the day
 * someone deletes their account this throws a foreign-key violation instead.
 * That is the one way this function can rot, and nothing here can catch it —
 * the constraint lives in the database, not in this file.
 *
 * Comments other people wrote on the deleted user's posts go too, since they
 * cascade from `posts`. Points other people earned by upvoting those posts are
 * kept: `point_events` rows belong to the earner, and only reference the post
 * through an unconstrained `reason` string.
 *
 * The route calling this has already re-verified the password before reaching
 * here — this function trusts that it has.
 */
export async function deleteUser(userId: string): Promise<void> {
  await sql`DELETE FROM users WHERE id = ${userId}`;
}

export type Comment = {
  id: string;
  /** Null on a top-level comment; otherwise the comment this one replies to. */
  parentId: string | null;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  createdAt: string;
  /**
   * Public, exactly like a post's. Rendered as the net score between the
   * arrows, never as two numbers — and the voters themselves are never named,
   * the same rule the post upvote list follows.
   */
  upvoteCount: number;
  downvoteCount: number;
  /**
   * This viewer's own vote, or null. A single field rather than the two
   * booleans on Post: the three states are mutually exclusive, and a thread
   * renders hundreds of these, so the shape that can't express an impossible
   * state is the one worth having here.
   */
  myVote: VoteDirection | null;
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
  /**
   * How many people hearted this post — **only ever populated for the post's
   * own author**, and null or absent for everybody else.
   *
   * A count is a weaker disclosure than the list `getHeartsForAuthor` guards,
   * but it is the same disclosure in kind: hearts are private in this app, so
   * "nine people hearted your plate" is the author's number and nobody else's.
   * The rule is therefore enforced the same way — inside the query, by a CASE
   * on `p.user_id`, so a row the requester did not write cannot carry a count
   * even in memory. It is deliberately NOT filtered out in JS afterwards,
   * where a later refactor of the mapping could quietly restore the leak.
   *
   * Only `getProfilePosts` selects it, because only the author's own profile
   * has a use for it; every other query leaves it undefined. Absent means "not
   * yours to see", never "zero" — a plate with no hearts reports 0.
   */
  heartCount?: number | null;
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
    commentUpvoteRows,
    commentDownvoteRows,
    myCommentUpvoteRows,
    myCommentDownvoteRows,
    upvoteCountRows,
    downvoteCountRows,
    myUpvoteRows,
    myDownvoteRows,
    myHeartRows,
  ] = await Promise.all([
    sql`SELECT post_id, user_id FROM post_saves WHERE post_id = ANY(${ids})`,
    // Flat, in the order they were written. The reply tree is assembled from
    // parent_id by whoever renders it — a recursive CTE would order the rows
    // for one presentation (depth-first, oldest-first) and the thread offers
    // two sorts, so the shape stays flat and the client decides.
    sql`
      SELECT c.id, c.post_id, c.parent_id, c.user_id, c.text, c.created_at,
             u.name AS author_name, u.avatar_url AS author_avatar_url
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ANY(${ids})
      ORDER BY c.created_at ASC
    `,
    sql`
      SELECT cv.comment_id, count(*)::int AS count
      FROM comment_upvotes cv
      JOIN comments c ON c.id = cv.comment_id
      WHERE c.post_id = ANY(${ids})
      GROUP BY cv.comment_id
    `,
    sql`
      SELECT cv.comment_id, count(*)::int AS count
      FROM comment_downvotes cv
      JOIN comments c ON c.id = cv.comment_id
      WHERE c.post_id = ANY(${ids})
      GROUP BY cv.comment_id
    `,
    // Scoped to this viewer's own rows, like the post-vote reads below — the
    // full list of who voted on a comment is never assembled anywhere.
    viewerId
      ? sql`
          SELECT cv.comment_id
          FROM comment_upvotes cv
          JOIN comments c ON c.id = cv.comment_id
          WHERE c.post_id = ANY(${ids}) AND cv.user_id = ${viewerId}
        `
      : Promise.resolve([]),
    viewerId
      ? sql`
          SELECT cv.comment_id
          FROM comment_downvotes cv
          JOIN comments c ON c.id = cv.comment_id
          WHERE c.post_id = ANY(${ids}) AND cv.user_id = ${viewerId}
        `
      : Promise.resolve([]),
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

  const commentUpvotes = new Map(
    commentUpvoteRows.map((r) => [r.comment_id as string, r.count as number]),
  );
  const commentDownvotes = new Map(
    commentDownvoteRows.map((r) => [r.comment_id as string, r.count as number]),
  );
  const myCommentUpvotes = new Set(myCommentUpvoteRows.map((r) => r.comment_id as string));
  const myCommentDownvotes = new Set(myCommentDownvoteRows.map((r) => r.comment_id as string));

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
      vibe: row.vibe ?? undefined,
      media: (row.media as PostMedia[] | null) ?? [],
      photosPublic: row.photos_public ?? false,
      createdAt: new Date(row.created_at).toISOString(),
      upvoteCount: upvoteCounts.get(postId) ?? 0,
      downvoteCount: downvoteCounts.get(postId) ?? 0,
      upvotedByMe: myUpvotes.has(postId),
      downvotedByMe: myDownvotes.has(postId),
      heartedByMe: myHearts.has(postId),
      // Carried straight through from whatever the SELECT decided, never
      // computed here: hydratePosts serves every viewer of every post, so it
      // is the last place that should be deciding who may know a heart count.
      // Only getProfilePosts asks for the column, and its CASE has already
      // nulled it for anything the requester did not write.
      heartCount: row.heart_count ?? null,
      savedBy: saveRows.filter((s) => s.post_id === postId).map((s) => s.user_id as string),
      comments: commentRows
        .filter((c) => c.post_id === postId)
        .map((c) => ({
          id: c.id as string,
          parentId: (c.parent_id as string | null) ?? null,
          userId: c.user_id as string,
          authorName: c.author_name as string,
          authorAvatarUrl: (c.author_avatar_url as string | null) ?? undefined,
          text: c.text as string,
          createdAt: new Date(c.created_at as string).toISOString(),
          upvoteCount: commentUpvotes.get(c.id as string) ?? 0,
          downvoteCount: commentDownvotes.get(c.id as string) ?? 0,
          myVote: myCommentUpvotes.has(c.id as string)
            ? ("up" as const)
            : myCommentDownvotes.has(c.id as string)
              ? ("down" as const)
              : null,
        })),
    };
  });
}

const POST_SELECT = `
  SELECT p.id, p.user_id, p.text, p.restaurant, p.created_at,
         p.restaurant_id, p.restaurant_lat, p.restaurant_lng,
         p.dish_name, p.price, p.rating, p.rating_kind, p.location_label, p.media,
         p.vibe, p.photos_public,
         u.name AS author_name, u.avatar_url AS author_avatar_url,
         u.points AS author_points
  FROM posts p
  JOIN users u ON u.id = p.user_id
`;

export async function getPosts(viewerId: string | null = null): Promise<Post[]> {
  const rows = await sql.query(`${POST_SELECT} ORDER BY p.created_at ASC`);
  return hydratePosts(rows, viewerId);
}

/**
 * Everything one profile screen needs: the posts you wrote, plus the posts
 * you saved, in one round trip.
 *
 * **This exists because the profile was downloading the entire corpus to
 * render six plates.** It called `getPosts()` — every row in the table — and
 * filtered client-side for `userId === account.id`, which meant 531 posts and
 * 328KB over the wire so that 1.1% of it could be shown, and `hydratePosts`
 * running its vote/comment/save fan-out across all 531 on every profile view.
 * That cost does not stay still either: it grows with the size of the app,
 * on a screen whose content does not.
 *
 * The `OR` is what keeps it one query rather than two: the saved grid and the
 * plate shelves are both on this screen, and fetching them separately would
 * trade one oversized request for two round trips plus a second hydration.
 * Both sets pass through the same `savedBy`/`userId` fields the callers
 * already filter on, so the client code splitting them apart is unchanged.
 *
 * Takes the id from the session at the call site, never from a query
 * parameter — a caller-supplied id here would hand anyone another person's
 * saved-post list, which is not public.
 *
 * **It is also the only query that selects a heart count, and the reason it
 * can is the CASE below.** The profile's plate badge counts every reaction a
 * plate has drawn — upvotes, comments and hearts together — which means the
 * author's own screen needs the third number the rest of the app is forbidden
 * to know. But this result set is mixed: the `OR` deliberately returns other
 * people's posts (the ones you saved), and a heart count on one of those would
 * be a straight leak of somebody else's private number. So the count is
 * decided by the same row that decides whether you may have it, in SQL, and
 * `heart_count` comes back NULL for every saved post. Doing it in JS after the
 * fact would put one refactor between here and the leak; doing it here means
 * the leak would have to be written on purpose.
 */
export async function getProfilePosts(
  userId: string,
  viewerId: string | null = null
): Promise<Post[]> {
  const rows = await sql.query(
    `SELECT p.*,
            CASE WHEN p.user_id = $1
                 THEN (SELECT count(*)::int FROM post_hearts h WHERE h.post_id = p.id)
                 ELSE NULL
            END AS heart_count
       FROM (${POST_SELECT}
             WHERE p.user_id = $1
                OR p.id IN (SELECT post_id FROM post_saves WHERE user_id = $1)) p
      ORDER BY p.created_at ASC`,
    [userId]
  );
  return hydratePosts(rows, viewerId);
}

export async function getPostById(id: string, viewerId: string | null = null): Promise<Post | null> {
  const rows = await sql.query(`${POST_SELECT} WHERE p.id = $1`, [id]);
  const hydrated = await hydratePosts(rows, viewerId);
  return hydrated[0] ?? null;
}

/**
 * Discover feed: every post, ranked by recency with steep time decay and
 * public engagement — net votes plus comments — as the secondary factor.
 * Moved server-side from the old client-side hotScore because it has to join
 * the vote and comment tables.
 *
 * **A negative score sinks below everything, and the ranking is in two tiers
 * because of the arithmetic.** The score used to be floored at zero, so a plate
 * everybody downvoted ranked exactly like one nobody had voted on — past zero,
 * downvotes stopped meaning anything. They mean something now.
 *
 * They can't mean it through the same division, though. `net / age^1.5` shrinks
 * toward zero as a post gets older, which is what makes it decay while positive
 * — and for a negative score, shrinking toward zero is a promotion. A month-old
 * −9 would climb over a fresh −1. So the sort is: everything at zero or above
 * first, on the original curve, untouched; then everything below zero, worst
 * first, newest breaking ties. Age deliberately does not lift a negative post
 * back up. Only votes can.
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
 *
 * Only the last `FEED_WINDOW_DAYS` of posts are eligible — see lib/feedWindow.
 * The cutoff is a filter on this read, never a delete: the post stays in the
 * table and keeps counting toward the restaurant's rating forever.
 *
 * **`limit` is the binding constraint on this feed, not the window**, and the
 * map is why that matters. `/feed`'s Map tab draws its bubbles from this same
 * response, so this number is also how many comments the whole city gets to
 * have. At 30 it ran out after 11 days — the cap was cutting the feed off well
 * inside even the old fortnight, so widening FEED_WINDOW_DAYS to two months
 * moved nothing, and searching the map for a cuisine found most of its matches
 * silent. 120 is what makes the wider window reach anything.
 *
 * It costs the feed LIST the same rows, since `/feed` fetches once and renders
 * both surfaces from it. That is the trade being made here: a longer scroll for
 * a map that has something to say about more than thirty plates. If the list
 * becomes the problem, the fix is to give the map its own read rather than to
 * put this back — see the same note in lib/feedWindow.
 */
/**
 * The two orderings, as literal SQL keyed by a validated union.
 *
 * `sql.unsafe` is safe here for the same reason `POST_SELECT` uses it: what it
 * splices is a constant chosen from this map, never a value off a request.
 * `parseFeedSort` narrows the query string to the union before it can reach
 * this object, so an unknown `?sort=` lands on "trending" rather than
 * anywhere near the query. Do not extend this to interpolate a caller's
 * string.
 *
 * "trending" is *recent plates with the most upvotes*:
 * `(netVotes + COMMENT_WEIGHT*comments + 1) / (ageHours + 2)^GRAVITY`.
 *
 * Both constants live in `lib/feedSort` rather than here, because that module
 * is the pure one — the UI can read them without pulling the Neon driver into
 * the browser bundle, and the reasoning for each number is written out beside
 * it.
 *
 * `TRENDING_COMMENT_WEIGHT` is 0 today, and the ternary below omits the term
 * rather than writing `0 * cm.count`, so the ranking is the expression it
 * looks like rather than one with a dead multiply in it. **The `cm` join in
 * the query itself stays either way**, and it is free while the weight is 0:
 * checked on 2026-08-24, `EXPLAIN` of this ordering drops the `cm` node from
 * the plan entirely (`uv` and `dv` both survive as Hash Left Joins, `cm` does
 * not appear). Keeping it in the text means turning the knob back on is a
 * one-line change in `feedSort` and nothing here.
 *
 * The vote total is floored at zero so a heavily downvoted plate sinks to "as
 * if nobody voted" rather than sorting *below* older neutral posts by going
 * negative and inverting the age decay. That floor is also the whole of what
 * happens to a downvoted plate: there is **no Yik Yak-style `-5` removal**
 * here, and there should not be — see the note in `lib/feedSort`.
 *
 * The decay stays. Without it "Trending" is an all-time leaderboard that
 * never changes and a plate posted this evening can never reach — which is
 * "Top", not "Trending", and there is already a "New" for chronology.
 */
const DISCOVER_ORDER: Record<FeedSort, string> = {
  trending: `(GREATEST(COALESCE(uv.count, 0) - COALESCE(dv.count, 0), 0)${
    TRENDING_COMMENT_WEIGHT > 0 ? ` + ${TRENDING_COMMENT_WEIGHT} * COALESCE(cm.count, 0)` : ""
  } + 1)
        / POWER(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600 + 2, ${TRENDING_GRAVITY}) DESC`,
  new: `p.created_at DESC`,
};

export async function getDiscoverFeed(
  viewerId: string | null,
  limit = 30,
  sort: FeedSort = FEED_SORT_DEFAULT,
): Promise<Post[]> {
  // `!= ALL(empty array)` is vacuously true in Postgres, so a signed-out
  // viewer (empty blockedIds) filters nothing — same shape as the `ANY(ids)`
  // pattern hydratePosts already uses for viewer-scoped lookups.
  const blockedIds = viewerId ? await getBlockedEitherWayIds(viewerId) : [];
  // The net score is computed in a subquery rather than inline in ORDER BY:
  // Postgres only resolves a select alias in ORDER BY when it stands alone, and
  // every use here is inside an expression, so naming it any other way would
  // mean writing the same COALESCE pair out three more times.
  const rows = await sql`
    SELECT p.id, p.user_id, p.text, p.restaurant, p.created_at,
           p.restaurant_id, p.restaurant_lat, p.restaurant_lng,
           p.dish_name, p.price, p.rating, p.rating_kind, p.location_label,
           /*
            * Private media is dropped **in the database**, not after it arrives.
            *
            * This used to select p.media whole and then throw it away in JS
            * (media: photosPublic ? media : []). While photos are base64
            * in this column that means every private photo was read out of
            * Postgres in full — ~150KB each, up to four a post — carried across
            * the network, and dropped on the floor. On a metered database that
            * is a bill for bytes nobody was ever going to see, and it is what
            * exhausted Neon's transfer quota.
            *
            * It is also the stronger form of the privacy rule. The invariant was
            * "a private photo's URL never reaches the response"; enforcing it
            * here means the bytes never leave the database at all, so no later
            * caller can forget to re-apply the filter.
            */
           CASE WHEN p.photos_public THEN p.media ELSE '[]'::jsonb END AS media,
           p.vibe, p.photos_public,
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
    LEFT JOIN (
      SELECT post_id, count(*) AS count FROM comments GROUP BY post_id
    ) cm ON cm.post_id = p.id
    WHERE p.user_id != ALL(${blockedIds})
      AND p.created_at > now() - make_interval(days => ${FEED_WINDOW_DAYS})
    ORDER BY ${sql.unsafe(DISCOVER_ORDER[sort])}
    LIMIT ${limit}
  `;
  const posts = await hydratePosts(rows, viewerId, /* includeHearts */ false);
  // `net` is selected so ORDER BY can name it once instead of repeating the
  // expression three times; hydratePosts recounts both directions itself and
  // ignores the column.
  /* No media filter here any more — the SELECT above already returned '[]' for
     any post whose photos are private, so there is nothing left to strip. */
  return posts;
}

/**
 * Friends tab: strictly chronological, only mutual friends, every post
 * appears. No ranking math, no engagement join — the spec is explicit that
 * this feed does not sort by engagement at all. Photos always show for a
 * friend's post regardless of photosPublic; that flag only gates Discover.
 *
 * Same `FEED_WINDOW_DAYS` cutoff as Discover, for the same reason and with the
 * same guarantee: a friend's older post is out of the feed, not gone.
 */
export async function getFriendsFeed(viewerId: string, limit = 60): Promise<Post[]> {
  // Belt-and-suspenders: blockUser() already unfriends both sides, so a
  // blocked user's rows are normally gone from the friendship subquery
  // below on their own. This catches it anyway rather than trusting that
  // invariant to hold forever.
  const blockedIds = await getBlockedEitherWayIds(viewerId);
  const rows = await sql`
    ${sql.unsafe(POST_SELECT)}
    WHERE p.user_id IN (
      SELECT CASE WHEN f.user_a = ${viewerId} THEN f.user_b ELSE f.user_a END
      FROM friendships f
      WHERE f.user_a = ${viewerId} OR f.user_b = ${viewerId}
    )
    AND p.user_id != ALL(${blockedIds})
    AND p.created_at > now() - make_interval(days => ${FEED_WINDOW_DAYS})
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
  const media = data.media ?? [];
  const rows = await sql`
    INSERT INTO posts (
      id, user_id, text, restaurant, restaurant_id, restaurant_lat, restaurant_lng,
      dish_name, price, rating, rating_kind, location_label, media, vibe,
      photos_public
    )
    VALUES (
      ${data.id}, ${data.userId}, ${data.text}, ${data.restaurant ?? null},
      ${data.restaurantId ?? null}, ${data.restaurantLat ?? null}, ${data.restaurantLng ?? null},
      ${data.dishName ?? null}, ${data.price ?? null}, ${data.rating ?? null}, ${data.ratingKind ?? null},
      ${data.locationLabel ?? null}, ${JSON.stringify(media)}::jsonb,
      ${data.vibe ?? null}, ${data.photosPublic}
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

/**
 * Deletes a post and the photos on it.
 *
 * The photos are files in the blob store now and the row only holds their
 * addresses, so dropping the row alone would strand them: unreferenced,
 * still public at their URL, still billed, and no longer reachable from
 * anything that could tell you they existed. They have to be read before the
 * DELETE, because afterwards there is nothing left to read them from.
 *
 * A failed `del` does not fail the delete. What was asked for is the post
 * going away, and it has; a file that outlives it is a housekeeping problem,
 * not a reason to tell someone their post is still there.
 */
export async function deletePost(id: string): Promise<void> {
  const rows = (await sql`
    SELECT jsonb_array_elements(media)->>'url' AS url
      FROM posts
     WHERE id = ${id} AND jsonb_array_length(media) > 0
  `) as { url: string | null }[];

  await sql`DELETE FROM posts WHERE id = ${id}`;

  const urls = rows
    .map((r) => r.url)
    .filter((u): u is string => typeof u === "string" && isStoredPhotoUrl(u));
  if (urls.length === 0) return;

  try {
    await del(urls);
  } catch (err) {
    console.error(`[deletePost] ${id}: row deleted, ${urls.length} photo(s) left behind`, err);
  }
}

export async function addComment(
  postId: string,
  data: { id: string; userId: string; text: string; parentId?: string | null }
): Promise<Comment> {
  const parentId = data.parentId ?? null;
  const rows = await sql`
    INSERT INTO comments (id, post_id, user_id, text, parent_id)
    VALUES (${data.id}, ${postId}, ${data.userId}, ${data.text}, ${parentId})
    RETURNING created_at
  `;
  const user = await getUserById(data.userId);
  return {
    id: data.id,
    parentId,
    userId: data.userId,
    authorName: user?.name ?? "",
    authorAvatarUrl: user?.avatarUrl,
    text: data.text,
    createdAt: new Date(rows[0].created_at).toISOString(),
    upvoteCount: 0,
    downvoteCount: 0,
    myVote: null,
  };
}

/**
 * Who wrote a comment and which post it hangs off — the two things a caller
 * needs before it can pay someone or accept a reply. Null if there's no such
 * comment.
 */
export async function getCommentContext(
  commentId: string,
): Promise<{ postId: string; userId: string } | null> {
  const rows = await sql`SELECT post_id, user_id FROM comments WHERE id = ${commentId}`;
  if (!rows[0]) return null;
  return { postId: rows[0].post_id as string, userId: rows[0].user_id as string };
}

/**
 * A comment's vote. Same three-state contract as castVote — pressing the
 * direction you already hold clears it, the other one switches sides — and the
 * same two-table shape, so the counts can't be confused with each other.
 *
 * `firstTimeUpvote` means the same thing it does for a post, and is what the
 * route pays out on: switching over from a downvote counts, re-pressing an
 * upvote already held doesn't, and a downvote never does.
 */
export async function castCommentVote(
  commentId: string,
  userId: string,
  direction: VoteDirection,
): Promise<{
  myVote: VoteDirection | null;
  upvoteCount: number;
  downvoteCount: number;
  firstTimeUpvote: boolean;
}> {
  const [hadUp, hadDown] = await Promise.all([
    sql`SELECT 1 FROM comment_upvotes WHERE comment_id = ${commentId} AND user_id = ${userId}`,
    sql`SELECT 1 FROM comment_downvotes WHERE comment_id = ${commentId} AND user_id = ${userId}`,
  ]);
  const held: VoteDirection | null =
    hadUp.length > 0 ? "up" : hadDown.length > 0 ? "down" : null;
  const myVote = held === direction ? null : direction;

  await sql`DELETE FROM comment_upvotes WHERE comment_id = ${commentId} AND user_id = ${userId}`;
  await sql`DELETE FROM comment_downvotes WHERE comment_id = ${commentId} AND user_id = ${userId}`;
  if (myVote === "up") {
    await sql`INSERT INTO comment_upvotes (comment_id, user_id) VALUES (${commentId}, ${userId})`;
  } else if (myVote === "down") {
    await sql`INSERT INTO comment_downvotes (comment_id, user_id) VALUES (${commentId}, ${userId})`;
  }

  const [upRows, downRows] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM comment_upvotes WHERE comment_id = ${commentId}`,
    sql`SELECT count(*)::int AS count FROM comment_downvotes WHERE comment_id = ${commentId}`,
  ]);

  return {
    myVote,
    upvoteCount: upRows[0].count as number,
    downvoteCount: downRows[0].count as number,
    firstTimeUpvote: myVote === "up" && held !== "up",
  };
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

  // Either direction of a block kills a friend request before it starts —
  // same as sending it and having it silently vanish, but without ever
  // creating the pending row.
  const blocked = await sql`
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = ${requesterId} AND blocked_id = ${recipientId})
       OR (blocker_id = ${recipientId} AND blocked_id = ${requesterId})
  `;
  if (blocked.length > 0) return "none";

  // The recipient closed their door. Returns "none" — the same answer a block
  // gives — because the alternative is telling the requester something about
  // an account that has just declined to tell them anything.
  const closed = await sql`
    SELECT 1 FROM users WHERE id = ${recipientId} AND NOT friend_requests_open
  `;
  if (closed.length > 0) return "none";

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

// --- Blocking ----------------------------------------------------------

export type BlockStatus = "none" | "blocked" | "blocked_by";

/** Where two users stand on blocking, from viewerId's point of view. */
export async function getBlockStatus(viewerId: string, otherId: string): Promise<BlockStatus> {
  if (viewerId === otherId) return "none";
  const rows = await sql`
    SELECT blocker_id FROM blocked_users
    WHERE (blocker_id = ${viewerId} AND blocked_id = ${otherId})
       OR (blocker_id = ${otherId} AND blocked_id = ${viewerId})
  `;
  const row = rows[0] as { blocker_id: string } | undefined;
  if (!row) return "none";
  return row.blocker_id === viewerId ? "blocked" : "blocked_by";
}

/**
 * Blocking tears down any existing friendship and any pending request in
 * either direction first — being blocked shouldn't leave a friendship or an
 * unanswered request behind it.
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) return;
  await unfriend(blockerId, blockedId);
  await sql`
    DELETE FROM friend_requests
    WHERE (requester_id = ${blockerId} AND recipient_id = ${blockedId})
       OR (requester_id = ${blockedId} AND recipient_id = ${blockerId})
  `;
  await sql`
    INSERT INTO blocked_users (blocker_id, blocked_id) VALUES (${blockerId}, ${blockedId})
    ON CONFLICT DO NOTHING
  `;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await sql`DELETE FROM blocked_users WHERE blocker_id = ${blockerId} AND blocked_id = ${blockedId}`;
}

export type BlockedUserSummary = { id: string; name: string; avatarUrl?: string };

/** Who this user has blocked — for the account settings list and its unblock action. */
export async function getBlockedUsers(userId: string): Promise<BlockedUserSummary[]> {
  const rows = await sql`
    SELECT u.id, u.name, u.avatar_url
    FROM blocked_users b
    JOIN users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ${userId}
    ORDER BY u.name ASC
  `;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    avatarUrl: (r.avatar_url as string | null) ?? undefined,
  }));
}

/**
 * Every id blocking or blocked by this user, either direction — the feed
 * filter. Blocking is directional in the table but symmetric in effect: if
 * either side blocked the other, neither should see the other's posts.
 */
export async function getBlockedEitherWayIds(userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT CASE WHEN blocker_id = ${userId} THEN blocked_id ELSE blocker_id END AS other_id
    FROM blocked_users
    WHERE blocker_id = ${userId} OR blocked_id = ${userId}
  `;
  return rows.map((r) => r.other_id as string);
}

export type UserSearchResult = { id: string; name: string; avatarUrl?: string };

/**
 * Finds people to friend, by the same handle FoodPostCard already shows next
 * to their posts. There's no separate username column — `handleFor` in that
 * component derives one from `name` (lowercase, spaces stripped), so a search
 * normalizes both sides the identical way rather than introducing a second
 * notion of "username" that could drift from what's actually displayed.
 *
 * Excludes the searcher and anyone blocked in either direction: a block is
 * supposed to end contact, and turning up in the other person's search
 * results would be a way back in.
 */
export async function searchUsers(
  query: string,
  viewerId: string,
  limit = 10,
): Promise<UserSearchResult[]> {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) return [];
  const blockedIds = await getBlockedEitherWayIds(viewerId);
  const rows = await sql`
    SELECT id, name, avatar_url
    FROM users
    WHERE id != ${viewerId}
      AND id != ALL(${blockedIds})
      -- Opted out of being findable. Enforced here rather than filtered after,
      -- so a hidden account never reaches a response at all.
      AND discoverable_by_username
      AND lower(replace(name, ' ', '')) LIKE ${"%" + normalized + "%"}
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    avatarUrl: (r.avatar_url as string | null) ?? undefined,
  }));
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

/**
 * Records that the first-post photo notice has been shown.
 *
 * One-way on purpose, and one-way *here* rather than at the route: there is no
 * caller that wants to un-tell somebody something, and a settable boolean would
 * let a replayed request put the notice back in front of a user who has already
 * answered it. The route passes no value.
 */
export async function markPhotoNoticeSeen(userId: string): Promise<void> {
  await sql`UPDATE users SET photo_notice_seen = true WHERE id = ${userId}`;
}

/**
 * Records that the first-run coach tour has run. Same one-way latch, and for
 * the same reason: nothing wants to put a tour back in front of somebody who
 * has already been walked through the app.
 */
export async function markTourSeen(userId: string): Promise<void> {
  await sql`UPDATE users SET tour_seen = true WHERE id = ${userId}`;
}

/**
 * The three privacy switches, written one column at a time so a caller can
 * send one without having to know or resend the other two — the same shape
 * `updateFavorites` uses, and the reason both take partials.
 */
export async function updatePrivacySettings(
  userId: string,
  data: {
    hideFromLeaderboard?: boolean;
    discoverableByUsername?: boolean;
    friendRequestsOpen?: boolean;
  }
): Promise<void> {
  if (data.hideFromLeaderboard !== undefined) {
    await sql`UPDATE users SET hide_from_leaderboard = ${data.hideFromLeaderboard} WHERE id = ${userId}`;
  }
  if (data.discoverableByUsername !== undefined) {
    await sql`UPDATE users SET discoverable_by_username = ${data.discoverableByUsername} WHERE id = ${userId}`;
  }
  if (data.friendRequestsOpen !== undefined) {
    await sql`UPDATE users SET friend_requests_open = ${data.friendRequestsOpen} WHERE id = ${userId}`;
  }
}

/**
 * Rename. The uniqueness check belongs to the caller — the route does it
 * against `getUserByName` so it can say "that username is taken" rather than
 * surface a constraint violation — but `idx_users_name_unique` is what
 * actually holds the line if two renames race.
 *
 * Nothing else has to change: posts, comments and the leaderboard all join
 * `users` for the display name rather than copying it, and a handle is derived
 * from the current name at render time. The one thing that does *not* follow
 * the rename is history someone else already read.
 */
export async function updateUserName(userId: string, name: string): Promise<void> {
  await sql`UPDATE users SET name = ${name} WHERE id = ${userId}`;
}

/** Caller hashes. This never sees a plaintext password and must not start. */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`;
}

/* --- Email verification ----------------------------------------------------
 *
 * The rule these functions exist to hold: **`users.email` changes in exactly
 * one place**, `confirmEmail`, and only with a token in hand. Everything else
 * here either parks an address in `pending_email` (which authenticates
 * nothing) or reads a token. A second writer would quietly undo the guarantee.
 */

/** Parks an address as "asked for, not proved". Pass null to withdraw it. */
export async function setPendingEmail(userId: string, email: string | null): Promise<void> {
  await sql`UPDATE users SET pending_email = ${email} WHERE id = ${userId}`;
}

export async function createEmailVerification(data: {
  tokenHash: string;
  userId: string;
  email: string;
  expiresAt: Date;
}): Promise<void> {
  await sql`
    INSERT INTO email_verifications (token_hash, user_id, email, expires_at)
    VALUES (${data.tokenHash}, ${data.userId}, ${data.email}, ${data.expiresAt.toISOString()})
  `;
}

export type EmailVerification = {
  userId: string;
  /** The address this token proves — snapshotted, so a later edit can't retarget it. */
  email: string;
  expiresAt: string;
};

export async function getEmailVerification(tokenHash: string): Promise<EmailVerification | null> {
  const rows = await sql`
    SELECT user_id, email, expires_at FROM email_verifications WHERE token_hash = ${tokenHash}
  `;
  const row = rows[0];
  if (!row) return null;
  return { userId: row.user_id, email: row.email, expiresAt: row.expires_at };
}

/** Spend or discard one token. Redeeming clears the rest — see `confirmEmail`. */
export async function deleteEmailVerification(tokenHash: string): Promise<void> {
  await sql`DELETE FROM email_verifications WHERE token_hash = ${tokenHash}`;
}

/** Withdraw every outstanding link for this user — what "cancel" has to mean. */
export async function deleteEmailVerificationsForUser(userId: string): Promise<void> {
  await sql`DELETE FROM email_verifications WHERE user_id = ${userId}`;
}

/**
 * Stamp the current address as proved, without changing it.
 *
 * `confirmEmail` is the only writer of `users.email`; this is the one place
 * that can raise the verified flag on its own, and it exists for the password
 * reset — reading a link sent to an address is the same proof a verification
 * link asks for, so demanding a second one afterwards would be theatre.
 */
export async function markEmailVerified(userId: string): Promise<void> {
  await sql`UPDATE users SET email_verified_at = now() WHERE id = ${userId} AND email_verified_at IS NULL`;
}

/* --- Password resets -------------------------------------------------------
 *
 * Deliberately thin, and deliberately separate from the verification helpers
 * above: a reset token names an account and nothing else. It cannot carry an
 * address, so it can never move one.
 */

export async function createPasswordReset(data: {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}): Promise<void> {
  await sql`
    INSERT INTO password_resets (token_hash, user_id, expires_at)
    VALUES (${data.tokenHash}, ${data.userId}, ${data.expiresAt.toISOString()})
  `;
}

export async function getPasswordReset(
  tokenHash: string
): Promise<{ userId: string; expiresAt: string } | null> {
  const rows = await sql`
    SELECT user_id, expires_at FROM password_resets WHERE token_hash = ${tokenHash}
  `;
  const row = rows[0];
  return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
}

export async function deletePasswordReset(tokenHash: string): Promise<void> {
  await sql`DELETE FROM password_resets WHERE token_hash = ${tokenHash}`;
}

/** Every outstanding reset for this account — spent on success, so a second
    link sitting in the inbox can't rewrite the password again later. */
export async function deletePasswordResetsForUser(userId: string): Promise<void> {
  await sql`DELETE FROM password_resets WHERE user_id = ${userId}`;
}

export async function getLastPasswordResetSentAt(userId: string): Promise<string | null> {
  const rows = await sql`
    SELECT created_at FROM password_resets
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0]?.created_at ?? null;
}

/** When this user last asked for a link, for the resend throttle. */
export async function getLastEmailVerificationSentAt(userId: string): Promise<string | null> {
  const rows = await sql`
    SELECT created_at FROM email_verifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0]?.created_at ?? null;
}

/**
 * Redeem: the address on the token becomes the account's, proved, and every
 * outstanding token for this user dies with it.
 *
 * The `WHERE NOT EXISTS` is the race guard. Two people can both start a change
 * to the same address, and both links are valid until one is clicked — so the
 * claim has to be re-checked at the moment of the write, not at the moment the
 * mail was sent. The UPDATE touching no rows is how the caller learns it lost.
 *
 * Deleting the user's other tokens is deliberate: after a successful change,
 * a link sitting in the old inbox must not still be able to move the account.
 */
export async function confirmEmail(userId: string, email: string): Promise<boolean> {
  const rows = await sql`
    UPDATE users SET email = ${email}, email_verified_at = now(), pending_email = NULL
    WHERE id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM users other WHERE lower(other.email) = lower(${email}) AND other.id <> ${userId}
      )
    RETURNING id
  `;
  if (!rows[0]) return false;
  await sql`DELETE FROM email_verifications WHERE user_id = ${userId}`;
  return true;
}

/**
 * Ends every session except the one making the request, which is what "log out
 * everywhere else" has to mean — logging *this* device out too would answer a
 * request about other devices by signing you out of the one in your hand.
 *
 * Returns how many were ended, because "0 other devices" and "3 other devices"
 * deserve different sentences, and the caller can't count them afterwards.
 */
export async function deleteOtherSessions(userId: string, keepToken: string): Promise<number> {
  const rows = await sql`
    DELETE FROM sessions
    WHERE user_id = ${userId} AND token != ${keepToken}
    RETURNING token
  `;
  return rows.length;
}

/**
 * Everything this account has written, as plain data.
 *
 * The rule for what goes in: things *you* produced or chose. Your posts, your
 * comments, your saves, your points, who you're friends with. What stays out is
 * anything that would use your export to leak somebody else — the same line
 * `getActivityForAuthor` draws. Hearts you *received* are already author-only
 * and stay that way here; upvotes you received are counted, never named, which
 * is the standing rule everywhere in this app. Other people's comments on your
 * posts are theirs, not yours, so they are counted rather than reproduced.
 *
 * No password hash, obviously, and no session tokens: an export lands in a
 * downloads folder and gets emailed around, and neither of those should travel.
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const [user, posts, comments, saves, points, friends] = await Promise.all([
    sql`SELECT id, name, email, points, avatar_url, share_photos_publicly,
               favorite_cuisine, favorite_restaurant_id, agreed_to_terms_at,
               hide_from_leaderboard, discoverable_by_username, friend_requests_open
        FROM users WHERE id = ${userId}`,
    sql`SELECT p.id, p.text, p.restaurant, p.restaurant_id, p.dish_name, p.price,
               p.rating, p.rating_kind, p.location_label, p.tags, p.amenities, p.vibe,
               p.photos_public, p.created_at,
               (SELECT count(*) FROM post_upvotes v WHERE v.post_id = p.id)::int AS upvotes,
               (SELECT count(*) FROM comments c WHERE c.post_id = p.id)::int AS comment_count
        FROM posts p WHERE p.user_id = ${userId} ORDER BY p.created_at ASC`,
    sql`SELECT id, post_id, text, created_at FROM comments
        WHERE user_id = ${userId} ORDER BY created_at ASC`,
    sql`SELECT post_id FROM post_saves WHERE user_id = ${userId}`,
    sql`SELECT amount, reason, created_at FROM point_events
        WHERE user_id = ${userId} ORDER BY created_at ASC`,
    sql`SELECT u.name, f.created_at
        FROM friendships f
        JOIN users u ON u.id = CASE WHEN f.user_a = ${userId} THEN f.user_b ELSE f.user_a END
        WHERE f.user_a = ${userId} OR f.user_b = ${userId}
        ORDER BY f.created_at ASC`,
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: user[0] ?? null,
    posts,
    comments,
    savedPostIds: saves.map((r) => r.post_id),
    pointHistory: points,
    friends,
    // Photos are deliberately absent. They live as data URLs on the post rows
    // and would multiply the file size by an order of magnitude for something
    // the person already has in their camera roll.
    note: "Photos are not included. Posts older than the feed window are — nothing here is ever deleted.",
  };
}

export type PublicProfile = {
  id: string;
  name: string;
  avatarUrl?: string;
  points: number;
  favoriteCuisine?: string;
  favoriteRestaurantId?: string;
};

// --- Plate scores ----------------------------------------------------------
//
// Every plate average below is weighted twice over, and the two weights answer
// different questions. `plateScore.ts` weights a *dish* by how many ratings
// stand behind it — how well attested it is. The three queries here weight each
// individual *rating* by the rank its author has earned, off the ladder in
// `lib/ranks.ts`. A person who has been rating plates in this city for a year
// leans on a disagreement harder than an account opened this morning, and that
// happens inside the group average, before the confidence damping ever sees it.
//
// Both are narrow on purpose and neither can run away with a score. See the
// docstring at the top of `plateScore.ts`, which is where the whole model is
// written down.

/**
 * One row per distinct plate someone has rated at a restaurant.
 *
 * Grouped on a normalised dish name (`lower(trim(...))`) so "Al Pastor" and
 * "al pastor" are one plate rather than two thinly-rated ones — the composer
 * picks off a menu, but free-typed and legacy rows exist and two spellings of
 * the same dish would each get its own confidence weight.
 *
 * A rated post with no dish name falls into a single empty-key bucket rather
 * than being dropped: it is still somebody's rating of something they ate
 * there, and dropping it would quietly shrink the sample.
 *
 * Takes the table alias because the same expression has to be written two
 * ways: the aggregates below select `FROM posts` directly, while `POST_SELECT`
 * aliases it `p`. One function rather than a second string literal — this
 * normalisation already has a twin in `lib/dishRatingKey.ts` that must match
 * it, and a third copy is one more thing to drift.
 */
function plateGroupOn(alias: string): string {
  return `lower(trim(coalesce(${alias}.dish_name, '')))`;
}

const PLATE_GROUP = plateGroupOn("posts");

/**
 * The rank ladder from `lib/ranks.ts`, compiled down to a SQL `CASE` over the
 * rating author's lifetime points.
 *
 * It is generated rather than written out because the alternative is a second
 * copy of 4000/1200/400/100/10 living in a string, and two copies of a
 * threshold table drift the first time somebody decides Critic starts at 1,500.
 * The badge on a profile and the pull that person's rating carries have to come
 * from the same row or the product is quietly lying in one of the two places.
 * `RANKS` stays the only place those numbers exist.
 *
 * Every value spliced in is a number off our own constant table — nothing here
 * has ever touched a request — but it is coerced with `Number()` on the way
 * into the string anyway, so that even a future `RANKS` populated from
 * somewhere less trustworthy cannot turn this into an injection site. The arms
 * are emitted descending because a `CASE` returns on its first match, which is
 * what makes "at least this many points" work without an upper bound on each
 * arm; the lowest rung is the `ELSE` for the same reason.
 *
 * A missing author — the LEFT JOIN found nothing — is Regular's neutral 1.0,
 * never a drop. See the note on the joins below for why that matters.
 */
const RATER_WEIGHT = (() => {
  const neutral = rankByKey("regular").weight;
  const descending = [...RANKS].sort((a, b) => b.minPoints - a.minPoints);
  const floor = descending[descending.length - 1];
  const arms = descending
    .slice(0, -1)
    .map((rank) => `WHEN users.points >= ${Number(rank.minPoints)} THEN ${Number(rank.weight)}`)
    .join(" ");
  return `CASE WHEN users.points IS NULL THEN ${Number(neutral)} ${arms} ELSE ${Number(floor.weight)} END`;
})();

/**
 * One plate's average, with each rating pulling as hard as its author's rank.
 *
 * `NULLIF` guards a zero denominator that today's ladder cannot produce — every
 * weight in `RANKS` is positive, so any group with a row in it sums above zero.
 * It is here because it costs nothing and a division-by-zero raised inside a
 * page render is a 500 with a stack trace where a restaurant should be. It is
 * a guard, not a feature: a rung weighted 0 would still need handling in
 * `plateScore`, which has no null branch and would carry the NaN through.
 * Adding a zero weight to `RANKS` means going there first.
 *
 * The outer parentheses are load-bearing. Every call site casts this with
 * `::float`, and `::` binds tighter than `/` — unparenthesised, the cast lands
 * on the divisor alone and turns an exact `numeric` division into a float8 one.
 * `rating` is `numeric(5,1)`, so that was visible: a plate averaging exactly 58
 * came back as 57.99999999999999. Everything downstream rounds, so it never
 * reached a reader, but a score that is off in the sixteenth digit for no
 * reason is the kind of thing someone eventually spends an afternoon on.
 */
const PLATE_AVERAGE = `(SUM(rating * (${RATER_WEIGHT})) / NULLIF(SUM(${RATER_WEIGHT}), 0))`;

/**
 * What this restaurant's plates add up to — the only restaurant-level rating in
 * the product. See src/lib/plateScore.ts for the weighting and for why a
 * thinly-rated restaurant gets a null percent rather than a confident-looking
 * number off two ratings.
 *
 * The join is LEFT and not INNER, and the difference is a silent one. A rated
 * post whose author row has gone missing is still somebody's rating of
 * something they ate; an INNER join would drop it out of the sample entirely,
 * changing the count as well as the average, and nothing would ever say so.
 * It counts, at Regular's neutral 1.0 — the same reasoning as the empty-key
 * bucket in `PLATE_GROUP` above.
 *
 * `ratings` stays `count(*)`, the raw headcount, and that is not an oversight.
 * It is the number `plateScore` damps with `CONFIDENCE_K` and tests against
 * `MIN_RATED_DISHES` / `MIN_TOTAL_RATINGS`, and every one of those means "how
 * many people actually rated this", never "how much weight accumulated". Let
 * the weighted sum become the count and three Newcomers stop clearing a floor
 * of three — the restaurant goes back to "No plates rated yet" because of who
 * rated it, which is a different and much worse product than this one.
 */
export async function getRestaurantPlateScore(restaurantId: string): Promise<PlateScore> {
  const rows = await sql`
    SELECT ${sql.unsafe(PLATE_AVERAGE)}::float AS average, count(*)::int AS ratings
    FROM posts
    LEFT JOIN users ON users.id = posts.user_id
    WHERE restaurant_id = ${restaurantId}
      AND rating_kind = 'dish'
      AND rating IS NOT NULL
    GROUP BY ${sql.unsafe(PLATE_GROUP)}
  `;
  return plateScore(rows.map(toRatedDish));
}

/**
 * The same score for every restaurant at once, keyed by id.
 *
 * Discover needs all of them before it can order the grid, evaluate "Top rated"
 * or print a facet count, exactly as with the aspect tallies below — and for the
 * same reason this is one grouped aggregate rather than a request per card.
 *
 * Restaurants nobody has rated a plate at are absent rather than present with a
 * zeroed score; `plateScore([])` is what a caller should show for them, and a
 * missing key and an empty list mean the same thing to it.
 */
export async function getAllRestaurantPlateScores(): Promise<Record<string, PlateScore>> {
  const rows = await sql`
    SELECT restaurant_id,
           ${sql.unsafe(PLATE_AVERAGE)}::float AS average,
           count(*)::int AS ratings
    FROM posts
    LEFT JOIN users ON users.id = posts.user_id
    WHERE rating_kind = 'dish'
      AND rating IS NOT NULL
      AND restaurant_id IS NOT NULL
    GROUP BY restaurant_id, ${sql.unsafe(PLATE_GROUP)}
  `;

  const byRestaurant = new Map<string, RatedDish[]>();
  for (const row of rows) {
    const id = row.restaurant_id as string;
    const list = byRestaurant.get(id);
    if (list) list.push(toRatedDish(row));
    else byRestaurant.set(id, [toRatedDish(row)]);
  }

  const scores: Record<string, PlateScore> = {};
  for (const [id, dishes] of byRestaurant) scores[id] = plateScore(dishes);
  return scores;
}

function toRatedDish(row: Record<string, unknown>): RatedDish {
  return { average: row.average as number, ratings: row.ratings as number };
}

/**
 * Each plate's own rating at one restaurant, keyed by its normalised name.
 *
 * The same grouping the plate score is built from (`PLATE_GROUP`), returned per
 * dish instead of folded together — so the menu can print the number a plate
 * earned and the header's percent is visibly the average of exactly these.
 * A caller matches a menu row by `dishRatingKey(dish.name)`.
 *
 * This is distinct from `dishes.yes_votes`/`no_votes`, the older "would you eat
 * this?" tally that `dishStats` reads. Both render as a percent, and that is a
 * known problem: they answer different questions from different inputs. Ratings
 * win where a plate has them — see the note in RestaurantDetail.
 */
export async function getDishRatingsForRestaurant(
  restaurantId: string,
): Promise<Record<string, RatedDish>> {
  const rows = await sql`
    SELECT ${sql.unsafe(PLATE_GROUP)} AS dish_key,
           ${sql.unsafe(PLATE_AVERAGE)}::float AS average,
           count(*)::int AS ratings
    FROM posts
    LEFT JOIN users ON users.id = posts.user_id
    WHERE restaurant_id = ${restaurantId}
      AND rating_kind = 'dish'
      AND rating IS NOT NULL
      AND dish_name IS NOT NULL
    GROUP BY ${sql.unsafe(PLATE_GROUP)}
  `;

  const byDish: Record<string, RatedDish> = {};
  for (const row of rows) byDish[row.dish_key as string] = toRatedDish(row);
  return byDish;
}

/**
 * Enough to read the room about one plate. A dish is a much narrower subject
 * than a restaurant, so this is a ceiling that is rarely reached rather than a
 * page size — the sheet has no "load more" because there is nothing to load.
 */
const DISH_POSTS_LIMIT = 40;

/**
 * Every post about one plate at one restaurant, newest first.
 *
 * The same normalised name the ratings are grouped under (`plateGroupOn`), so
 * the list underneath a dish's percent is exactly the posts that percent was
 * computed from — two spellings of "Al Pastor" are one plate here for the same
 * reason they are one plate there. `dishRatingKey` normalises the parameter
 * side; the two must agree or a dish with ratings shows an empty list.
 *
 * Unrated posts that name the dish are included. `rating IS NOT NULL` belongs
 * on the aggregates — a number nobody entered cannot be averaged — but this is
 * a *reading* surface, and "I got the al pastor, skip the salsa verde" is
 * exactly what someone tapping a dish came for.
 *
 * **Not windowed.** Like `getPosts`, and for the reason in the note on
 * `FEED_WINDOW_DAYS`: freshness is a question the feeds ask, and a plate's
 * write-up is worth reading long after it would have scrolled off Discover.
 *
 * Photo privacy is enforced here rather than left to the client, the same way
 * `getDiscoverFeed` does it — a restaurant page is public, so a post whose
 * author never opted into public photos has its media stripped before the row
 * becomes a response.
 */
export async function getDishPosts(
  restaurantId: string,
  dishName: string,
  viewerId: string | null = null,
  limit = DISH_POSTS_LIMIT,
): Promise<Post[]> {
  // The empty key is a real bucket in the aggregates — every rated post that
  // named no dish. It is not a dish, so it can never be what was tapped.
  const key = dishRatingKey(dishName);
  if (!key) return [];

  const blockedIds = viewerId ? await getBlockedEitherWayIds(viewerId) : [];
  const rows = await sql`
    ${sql.unsafe(POST_SELECT)}
    WHERE p.restaurant_id = ${restaurantId}
      AND p.dish_name IS NOT NULL
      AND ${sql.unsafe(plateGroupOn("p"))} = ${key}
      AND p.user_id != ALL(${blockedIds})
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `;
  const posts = await hydratePosts(rows, viewerId);
  return posts.map((post) => ({ ...post, media: post.photosPublic ? post.media : [] }));
}

// --- Per-aspect verdicts ---------------------------------------------------

export type RestaurantAspectTally = {
  /**
   * The restaurant's sourced rating on 1-5 — the base every category is spaced
   * around (`aspectScores`), and the only outside number in that model.
   *
   * Not the plate score, on purpose: a category is a claim about the place, the
   * plate score is a claim about its food, and anchoring categories to it made
   * them move whenever the menu did.
   */
  base: number;
  /** How many rated reviews the votes could have come from. */
  reviewCount: number;
  /** praised / faulted counts, keyed by aspect. Aspects nobody voted on are absent. */
  votes: Record<string, { praised: number; faulted: number }>;
};

/**
 * Aspect votes are read from **every** rated post, whatever its `rating_kind`.
 *
 * A vote is a claim about the place — "the drinks are what this bar is for" —
 * and which instrument the review that carried it happened to use says nothing
 * about that. Scoping these to `'dish'` when the star review was retired hid
 * every vote written before the change, which is most of them; the taps are
 * identical either way, so the kind of the host post is not a reason to discard
 * one.
 */
const VOTE_SOURCE_POSTS = `p.rating IS NOT NULL`;

/**
 * Everything src/lib/aspectScores.ts needs to score one restaurant: its own
 * average rating, how many reviews that came from, and the signed aspect
 * tallies.
 *
 * New taps ride along on a plate review — you were at the place to eat the
 * plate — but the read spans every rated post; see `VOTE_SOURCE_POSTS`.
 */
export async function getRestaurantAspectTally(
  restaurantId: string,
): Promise<RestaurantAspectTally> {
  const [voteRows, sourceRows, baseRows] = await Promise.all([
    sql`
      SELECT v.aspect,
             count(*) FILTER (WHERE v.sentiment = 'praise')::int AS praised,
             count(*) FILTER (WHERE v.sentiment = 'fault')::int   AS faulted
      FROM post_aspect_votes v
      JOIN posts p ON p.id = v.post_id
      WHERE p.restaurant_id = ${restaurantId}
        AND ${sql.unsafe(VOTE_SOURCE_POSTS)}
      GROUP BY v.aspect
    `,
    // The denominator `net` is taken over: how many rated reviews existed to
    // vote, not how many did. A category praised by 3 of 40 is a much weaker
    // claim than 3 of 4, and only this count can tell them apart.
    sql`
      SELECT count(*)::int AS n
      FROM posts p
      WHERE p.restaurant_id = ${restaurantId}
        AND ${sql.unsafe(VOTE_SOURCE_POSTS)}
    `,
    sql`SELECT rating FROM restaurants WHERE id = ${restaurantId}`,
  ]);

  const votes: Record<string, { praised: number; faulted: number }> = {};
  for (const row of voteRows) {
    votes[row.aspect as string] = {
      praised: row.praised as number,
      faulted: row.faulted as number,
    };
  }

  return {
    base: Number(baseRows[0]?.rating ?? 0),
    reviewCount: sourceRows[0]?.n ?? 0,
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
  const [voteRows, sourceRows] = await Promise.all([
    sql`
      SELECT p.restaurant_id,
             v.aspect,
             count(*) FILTER (WHERE v.sentiment = 'praise')::int AS praised,
             count(*) FILTER (WHERE v.sentiment = 'fault')::int   AS faulted
      FROM post_aspect_votes v
      JOIN posts p ON p.id = v.post_id
      WHERE ${sql.unsafe(VOTE_SOURCE_POSTS)}
        AND p.restaurant_id IS NOT NULL
      GROUP BY p.restaurant_id, v.aspect
    `,
    // The sourced rating plus how many rated reviews the votes could have come
    // from. Every restaurant is listed, including those with none, so a tally
    // exists for any restaurant a vote row might point at.
    sql`
      SELECT r.id, r.rating, count(p.id)::int AS review_count
      FROM restaurants r
      LEFT JOIN posts p
        ON p.restaurant_id = r.id AND p.rating IS NOT NULL
      WHERE r.listed
      GROUP BY r.id, r.rating
    `,
  ]);

  const tallies: Record<string, RestaurantAspectTally> = {};
  for (const row of sourceRows) {
    const id = row.id as string;
    tallies[id] = {
      base: Number(row.rating ?? 0),
      reviewCount: row.review_count as number,
      votes: {},
    };
  }

  // A vote row whose restaurant isn't in the corpus (an id rewritten by a data
  // refresh — `posts.restaurant_id` is a soft reference) is skipped rather than
  // given a tally of its own, which would score aspects against no anchor.
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
    sourceKey: row.source_key ?? undefined,
    name: row.name,
    cuisine: row.cuisine ?? null,
    cuisineTags: row.cuisine_tags ?? undefined,
    cuisineRaw: row.cuisine_raw ?? undefined,
    neighborhood: row.neighborhood,
    distance: row.distance,
    walkTime: row.walk_time,
    closingTime: row.closing_time,
    hours: row.hours ?? null,
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
    // Detail page only. Deliberately absent from `RestaurantView`, which is
    // downloaded once per restaurant by every visitor to the grid — a street
    // address is ~40 bytes nobody reads until they have chosen a restaurant.
    address: row.address ?? undefined,
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
 * Selects the `RestaurantView` columns rather than `*`, and that narrowing is
 * load-bearing rather than tidiness: these rows are handed to client
 * components, so every column named here is serialised into the page payload
 * once per restaurant and downloaded by every visitor. `SELECT *` was sending
 * eight fields the grid never reads. The detail page still gets the whole row
 * from `getRestaurantById`, where it is one restaurant and something renders
 * them.
 *
 * `price_band` is read, not derived. It used to be computed on every call by
 * pulling the price and section of every dish in the table and banding them in
 * JS — fine against 125 dishes, a full scan of the menu corpus against a real
 * one. It changes only when menus are re-imported, so the import writes it
 * (see scripts/import-restaurants.mjs, which calls the same `bandFor`).
 */
export async function getRestaurants(): Promise<RestaurantView[]> {
  // Seed-file order, not id order — `id` is TEXT, so ordering by it would
  // put "10" ahead of "2" and reshuffle the grid. See the sort_order note in
  // scripts/migrate.mjs.
  /*
   * `WHERE listed` is the publication gate: a row is visible only once it can
   * say something about itself. It is enforced here and in
   * `getRestaurantFacets`, which together cover the grid, search, the map, the
   * filter menus and the restaurants API.
   *
   * It is not a nicety. A restaurant imported from OpenStreetMap has a name and
   * coordinates and nothing else, and a single unrated row in the result set
   * threw `Cannot read properties of null` out of `RestaurantSearch` and took
   * down the whole page for any query that matched its name — a far wider blast
   * radius than the one broken listing that caused it.
   *
   * Holding those rows back rather than teaching the UI to render an absence is
   * deliberate: a card with no photo, no rating and no menu is not a degraded
   * listing, it is an empty one. Never drop this predicate to "show more".
   */
  const restaurantRows = await sql`
    SELECT id, name, cuisine, cuisine_tags, neighborhood, distance, hours,
           lat, lng, rating, review_count, trending, photo, photo_alt,
           photo_w, photo_h, price_band
    FROM restaurants WHERE listed ORDER BY sort_order, id
  `;

  return restaurantRows.map(rowToRestaurantView);
}

/**
 * The projection `getRestaurants` and `searchRestaurants` share.
 *
 * Pulled out so the two cannot drift: a column added to one and not the other
 * would give the search results a different shape than the grid, and every
 * caller reads both through the same `RestaurantView`.
 */
function rowToRestaurantView(row: Record<string, unknown>): RestaurantView {
  return {
    id: row.id as string,
    name: row.name as string,
    cuisine: (row.cuisine as string | null) ?? null,
    cuisineTags: (row.cuisine_tags as string | null) ?? "",
    // Present only on a search that joined the dish table; the grid's own
    // projection never selects these, so the field stays off browsing rows.
    ...(row.matched_dish
      ? {
          matchedDish: {
            name: row.matched_dish as string,
            price: (row.matched_dish_price as string) || null,
          },
        }
      : {}),
    neighborhood: row.neighborhood as string,
    distance: row.distance as string,
    hours: (row.hours as Hours) ?? null,
    lat: row.lat as number,
    lng: row.lng as number,
    rating: row.rating as number,
    reviewCount: row.review_count as number,
    trending: (row.trending as boolean) ?? false,
    photo: (row.photo as string | null) ?? undefined,
    photoAlt: (row.photo_alt as string | null) ?? undefined,
    // Both or neither: half a pair is not a ratio, and a caller that got one
    // would have to re-check the other anyway.
    photoW: (row.photo_w as number | null) ?? undefined,
    photoH: (row.photo_h as number | null) ?? undefined,
    // Null is meaningful: no menu means no band, and no price filter matches.
    priceBand: (row.price_band as PriceBand | null) ?? null,
  };
}

/**
 * Every listed restaurant, as the five fields a picker actually reads.
 *
 * `RestaurantPicker` uses `id`, `name`, `cuisine`, `neighborhood` and
 * `distance`; `restaurantRank.rank()` ranks on the middle three; the account
 * favourite picker uses `id` and `name` alone. None of them touches a photo, a
 * rating, coordinates, or `hours` - and `hours` is a JSONB blob that is on its
 * own about a third of the full projection's weight.
 *
 * Those three surfaces were fetching the whole corpus: 4,053 rows at 2.8 MB,
 * plus a full aggregate over `posts` for plate scores none of them render.
 * This exists because that is roughly a tenth of the transfer for exactly the
 * same behaviour.
 *
 * It is not a search - it deliberately returns everything, because a picker
 * filters as you type and a request per keystroke would be worse than one
 * request that is small. `searchRestaurants` below is the one that narrows.
 */
export type RestaurantIndexRow = Pick<
  RestaurantView,
  "id" | "name" | "cuisine" | "neighborhood" | "distance" | "lat" | "lng" | "rating"
>;

export async function getRestaurantIndex(): Promise<RestaurantIndexRow[]> {
  // `lat`/`lng` are here for the composer alone: picking a place stamps its
  // coordinates onto the post. Two floats against a JSONB `hours` blob and two
  // photo URLs is not the weight worth arguing about, and fetching them
  // separately on select would trade a tenth of a megabyte for a round trip in
  // the middle of someone's flow.
  // `rating` is a single number and the draft map-search fields print it, so it
  // rides along rather than justifying a third projection. The composer pickers
  // simply don't declare it.
  const rows = await sql`
    SELECT id, name, cuisine, neighborhood, distance, lat, lng, rating
    FROM restaurants WHERE listed ORDER BY sort_order, id
  `;
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    cuisine: (row.cuisine as string | null) ?? null,
    neighborhood: row.neighborhood as string,
    distance: row.distance as string,
    lat: row.lat as number,
    lng: row.lng as number,
    rating: row.rating as number,
  }));
}

/**
 * Every listed restaurant as the map reads it.
 *
 * `RestaurantMap` touches seven fields — `id`, `lat`, `lng`, `name`, `rating`,
 * `hours` and the plate score — and was being handed all fourteen plus two
 * photo URLs. It renders an unclustered WebGL circle layer, so it genuinely
 * does need every restaurant at every zoom (see AGENTS.md: the dots crowding
 * into bright districts is the intended effect, and clustering is explicitly
 * ruled out). What it does not need is the cuisine, the neighbourhood, the
 * walking distance, the price band, the review count, the trending flag, or
 * either photo.
 *
 * `hours` stays, and it is the heaviest thing left here — a seven-day array,
 * carried so one boolean can be recomputed on every clock tick (`closed`, which
 * dims a dot). Server-computing that boolean would halve this payload and
 * freeze the dimming until the next fetch, and sending only today's slot breaks
 * on the after-midnight wraparound `openStateFor` handles. Both are worth
 * doing and neither is worth guessing at: measure the real column first.
 */
export type RestaurantMapRow = Pick<
  RestaurantView,
  "id" | "name" | "lat" | "lng" | "rating" | "hours"
>;

export async function getRestaurantMapRows(): Promise<RestaurantMapRow[]> {
  /*
   * `hours` is trimmed to the two days that can affect the answer.
   *
   * Measured: the column is 1.37 MB across the listed rows, 324 bytes each, and
   * it was 67% of this endpoint's payload — seven near-identical slot objects
   * per restaurant, carried so the map could recompute one boolean. But
   * `windowsAround` in lib/openState.ts reads exactly two of them, today and
   * yesterday, the second only because a close after midnight belongs to the
   * previous day's window.
   *
   * Filtered in SQL rather than in JS after the query, and that distinction is
   * the whole point: Neon meters what leaves the database, so trimming after
   * the rows arrive would shrink the response to the browser and change the
   * bill not at all.
   *
   * The field keeps its name and shape - a `DaySlot[]`, just shorter - so
   * `openStateFor` needs no change. It already selects by `day`, and slots it
   * would have skipped are simply not there.
   *
   * "Today" is Los Angeles' today, computed here, which is the same clock
   * `openState.ts` uses; there is no timezone for the two to disagree about.
   * The route caches for 60s, so within a minute of midnight a cached response
   * can carry the previous pair. One dot's dimming, for under a minute, once a
   * day.
   */
  const laDay = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  });
  const today = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(laDay);
  const yesterday = (today + 6) % 7;

  const rows = await sql`
    SELECT id, name, lat, lng, rating,
           (
             SELECT jsonb_agg(slot)
             FROM jsonb_array_elements(hours) AS slot
             WHERE (slot->>'day')::int IN (${today}, ${yesterday})
           ) AS hours
    FROM restaurants WHERE listed ORDER BY sort_order, id
  `;
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    lat: row.lat as number,
    lng: row.lng as number,
    rating: row.rating as number,
    hours: (row.hours as Hours) ?? null,
  }));
}

/**
 * Restaurants matching a search term, filtered and capped in Postgres.
 *
 * `/api/restaurants?q=` used to call `getRestaurants()` and filter the result
 * in JavaScript. That returned the right answer at any size and got steadily
 * slower with the table: 4,053 rows, 2.8 MB and ~1.8s measured per request,
 * for a typeahead that shows at most a dozen results. The route's own comment
 * had named this the seam to move into SQL, and this is that move.
 *
 * Four fields now, not three, matched the same case-insensitive substring way.
 * `cuisine_tags` joined when cuisine became a controlled vocabulary: the
 * filter collapsed 162 labels into 29, and this column is what keeps the
 * detail searchable — a shop tagged `taco` files under Mexican but still
 * answers "tacos". Without it the collapse would have quietly deleted a
 * hundred and thirty working search terms.
 *
 * Every part is coalesced because `cuisine` is nullable, and `a || b` is NULL
 * when either side is: an uncoalesced concatenation would make the ~400
 * restaurants with no cuisine unfindable by *name*. The concatenation mirrors
 * the trigram index in scripts/migrate.mjs; if you change one, change the
 * other or the planner will quietly fall back to a sequential scan.
 *
 * Dishes join the search as a fifth field, and they are the reason the query
 * grew a CTE. 171,662 dishes sat in that table unreachable by any search box:
 * "carne asada fries" returned nothing while 129 listed restaurants served it.
 * A restaurant now matches if its own text matches *or* one of its dishes
 * does.
 *
 * `DISTINCT ON (restaurant_id) ... ORDER BY length(name)` picks one dish per
 * restaurant, the shortest matching name. That is the "which one did I mean"
 * heuristic: for "carne asada fries", the plain `Carne Asada Fries` is a
 * better answer than `Carne Asada Fries Supreme w/ Extra Guacamole`, and one
 * dish per row is what the card has room to print.
 *
 * The matched dish rides back on the row rather than being looked up again,
 * because the card shows it *before* you click through — a query like
 * "california burrito" returns 184 restaurants that would otherwise be
 * indistinguishable walls of "Mexican · Barrio Logan".
 *
 * `LIMIT` exists because no search surface can show more than a handful of
 * rows. It is generous rather than tight - ranking happens after this, in the
 * caller, so cutting too close here would hide a better match that sorting
 * would have brought to the top.
  * **Every field is coalesced.** Postgres propagates NULL through
 * concatenation, so `name || ' ' || cuisine || ' ' || neighborhood` is NULL for
 * any row missing a cuisine or a neighborhood — and NULL never matches ILIKE.
 * That silently hid **404 listed restaurants** from every search term,
 * including their own exact name: they were browsable but unfindable, which
 * reads to a visitor as "this restaurant isn't on the app". `concat_ws` skips
 * `coalesce` turns each missing field into an empty string instead of
 * poisoning the whole expression. It is `coalesce` rather than the tidier
 * `concat_ws` because concat_ws is STABLE, and Postgres will not build an
 * index on a non-IMMUTABLE expression.
 *
 * The GIN trigram index has to be built on the *same* expression or the
 * planner cannot use it — `idx_restaurants_search_ws` in scripts/migrate.mjs
 * is that index. Change one, change both.
 */
export async function searchRestaurants(term: string, limit = 60): Promise<RestaurantView[]> {
  const needle = `%${term}%`;
  const rows = await sql`
    WITH dish_match AS (
      SELECT DISTINCT ON (d.restaurant_id)
             d.restaurant_id, d.name, d.price
      FROM dishes d
      WHERE d.name ILIKE ${needle}
      ORDER BY d.restaurant_id, length(d.name), d.sort_order
    )
    SELECT r.id, r.name, r.cuisine, r.cuisine_tags, r.neighborhood, r.distance,
           r.hours, r.lat, r.lng, r.rating, r.review_count, r.trending,
           r.photo, r.photo_alt, r.photo_w, r.photo_h, r.price_band,
           dm.name AS matched_dish, dm.price AS matched_dish_price
    FROM restaurants r
    LEFT JOIN dish_match dm ON dm.restaurant_id = r.id
    WHERE r.listed
      AND (
        dm.restaurant_id IS NOT NULL
        OR (
          coalesce(r.name, '') || ' ' || coalesce(r.cuisine, '') || ' ' ||
          coalesce(r.cuisine_tags, '') || ' ' || coalesce(r.neighborhood, '')
        ) ILIKE ${needle}
      )
    ORDER BY r.sort_order, r.id
    LIMIT ${limit}
  `;
  return rows.map(rowToRestaurantView);
}

/**
 * Which restaurants serve a dish matching this term, and which dish it is.
 *
 * Discover needs the same answer `searchRestaurants` computes, but it cannot
 * use that function: the grid runs `matchesFilters` over the in-memory corpus
 * so the facet counts and the results come from one predicate, and that corpus
 * has no dishes in it. Putting them there was the alternative and it is the
 * wrong trade — 171,662 dish names is megabytes of text held per server
 * instance to answer a question almost no request asks.
 *
 * So the dish half of a query is fetched once per request that has a `q`, as a
 * map the predicate can consult by id. Unfiltered by `listed` on purpose: the
 * caller intersects with its own corpus, which is already gated, and a
 * predicate that has to agree with a second gate is a second place to drift.
 *
 * Returns an empty map for a blank term rather than every dish in the city.
 */
export async function dishMatchesFor(term: string): Promise<Map<string, MatchedDish>> {
  const trimmed = term.trim();
  if (!trimmed) return new Map();

  const rows = await sql`
    SELECT DISTINCT ON (d.restaurant_id)
           d.restaurant_id, d.name, d.price
    FROM dishes d
    WHERE d.name ILIKE ${`%${trimmed}%`}
    ORDER BY d.restaurant_id, length(d.name), d.sort_order
  `;

  return new Map(
    rows.map((row) => [
      row.restaurant_id as string,
      { name: row.name as string, price: (row.price as string) || null },
    ]),
  );
}

/**
 * One restaurant, or null if it is not ready to be shown.
 *
 * `AND listed` matters as much here as in the grid: without it an unlisted row
 * is unreachable by browsing but still reachable by URL, and the page it
 * renders is a crash rather than a 404. Returning null hands the caller a
 * missing restaurant, which `restaurant/[id]/page.tsx` already knows how to
 * turn into notFound().
 */
export async function getRestaurantById(id: string): Promise<Restaurant | null> {
  const rows = await sql`SELECT * FROM restaurants WHERE id = ${id} AND listed`;
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
/* --- Menu lookups -------------------------------------------------------- */

/*
 * The extraction ledger. `menu_lookups` records that a restaurant's menu was
 * ASKED ABOUT, separately from `dishes`, which records what came back. The
 * distinction is the whole point: a restaurant whose menu isn't on the open
 * web looks identical to one nobody has got to yet unless the attempt itself
 * is written down, and re-attempting those is the expensive mistake.
 *
 * Written by scripts/load-menus.mjs as menus are filled in ahead of time.
 * There is no per-visit lookup — see components/FullMenu.tsx.
 */

export type MenuLookup = {
  restaurantId: string;
  status: "found" | "not_found" | "error";
  sourceUrl?: string;
  confidence?: string;
  dishCount: number;
  attemptedAt: string;
};

/** Null when this restaurant has never been looked up — the only state in
    which spending money on it is allowed. */
export async function getMenuLookup(restaurantId: string): Promise<MenuLookup | null> {
  const rows = await sql`SELECT * FROM menu_lookups WHERE restaurant_id = ${restaurantId}`;
  const row = rows[0];
  if (!row) return null;
  return {
    restaurantId: row.restaurant_id as string,
    status: row.status as MenuLookup["status"],
    sourceUrl: (row.source_url as string | null) ?? undefined,
    confidence: (row.confidence as string | null) ?? undefined,
    dishCount: row.dish_count as number,
    attemptedAt: (row.attempted_at as Date).toISOString(),
  };
}

/** How many lookups have been attempted since a given moment — the daily cap. */
export async function countMenuLookupsSince(since: Date): Promise<number> {
  const rows = await sql`
    SELECT count(*)::int AS n FROM menu_lookups WHERE attempted_at >= ${since.toISOString()}
  `;
  return rows[0].n as number;
}

/**
 * Writes the attempt. `ON CONFLICT DO NOTHING` rather than an upsert: the row
 * means "we have already spent money asking about this", and a second attempt
 * must not be able to quietly reset that to look unspent.
 */
export async function recordMenuLookup(entry: {
  restaurantId: string;
  status: MenuLookup["status"];
  userId: string;
  sourceUrl?: string;
  confidence?: string;
  dishCount?: number;
}): Promise<void> {
  await sql`
    INSERT INTO menu_lookups
      (restaurant_id, status, source_url, confidence, dish_count, requested_by)
    VALUES (
      ${entry.restaurantId}, ${entry.status}, ${entry.sourceUrl ?? null},
      ${entry.confidence ?? null}, ${entry.dishCount ?? 0}, ${entry.userId}
    )
    ON CONFLICT (restaurant_id) DO NOTHING
  `;
}

/**
 * Swaps in a freshly read menu, as a set.
 *
 * Delete-then-insert rather than upsert by dish id, for the reason the import
 * script gives: a dish that has come off the menu has to actually leave, and
 * ids are positional within a restaurant so an upsert would leave a longer old
 * menu's tail behind.
 */
export async function replaceDishesForRestaurant(
  restaurantId: string,
  dishes: readonly Dish[],
): Promise<void> {
  await sql`DELETE FROM dishes WHERE restaurant_id = ${restaurantId}`;
  for (const [order, dish] of dishes.entries()) {
    await sql`
      INSERT INTO dishes
        (id, restaurant_id, name, description, price, section, yes_votes, no_votes, sort_order)
      VALUES (
        ${dish.id}, ${restaurantId}, ${dish.name}, ${dish.description ?? null},
        ${dish.price}, ${dish.section}, ${dish.yesVotes}, ${dish.noVotes}, ${order}
      )
    `;
  }
}

export async function getRestaurantFacets(): Promise<{
  cuisines: string[];
  neighborhoods: string[];
}> {
  // Gated like getRestaurants, and it matters more here than the row count
  // suggests: these two lists are Discover's filter menus. Ungated, every
  // cuisine and neighbourhood appearing anywhere in the staged rows becomes a
  // filter you can pick, and picking one returns an empty grid, because the
  // grid it filters is gated. An option that cannot match anything is worse
  // than an option that isn't offered.
  const [cuisineRows, neighborhoodRows] = await Promise.all([
    sql`SELECT DISTINCT cuisine FROM restaurants
           WHERE listed AND cuisine IS NOT NULL ORDER BY cuisine`,
    sql`SELECT DISTINCT neighborhood FROM restaurants WHERE listed ORDER BY neighborhood`,
  ]);
  return {
    cuisines: cuisineRows.map((r) => r.cuisine as string),
    neighborhoods: neighborhoodRows.map((r) => r.neighborhood as string),
  };
}
