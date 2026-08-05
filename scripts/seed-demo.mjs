/**
 * Seeds demo eaters and plates so a fresh database has a feed and a
 * leaderboard worth looking at. Idempotent: re-running replaces the demo rows
 * and leaves real accounts alone.
 *
 *   npm run db:seed
 *
 * Demo users get a random password hash, so nobody can sign in as them.
 */
import { neon } from "@neondatabase/serverless";
import { randomUUID, randomBytes } from "node:crypto";

const sql = neon(process.env.DATABASE_URL);

const photo = (id) =>
  `https://images.unsplash.com/photo-${id}?w=1080&q=80&fm=jpg&fit=crop`;

const USERS = [
  { key: "maya", name: "Maya Ellis" },
  { key: "diego", name: "Diego Alvarez" },
  { key: "ben", name: "Ben Ortiz" },
  { key: "priya", name: "Priya Nair" },
  { key: "sam", name: "Sam Whitaker" },
];

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000);

const POSTS = [
  {
    user: "maya",
    dish: "Hot honey pepperoni pizza",
    restaurant: "Landini's Pizzeria",
    text: "Crispy crust, spicy honey, and definitely worth ordering again. Got there right at open and walked straight in.",
    price: "$18",
    rating: 9.2,
    location: "0.8 miles away",
    tags: ["Dinner", "Fine Dining"],
    photos: [1513104890138 + "-7c749659a591", "1565299624946-b28f40a0ae38"],
    hours: 2,
    likes: ["diego", "ben", "priya", "sam"],
    comments: [
      { user: "diego", text: "The hot honey is the whole thing. Get it with the fennel sausage next time." },
      { user: "priya", text: "Adding this to the list immediately" },
    ],
  },
  {
    user: "diego",
    dish: "Marlin taco",
    restaurant: "Tacos El Gordo",
    text: "Still the best $4.50 in the city. Smoked marlin, no line at 11am on a Tuesday.",
    price: "$4.50",
    rating: 9.6,
    location: "0.6 miles away",
    tags: ["Lunch", "Hidden Gem", "Under $15"],
    photos: ["1551782450-a2132b4ba21d"],
    hours: 5,
    likes: ["maya", "ben", "sam"],
    comments: [{ user: "ben", text: "Marlin over shrimp every single time." }],
  },
  {
    user: "ben",
    dish: "Cortado and a morning bun",
    restaurant: "Breakfast Republic",
    text: "Sat in the garden for an hour and nobody rushed me. The bun is laminated properly — shatters when you pull it.",
    price: "$9",
    rating: 8.4,
    location: "1.1 miles away",
    tags: ["Breakfast", "Coffee"],
    photos: ["1567620905732-2d1ec7ab7445"],
    hours: 9,
    likes: ["maya", "priya"],
    comments: [],
  },
  {
    user: "priya",
    dish: "Chirashi bowl",
    restaurant: "Sushi Ota",
    text: "Ordered the chirashi instead of omakase and regret nothing. Everything tasted like it was cut that morning.",
    price: "$32",
    rating: 9.4,
    location: "2.4 miles away",
    tags: ["Dinner", "Fine Dining"],
    photos: ["1546069901-ba9599a7e63c", "1504674900247-0877df9cc836"],
    hours: 26,
    likes: ["maya", "diego", "ben", "sam"],
    comments: [
      { user: "maya", text: "Ota never misses. Did you sit at the bar?" },
      { user: "sam", text: "That's a serious amount of uni for $32." },
    ],
  },
  {
    user: "sam",
    dish: "Tiramisù",
    restaurant: "Buona Forchetta",
    text: "Came for the pizza, stayed for this. Soaked all the way through, not soggy. Split it and still wanted my own.",
    price: "$8",
    rating: 8.9,
    location: "6.2 miles away",
    tags: ["Dessert", "Under $15"],
    photos: ["1559847844-5315695dadae"],
    hours: 40,
    likes: ["priya", "diego"],
    comments: [{ user: "priya", text: "Their dessert case is criminally underrated" }],
  },
  {
    user: "maya",
    dish: "Fish and chips, dockside",
    restaurant: "Mitch's Seafood",
    text: "Ate it standing at the rail watching the boats come in. Batter was light, tartar had actual dill in it.",
    price: "$21",
    rating: 8.7,
    location: "4.0 miles away",
    tags: ["Lunch"],
    photos: ["1541592106381-b31e9677c0e5"],
    hours: 52,
    likes: ["ben"],
    comments: [],
  },
];

