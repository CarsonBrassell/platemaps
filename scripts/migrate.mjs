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

  // --- Per-aspect verdicts -------------------------------------------------
  //
  // One row per aspect a review had an opinion about. A review may name one
  // aspect the best thing about a place and one that let them down, so at most
  // two rows per post — the PK enforces one verdict per aspect per post, and
  // the app enforces at most one of each sentiment.
  //
  // Deliberately NOT a star rating per aspect: someone naming an aspect the
  // best thing will always rate it 4-5 and someone naming a letdown will
  // always rate it 1-2, so the star repeats what the chip said and costs an
  // extra tap. Magnitude comes from how many reviews agree — see
  // src/lib/aspectScores.ts.
  `CREATE TABLE IF NOT EXISTS post_aspect_votes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    aspect TEXT NOT NULL,
    sentiment TEXT NOT NULL CHECK (sentiment IN ('praise', 'fault')),
    PRIMARY KEY (post_id, aspect)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_post_aspect_votes_post ON post_aspect_votes(post_id)`,

  // The old composer stored the single best-at pick in `vibe`, which it shares
  // with the room-vibe vocabulary ("Lively"). Lift those into real praise
  // votes so existing reviews contribute to the new scores instead of being
  // stranded. Only the BEST_AT labels move; room vibes stay where they are.
  // ON CONFLICT makes this re-runnable.
  `INSERT INTO post_aspect_votes (post_id, aspect, sentiment)
     SELECT id, vibe, 'praise' FROM posts
     WHERE vibe IN ('Food','Ambiance','Service','Menu variety','Drinks','Value','Speed','Dessert')
     ON CONFLICT DO NOTHING`,

  // --- Downvotes -----------------------------------------------------------
  //
  // The other half of Discover's vote pair. A separate table rather than a
  // `direction` column on post_upvotes, for the same reason hearts are their
  // own table: the ranking query names exactly the tables it is allowed to
  // read, so no column-value mistake can quietly turn a downvote into an
  // upvote in a count(*).
  //
  // Mutual exclusivity (nobody is both up and down on one post) is enforced
  // in castVote, which deletes the opposite row before inserting — a CHECK
  // can't span two tables.
  `CREATE TABLE IF NOT EXISTS post_downvotes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_post_downvotes_post ON post_downvotes(post_id)`,

  // --- Restaurants and menus ----------------------------------------------
  //
  // These used to be static TypeScript imported straight into components
  // (src/data/restaurants.ts, src/data/dishes.ts). That worked at 36 places
  // and could not survive growth: the home page is a client component, so the
  // entire array shipped to every visitor's browser. Postgres is the source of
  // truth from here; the generated files are seed input for
  // `npm run restaurants:import` and nothing in src/ imports them.
  //
  // Deliberately NOT foreign-keyed from posts.restaurant_id, even though it is
  // now referenceable. `scripts/fetch-restaurants.mjs` rewrites the id space
  // wholesale, so an FK would turn a routine data refresh into a cascade
  // through everyone's reviews. The seam stays soft until ids are stable.
  `CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    neighborhood TEXT NOT NULL,
    distance TEXT NOT NULL,
    walk_time TEXT NOT NULL,
    closing_time TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('calm', 'urgent')),
    status_label TEXT NOT NULL,
    rating REAL NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    yelp_rating REAL,
    yelp_review_count INTEGER,
    google_rating REAL,
    google_review_count INTEGER,
    trending BOOLEAN NOT NULL DEFAULT false,
    photo TEXT,
    photo_alt TEXT,
    yelp_url TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine ON restaurants(cuisine)`,
  `CREATE INDEX IF NOT EXISTS idx_restaurants_neighborhood ON restaurants(neighborhood)`,

  // `sort_order` exists because a menu is an ordered document — starters
  // before mains — and that order is part of what was extracted. Without it
  // the rows come back in whatever order the planner likes and the menu reads
  // as a shuffled list.
  `CREATE TABLE IF NOT EXISTS dishes (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price TEXT NOT NULL DEFAULT '',
    section TEXT NOT NULL DEFAULT '',
    yes_votes INTEGER NOT NULL DEFAULT 0,
    no_votes INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dishes_restaurant ON dishes(restaurant_id, sort_order)`,

  // Position in the seed file, which is not decoration: fetch-restaurants.mjs
  // walks the regions in turn, so the array arrives interleaved across San
  // Diego rather than clustered downtown, and Discover's unsorted grid has
  // always shown it that way. `id` cannot stand in — it is TEXT, so ordering by
  // it puts "10" before "2" and hands the top of the grid to whichever places
  // happen to sort early.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_restaurants_sort ON restaurants(sort_order)`,
];

for (const statement of statements) {
  await sql.query(statement);
}

console.log("Migration complete.");
