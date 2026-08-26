/**
 * Manufactures a slice of recent, unevenly-voted activity so the feed ranking
 * and the profile Activity tab have something real to be judged against.
 *
 *   npm run sim:activity            # write it
 *   npm run sim:activity -- --dry   # print the plan, touch nothing (no DB calls at all)
 *   npm run sim:activity -- --clean # remove everything this script wrote, then exit
 *
 * ## Why this exists
 *
 * The corpus is ~493 posts, ~225 of them inside 30 days — roughly 7.5 a day,
 * almost none of them voted on. At that volume "Trending" and "New" return the
 * same list in nearly the same order, so there is no way to tell whether a
 * change to `DISCOVER_ORDER` in `src/lib/db.ts` did anything, and the Activity
 * tab on /account renders its empty state. This writes the missing shape:
 * long-tailed vote counts, ages weighted toward the last 48 hours, comments on
 * a minority of posts, and a handful of deliberate fixtures — including the one
 * the Yik Yak-style retune exists to get right, an older post with a pile of
 * upvotes that must still outrank a brand-new post with none.
 *
 * It is data, not a test. There is no test framework here and this is not one.
 *
 * ## Cleanup, and how it stays inside the existing cascade
 *
 * Every simulated actor is a `@demo.platemaps.app` user (emails are
 * `sim-<key>@demo.platemaps.app`, so they never collide with the five accounts
 * `scripts/seed-demo.mjs` owns), which means the documented one-liner still
 * removes all of it:
 *
 *   psql $DATABASE_URL -c "DELETE FROM users WHERE email LIKE '%@demo.platemaps.app'"
 *
 * Checked against `scripts/migrate.mjs`: `post_upvotes`, `post_downvotes`,
 * `comments`, `comment_upvotes`, `post_hearts` and `point_events` every one
 * declare `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`, so
 * deleting the user takes their votes, hearts, comments and ledger rows with
 * it — including the ones sitting on a REAL user's posts. No explicit deletes
 * are needed for those tables.
 *
 * The one thing that does NOT cascade is a post authored by a real account,
 * which this script only ever writes in one case — the owner having no posts at
 * all (see below). So every post it writes gets an id prefixed `sim-`
 * (`sim-owner-` for the owner's own) and `--clean` deletes those by prefix
 * before it deletes the users. Real post ids are bare UUIDs and can never match
 * the prefix.
 *
 * That is the one gap in the psql one-liner above: it removes the accounts and
 * everything hanging off them, but it cannot know about a post owned by a real
 * account. `npm run sim:activity -- --clean` removes both.
 *
 * ## point_events
 *
 * Written only for simulated users, with the exact reason strings
 * `src/lib/points.ts` and the API routes use — `post:<post>`,
 * `upvote:<post>:<voter>`, `comment:<comment>`, `comment-upvote:<comment>:<voter>`
 * — so the partial unique indexes (`idx_point_events_unique_upvote`) see the
 * shapes they were built for and a re-run can never double-pay. Post ids are
 * fresh per run, so nothing collides.
 *
 * **Nothing is ever awarded to the owner (or any real account).** Those rows
 * hang off the real user, so the demo-user cascade could not take them back and
 * the simulation would permanently inflate a real `users.points` total.
 *
 * ## What it deliberately does not write
 *
 * - `post_aspect_votes` — the category model has asserted invariants
 *   (`npm run aspects:preview`) and this script has no business moving them.
 * - `media` — photos would need real blob URLs; missing photos render as the
 *   warm tone blocks the design already specifies.
 * - `'restaurant'` rating rows — there is one rating scale. Every post here is
 *   `rating_kind = 'dish'` with a 0-100 percent.
 * - `tags` and `vibe` at all. The occasion tags and the room vocabulary this
 *   script used to write were the only source of either in the whole app —
 *   no composer ever offered them — and both are now deleted. The literals
 *   below keep their `tags`/`vibe` keys so the scenarios stay readable as
 *   prose; nothing reads them.
 */
import { neon } from "@neondatabase/serverless";
import { randomUUID, randomBytes } from "node:crypto";
import { restaurants } from "../src/data/restaurants.ts";
import { dishesByRestaurant } from "../src/data/dishes.ts";
import { MAX_POST_TEXT } from "../src/lib/postLimits.ts";
// Safe to import here for the same reason lib/feedSort exists as its own
// module: it is pure, with no database import to drag in. See trendingScore.
import { TRENDING_COMMENT_WEIGHT, TRENDING_GRAVITY } from "../src/lib/feedSort.ts";

const DRY_RUN = process.argv.includes("--dry");
const CLEAN_ONLY = process.argv.includes("--clean");

/** The repo owner. Requirement: his profile Activity tab has to have content. */
const OWNER_EMAIL = "cjlensink.den@gmail.com";
/** Matches every actor this script creates, and nothing seed-demo.mjs owns. */
const SIM_EMAIL_LIKE = "sim-%@demo.platemaps.app";
/** Every post id this script writes starts with this. Real ids are bare UUIDs. */
const POST_PREFIX = "sim-";
const OWNER_POST_PREFIX = "sim-owner-";

/* --dry makes no database calls whatsoever, so it can be run without touching
   a live database at all. Everything below the plan is deterministic. */
const sql = DRY_RUN ? null : neon(process.env.DATABASE_URL);

/** Same contract as seed-demo.mjs: a name that isn't in the corpus is a bug in
    this file, not a row to skip. */
function findRestaurant(name) {
  const match = restaurants.find((r) => r.name === name);
  if (!match) throw new Error(`No restaurant named "${name}" in data/restaurants.ts`);
  return match;
}

/**
 * The plate a post is about, priced from the real menu when there is one.
 *
 * Where `src/data/dishes.ts` has a menu for the restaurant the dish must be on
 * it — a typo here should fail loudly, the way findRestaurant does, rather than
 * quietly inventing a plate. Restaurants with no menu in that file carry their
 * price in the spec instead.
 */
function findDish(restaurant, dishName, specPrice) {
  const menu = dishesByRestaurant[restaurant.id];
  if (!menu) {
    if (!specPrice) throw new Error(`${restaurant.name} has no menu — "${dishName}" needs a price`);
    return { name: dishName, price: specPrice };
  }
  const hit = menu.find((d) => d.name === dishName);
  if (!hit) {
    throw new Error(
      `"${dishName}" is not on ${restaurant.name}'s menu in data/dishes.ts ` +
        `(has: ${menu.map((d) => d.name).join(", ")})`,
    );
  }
  return { name: hit.name, price: specPrice ?? hit.price };
}

/** `/api/posts` rejects an over-length body rather than truncating it, and a
    seeded plate has no business being longer than one a person could write. */
function checkText(text, where) {
  if (text.trim().length > MAX_POST_TEXT) {
    throw new Error(`${where}: post text is ${text.trim().length} chars, over MAX_POST_TEXT`);
  }
}

/* --- Determinism ---------------------------------------------------------
 *
 * A fixed seed, so --dry prints exactly what the real run writes and two runs
 * produce the same shape. Only *which* accounts vote and how far a timestamp
 * drifts are random; every vote count and every post age is written down below
 * on purpose, because those are the numbers a ranking change gets judged on.
 */
