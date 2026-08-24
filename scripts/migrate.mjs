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

  // --- Threaded comments ----------------------------------------------------
  //
  // A comment may hang off another comment on the same post. Self-referential
  // and ON DELETE CASCADE, so removing a comment takes its whole subtree with
  // it rather than orphaning replies back onto the root of the thread.
  //
  // No depth limit is expressed here on purpose: the renderer caps how far it
  // *indents* (see CommentsScreen), which is a layout decision. Baking a
  // maximum depth into the schema would make it a data decision, and the two
  // want to change independently.
  `ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id)`,

  // --- Comment votes --------------------------------------------------------
  //
  // Two tables rather than a `direction` column, for the same reason post
  // votes are split (see the Downvotes note above): a count(*) can only ever
  // read the direction it names. Mutual exclusivity is enforced in
  // castCommentVote, which deletes the opposite row before inserting.
  `CREATE TABLE IF NOT EXISTS comment_upvotes (
    comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comment_upvotes_comment ON comment_upvotes(comment_id)`,

  `CREATE TABLE IF NOT EXISTS comment_downvotes (
    comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comment_downvotes_comment ON comment_downvotes(comment_id)`,

  // comment_likes is retired by the pair above, the way post_votes was retired
  // by post_upvotes: nothing writes to it anymore, and it keeps its rows rather
  // than being dropped. Every like it holds becomes an upvote here, once — the
  // NOT EXISTS guard makes this a one-time backfill, so re-running the
  // migration can never resurrect a vote somebody has since taken back.
  `INSERT INTO comment_upvotes (comment_id, user_id)
     SELECT comment_id, user_id FROM comment_likes
     WHERE NOT EXISTS (SELECT 1 FROM comment_upvotes)
     ON CONFLICT DO NOTHING`,

  // --- Price band as a column ---------------------------------------------
  //
  // The band a restaurant's menu prices put it in, written by the import script
  // rather than derived on every read.
  //
  // It used to be computed per request by pulling `price` and `section` for
  // every dish in the table and banding them in JS — fine against 125 dishes,
  // a full scan of the menu corpus against a real one. It only changes when
  // dishes.ts is re-imported, which is exactly when the import runs.
  //
  // NULL is meaningful and is not the same as cheap: a restaurant with no menu
  // has no band and matches no price filter. See src/data/priceBands.ts.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS price_band TEXT
     CHECK (price_band IN ('$', '$$', '$$$', '$$$$'))`,
  `CREATE INDEX IF NOT EXISTS idx_restaurants_price_band ON restaurants(price_band)`,

  // --- One upvote, one payout ----------------------------------------------
  //
  // Upvote awards are keyed "upvote:<post>:<voter>" and
  // "comment-upvote:<comment>:<voter>" — deterministic per voter per item,
  // which reads like it was meant to pay once. It wasn't: awardPoints only
  // deduplicated the milestone prefix, so taking an upvote back and re-casting
  // it paid the author again, every time, without limit.
  //
  // Two steps, and the order is load-bearing: fold the extra rows away first,
  // then add the index that makes them impossible. The index alone would fail
  // against the duplicates already in the table.
  //
  // The dedupe keeps the earliest row per reason, deletes the rest, and takes
  // those same amounts back off the cached totals on `users`. `monthly_points`
  // moves only for rows written in the current UTC month, and only when the
  // user's monthly_points_month still names that month — otherwise their
  // monthly figure is about some earlier month and this would corrupt it.
  // (currentMonthKey in lib/db.ts is UTC, which is what to_char matches here.)
  //
  // Re-running is a no-op: with nothing duplicated, `removed` is empty and the
  // UPDATE touches nobody.
  `WITH ranked AS (
     SELECT id, row_number() OVER (PARTITION BY reason ORDER BY created_at, id) AS rn
     FROM point_events
     WHERE reason LIKE 'upvote:%' OR reason LIKE 'comment-upvote:%'
   ),
   removed AS (
     DELETE FROM point_events
     WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
     RETURNING user_id, amount, created_at
   ),
   totals AS (
     SELECT user_id,
            sum(amount)::int AS all_time,
            coalesce(sum(amount) FILTER (
              WHERE to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM')
                  = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
            ), 0)::int AS this_month
     FROM removed GROUP BY user_id
   )
   UPDATE users u
   SET points = greatest(0, u.points - t.all_time),
       monthly_points = CASE
         WHEN u.monthly_points_month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
           THEN greatest(0, u.monthly_points - t.this_month)
         ELSE u.monthly_points
       END
   FROM totals t
   WHERE u.id = t.user_id`,

  // This predicate is repeated verbatim in awardPoints' ON CONFLICT clause —
  // that text is how Postgres infers which partial index it is talking about,
  // so the two only work as a pair and have to change together.
  //
  // A second index rather than a wider idx_point_events_unique_reason: that
  // one is an existing statement, and existing statements are append-only.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_point_events_unique_upvote
     ON point_events(reason)
     WHERE reason LIKE 'upvote:%' OR reason LIKE 'comment-upvote:%'`,

  // --- Menu lookups --------------------------------------------------------
  //
  // One row per restaurant we have ASKED about, whether or not a menu came
  // back. That distinction is the whole point: `dishes` records what was found,
  // this records what was paid for.
  //
  // Menu extraction is a billed Anthropic call with web search behind it — the
  // most expensive thing this app can do — and there is no API to get a menu
  // from, so the cost is unavoidable. What is avoidable is paying it twice.
  // Without this table, a restaurant with no findable menu would be looked up
  // again by every visitor who opened it, forever, at full price each time.
  //
  // `status` distinguishes the three outcomes, because they deserve different
  // retry rules: 'found' is done, 'not_found' means the menu isn't on the open
  // web and re-asking next week won't change that, 'error' is worth retrying.
  `CREATE TABLE IF NOT EXISTS menu_lookups (
    restaurant_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('found', 'not_found', 'error')),
    source_url TEXT,
    confidence TEXT,
    dish_count INTEGER NOT NULL DEFAULT 0,
    requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_menu_lookups_attempted ON menu_lookups(attempted_at)`,

  // --- Real opening hours ---------------------------------------------------
  //
  // `closing_time` was only ever half the fact, and the missing half made the
  // site confidently wrong: with nothing but "Closes 10pm", the only question
  // that could be asked was "is it before 10pm", so a dinner-only steakhouse
  // read "Open til 10pm" at nine in the morning. Every dinner-only restaurant
  // in the corpus did, and the "Open now" filter returned all of them.
  //
  // Stored as the whole week rather than one open/close pair, because a pair
  // still cannot say "closed Mondays" or describe a kitchen that shuts between
  // lunch and dinner. Yelp already returns this shape and the fetcher was
  // discarding it; the column just stops throwing it away.
  //
  //   [{ "day": 0, "start": "1100", "end": "2200" }, ...]   day 0 = Monday
  //
  // JSONB rather than a table of slots: it is always read whole, for one
  // restaurant, and never queried across restaurants.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS hours JSONB`,

  // --- Menu freshness -------------------------------------------------------
  //
  // Re-extracting every menu on a schedule does not close: 682 restaurants at
  // the achievable rate is ten days of work per week. But menus do not change
  // weekly — prices move once or twice a year and items shift seasonally, so
  // almost all of that work would re-read pages identical to last time.
  //
  // `source_fingerprint` makes the cheap check possible. It is a hash of the
  // menu-bearing text of the source page, taken when the menu was extracted. A
  // later pass re-fetches the page, hashes it again, and only queues a
  // re-extraction when the two differ — HTTP and a checksum, no model, no
  // agent, no session budget. The expensive step then runs over the handful
  // that actually changed rather than the whole corpus.
  //
  // `checked_at` is when the page was last *compared*, which is not
  // `attempted_at` — the point of the split is that most checks find nothing
  // and must not look like re-extractions.
  `ALTER TABLE menu_lookups ADD COLUMN IF NOT EXISTS source_fingerprint TEXT`,
  `ALTER TABLE menu_lookups ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_menu_lookups_checked ON menu_lookups(checked_at NULLS FIRST)`,

  // --- Terms/Privacy consent -------------------------------------------------
  //
  // Evidence that a real checkbox was checked at signup, not just that the
  // signup form currently shows one. `createUser` stamps this itself with
  // NOW() at insert time — there is no client-supplied timestamp to trust.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_to_terms_at TIMESTAMPTZ`,

  // --- Blocking ----------------------------------------------------------
  //
  // Directional, unlike friendships — blocking someone needs no agreement
  // from them, so there's no canonical-ordering trick here, just
  // blocker_id -> blocked_id. blockUser() in lib/db.ts also tears down any
  // existing friendship/pending request between the two before inserting.
  `CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id)`,

  // --- Usernames -----------------------------------------------------------
  //
  // `name` now doubles as the username — signup asks for one directly rather
  // than a free-text display name, and it has to be unique to mean anything
  // as a handle. Case-insensitive: FoodPostCard's handleFor() already
  // lowercases for display, so "MayaEllis" and "mayaellis" reading as the
  // same person is the existing behavior, not a new rule — the constraint
  // just makes signup enforce what display already assumed. One real
  // collision existed before this ran (two "calvin lenisnk" rows, one an
  // obvious throwaway test signup at "cal@email") and was renamed by hand
  // first so this index can actually build.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_unique ON users (lower(name))`,
  // --- Where a restaurant came from, and whether it is ready to show --------
  //
  // The corpus stopped being one pipeline. Yelp search returns a ranked sample
  // of well-reviewed places and then stops — it will not enumerate a city, so
  // it cannot reach every restaurant in San Diego however many calls it is
  // given. OpenStreetMap will, but an OSM row arrives as a name, a cuisine and
  // a pair of coordinates: no rating, no photo, no hours, no menu.
  //
  // `source_key` records which one a row came from (`yelp:<alias>` /
  // `osm:node/<id>`) and is the identity a re-import matches on, so the same
  // restaurant found twice updates instead of duplicating.
  //
  // `listed` is the readiness gate, and it exists because the app has no
  // concept of a half-finished restaurant: `rating` is typed non-null and
  // called with `.toFixed(1)` in seven components, so one row with a null
  // rating took down the search results for every query that matched it, not
  // just its own page. Rather than teach every component to render an absence
  // it has no design for, incomplete rows are held out of the query entirely —
  // see `getRestaurants` in src/lib/db.ts, the only place the gate is enforced.
  //
  // Set by scripts/publish-check.mjs, which recomputes it from the row rather
  // than trusting a flag somebody flipped by hand. Defaulting to FALSE is the
  // load-bearing half: an importer that forgets to think about readiness
  // stages its rows instead of publishing them broken.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS source_key TEXT`,
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_source_key ON restaurants(source_key) WHERE source_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_restaurants_listed ON restaurants(listed) WHERE listed`,

  // A restaurant kept off the site on purpose, and why.
  //
  // `listed` alone cannot hold this, because publish-check.mjs recomputes
  // `listed` from the row and would happily re-publish anything complete. Four
  // of the six rows unlisted by hand turned out to be in Tijuana, filed under
  // the San Ysidro neighbourhood — complete in every mechanical sense, and
  // still not restaurants in San Diego. A judgement that survives one run and
  // not the next is not a judgement, so it gets a column.
  //
  // Set means held, whatever else is true of the row. The text is for whoever
  // reads it in six months, not for the code.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS hold_reason TEXT`,

  // The restaurant's own site, which is where a menu comes from.
  //
  // Worth its own column rather than being looked up each time because
  // finding it is the expensive half: OpenStreetMap tags a website on 47% of
  // San Diego venues, and the other 53% need a paid search to discover one.
  // Once found it does not change, so it is written down.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS website TEXT`,

  // When Yelp was last ASKED about this restaurant, as opposed to what it
  // said. The distinction is the same one menu_lookups draws, and it exists
  // for the same reason: a restaurant Yelp has never heard of looks exactly
  // like one nobody has got to yet, and at 300 calls a day, re-asking about
  // the former forever is how a seventeen-day job becomes an endless one.
  //
  // Set whether the lookup matched or not. A row with a timestamp and no
  // photo has been asked about and come back empty; leave it alone.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS yelp_checked_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_restaurants_yelp_checked ON restaurants(yelp_checked_at NULLS FIRST)`,

  // --- Account privacy switches --------------------------------------------
  //
  // Three separate columns rather than one "private account" flag, because
  // they answer three different questions and people want different answers to
  // them: being off the leaderboard is not the same as being unfindable, and
  // neither is the same as refusing friend requests.
  //
  // Note the defaults differ, and each matches what the app already does
  // today, so running this migration changes nothing for anyone until they go
  // and change it. Hiding from the leaderboard is opt-in (false); being
  // findable and accepting requests are opt-out (true), since an account that
  // silently couldn't be found or friended would read as broken.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_from_leaderboard BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS discoverable_by_username BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_requests_open BOOLEAN NOT NULL DEFAULT true`,

  // --- A restaurant may not have a rating yet ------------------------------
  //
  // `rating` and `review_count` were NOT NULL because every restaurant used to
  // arrive from Yelp with both attached. Restaurants now arrive from
  // OpenStreetMap, which has no rating field at all, and are rated by a
  // separate Google pass afterwards.
  //
  // NULL means "not sourced yet" and must never be backfilled with 0 — a zero
  // rating is a measurement, and nobody measured it. The display guarantee
  // moved to `listed`, which stays false until a rating and a real menu both
  // exist, so no query feeding a card can return a null rating anyway.
  //
  // Re-running against already-nullable columns is a no-op.
  `ALTER TABLE restaurants ALTER COLUMN rating DROP NOT NULL`,
  `ALTER TABLE restaurants ALTER COLUMN review_count DROP NOT NULL`,
