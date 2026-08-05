import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    points INTEGER NOT NULL DEFAULT 0,
    monthly_points INTEGER NOT NULL DEFAULT 0,
    monthly_points_month TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    restaurant TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS post_likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    liked BOOLEAN NOT NULL DEFAULT true,
    awarded_points BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (post_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS post_saves (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_likes_post ON post_likes(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_saves_post ON post_saves(post_id)`,

  // Rich post fields. Added as separate ALTERs so the migration stays
  // re-runnable against a database created by an earlier version.
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS dish_name TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS price TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS rating NUMERIC(3,1)`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_label TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb`,
  // Room vibe (one value off a five-stop scale) and the amenity chips picked
  // in the review composer. Amenities are kept apart from `tags` so the card
  // can style "Outdoor seating" differently from "Dessert".
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS vibe TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}'`,

  // Every point award is written here as well as folded into users.points.
  // The ledger is what makes today/week/month leaderboards and rank deltas
  // computable; users.points stays as the cached all-time total.
  `CREATE TABLE IF NOT EXISTS point_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_point_events_user_time ON point_events(user_id, created_at)`,
  // Milestone bonuses use a deterministic reason string ("milestone:<post>:100")
  // so this unique index is what makes them award exactly once.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_point_events_unique_reason
     ON point_events(reason) WHERE reason LIKE 'milestone:%'`,

  `CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, following_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`,

  `CREATE TABLE IF NOT EXISTS comment_likes (
    comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (comment_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id)`,
];

for (const statement of statements) {
  await sql.query(statement);
}

console.log("Migration complete.");