function rngFrom(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates against a seeded rng, so a post's voter list is reproducible. */
function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const NOW = Date.now();
const hoursAgo = (h) => new Date(NOW - h * 3_600_000);

/**
 * A timestamp between `after` and now, biased toward `after`.
 *
 * Votes and comments must trail the post they land on and never precede it —
 * `Math.pow(rng(), 0.55)` pulls the mass toward the hours right after
 * publication, which is what a real post's vote curve looks like.
 */
function trailing(after, rng) {
  const floor = after.getTime() + 60_000;
  if (floor >= NOW) return new Date(NOW);
  return new Date(floor + Math.pow(rng(), 0.55) * (NOW - floor));
}

/* --- Actors ---------------------------------------------------------------
 *
 * Two kinds, and the split is only about volume. The twelve VOICES author the
 * plates and the comments, so what appears in the feed reads like twelve
 * people rather than seventy. The LURKERS exist because `post_upvotes` is keyed
 * on (post_id, user_id): a post cannot collect 58 upvotes without 58 distinct
 * accounts, and a "most upvoted recent post" fixture is the whole point of this
 * script.
 *
 * Lurkers are hidden from the leaderboard — seventy accounts with zero points
 * would be a wall of noise on a screen that is about ranking people — and no
 * simulated account is discoverable by username, so user search stays clean.
 */
const VOICES = [
  { key: "rosa", name: "Rosa Delgado" },
  { key: "kenji", name: "Kenji Watanabe" },
  { key: "tasha", name: "Tasha Boone" },
  { key: "marco", name: "Marco Ferrante" },
  { key: "lena", name: "Lena Kowalski" },
  { key: "omar", name: "Omar Haddad" },
  { key: "juno", name: "Juno Park" },
  { key: "dev", name: "Dev Ramanathan" },
  { key: "cassie", name: "Cassie Nguyen" },
  { key: "theo", name: "Theo Brandt" },
  { key: "imani", name: "Imani Clarke" },
  { key: "gus", name: "Gus Marchetti" },
  { key: "nadia", name: "Nadia Beshara" },
  { key: "wes", name: "Wes Okonkwo" },
];

const LURKER_COUNT = 68;
const LURKER_FIRST = [
  "Alex", "Brynn", "Cal", "Dani", "Elena", "Franco", "Greta", "Hugo", "Iris", "Jonah",
  "Kira", "Luis", "Mona", "Nate", "Opal", "Pia", "Quinn", "Ruth", "Silas", "Tess",
];
const LURKER_LAST = [
  "Abbott", "Bello", "Castro", "Dunne", "Ellery", "Faraday", "Gaines", "Holt", "Ibarra", "Jessop",
  "Kwan", "Lindqvist", "Moreau", "Nakamura", "Olsen", "Prieto", "Quaid", "Rivas", "Sandoval", "Tran",
];

/** 68 distinct first/last pairs — 20 and 20 are coprime with the 7-step, and the
    block offset keeps the second and fourth passes off the first one's pairs. */
const LURKERS = Array.from({ length: LURKER_COUNT }, (_, i) => ({
  key: `l${String(i + 1).padStart(2, "0")}`,
  name: `${LURKER_FIRST[i % 20]} ${LURKER_LAST[(i * 7 + Math.floor(i / 20)) % 20]}`,
  lurker: true,
}));

const ACTORS = [...VOICES, ...LURKERS];

/* --- The plates -----------------------------------------------------------
 *
 * `at` is age in hours, `up`/`down` are exact vote counts. Both are written out
 * rather than generated because they are the experiment: a uniform sprinkle of
 * votes produces a feed where every ordering looks the same, which is the
 * situation this script exists to escape.
 *
 * The distribution: most posts sit at 0-9 upvotes, a handful at 12-26, two
 * above 50, and four end up net-negative so the `GREATEST(..., 0)` floor in
 * `DISCOVER_ORDER` is actually exercised. Ages run 0.4h to 220h, weighted to
 * the last 48 hours.
 *
 * `comments[].replyTo` is an index into the same post's comment list and must
 * point backwards; it becomes `comments.parent_id`, and the reply is written
 * after its parent.
 */
const PLATES = [
  /* --- Fixtures. Each of these is a case the ranking has to get right. --- */
  {
    // THE case for the retune: 2.6 days old, buried in upvotes, and it must
    // still beat `newborn` below. If it doesn't, the decay is too steep.
    fixture: "old post, many upvotes — must outrank a brand-new post with none",
    by: "rosa", at: 62, rest: "Tacos El Gordo", dish: "Al pastor taco",
    rating: 96, tags: ["Late Night", "Under $15"], vibe: "Buzzing", up: 58, down: 3,
    text: "Two nights running. The pastor comes off the trompo straight onto the tortilla — you can hear it. Line moved in eight minutes at 11pm.",
    comments: [
      { by: "kenji", text: "The 1am line is worse and still worth it.", up: 6 },
      { by: "tasha", text: "Adobada or nothing. The asada here is the tourist order.", up: 4 },
      { by: "marco", text: "Chula Vista or the 30th Street one?", up: 1 },
      { by: "rosa", replyTo: 2, text: "Chula Vista. The trompo is the entire point.", up: 5 },
      { by: "lena", text: "Ask for a cup of consomé with it. Free, and nobody tells you.", up: 9 },
      { by: "omar", text: "58 upvotes on a $3.25 taco is the most San Diego thing on here.", up: 12 },
      { by: "juno", text: "Went after reading this. Correct.", up: 2 },
      { by: "dev", text: "Nopales taco is the sleeper order.", up: 3 },
      { by: "cassie", replyTo: 7, text: "Seconding the nopales. Get one with everything else.", up: 1 },
    ],
  },
  {
    fixture: "brand new, zero votes — the post the decay must not hand the top slot to",
    by: "theo", at: 0.4, rest: "Menya Ultra", dish: "Tonkotsu ramen", price: "$16.00",
    rating: 88, tags: ["Dinner"], vibe: "Casual", up: 0, down: 0,
    text: "Broth thick enough to coat the spoon. Sat down at 5:02 and the shop was already two-thirds full.",
  },
  {
    fixture: "five hours old, climbing fast — the genuinely trending one",
    by: "imani", at: 5, rest: "Hodad's", dish: "Double bacon cheeseburger", price: "$14.50",
    rating: 93, tags: ["Lunch"], vibe: "Lively", up: 34, down: 2,
    text: "The bacon is a woven mat, not three sad strips. Ate it sitting on the wall outside because there was no chance of a table.",
    comments: [
      { by: "gus", text: "Order it with the onion rings and write off the afternoon.", up: 5 },
      { by: "nadia", text: "OB location only. The airport one is not the same sandwich.", up: 8 },
      { by: "wes", replyTo: 1, text: "This is objectively true and people keep learning it the hard way.", up: 3 },
      { by: "rosa", text: "Cash line moves faster.", up: 2 },
      { by: "juno", text: "How is the wait at 1pm on a Saturday?", up: 0 },
      { by: "imani", replyTo: 4, text: "Forty minutes. Go at 11 or go at 3.", up: 4 },
    ],
  },
  {
    fixture: "net negative and recent — the floor case, sinks to 'as if nobody voted'",
    by: "gus", at: 9, rest: "Waterfront Bar & Grill", dish: "Ribeye steak",
    rating: 34, tags: ["Dinner"], vibe: "Casual", up: 2, down: 13,
    text: "Ordered medium rare, got grey the whole way through, and $32 is still $32. The room is great. The steak was not.",
    comments: [
      { by: "marco", text: "You went to the oldest bar in the city and ordered a ribeye.", up: 14 },
      { by: "gus", replyTo: 0, text: "It was on the menu. That is usually taken as an invitation.", up: 7 },
      { by: "lena", text: "Burger and a beer here, every time.", up: 6 },
    ],
  },
  {
    fixture: "net negative and old — should be at the bottom of both orderings",
    by: "wes", at: 70, rest: "Corvette Diner", dish: "Chicken fried steak",
    rating: 41, tags: ["Lunch"], vibe: "Lively", up: 1, down: 8,
    text: "Gravy with the texture of wallpaper paste. The kids had a great time, which is the actual reason to come, but don't order this.",
  },
  {
    fixture:
      "middling votes, heavy thread — must NOT be carried by the thread while " +
      "TRENDING_COMMENT_WEIGHT is 0; raise it and this one climbs",
    by: "nadia", at: 31, rest: "Din Tai Fung", dish: "Xiao long bao", price: "$14.50",
    rating: 82, tags: ["Dinner"], vibe: "Buzzing", up: 7, down: 4,
    text: "Good, not a pilgrimage. The skins are thinner in Arcadia and I will die on that hill. Still ate two baskets.",
    comments: [
      { by: "kenji", text: "The skins are machine-consistent here, which is the trade.", up: 9 },
      { by: "juno", text: "Arcadia is a 2.5 hour drive to argue about dumpling skin.", up: 11 },
      { by: "nadia", replyTo: 1, text: "Correct, and I would do it again tomorrow.", up: 6 },
      { by: "dev", text: "Get the chicken soup dumplings, everyone sleeps on them.", up: 4 },
      { by: "tasha", text: "UTC mall parking alone knocks ten points off.", up: 8 },
      { by: "marco", replyTo: 4, text: "Park at the far end by the ice rink. Always open.", up: 5 },
      { by: "cassie", text: "The cucumbers are the best thing on the table and they're $6.", up: 7 },
      { by: "theo", replyTo: 6, text: "Two orders of cucumbers is a legitimate lunch.", up: 3 },
      { by: "omar", text: "Watching them fold through the window is worth the wait by itself.", up: 2 },
      { by: "gus", text: "82 feels generous for 'good, not a pilgrimage'.", up: 1 },
      { by: "nadia", replyTo: 9, text: "82 is good. Not everything has to be a 95.", up: 6 },
      { by: "imani", text: "Went at 11am on a Tuesday, walked straight in.", up: 4 },
    ],
  },
  {
    fixture: "huge score but 8 days old — a decay that ignores age would pin this at #1 forever",
    by: "marco", at: 200, rest: "Addison", dish: "Tasting menu", price: "$345.00",
    rating: 98, tags: ["Fine Dining", "Dinner"], vibe: "Cozy", up: 71, down: 1,
    text: "Three stars and the thing I keep thinking about is one bite of abalone. Four hours and not a second of dead air in it.",
    comments: [
      { by: "lena", text: "The bread service alone is a reason to go.", up: 8 },
      { by: "cassie", text: "Booked six weeks out. Worth every day of the wait.", up: 5 },
      { by: "gus", text: "$345 before wine, for the record.", up: 12 },
      { by: "marco", replyTo: 2, text: "Yes. It is a once-a-year thing, not a Tuesday.", up: 9 },
      { by: "rosa", text: "Ask for the kitchen table if you can get it.", up: 4 },
      { by: "juno", text: "Best meal I have had in this county, full stop.", up: 6 },
      { by: "theo", replyTo: 5, text: "Better than the tasting at Callie? Genuine question.", up: 2 },
    ],
  },

  /* --- The rest. Ordinary volume, weighted toward the last two days. --- */
  { by: "kenji", at: 1.2, rest: "The Taco Stand", dish: "Adobada taco", price: "$4.25", rating: 90, tags: ["Lunch", "Under $15"], vibe: "Casual", up: 3, down: 0,
    text: "Adobada, no cilantro, extra chipotle crema. Four dollars and it is the best thing I have eaten this week." },
  { by: "lena", at: 2.1, rest: "Morning Glory", dish: "Ricotta pancakes", price: "$18.00", rating: 85, tags: ["Breakfast"], vibe: "Lively", up: 5, down: 1,
    text: "Pink room, loud music, pancakes the size of a hubcap. Worth the forty-minute wait exactly once." },
  { by: "omar", at: 3.4, rest: "Buona Forchetta", dish: "Wood-fired oysters", rating: 91, tags: ["Dinner"], vibe: "Buzzing", up: 8, down: 0,
    text: "Four dollars each and they come out blistered under garlic butter. Order a dozen before you even look at the pizza list." },
  { by: "juno", at: 4.6, rest: "Sushi Ota", dish: "Uni nigiri", rating: 95, tags: ["Fine Dining", "Dinner"], vibe: "Chill", up: 12, down: 1,
    text: "Sat at the bar, asked for whatever was best, got uni twice. Nobody rushed us and nobody upsold us.",
    comments: [
      { by: "tasha", text: "The bar is the only way to eat here.", up: 4 },
      { by: "dev", text: "Reservations open a month out and go in a day.", up: 3 },
    ] },
  { by: "dev", at: 6, rest: "Cali BBQ", dish: "Brisket plate", rating: 87, tags: ["Lunch"], vibe: "Casual", up: 4, down: 0,
    text: "Real bark, real smoke ring, and they did not drown it in sauce. Sides are an afterthought but the meat is not." },
  { by: "cassie", at: 7.5, rest: "Snooze, an A.M. Eatery", dish: "Pineapple upside down pancake", price: "$6.50", rating: 83, tags: ["Breakfast"], vibe: "Lively", up: 6, down: 2,
    text: "Order it as a single, not a stack. One is a dessert; three is a dare you will lose." },
  { by: "theo", at: 9.5, rest: "Ironside Fish & Oyster", dish: "Kumamoto oysters", price: "$1.75", rating: 89, tags: ["Late Night"], vibe: "Cozy", up: 9, down: 0,
    text: "Buck-seventy-five an oyster from 3 to 6. Sat under the piranha jaws and worked through two dozen without blinking." },
  { by: "imani", at: 11, rest: "Puesto La Jolla", dish: "Quesabirria", rating: 92, tags: ["Lunch"], vibe: "Buzzing", up: 15, down: 1,
    text: "Crisped in its own fat, consomé on the side, and they do not skimp on the dip. Get two, you will want two." },
  { by: "gus", at: 13, rest: "Phil's BBQ", dish: "Baby back ribs", price: "$26.00", rating: 88, tags: ["Dinner"], vibe: "Casual", up: 7, down: 1,
    text: "The line looks insane and moves like a conveyor belt. Twenty minutes door to tray, ribs still worth it after all these years." },
  { by: "nadia", at: 15, rest: "Panda Machi", dish: "Classic ahi poke bowl", rating: 79, tags: ["Lunch", "Under $15"], vibe: "Casual", up: 2, down: 0,
    text: "Fine, fast, cheap. Not a destination but I would eat it every Wednesday and be perfectly happy." },
  { by: "wes", at: 17, rest: "Kono's Cafe", dish: "Breakfast burrito", price: "$9.50", rating: 86, tags: ["Breakfast", "Under $15"], vibe: "Casual", up: 11, down: 0,
    text: "Ate it on the seawall watching the surfers give up. The potatoes are the whole thing and the line is always worth it." },
  { by: "rosa", at: 19, rest: "Las Cuatro Milpas", dish: "Rolled tacos", price: "$5.00", rating: 94, tags: ["Lunch", "Hidden Gem", "Under $15"], vibe: "Casual", up: 21, down: 0,
    text: "Ninety years of doing one thing. Cash, no menu on the wall you need to read, out the door by noon or don't bother.",
    comments: [
      { by: "omar", text: "Get the chorizo and beans too. It is two dollars.", up: 7 },
      { by: "imani", text: "They close when they run out. That is not a figure of speech.", up: 9 },
      { by: "marco", replyTo: 1, text: "Learned that at 1:15pm on a Saturday. Never again.", up: 4 },
    ] },
  { by: "kenji", at: 21, rest: "Tajima", dish: "Tonkotsu black garlic ramen", price: "$15.00", rating: 84, tags: ["Late Night"], vibe: "Casual", up: 3, down: 1,
    text: "Open until 1am on Convoy, which is most of the argument. Black garlic oil is doing a lot of heavy lifting." },
  { by: "lena", at: 24, rest: "Cucina Urbana", dish: "Ricotta gnudi", price: "$24.00", rating: 90, tags: ["Dinner"], vibe: "Cozy", up: 6, down: 0,
    text: "Retail corkage means you pick a bottle off the shelf and pay ten dollars. The gnudi barely hold together, which is correct." },
  { by: "marco", at: 26, rest: "Italianissimo Trattoria", dish: "Osso buco", rating: 88, tags: ["Dinner"], vibe: "Cozy", up: 4, down: 0,
    text: "Small room, no music, everything made the long way. The marrow spoon arrived without being asked for." },
  { by: "omar", at: 28, rest: "Oscars Mexican Seafood", dish: "Smoked fish taco", price: "$4.75", rating: 93, tags: ["Lunch", "Under $15"], vibe: "Casual", up: 18, down: 1,
    text: "Smoked, not battered, and the difference is the entire meal. Add the shrimp aguachile and eat standing up like everyone else.",
    comments: [
      { by: "cassie", text: "The green salsa here should be sold by the jar.", up: 6 },
      { by: "theo", text: "PB location has seating. Barely.", up: 2 },
    ] },
  { by: "juno", at: 33, rest: "Azuki Sushi", dish: "Chirashi", price: "$34.00", rating: 87, tags: ["Dinner"], vibe: "Chill", up: 5, down: 0,
    text: "Quiet, unhurried, and the rice is seasoned properly. Ordered chirashi instead of omakase and did not regret a bite of it." },
  { by: "dev", at: 36, rest: "The Crack Shack", dish: "Señor Croque", price: "$13.00", rating: 81, tags: ["Lunch"], vibe: "Lively", up: 3, down: 2,
    text: "Fried chicken, bacon, a fried egg and miso maple butter. Good sandwich, loud yard, and thirteen dollars feels like plenty." },
  { by: "cassie", at: 39, rest: "Mitch's Seafood", dish: "Fish tacos", rating: 89, tags: ["Lunch"], vibe: "Casual", up: 8, down: 0,
    text: "Ate them at the rail watching the boats unload. Batter light, tartar with actual dill in it, gulls circling the whole time." },
  { by: "theo", at: 42, rest: "Kettner Exchange", dish: "Duck fat fries", price: "$12.00", rating: 85, tags: ["Late Night"], vibe: "Buzzing", up: 6, down: 1,
    text: "Rooftop, a lot of denim, and fries good enough that nobody at the table spoke for a minute." },
  { by: "imani", at: 45, rest: "Farmer's Table", dish: "Lobster bisque", rating: 76, tags: ["Dinner"], vibe: "Cozy", up: 2, down: 1,
    text: "Pretty room doing most of the work. The bisque was warm rather than hot and tasted mostly of cream." },
  { by: "gus", at: 48, rest: "Breakfast Republic", dish: "Churro pancakes", price: "$14.00", rating: 82, tags: ["Breakfast"], vibe: "Lively", up: 9, down: 2,
    text: "Cinnamon sugar, dulce de leche, a pancake pretending to be dessert. It is dessert. Order it anyway and skip lunch.",
    comments: [
      { by: "nadia", text: "The chicken and waffle benedict is the actual order.", up: 5 },
      { by: "wes", text: "Every location has a ninety-minute wait and none of them take names early.", up: 7 },
      { by: "gus", replyTo: 1, text: "North Park at 7:30am is a walk-in. That is the whole trick.", up: 8 },
    ] },
  { by: "nadia", at: 53, rest: "True Food Kitchen", dish: "Crispy brussels sprouts", rating: 80, tags: ["Dinner"], vibe: "Chill", up: 3, down: 0,
    text: "Sprouts fried hard and hit with vinegar, which is the only way they are worth ordering. The rest of the meal was fine." },
  { by: "wes", at: 57, rest: "Sushi Tadokoro", dish: "Omakase", price: "$120.00", rating: 96, tags: ["Fine Dining", "Dinner"], vibe: "Chill", up: 26, down: 0,
    text: "Twelve seats, one chef, no music, no photos of the food from anyone. Best sushi in the city and it is not close.",
    comments: [
      { by: "juno", text: "Book the 5:30 seating. The 8pm is rushed.", up: 9 },
      { by: "kenji", text: "He remembers what you ordered last time. Every time.", up: 11 },
      { by: "rosa", replyTo: 1, text: "Went twice in a year and he remembered the mackerel. Uncanny.", up: 6 },
    ] },
  { by: "rosa", at: 66, rest: "Coasterra", dish: "Carne asada fries", rating: 74, tags: ["Dinner"], vibe: "Buzzing", up: 2, down: 3,
    text: "You are paying for the skyline and everyone knows it. The fries were soft by the time they crossed the patio." },
  { by: "kenji", at: 72, rest: "Duke's La Jolla", dish: "Crab cakes", rating: 83, tags: ["Dinner"], vibe: "Lively", up: 4, down: 0,
    text: "More crab than filler, which is the only test that matters. Got the window table by accident and it made the meal." },
  { by: "lena", at: 80, rest: "Landini's Pizzeria", dish: "Hot honey pepperoni pizza", price: "$19.00", rating: 91, tags: ["Dinner"], vibe: "Casual", up: 13, down: 1,
    text: "Cups of pepperoni holding little pools of grease, hot honey over the top. Folded it in half on the sidewalk like a New Yorker." },
  { by: "marco", at: 88, rest: "Ballast Point Brewing", dish: "Beer-battered fish and chips", rating: 77, tags: ["Lunch"], vibe: "Lively", up: 3, down: 1,
    text: "You come here for what is in the glass. The fish was fine, the batter was heavy, the Sculpin was cold and correct." },
  { by: "omar", at: 96, rest: "Jake's", dish: "Pan-seared halibut", rating: 86, tags: ["Dinner"], vibe: "Cozy", up: 5, down: 0,
    text: "Fish cooked properly, skin crisp, sauce underneath rather than poured over. Quiet enough to have an actual conversation." },
  { by: "juno", at: 106, rest: "Pacific Beach Fish Shop", dish: "Shrimp aguachile tostada", rating: 92, tags: ["Lunch"], vibe: "Casual", up: 16, down: 0,
    text: "Picked the fish off the board, picked the marinade, ate it eleven minutes later. Aguachile with enough lime to hurt slightly.",
    comments: [
      { by: "dev", text: "The scallop tostada is the one people miss.", up: 8 },
      { by: "gus", text: "Order at the counter, grab a table outside, ignore the parking.", up: 3 },
    ] },
  { by: "dev", at: 118, rest: "Tom Ham's Lighthouse", dish: "Lobster roll", rating: 79, tags: ["Lunch"], vibe: "Chill", up: 2, down: 1,
    text: "Nineteen dollars, decent bun, not much lobster. The view across the bay is doing a lot of the arguing here." },
  { by: "cassie", at: 130, rest: "Janet's Montana Cafe", dish: "Classic cheeseburger", rating: 78, tags: ["Lunch", "Under $15"], vibe: "Casual", up: 1, down: 0,
    text: "A diner burger that knows exactly what it is. Griddled, cheap, out in nine minutes, refill before I asked." },
  { by: "theo", at: 145, rest: "Callie", dish: "Hummus", price: "$16.00", rating: 90, tags: ["Dinner", "Fine Dining"], vibe: "Cozy", up: 12, down: 0,
    text: "Sixteen dollars for hummus sounds absurd until it arrives warm under olive oil with bread straight off the fire." },
  { by: "imani", at: 160, rest: "Buona Forchetta", dish: "Butterscotch budino", rating: 93, tags: ["Dessert"], vibe: "Buzzing", up: 7, down: 0,
    text: "Salted caramel over the top, olive oil under it, gone in about ninety seconds. Split it and immediately wanted my own." },
  { by: "gus", at: 178, rest: "Tacos El Gordo", dish: "California burrito", rating: 85, tags: ["Late Night"], vibe: "Buzzing", up: 5, down: 1,
    text: "Fries inside a burrito is a local institution and I will not be debating it. Ten fifty, eaten at midnight, no regrets." },
  { by: "nadia", at: 196, rest: "Menya Ultra", dish: "Spicy miso ramen", price: "$17.00", rating: 87, tags: ["Dinner"], vibe: "Casual", up: 4, down: 0,
    text: "Noodles with real bite and a broth that does not go flat halfway down. Ask for the extra chashu, it is worth the four dollars." },
  { by: "wes", at: 220, rest: "Hodad's", dish: "Onion rings", price: "$5.50", rating: 72, tags: ["Lunch"], vibe: "Lively", up: 1, down: 2,
    text: "Batter slid off in one piece on the first bite. The burger is the reason to come; the rings are the reason to bring a friend." },
];

/* --- The owner's own plates ----------------------------------------------
 *
 * Written ONLY if the owner's account has no posts at all — the Activity tab
 * cannot show anything landing on posts that do not exist. His existing posts
 * are never touched, never edited, never deleted.
 */
const OWNER_PLATES = [
  { at: 5, rest: "Sushi Ota", dish: "Toro nigiri", rating: 94, tags: ["Fine Dining", "Dinner"], vibe: "Chill",
    text: "Sat at the bar on a Tuesday. Toro first, then whatever he handed over. No menu, no decisions, no complaints." },
  { at: 30, rest: "Tacos El Gordo", dish: "Carne asada taco", rating: 91, tags: ["Late Night", "Under $15"], vibe: "Buzzing",
    text: "Ticket line, then the meat line, then out to the parking lot. Three fifty a taco and worth the whole ceremony." },
  { at: 54, rest: "Buona Forchetta", dish: "Burrata", rating: 88, tags: ["Dinner"], vibe: "Lively",
    text: "Heirloom tomato underneath, grilled bread on the side, ate it in the alley out back while the oven roared." },
  { at: 100, rest: "Mitch's Seafood", dish: "Grilled mahi plate", rating: 86, tags: ["Lunch"], vibe: "Casual",
    text: "Dockside, paper plate, boats unloading twenty feet away. Mahi grilled hard on one side and left alone otherwise." },
  { at: 150, rest: "Cali BBQ", dish: "Pulled pork sandwich", rating: 84, tags: ["Lunch"], vibe: "Casual",
    text: "Pulled, not shredded to mush, and the slaw goes on top where it belongs. Twelve dollars and I did not need dinner." },
];

/**
 * How much attention each of the owner's most recent posts collects, newest
 * first. Long-tailed like everything else — the point is a populated Activity
 * tab, not a uniform badge on every row.
 */
const OWNER_UPVOTES = [26, 19, 14, 11, 8, 6, 5, 3];
const OWNER_HEARTS = [4, 3, 2, 2, 1, 1, 0, 0];

/** Comments other people leave on the owner's plates, spread over his newest
    posts. Written to read as replies to a plate without naming the dish. */
const OWNER_COMMENTS = [
  { by: "rosa", text: "Been meaning to go for months. This is the push." },
  { by: "kenji", text: "Agreed on the rating. I'd have gone a couple points higher." },
  { by: "imani", text: "Which day did you go? Weekends are a completely different place." },
  { by: "marco", text: "Good call ordering it that way. Most people don't." },
  { by: "lena", text: "Adding this to the list. Third time it's come up this month." },
  { by: "omar", text: "I've walked past this a hundred times and never stopped. Fixing that." },
  { by: "juno", text: "Solid write-up. The photo would have sold it though." },
  { by: "dev", text: "Went last week off your last post and it held up. Keep them coming." },
  { by: "cassie", text: "Is it worth the drive from North County or is it a neighborhood thing?" },
  { by: "theo", text: "This is the one thing on their menu I've never ordered. Next time." },
];

/* --- Planning ------------------------------------------------------------
 *
 * The plan is built in full before anything is written, so --dry prints exactly
 * what a real run would insert and the counts below are the real counts.
 */
function buildPlan(actorIds) {
  const keys = ACTORS.map((a) => a.key);
  const posts = [];
  const upvotes = [];
  const downvotes = [];
  const comments = [];
  const commentUpvotes = [];
  const points = [];

  const award = (userKey, amount, reason, at) => {
    points.push({ userKey, amount, reason, at });
  };

  for (const [index, plate] of PLATES.entries()) {
    const restaurant = findRestaurant(plate.rest);
    const dish = findDish(restaurant, plate.dish, plate.price);
    checkText(plate.text, plate.rest);
    const postId = `${POST_PREFIX}${randomUUID()}`;
    const createdAt = hoursAgo(plate.at);
    const rng = rngFrom(`plate:${index}:${plate.rest}:${plate.dish}`);

    posts.push({
      id: postId,
      userKey: plate.by,
      text: plate.text,
      restaurantName: plate.rest,
      restaurantId: restaurant.id,
      lat: restaurant.lat,
      lng: restaurant.lng,
      dishName: dish.name,
      price: dish.price,
      rating: plate.rating,
      createdAt,
      fixture: plate.fixture ?? null,
      up: plate.up,
      down: plate.down,
      commentCount: plate.comments?.length ?? 0,
    });
    award(plate.by, 10, `post:${postId}`, createdAt);

    /* Voters are drawn from one shuffled pool, upvoters first and downvoters
       from what is left, so nobody is both up and down on the same post — the
       rule castVote enforces in the app. */
    const pool = shuffled(keys.filter((k) => k !== plate.by), rng);
    const upKeys = pool.slice(0, plate.up);
    const downKeys = pool.slice(plate.up, plate.up + plate.down);
    if (upKeys.length < plate.up || downKeys.length < plate.down) {
      throw new Error(
        `${plate.rest}: ${plate.up + plate.down} votes needs more than ${pool.length} accounts`,
      );
    }

    for (const key of upKeys) {
      const at = trailing(createdAt, rng);
      upvotes.push({ postId, userKey: key, at });
      award(plate.by, 1, `upvote:${postId}:${actorIds[key]}`, at);
    }
    /* Downvotes pay the author nothing and take nothing away — no award call
       here is the whole rule (same as seed-demo.mjs). */
    for (const key of downKeys) {
      downvotes.push({ postId, userKey: key, at: trailing(createdAt, rng) });
    }

    const written = [];
    for (const [i, c] of (plate.comments ?? []).entries()) {
      const commentId = `${POST_PREFIX}c-${randomUUID()}`;
      const parent = c.replyTo === undefined ? null : written[c.replyTo];
      if (c.replyTo !== undefined && !parent) {
        throw new Error(`${plate.rest}: comment ${i} replies to ${c.replyTo}, which is not earlier`);
      }
      const at = trailing(parent ? parent.at : createdAt, rng);
      written.push({ id: commentId, at });
      comments.push({
        id: commentId,
        postId,
        parentId: parent?.id ?? null,
        userKey: c.by,
        text: c.text,
        at,
      });
      // The post's author is paid for a comment; a self-reply is not a comment
      // somebody left you, so it earns nothing.
      if (c.by !== plate.by) award(plate.by, 2, `comment:${commentId}`, at);

      const voters = shuffled(keys.filter((k) => k !== c.by), rng).slice(0, c.up ?? 0);
      for (const key of voters) {
        const votedAt = trailing(at, rng);
        commentUpvotes.push({ commentId, userKey: key, at: votedAt });
        award(c.by, 1, `comment-upvote:${commentId}:${actorIds[key]}`, votedAt);
      }
    }
  }

  return { posts, upvotes, downvotes, comments, commentUpvotes, points };
}

/**
 * What lands on the owner's plates. Separate from buildPlan because it needs
 * his real post ids, and because nothing here writes a single point_event —
 * see the header.
 */
function buildOwnerPlan(ownerPostRows) {
  const keys = ACTORS.map((a) => a.key);
  const upvotes = [];
  const hearts = [];
  const comments = [];
  /* Reactions are dated from the newer of "when the post went up" and eight
     days ago, so an old post still produces activity that reads as recent —
     getActivityForAuthor orders by created_at DESC and this is the screen the
     whole exercise is meant to populate. */
  const window = new Date(NOW - 8 * 24 * 3_600_000);

  ownerPostRows.forEach((row, index) => {
    const posted = new Date(row.created_at);
    const floor = posted > window ? posted : window;
    const rng = rngFrom(`owner:${row.id}`);
    const pool = shuffled(keys, rng);

    const upCount = Math.min(OWNER_UPVOTES[index] ?? 0, pool.length);
    for (const key of pool.slice(0, upCount)) {
      upvotes.push({ postId: row.id, userKey: key, at: trailing(floor, rng) });
    }
    /* Hearts are private and earn nothing — they exist here purely so the
       Activity tab has the one kind of row that names who sent it. */
    const heartCount = Math.min(OWNER_HEARTS[index] ?? 0, pool.length);
    for (const key of pool.slice(upCount, upCount + heartCount)) {
      hearts.push({ postId: row.id, userKey: key, at: trailing(floor, rng) });
    }
  });

  /* Comments go on the three newest posts, round-robin, so the tab shows a
     mix rather than one post's thread. */
  const targets = ownerPostRows.slice(0, 3);
  if (targets.length > 0) {
    OWNER_COMMENTS.forEach((c, i) => {
      const row = targets[i % targets.length];
      const posted = new Date(row.created_at);
      const floor = posted > window ? posted : window;
      comments.push({
        id: `${POST_PREFIX}c-${randomUUID()}`,
        postId: row.id,
        parentId: null,
        userKey: c.by,
        text: c.text,
        at: trailing(floor, rngFrom(`owner-comment:${row.id}:${i}`)),
      });
    });
  }

  return { upvotes, hearts, comments };
}

/* --- Ordering preview ----------------------------------------------------
 *
 * The same expression DISCOVER_ORDER["trending"] uses, in JS, over the
 * simulated posts only. It is a sanity check on the plan, not a claim about
 * the real feed — the live query ranks these against the whole corpus.
 *
 * **The constants are imported, never copied.** This started with `1.5` and a
 * 1:1 comment term written out here by hand, which is what `DISCOVER_ORDER`
 * used at the time; the moment the feed was retuned this function went on
 * confidently printing rankings under a formula the app no longer had, while
 * the header above it still called them the current ordering. Reading the
 * exponent and the weight from `lib/feedSort` is what keeps that honest — turn
 * either knob there and this preview follows without anyone remembering to
 * come back here.
 */
function trendingScore(post) {
  const net = Math.max(post.up - post.down, 0);
  const ageHours = (NOW - post.createdAt.getTime()) / 3_600_000;
  return (
    (net + TRENDING_COMMENT_WEIGHT * post.commentCount + 1) /
    Math.pow(ageHours + 2, TRENDING_GRAVITY)
  );
}

/**
 * Every row in the plan must carry a real actor id before anything is written.
 *
 * **This exists because the guard above it was not enough.** Restaurant and
 * dish names were validated up front for exactly the right reason — fail on
 * `--dry`, not halfway through a live run — but author *keys* were not, and
 * `PLATES` referenced two (`nadia`, `wes`) that were in no actor list. A
 * missing key is not a crash: `actorIds["nadia"]` is `undefined`, the plan
 * builds and prints a perfectly convincing dry run, and the failure arrives as
 * a `null value in column "user_id"` constraint violation ten posts into a
 * real write, with the rows before it already committed.
 *
 * So this checks the built plan rather than the source lists: any row that
 * reaches the database, whatever future field points at an actor, has to
 * resolve here first. Keep it generic — enumerating today's reference sites is
 * how the original gap opened.
 */
function assertPlanResolved(plan, actorIds) {
  const bad = [];
  const missing = new Set();
  /* Every planned row names its actor by `userKey`; the id is looked up at
     INSERT time as `actorIds[row.userKey]`. So the check is that the key is
     present AND resolves — an absent key and a key spelled wrong fail the
     same way at the database, and must fail the same way here. */
  const check = (rows, table) => {
    (rows ?? []).forEach((row, i) => {
      if (!row.userKey) {
        bad.push(`${table}[${i}] names no actor at all`);
      } else if (!actorIds[row.userKey]) {
        bad.push(`${table}[${i}] -> "${row.userKey}"`);
        missing.add(row.userKey);
      }
    });
  };
  check(plan.posts, "posts");
  check(plan.upvotes, "post_upvotes");
  check(plan.downvotes, "post_downvotes");
  check(plan.hearts, "post_hearts");
  check(plan.comments, "comments");
  check(plan.commentUpvotes, "comment_upvotes");
  check(plan.points, "point_events");

  if (bad.length > 0) {
    throw new Error(
      `${bad.length} planned row(s) reference an actor that does not exist ` +
        `(${[...missing].map((k) => `"${k}"`).join(", ") || "no key"}).\n` +
        bad.slice(0, 8).map((b) => `  - ${b}`).join("\n") +
        (bad.length > 8 ? `\n  ... and ${bad.length - 8} more` : "") +
        `\n\nEvery author key must appear in VOICES or LURKERS. Known keys:\n  ` +
        ACTORS.map((a) => a.key).join(", "),
    );
  }
}

function printOrderingPreview(posts) {
  const label = (p) =>
    `${p.dishName} @ ${p.restaurantName}`.padEnd(50).slice(0, 50) +
    ` ${String(Math.round((NOW - p.createdAt.getTime()) / 3_600_000)).padStart(4)}h ` +
    `+${String(p.up).padStart(2)}/-${String(p.down).padStart(2)} ${String(p.commentCount).padStart(2)}c`;

  const byTrending = posts.slice().sort((a, b) => trendingScore(b) - trendingScore(a));
  const byNew = posts
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  console.log("\nTrending, simulated posts only (current DISCOVER_ORDER formula):");
  byTrending.slice(0, 10).forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${label(p)}`));

  console.log("\nNew, simulated posts only:");
  byNew.slice(0, 10).forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${label(p)}`));

  /* Printed with the rank the *current* formula gives each fixture, which is
     the measurement the retune is for. Today the 62-hour post with 58 upvotes
     sits below the zero-vote post published a minute ago — that inversion is
     the thing to watch move. */
  console.log("\nFixtures, with the rank today's trending formula gives them:");
  for (const p of posts.filter((x) => x.fixture)) {
    const rank = byTrending.indexOf(p) + 1;
    console.log(`  #${String(rank).padStart(2)} of ${byTrending.length}  ${p.dishName} @ ${p.restaurantName}`);
    console.log(`            ${p.fixture}`);
  }
}