// --- An email address nobody has proved they own -------------------------
  //
  // `users.email` is written once at signup, is the unique key a login is
  // looked up by, and is the only address a recovery could ever be sent to —
  // and nothing has ever checked that the person typing it can read it. A typo
  // at signup produces an account that works perfectly until the day its owner
  // needs it back, at which point there is no route home at all.
  //
  // Three pieces, and the split between them is the whole safety property:
  //
  // - `email_verified_at` is NULL for every account that already exists. That
  //   is the truth and must not be backfilled — nobody proved anything. The
  //   ledger says "Unverified" and offers to send a link.
  // - `pending_email` is the address someone has asked to move to. It is for
  //   display only ("Check your inbox"), never for authentication.
  // - `email_verifications` is the authority. The new address is snapshotted on
  //   the token row, and `users.email` is not touched until that token comes
  //   back. This is what stops a mistyped address from taking over an account:
  //   an address you cannot read is an address whose link you never click.
  //
  // The primary key is a SHA-256 of the token, not the token — the raw value
  // exists only in the sent mail, so a leaked table hands over nothing usable.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT`,
  `CREATE TABLE IF NOT EXISTS email_verifications (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  // Every read is "the live tokens for this user" — redeeming one clears the
  // rest, and the resend throttle counts the newest.
  `CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id, created_at DESC)`,
// --- Forgotten passwords -------------------------------------------------
  //
  // Same shape and same rules as `email_verifications` above: the hash is
  // stored, never the token, and the row is the authority for one single use.
  // Two tables rather than one with a `kind` column, because they are spent
  // under different rules — a verification proves an address and a reset
  // rewrites a credential and ends every session — and a shared table makes it
  // one typo away from a link minted for one purpose being redeemable for the
  // other.
  //
  // No `email` column, unlike the verification table. A reset never chooses an
  // address; it acts on the account the token was minted for.
  `CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, created_at DESC)`,

  // --- Street address ------------------------------------------------------
  //
  // Both sources already carry it and both were throwing it away. Yelp's search
  // response includes `location` in the same call that fetches the photo and
  // the rating, and OpenStreetMap tags addr:housenumber / addr:street on 65% of
  // San Diego venues. Neither costs an extra request, so an address is free
  // for any restaurant either source knows.
  //
  // `city` is stored separately from the formatted line because it answers a
  // question `neighborhood` gets wrong. Neighborhood is derived from the
  // nearest entry in regions.ts, which has no sub-area for Escondido, San
  // Marcos, Vista or Borrego Springs — so restaurants in those cities are
  // filed under whatever is closest, and 15% of the corpus sits more than 5km
  // from the neighbourhood it claims. A real city name from the source fixes
  // that where the source has one.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS address TEXT`,
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS city TEXT`,

  // --- Google Places -------------------------------------------------------
  //
  // `google_checked_at` is the same "record the ask, not just the answer"
  // pattern as yelp_checked_at, and here it does a second job: it IS the call
  // counter. Google bills per request and the account is on a 90-day trial
  // credit, so the script has to know how many calls it has made this billing
  // month before it makes another. Counting rows stamped within the month
  // answers that without a separate ledger that could drift from reality.
  //
  // `google_place_id` is Google's stable id for the business. Kept because it
  // is the only way to re-fetch a photo later without paying for the search
  // again, and because it is what the duplicate guard matches on - one place
  // id describes one restaurant, so a second row claiming it is a mismatch.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_checked_at TIMESTAMPTZ`,
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_place_id TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_restaurants_google_checked ON restaurants(google_checked_at NULLS FIRST)`,
];

for (const statement of statements) {
  await sql.query(statement);
}

console.log("Migration complete.");
