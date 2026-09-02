import { sql, usingLocalPostgres } from "./sql-client.mjs";

if (usingLocalPostgres) console.log("→ local Postgres");

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

  // Trigram search over the three fields every search surface ranks on.
  //
  // `/api/restaurants?q=` used to read all 4,053 listed rows and filter them in
  // JavaScript - 2.8 MB and ~1.8s per keystroke-triggered request, measured, on
  // localhost with no network in the way. The route's own comment named this
  // index as the intended fix and it finally matters: at 991 restaurants the
  // scan was invisible, at 4,053 it is the slowest thing the app does.
  //
  // GIN over `gin_trgm_ops` rather than a plain btree because the queries are
  // all `ILIKE '%term%'`, and a leading wildcard makes a btree useless. Trigram
  // indexes serve exactly that shape.
  //
  // One index across the three columns via a concatenation, not three indexes:
  // the search treats them as one haystack ("thai" should find the cuisine,
  // "hillcrest" the neighbourhood, from the same box), and the expression has to
  // match the predicate in db.ts for the planner to use it. If you change either
  // side, change both.
  // Superseded further down, once `cuisine_tags` exists: cuisine became a
  // controlled vocabulary, the tags joined the haystack, and every part had
  // to be coalesced because `cuisine` is now nullable. Left exactly as it ran
  // rather than edited in place — this array is append-only, and a fresh
  // database building this index once before the gated rebuild replaces it is
  // cheaper than the reproducibility that editing it would cost.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX IF NOT EXISTS idx_restaurants_search ON restaurants
     USING gin ((name || ' ' || cuisine || ' ' || neighborhood) gin_trgm_ops)`,

  // The same index with every field coalesced, which is what
  // `searchRestaurants` matches on now. The bare `||` expression above is NULL
  // for any row missing a cuisine or a neighborhood — Postgres propagates NULL
  // through concatenation — so 404 listed restaurants could not be found by
  // any search term, including their own exact name.
  //
  // **`coalesce`, not `concat_ws`.** concat_ws skips NULLs too and reads
  // better, but it is STABLE rather than IMMUTABLE, and Postgres refuses to
  // build an index on it ("functions in index expression must be marked
  // IMMUTABLE"). coalesce and `||` are both immutable, so this indexes.
  //
  // The old index is left in place rather than dropped: it is what the
  // deployed build queries through until this migration and the code ship
  // together, and an unused GIN index costs writes, not reads. Drop it in a
  // later migration once nothing queries the bare `||` form.
  `CREATE INDEX IF NOT EXISTS idx_restaurants_search_v2 ON restaurants
     USING gin ((coalesce(name,'') || ' ' || coalesce(cuisine,'') || ' ' ||
                 coalesce(cuisine_tags,'') || ' ' || coalesce(neighborhood,'')) gin_trgm_ops)`,

  // An earlier pass created the same index over three fields, before
  // `searchRestaurants` grew `cuisine_tags`. A GIN index is only usable when
  // its expression matches the predicate exactly, so the three-field one can
  // never be chosen again — and `CREATE INDEX IF NOT EXISTS` matches on *name*,
  // not on expression, so it would not have been rebuilt under the old name.
  // Dropped rather than left: an unusable GIN index still costs every write.
  `DROP INDEX IF EXISTS idx_restaurants_search_ws`,

  // Failed sign-in attempts, for the login throttle in lib/loginThrottle.ts.
  // Postgres rather than memory on purpose: every serverless instance gets its
  // own heap and instances scale to zero, so an in-process counter would reset
  // constantly and silently fail to limit anything in production.
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    ip TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // The throttle counts recent rows for one key, so both lookups are
  // (key, time) and both want their own index.
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_email
     ON login_attempts (email, attempted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
     ON login_attempts (ip, attempted_at DESC)`,

  // Whether this account has been told what happens to its photos.
  //
  // The photo rule is the one thing about posting nobody can infer from the
  // composer: the plate is public, the photo is not, and `share_photos_publicly`
  // above defaults to off. `PhotoPrivacyNotice` says so once, on the first post
  // that actually carries a photo, and this column is the "once".
  //
  // It is a separate flag from `share_photos_publicly` rather than a nullable
  // version of it, because "hidden, and you were told" and "hidden, and nobody
  // has mentioned it" are different states and only one of them still owes the
  // user an explanation.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_notice_seen BOOLEAN NOT NULL DEFAULT false`,

  // A ledger of one-shot DATA statements, as opposed to the DDL above.
  //
  // Everything else in this file is idempotent by construction — `IF NOT EXISTS`
  // means the second run is a no-op. A backfill is not like that: it is a
  // sentence about a moment ("everyone who had already posted *when this
  // shipped*"), and re-running it turns that sentence into a standing rule that
  // keeps applying to people it was never about. There was nowhere to record
  // "this one has already happened", so this is that place. Claim a key here and
  // gate the statement on the claim; see the backfill below for the shape.
  `CREATE TABLE IF NOT EXISTS data_migrations (
    key TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // Everyone already posting when this shipped is past their first post, so the
  // question has no first post left to open on and would only ambush them on
  // their next one.
  //
  // **Gated on the claim, and that is not decoration.** Run unguarded on every
  // migrate, this silently answers the question on behalf of anyone who
  // dismissed it and then posted — they would never be asked again, decided by a
  // deploy rather than by them. Dismissing has to keep meaning "ask me next
  // time". The INSERT runs on every migrate and does nothing after the first;
  // `claim` is empty from then on, so the UPDATE matches no rows.
  `WITH claim AS (
     INSERT INTO data_migrations (key) VALUES ('photo-notice-backfill')
     ON CONFLICT (key) DO NOTHING
     RETURNING key
   )
   UPDATE users SET photo_notice_seen = true
     WHERE photo_notice_seen = false
       AND EXISTS (SELECT 1 FROM claim)
       AND EXISTS (SELECT 1 FROM posts WHERE posts.user_id = users.id)`,

  // The pixel size of `photo`, so a card can reserve the right box before the
  // image arrives.
  //
  // Discover crops every photo into a fixed 128px band, which needs no
  // dimensions — the box is the same whatever the file turns out to be. A card
  // that keeps the photo's own proportions cannot do that: without the ratio it
  // is a zero-height box until the image lands and then snaps to size, once per
  // card, which is the layout shift AGENTS.md's accessibility floor rules out.
  //
  // Derived, not sourced. Neither Yelp nor Google returns dimensions with a
  // photo URL, so `backfill-photo-size.mjs` reads them out of the image header
  // over a range request. That makes these the only columns on this table the
  // seed file has no opinion about — `import-restaurants.mjs` deliberately
  // leaves them out of its upsert so a data refresh doesn't blank them, and
  // instead clears them only for the rows whose `photo` actually changed.
  //
  // Nullable on purpose, and null means exactly one thing: not measured yet.
  // Every reader has to keep the fixed-crop path working for that case, because
  // a new restaurant is in it from the moment it lands until the backfill next
  // runs.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS photo_w INTEGER`,
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS photo_h INTEGER`,

  // Cuisine becomes a controlled vocabulary. See src/data/cuisines.ts.
  //
  // The column held 162 distinct values across 4,792 listed rows — three
  // unreconciled vocabularies layered on top of each other, with 79 values
  // carrying two restaurants or fewer. `import-osm.mjs` title-cased raw
  // OpenStreetMap tags with no map at all, so "Coffe Shop" (a contributor's
  // typo) was a filter option sitting near "Coffee Shop", "Cafe", "Coffee"
  // and "Coffee & Tea", all describing the same room.
  //
  // Three columns after this, with one job each:
  //
  //   `cuisine`      the filter. One of ~29 canonical values, or NULL.
  //   `cuisine_raw`  what the row arrived with, kept verbatim.
  //   `cuisine_tags` the specific labels, as a search haystack.
  //
  // `cuisine_raw` is not decoration — it is what makes the collapse
  // reversible. Re-running the backfill after editing the vocabulary re-reads
  // this column rather than the already-collapsed one, so a mapping mistake
  // costs an edit and a re-run instead of a re-import of the whole city.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine_raw TEXT`,
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine_tags TEXT`,

  // NULL is now a real value, and it means "no cuisine was ever given" — the
  // ~400 rows that had been carrying the literal word "Restaurant". That
  // string read as a category to anyone looking at the facet, which is why it
  // has to become an absence rather than stay a label.
  `ALTER TABLE restaurants ALTER COLUMN cuisine DROP NOT NULL`,

  // The search index has to be rebuilt, and not only because there is a new
  // column in the haystack.
  //
  // `a || b` is NULL when either side is, so the moment `cuisine` became
  // nullable the old expression evaluated to NULL for every row without one —
  // which would have made those ~400 restaurants unfindable by *name*, a far
  // worse bug than the one being fixed. Every part is coalesced now.
  //
  // `cuisine_tags` is joined text rather than `text[]` for this index's sake:
  // `array_to_string` is STABLE, not IMMUTABLE, so an array could not appear
  // in an index expression at all. Nothing reads the tags as a list — they are
  // only ever a haystack — so the join costs nothing.
  //
  // Still one index over a concatenation, and it still has to match the
  // predicate in db.ts exactly or the planner drops to a sequential scan. If
  // you change either side, change both.
  //
  // Gated on the definition rather than written as a plain DROP + CREATE:
  // building a GIN index over 4,792 rows on every single migrate, forever, to
  // replace it with a byte-identical copy is not idempotence, it is waste.
  // The first run after this shipped rebuilds; every run after that no-ops.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE indexname = 'idx_restaurants_search'
         AND indexdef LIKE '%cuisine_tags%'
     ) THEN
       DROP INDEX IF EXISTS idx_restaurants_search;
       CREATE INDEX idx_restaurants_search ON restaurants
         USING gin ((
           name || ' ' || coalesce(cuisine, '') || ' ' ||
           coalesce(cuisine_tags, '') || ' ' || neighborhood
         ) gin_trgm_ops);
     END IF;
   END $$`,

  // Whether this account has been walked through the app once — see
  // components/tour/CoachTour.tsx. One-way, like photo_notice_seen.
  //
  // **Not backfilled, deliberately**, and that is the difference from
  // `photo_notice_seen` above. That one is an explanation somebody is *owed*
  // before their first photo, so an existing poster who never got it would only
  // be ambushed by it late; this is an orientation to the app, and everybody
  // who has an account predates it existing. Letting it run once for current
  // users is the point, not a leak.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_seen BOOLEAN NOT NULL DEFAULT false`,

  // Trigram search over dish names, so a menu is reachable from the search box.
  //
  // 171,662 dishes across 2,676 restaurants were already in this table,
  // extracted from real menu pages and paid for a token at a time — and no
  // search in the app could reach a single one of them. "Carne asada fries"
  // returned nothing while 129 listed restaurants served it; "california
  // burrito" returned only the places with those words in their *name* while
  // 184 had it on the menu. The largest body of searchable text in the product
  // was invisible.
  //
  // GIN over `gin_trgm_ops` for the same reason the restaurant index uses one:
  // every query is `ILIKE '%term%'`, and a leading wildcard makes a btree
  // useless.
  //
  // Just the name, not the description. A description mentioning carne asada
  // in a list of what comes with the burrito is not the dish being searched
  // for, and folding it in makes half the menu match half the queries.
  `CREATE INDEX IF NOT EXISTS idx_dishes_name_trgm
     ON dishes USING gin (name gin_trgm_ops)`,

  // Which County of San Diego food-facility permit this restaurant is, and when
  // we last confirmed it.
  //
  // `scripts/verify-coverage.mjs` can already answer "is this row backed by a
  // permit?" — but only by re-downloading 17,503 records, re-normalising every
  // name and address on both sides, and re-running the fuzzy matcher, which
  // takes about a minute and produces a JSON file rather than an answer a query
  // can read. That is fine for a weekly measurement and useless for everything
  // else: the publish gate cannot consult it, an admin page cannot join against
  // it, and a menu-extraction agent looking at a suspicious row cannot ask it.
  //
  // Writing the permit id onto the row turns "verified against a real permit"
  // from a script's finding into a column. `deh_record_id IS NOT NULL` becomes
  // a WHERE clause; `deh_verified_at` says how stale that claim is, so a
  // re-verification pass can work oldest-first instead of redoing all of it.
  //
  // TEXT, not a foreign key: there is no permits table, and there should not be
  // one — the county's list is an external fact we check against, not data we
  // own. Same reasoning as `posts.restaurant_id` being a soft reference.
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS deh_record_id TEXT`,
  `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS deh_verified_at TIMESTAMPTZ`,

  // Not unique. One business can hold two permits (85 of the missing ones do),
  // and the reverse also happens — a permit covering a food hall sits over
  // several rows. The index is here so the import can ask "do we already have
  // this permit?" per row without a sequential scan over the whole table.
  `CREATE INDEX IF NOT EXISTS idx_restaurants_deh_record_id
     ON restaurants (deh_record_id) WHERE deh_record_id IS NOT NULL`,
];

for (const statement of statements) {
  await sql.query(statement);
}

console.log("Migration complete.");