async function main() {
  const ids = Object.fromEntries(USERS.map((u) => [u.key, randomUUID()]));

  // Clear any previous demo run. Cascades take the posts/likes/points with it.
  const emails = USERS.map((u) => `${u.key}@demo.platemaps.app`);
  await sql`DELETE FROM users WHERE email = ANY(${emails})`;

  for (const u of USERS) {
    await sql`
      INSERT INTO users (id, name, email, password_hash)
      VALUES (${ids[u.key]}, ${u.name}, ${`${u.key}@demo.platemaps.app`},
              ${`seeded-no-login-${randomBytes(16).toString("hex")}`})
    `;
  }

  const points = {};
  const award = async (userKey, amount, reason, at) => {
    await sql`
      INSERT INTO point_events (id, user_id, amount, reason, created_at)
      VALUES (${randomUUID()}, ${ids[userKey]}, ${amount}, ${reason}, ${at.toISOString()})
      ON CONFLICT DO NOTHING
    `;
    points[userKey] = (points[userKey] ?? 0) + amount;
  };

  for (const p of POSTS) {
    const postId = randomUUID();
    const createdAt = hoursAgo(p.hours);
    await sql`
      INSERT INTO posts (id, user_id, text, restaurant, dish_name, price, rating,
                         location_label, tags, media, created_at)
      VALUES (${postId}, ${ids[p.user]}, ${p.text}, ${p.restaurant}, ${p.dish},
              ${p.price}, ${p.rating}, ${p.location}, ${p.tags},
              ${JSON.stringify(
                p.photos.map((id) => ({
                  url: photo(id),
                  type: "image",
                  alt: `${p.dish} at ${p.restaurant}`,
                })),
              )}::jsonb, ${createdAt.toISOString()})
    `;
    await award(p.user, 10, `post:${postId}`, createdAt);

    for (const likerKey of p.likes) {
      await sql`
        INSERT INTO post_likes (post_id, user_id, liked, awarded_points)
        VALUES (${postId}, ${ids[likerKey]}, true, true)
        ON CONFLICT DO NOTHING
      `;
      await award(p.user, 1, `like:${postId}:${ids[likerKey]}`, hoursAgo(p.hours - 1));
    }

    for (const [i, c] of p.comments.entries()) {
      const commentId = randomUUID();
      await sql`
        INSERT INTO comments (id, post_id, user_id, text, created_at)
        VALUES (${commentId}, ${postId}, ${ids[c.user]}, ${c.text},
                ${hoursAgo(Math.max(p.hours - 1 - i, 0.2)).toISOString()})
      `;
      await award(p.user, 2, `comment:${commentId}`, hoursAgo(Math.max(p.hours - 1 - i, 0.2)));
    }
  }

  // Older history so the week/month windows have depth. The 8-13 day old
  // block lands in the *previous* 7-day window, which is what the rank-change
  // arrows compare against — without it every row would read "new".
  const HISTORY = [
    // This week.
    ["maya", 180, 40], ["diego", 240, 38], ["ben", 90, 44],
    ["priya", 150, 50], ["sam", 60, 46],
    ["maya", 120, 12], ["diego", 60, 10], ["priya", 95, 14],
    // Last week — Diego led, Ben was ahead of Priya, Sam hadn't started.
    ["diego", 400, 200], ["ben", 310, 220], ["priya", 150, 210],
    ["maya", 140, 260], ["ben", 90, 300],
  ];
  for (const [key, amount, hours] of HISTORY) {
    await award(key, amount, `history:${key}:${hours}`, hoursAgo(hours));
  }

  // Fold the ledger into the cached totals the same way awardPoints does.
  for (const u of USERS) {
    await sql`
      UPDATE users SET points = ${points[u.key] ?? 0},
                       monthly_points = ${points[u.key] ?? 0},
                       monthly_points_month = to_char(now(), 'YYYY-MM')
      WHERE id = ${ids[u.key]}
    `;
  }

  // Everyone follows Maya and Diego, so a signed-in user's Following tab has
  // something in it after one tap.
  for (const u of USERS) {
    for (const target of ["maya", "diego"]) {
      if (u.key === target) continue;
      await sql`
        INSERT INTO follows (follower_id, following_id)
        VALUES (${ids[u.key]}, ${ids[target]}) ON CONFLICT DO NOTHING
      `;
    }
  }

  console.log(`Seeded ${USERS.length} demo eaters and ${POSTS.length} plates.`);
}

main();
