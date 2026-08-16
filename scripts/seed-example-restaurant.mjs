/**
 * Fills in ONE restaurant so there is a worked example of the rating model to
 * look at — a page where the plate score, the category scores and the per-dish
 * percentages are all real and all agree with each other.
 *
 *   node --env-file=.env.local scripts/seed-example-restaurant.mjs
 *   node --env-file=.env.local scripts/seed-example-restaurant.mjs --dry
 *   node --env-file=.env.local scripts/seed-example-restaurant.mjs --restaurant 5
 *
 * ## Why this exists separately from seed-demo.mjs
 *
 * `db:seed` rewrites the whole demo corpus and deletes its users to do it. This
 * touches one restaurant and nothing else, so the example can be rebuilt or
 * repointed without disturbing anything already in the database.
 *
 * **Idempotent, and narrowly so.** It deletes only the posts it wrote — matched
 * on the example author and this restaurant — then writes them again. Real
 * accounts, other restaurants and the rest of the demo corpus are never touched.
 * Aspect votes and point events cascade from the post rows.
 *
 * ## What it writes
 *
 * Ratings on the top 8 plates only, which is the shape a real restaurant has:
 * a few dishes everyone orders and a long tail nobody has got to. The ratings
 * are spread unevenly on purpose — the margherita carries 9 of them, the last
 * two plates carry 2 each — because that unevenness is exactly what
 * `src/lib/plateScore.ts` weights for, and a flat 5-per-dish example would hide
 * the behaviour it exists to demonstrate.
 *
 * Every rating is a real row in `posts` with `rating_kind = 'dish'`. Nothing
 * here writes a restaurant-level number: the header's percent is derived from
 * these, which is the entire point of the example.
 */
import { neon } from "@neondatabase/serverless";
import { randomUUID, randomBytes } from "node:crypto";

const sql = neon(process.env.DATABASE_URL);

const DRY = process.argv.includes("--dry");
const restaurantArg = process.argv.indexOf("--restaurant");
const RESTAURANT_ID = restaurantArg !== -1 ? process.argv[restaurantArg + 1] : "2";

/**
 * The example's authors. Separate from the `@demo.platemaps.app` accounts
 * `db:seed` owns, so the two scripts can never delete each other's work.
 */
const AUTHORS = [
  { key: "nina", name: "Nina Alvarado" },
  { key: "theo", name: "Theo Marsh" },
  { key: "ruth", name: "Ruth Okonjo" },
  { key: "cal", name: "Cal Behrens" },
  { key: "iris", name: "Iris Tanaka" },
];

const EMAIL = (key) => `${key}@example.platemaps.app`;

/**
 * The eight plates, in the order they should rank, with the ratings each one
 * collected. Written out rather than generated: this is a worked example, and
 * a reader should be able to check the arithmetic by hand.
 *
 * Dishes are matched by name against the menu already in `dishes`, so this list
 * has to name plates that restaurant actually serves — the script fails loudly
 * if one is missing rather than silently seeding seven.
 */
const PLATES = [
  { dish: "Sopranos Pizza", ratings: [96, 94, 92, 97, 90, 95, 93, 98, 91] },
  { dish: "Meatball Ricotta Marinara Pizza", ratings: [95, 92, 90, 94, 88, 93] },
  { dish: "Tartufi Pizza", ratings: [93, 90, 88, 95, 91] },
  { dish: "Calzone", ratings: [89, 92, 86, 90] },
  { dish: "Pasta Carbonara", ratings: [88, 84, 90, 86, 83] },
  { dish: "Chicken Wings", ratings: [82, 78, 85] },
  { dish: "Greek Salad", ratings: [74, 70] },
  { dish: "Hawaiian Pizza", ratings: [61, 55] },
];

/**
 * Captions, one per rating band, so the feed cards read like sentences instead
 * of a wall of the same line. Picked by score, cycled within a band.
 */
const CAPTIONS = {
  high: [
    "Ordered it twice in one week. No notes.",
    "This is the one to get. Crust holds all the way to the tip.",
    "Better than it has any right to be for the price.",
    "Whatever they're doing to the sausage, they should keep doing it.",
    "Came for something else, left planning to come back for this.",
  ],
  mid: [
    "Solid. Wouldn't go out of my way but wouldn't skip it either.",
    "Good, a little heavy. Split it next time.",
    "Does the job. The sides are where the value is.",
    "Fine — I'd order it again if the table wanted to share.",
  ],
  low: [
    "Not the one. Stick to the specialty pies.",
    "Underseasoned, and it went cold fast.",
  ],
};

/** Which aspects this example's reviewers called out, and how often. */
const ASPECT_VOTES = [
  { aspect: "Service", sentiment: "praise", count: 11 },
  { aspect: "Ambiance", sentiment: "praise", count: 7 },
  { aspect: "Drinks", sentiment: "praise", count: 4 },
  { aspect: "Value", sentiment: "praise", count: 3 },
  { aspect: "Value", sentiment: "fault", count: 6 },
  { aspect: "Menu variety", sentiment: "fault", count: 4 },
];

