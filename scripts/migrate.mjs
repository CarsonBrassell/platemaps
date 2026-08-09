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
  // Which instrument produced `rating`, so the feed can render it back on the
  // scale it was collected on rather than one flattened 0-10 number:
  // 'restaurant' means `rating` is a star count 1-5, 'dish' means a percent
  // 0-100. Null only on comment-only posts, which carry no rating at all —
  // scripts/backfill-rating-kind.mjs converted every pre-split row.
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS rating_kind TEXT`,
  // NUMERIC(3,1) tops out at 99.9, which was fine for a 0-10 scale and is not
  // fine for a percent: a dish rated 100% overflowed the column outright.
  // Re-running this against an already-widened column is a no-op.
  `ALTER TABLE posts ALTER COLUMN rating TYPE NUMERIC(5,1)`,
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

  // "Would you eat this?" — a yes/no verdict per person per post, kept apart
  // from likes so a plate can be popular and still divisive.
  //
  // RETIRED as of the Discover/Friends split below: the up/down arrows this
  // fed are gone from the UI, replaced by post_upvotes. Left in place (not
  // dropped) because it holds real accumulated data; nothing writes to it
  // anymore.
  `CREATE TABLE IF NOT EXISTS post_votes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote BOOLEAN NOT NULL,
    PRIMARY KEY (post_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_post_votes_post ON post_votes(post_id)`,

  // --- Social layer: Discover feed, Friends feed, two reaction types ------
  //
  // Core invariant this schema exists to guarantee: no query that ranks or
  // counts for the public Discover feed may ever touch post_hearts. Keeping
  // upvotes and hearts as physically separate tables (rather than a `type`
  // column on one shared reactions table) makes that a structural fact, not
  // a discipline problem — a ranking query literally cannot join a table it
  // never names.

  // Mutual friendships. A request row tracks the ask; acceptance writes a
  // canonical, order-independent pair into friendships, so "are A and B
  // friends?" is one indexed lookup rather than a two-directional OR.
  `CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (requester_id, recipient_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient
     ON friend_requests(recipient_id) WHERE status = 'pending'`,

  `CREATE TABLE IF NOT EXISTS friendships (
    user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_a, user_b),
    CHECK (user_a < user_b)
  )`,

  // Upvotes: Discover-only, public count, ranks the feed.
  `CREATE TABLE IF NOT EXISTS post_upvotes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_post_upvotes_post ON post_upvotes(post_id)`,

  // Hearts: Friends-only, count never surfaced publicly, zero ranking weight
  // anywhere. See the note above the whole block — this table is the reason
  // the guarantee is structural.
  `CREATE TABLE IF NOT EXISTS post_hearts (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_post_hearts_post ON post_hearts(post_id)`,

  // Restaurant reference + coordinates on every post, so geographic filtering
  // can be added later with no further migration. Restaurant data lives in
  // data/restaurants.ts, not a DB table, so this is a plain id reference (the
  // same pattern findDishId already uses for dishes) rather than a real FK.
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS restaurant_id TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS restaurant_lat NUMERIC(9,6)`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS restaurant_lng NUMERIC(9,6)`,

  // Photo privacy. photos_public is a snapshot of the author's toggle taken
  // AT POST TIME, not a live join to users — that is what makes flipping the
  // toggle on non-retroactive for free: every already-written row keeps
  // whatever value it was born with. media is always stored regardless; this
  // column only gates whether Discover is allowed to show it.
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS photos_public BOOLEAN NOT NULL DEFAULT false`,

  // Global toggle, off by default — posting involves zero privacy decisions,
  // and the default keeps photos friends-only until someone opts in.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS share_photos_publicly BOOLEAN NOT NULL DEFAULT false`,

  // Profile favorites, stored as structured references (not free text) so
  // they're usable for taste matching later. Cuisine is validated against
  // data/restaurants.ts's `cuisines` list at the API layer — there is no
  // cuisines table to constrain against.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_cuisine TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_restaurant_id TEXT`,
];

for (const statement of statements) {
  await sql.query(statement);
}

console.log("Migration complete.");