/* --- Writing -------------------------------------------------------------- */

/** Bounded-concurrency runner. The Neon HTTP driver is one round trip per
    statement, and this script issues a few thousand of them. */
async function runAll(makeTasks, concurrency = 12) {
  const tasks = makeTasks.slice();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      await tasks[i]();
    }
  });
  await Promise.all(workers);
}

/**
 * Removes everything this script has ever written.
 *
 * Order matters: the posts go first, because a post authored by a REAL account
 * is the one row that would not cascade from the user delete. Everything else —
 * votes, hearts, comments, comment votes, point events — hangs off
 * `users(id) ON DELETE CASCADE` and leaves with the actors.
 */
async function clean() {
  const posts = await sql`DELETE FROM posts WHERE id LIKE ${`${POST_PREFIX}%`} RETURNING id`;
  const users = await sql`DELETE FROM users WHERE email LIKE ${SIM_EMAIL_LIKE} RETURNING id`;
  return { posts: posts.length, users: users.length };
}

async function main() {
  if (CLEAN_ONLY) {
    if (DRY_RUN) {
      console.log(
        `Dry run — --clean would delete every post whose id starts with "${POST_PREFIX}" ` +
          `and every user whose email matches "${SIM_EMAIL_LIKE}". Nothing was opened.`,
      );
      return;
    }
    const removed = await clean();
    console.log(
      `Removed ${removed.users} simulated account(s) and ${removed.posts} simulated post(s). ` +
        `Their votes, hearts, comments and point events went with them.`,
    );
    return;
  }

  const actorIds = Object.fromEntries(ACTORS.map((a) => [a.key, randomUUID()]));
  const plan = buildPlan(actorIds);
  /* Resolved up front, not lazily inside the owner branch, so a typo in a
     restaurant or dish name fails on --dry rather than halfway through a real
     run that has already written a thousand rows. */
  for (const plate of OWNER_PLATES) {
    findDish(findRestaurant(plate.rest), plate.dish, plate.price);
    checkText(plate.text, `owner/${plate.rest}`);
  }
  assertPlanResolved(plan, actorIds);

  if (DRY_RUN) {
    console.log("Dry run — no database connection was opened and nothing was written.\n");
    console.log(`Actors            ${ACTORS.length} (${VOICES.length} posting, ${LURKERS.length} voting only)`);
    console.log(`posts             ${plan.posts.length}`);
    console.log(`post_upvotes      ${plan.upvotes.length}`);
    console.log(`post_downvotes    ${plan.downvotes.length}`);
    console.log(`comments          ${plan.comments.length} (${plan.comments.filter((c) => c.parentId).length} threaded)`);
    console.log(`comment_upvotes   ${plan.commentUpvotes.length}`);
    console.log(`point_events      ${plan.points.length} (simulated users only)`);
    console.log(
      `\nVote spread: ${plan.posts.filter((p) => p.up - p.down < 0).length} post(s) net-negative, ` +
        `${plan.posts.filter((p) => p.up >= 15).length} at 15+ upvotes, ` +
        `${plan.posts.filter((p) => p.up >= 50).length} at 50+.`,
    );
    console.log(
      `Ages: ${plan.posts.filter((p) => p.createdAt.getTime() > NOW - 48 * 3_600_000).length} of ` +
        `${plan.posts.length} inside 48 hours, oldest ` +
        `${Math.round((NOW - Math.min(...plan.posts.map((p) => p.createdAt.getTime()))) / 86_400_000)} days.`,
    );
    printOrderingPreview(plan.posts);
    console.log(
      `\nOwner (${OWNER_EMAIL}) is looked up only on a real run.` +
        `\n  If he has posts:    ~${OWNER_UPVOTES.reduce((a, b) => a + b, 0)} upvotes, ` +
        `${OWNER_HEARTS.reduce((a, b) => a + b, 0)} hearts and ${OWNER_COMMENTS.length} comments ` +
        `spread over his ${OWNER_UPVOTES.length} newest posts. Nothing of his is edited or deleted.` +
        `\n  If he has none:     ${OWNER_PLATES.length} posts are created for him first (id prefix ` +
        `"${OWNER_POST_PREFIX}"), and the run says so loudly.` +
        `\n  Either way he is awarded no point_events — those would not cascade.`,
    );
    console.log(`\nRun it for real:  npm run sim:activity`);
    return;
  }

  // Idempotence: a re-run replaces the simulated rows rather than doubling them.
  const removed = await clean();
  if (removed.users > 0 || removed.posts > 0) {
    console.log(`Replacing a previous run: dropped ${removed.users} account(s), ${removed.posts} post(s).`);
  }

  /* users.name has a unique index on lower(name). The simulated names are only
     ever checked against real accounts here — the previous run's actors are
     already gone — and a clash gets an initial rather than aborting the run. */
  const wanted = ACTORS.map((a) => a.name.toLowerCase());
  const taken = new Set(
    (await sql`SELECT lower(name) AS n FROM users WHERE lower(name) = ANY(${wanted})`).map((r) => r.n),
  );
  for (const actor of ACTORS) {
    if (!taken.has(actor.name.toLowerCase())) {
      taken.add(actor.name.toLowerCase());
      continue;
    }
    let resolved = null;
    for (const suffix of ["S", "J", "R", "M", "T", "K", "V", "W"]) {
      const candidate = `${actor.name} ${suffix}.`;
      if (!taken.has(candidate.toLowerCase())) {
        resolved = candidate;
        break;
      }
    }
    actor.name = resolved ?? `${actor.name} ${randomBytes(2).toString("hex")}`;
    taken.add(actor.name.toLowerCase());
  }

  await runAll(
    ACTORS.map((actor) => async () => {
      await sql`
        INSERT INTO users (id, name, email, password_hash, hide_from_leaderboard,
                           discoverable_by_username)
        VALUES (${actorIds[actor.key]}, ${actor.name},
                ${`sim-${actor.key}@demo.platemaps.app`},
                ${`simulated-no-login-${randomBytes(16).toString("hex")}`},
                ${Boolean(actor.lurker)}, false)
      `;
    }),
  );

  await runAll(
    plan.posts.map((p) => async () => {
      await sql`
        INSERT INTO posts (id, user_id, text, restaurant, restaurant_id, restaurant_lat,
                           restaurant_lng, dish_name, price, rating, rating_kind,
                           photos_public, created_at)
        VALUES (${p.id}, ${actorIds[p.userKey]}, ${p.text}, ${p.restaurantName},
                ${p.restaurantId}, ${p.lat}, ${p.lng}, ${p.dishName}, ${p.price},
                -- One rating scale: a 0-100 percent about one plate. Never
                -- 'restaurant', never a 1-5 star value.
                ${p.rating}, 'dish',
                -- No media is written, so this decides nothing; false is the
                -- column default and the honest value for an account that
                -- never made a privacy choice.
                false, ${p.createdAt.toISOString()})
      `;
    }),
  );

  /* Comments go in serially, oldest first, and that ordering is what makes
     `parent_id` (a real FK to comments(id)) safe at any thread depth: a reply's
     timestamp is derived from its parent's, so time order is also insert order.
     Batching them by concurrency would race a reply ahead of its parent. */
  for (const c of plan.comments.slice().sort((a, b) => a.at.getTime() - b.at.getTime())) {
    await sql`
      INSERT INTO comments (id, post_id, parent_id, user_id, text, created_at)
      VALUES (${c.id}, ${c.postId}, ${c.parentId}, ${actorIds[c.userKey]}, ${c.text},
              ${c.at.toISOString()})
    `;
  }

  await runAll([
    ...plan.upvotes.map((v) => async () => {
      await sql`
        INSERT INTO post_upvotes (post_id, user_id, created_at)
        VALUES (${v.postId}, ${actorIds[v.userKey]}, ${v.at.toISOString()})
        ON CONFLICT DO NOTHING
      `;
    }),
    ...plan.downvotes.map((v) => async () => {
      await sql`
        INSERT INTO post_downvotes (post_id, user_id, created_at)
        VALUES (${v.postId}, ${actorIds[v.userKey]}, ${v.at.toISOString()})
        ON CONFLICT DO NOTHING
      `;
    }),
    ...plan.commentUpvotes.map((v) => async () => {
      await sql`
        INSERT INTO comment_upvotes (comment_id, user_id, created_at)
        VALUES (${v.commentId}, ${actorIds[v.userKey]}, ${v.at.toISOString()})
        ON CONFLICT DO NOTHING
      `;
    }),
  ]);

  /* point_events, simulated recipients only. The reason strings are the exact
     shapes awardPoints writes, so idx_point_events_unique_upvote covers the
     upvote and comment-upvote rows the way it was built to. */
  const totals = {};
  await runAll(
    plan.points.map((e) => async () => {
      await sql`
        INSERT INTO point_events (id, user_id, amount, reason, created_at)
        VALUES (${randomUUID()}, ${actorIds[e.userKey]}, ${e.amount}, ${e.reason},
                ${e.at.toISOString()})
        ON CONFLICT DO NOTHING
      `;
    }),
  );
  for (const e of plan.points) totals[e.userKey] = (totals[e.userKey] ?? 0) + e.amount;

  // Fold the ledger into the cached totals the same way awardPoints does.
  await runAll(
    ACTORS.map((actor) => async () => {
      await sql`
        UPDATE users SET points = ${totals[actor.key] ?? 0},
                         monthly_points = ${totals[actor.key] ?? 0},
                         monthly_points_month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
        WHERE id = ${actorIds[actor.key]}
      `;
    }),
  );

  /* --- The owner ---------------------------------------------------------- */
  const ownerRows = await sql`
    SELECT id, name FROM users WHERE lower(email) = ${OWNER_EMAIL.toLowerCase()}
  `;
  let ownerSummary = `No account found for ${OWNER_EMAIL}; nothing was written for it.`;

  if (ownerRows.length > 0) {
    const owner = ownerRows[0];
    let ownerPosts = await sql`
      SELECT id, created_at FROM posts WHERE user_id = ${owner.id}
      ORDER BY created_at DESC LIMIT ${OWNER_UPVOTES.length}
    `;
    let created = 0;

    if (ownerPosts.length === 0) {
      /* Only in this case, and it is announced. His existing posts are never
         created, edited or removed by this script. */
      await runAll(
        OWNER_PLATES.map((plate) => async () => {
          const restaurant = findRestaurant(plate.rest);
          const dish = findDish(restaurant, plate.dish, plate.price);
          await sql`
            INSERT INTO posts (id, user_id, text, restaurant, restaurant_id, restaurant_lat,
                               restaurant_lng, dish_name, price, rating, rating_kind,
                               photos_public, created_at)
            VALUES (${`${OWNER_POST_PREFIX}${randomUUID()}`}, ${owner.id}, ${plate.text},
                    ${plate.rest}, ${restaurant.id}, ${restaurant.lat}, ${restaurant.lng},
                    ${dish.name}, ${dish.price}, ${plate.rating}, 'dish',
                    false, ${hoursAgo(plate.at).toISOString()})
          `;
        }),
      );
      created = OWNER_PLATES.length;
      ownerPosts = await sql`
        SELECT id, created_at FROM posts WHERE user_id = ${owner.id}
        ORDER BY created_at DESC LIMIT ${OWNER_UPVOTES.length}
      `;
      console.log(
        `\n*** ${owner.name} (${OWNER_EMAIL}) had no posts, so ${created} were CREATED for that ` +
          `account so the Activity tab has something to sit on. They carry the id prefix ` +
          `"${OWNER_POST_PREFIX}" and "npm run sim:activity -- --clean" removes them. ***\n`,
      );
    }

    const ownerPlan = buildOwnerPlan(ownerPosts);
    await runAll(
      ownerPlan.comments.map((c) => async () => {
        await sql`
          INSERT INTO comments (id, post_id, parent_id, user_id, text, created_at)
          VALUES (${c.id}, ${c.postId}, NULL, ${actorIds[c.userKey]}, ${c.text},
                  ${c.at.toISOString()})
        `;
      }),
    );
    await runAll([
      ...ownerPlan.upvotes.map((v) => async () => {
        await sql`
          INSERT INTO post_upvotes (post_id, user_id, created_at)
          VALUES (${v.postId}, ${actorIds[v.userKey]}, ${v.at.toISOString()})
          ON CONFLICT DO NOTHING
        `;
      }),
      ...ownerPlan.hearts.map((v) => async () => {
        await sql`
          INSERT INTO post_hearts (post_id, user_id, created_at)
          VALUES (${v.postId}, ${actorIds[v.userKey]}, ${v.at.toISOString()})
          ON CONFLICT DO NOTHING
        `;
      }),
    ]);

    ownerSummary =
      `${owner.name}: ${ownerPlan.upvotes.length} upvotes, ${ownerPlan.hearts.length} hearts and ` +
      `${ownerPlan.comments.length} comments across ${ownerPosts.length} of his posts` +
      (created > 0 ? ` (${created} of which this script created)` : "") +
      `. No point_events were written to that account.`;
  }

  console.log(
    `\nWrote ${ACTORS.length} simulated accounts, ${plan.posts.length} plates, ` +
      `${plan.upvotes.length} upvotes, ${plan.downvotes.length} downvotes, ` +
      `${plan.comments.length} comments, ${plan.commentUpvotes.length} comment upvotes ` +
      `and ${plan.points.length} point events.`,
  );
  console.log(ownerSummary);
  printOrderingPreview(plan.posts);
  console.log(
    `\nUndo:  npm run sim:activity -- --clean` +
      `\n   or: psql $DATABASE_URL -c "DELETE FROM users WHERE email LIKE '%@demo.platemaps.app'"` +
      `\n       (the second also removes seed-demo's five accounts)`,
  );
}

main();