function captionFor(score, seen) {
  const band = score >= 88 ? "high" : score >= 70 ? "mid" : "low";
  const pool = CAPTIONS[band];
  const n = seen[band] ?? 0;
  seen[band] = n + 1;
  return pool[n % pool.length];
}

/** Deterministic, so re-running doesn't reshuffle who said what. */
function seedOf(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

async function main() {
  const [restaurant] = await sql`
    SELECT id, name, lat, lng, rating FROM restaurants WHERE id = ${RESTAURANT_ID}
  `;
  if (!restaurant) {
    throw new Error(`No restaurant with id "${RESTAURANT_ID}" — run restaurants:import first.`);
  }

  const menu = await sql`
    SELECT name, price FROM dishes WHERE restaurant_id = ${RESTAURANT_ID}
  `;
  const byName = new Map(menu.map((d) => [d.name.trim().toLowerCase(), d]));

  const missing = PLATES.filter((p) => !byName.has(p.dish.trim().toLowerCase()));
  if (missing.length > 0) {
    throw new Error(
      `${restaurant.name} has no menu row for: ${missing.map((m) => m.dish).join(", ")}.\n` +
        `Its menu has ${menu.length} dishes. Edit PLATES to name ones it serves.`,
    );
  }

  const totalRatings = PLATES.reduce((n, p) => n + p.ratings.length, 0);
  console.log(
    `\nExample restaurant: ${restaurant.name} (id ${restaurant.id})\n` +
      `  ${PLATES.length} rated plates, ${totalRatings} ratings, ` +
      `${menu.length - PLATES.length} plates left unrated\n`,
  );

  if (DRY) {
    for (const p of PLATES) {
      const avg = p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length;
      console.log(
        `  ${String(Math.round(avg)).padStart(3)}%  ${String(p.ratings.length).padStart(2)} ratings  ${p.dish}`,
      );
    }
    console.log("\n--dry: nothing written.\n");
    return;
  }

  // Authors first — created once, reused on every re-run so the posts they own
  // can be found and replaced.
  const ids = {};
  for (const a of AUTHORS) {
    const existing = await sql`SELECT id FROM users WHERE email = ${EMAIL(a.key)}`;
    if (existing.length > 0) {
      ids[a.key] = existing[0].id;
      continue;
    }
    ids[a.key] = randomUUID();
    await sql`
      INSERT INTO users (id, name, email, password_hash)
      VALUES (${ids[a.key]}, ${a.name}, ${EMAIL(a.key)},
              ${`seeded-no-login-${randomBytes(16).toString("hex")}`})
    `;
  }

  /* The narrow cleanup: only this restaurant, only these authors. Aspect votes
     and point events cascade from the post row. */
  const authorIds = Object.values(ids);
  const removed = await sql`
    DELETE FROM posts
    WHERE restaurant_id = ${RESTAURANT_ID}
      AND user_id = ANY(${authorIds})
    RETURNING id
  `;
  if (removed.length > 0) console.log(`  replaced ${removed.length} posts from a previous run`);

  // Flatten to one row per rating so authors and timestamps interleave across
  // plates the way real traffic would, rather than arriving dish by dish.
  const rows = [];
  for (const plate of PLATES) {
    const menuRow = byName.get(plate.dish.trim().toLowerCase());
    plate.ratings.forEach((score, i) => {
      rows.push({ dish: menuRow.name, price: menuRow.price, score, nonce: seedOf(`${plate.dish}:${i}`) });
    });
  }
  rows.sort((a, b) => a.nonce - b.nonce);

  const seen = {};
  const postIds = [];
  for (const [i, row] of rows.entries()) {
    const author = AUTHORS[row.nonce % AUTHORS.length].key;
    const postId = randomUUID();
    postIds.push(postId);
    // Spread over the last few weeks, newest first, so the feed and the
    // "recency-weighted hot" ranking have something real to sort.
    const createdAt = new Date(Date.now() - (4 + i * 7) * 3_600_000);

    await sql`
      INSERT INTO posts (id, user_id, text, restaurant, restaurant_id, restaurant_lat,
                         restaurant_lng, dish_name, price, rating, rating_kind,
                         photos_public, created_at)
      VALUES (${postId}, ${ids[author]}, ${captionFor(row.score, seen)},
              ${restaurant.name}, ${restaurant.id}, ${restaurant.lat}, ${restaurant.lng},
              ${row.dish}, ${row.price}, ${row.score}, 'dish',
              true, ${createdAt.toISOString()})
    `;
  }

  /* Aspect votes ride on the posts, the same way the composer writes them.
     Spread across the earliest posts so every vote has a host row. */
  let cursor = 0;
  for (const vote of ASPECT_VOTES) {
    for (let n = 0; n < vote.count; n++) {
      const postId = postIds[cursor % postIds.length];
      cursor++;
      await sql`
        INSERT INTO post_aspect_votes (post_id, aspect, sentiment)
        VALUES (${postId}, ${vote.aspect}, ${vote.sentiment})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  console.log(`  wrote ${rows.length} ratings and ${ASPECT_VOTES.reduce((n, v) => n + v.count, 0)} aspect votes`);
  console.log(`\n  → http://localhost:3000/restaurant/${restaurant.id}\n`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
