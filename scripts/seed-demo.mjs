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
import { restaurants } from "../src/data/restaurants.ts";
import { BEST_AT_LABELS } from "../src/data/reviewScales.ts";

const sql = neon(process.env.DATABASE_URL);

/** POSTS below reference restaurants by name; this resolves id/lat/lng for
    the restaurant_id/restaurant_lat/restaurant_lng columns. */
function findRestaurant(name) {
  const match = restaurants.find((r) => r.name === name);
  if (!match) throw new Error(`No restaurant named "${name}" in data/restaurants.ts`);
  return match;
}

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
    rating: 92,
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
    rating: 96,
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
    rating: 84,
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
    rating: 94,
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
    rating: 89,
    location: "6.2 miles away",
    tags: ["Dessert", "Under $15"],
    photos: ["1559847844-5315695dadae"],
    hours: 40,
    likes: ["priya", "diego"],
    dislikes: ["sam"],
    comments: [{ user: "priya", text: "Their dessert case is criminally underrated" }],
  },
  {
    user: "maya",
    dish: "Fish and chips, dockside",
    restaurant: "Mitch's Seafood",
    text: "Ate it standing at the rail watching the boats come in. Batter was light, tartar had actual dill in it.",
    price: "$21",
    rating: 87,
    location: "4.0 miles away",
    tags: ["Lunch"],
    photos: ["1541592106381-b31e9677c0e5"],
    hours: 52,
    likes: ["ben"],
    // The one seeded plate that lands underwater, so the feed has a negative
    // net score to render and the card's minus sign is exercised.
    dislikes: ["maya", "priya"],
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
    const restaurant = findRestaurant(p.restaurant);
    await sql`
      INSERT INTO posts (id, user_id, text, restaurant, restaurant_id, restaurant_lat,
                         restaurant_lng, dish_name, price, rating, rating_kind,
                         location_label, tags, media, photos_public, created_at)
      VALUES (${postId}, ${ids[p.user]}, ${p.text}, ${p.restaurant}, ${restaurant.id},
              ${restaurant.lat}, ${restaurant.lng}, ${p.dish}, ${p.price}, ${p.rating},
              -- Every seeded post names a dish, so all of them are dish
              -- reviews and their ratings are percentages (0-100), matching
              -- what the composer's meter produces.
              'dish', ${p.location}, ${p.tags},
              ${JSON.stringify(
                p.photos.map((id) => ({
                  url: photo(id),
                  type: "image",
                  alt: `${p.dish} at ${p.restaurant}`,
                })),
              )}::jsonb,
              -- Demo accounts can't log in, so there's no real privacy
              -- decision being overridden here — true so the seeded Discover
              -- feed actually shows photos instead of looking broken.
              true, ${createdAt.toISOString()})
    `;
    await award(p.user, 10, `post:${postId}`, createdAt);

    for (const upvoterKey of p.likes) {
      await sql`
        INSERT INTO post_upvotes (post_id, user_id)
        VALUES (${postId}, ${ids[upvoterKey]})
        ON CONFLICT DO NOTHING
      `;
      await award(p.user, 1, `upvote:${postId}:${ids[upvoterKey]}`, hoursAgo(p.hours - 1));
    }

    // Downvotes pay the author nothing and take nothing away — no award call
    // here is the whole rule. Nobody seeded appears in both lists for a post;
    // the app enforces that in castVote, the seed just doesn't violate it.
    for (const downvoterKey of p.dislikes ?? []) {
      await sql`
        INSERT INTO post_downvotes (post_id, user_id)
        VALUES (${postId}, ${ids[downvoterKey]})
        ON CONFLICT DO NOTHING
      `;
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

  /*
   * Captions for the seeded restaurant reviews. Three variants per aspect,
   * cycled by index, because every review sharing one templated sentence
   * turned the restaurant page's comment rail into a wall of the same line
   * repeated twenty times — which reads as broken seed data, not a busy
   * restaurant.
   */
  const PRAISE = {
    Food: [
      "The kitchen is the reason to come here.",
      "Food is the standout, full stop.",
      "Everything that came out of that kitchen landed.",
      "Whatever they're doing back there, it's working.",
      "Came for one thing, ate three. No regrets.",
    ],
    Drinks: [
      "The drinks list is the draw.",
      "They know exactly what they're doing behind that bar.",
      "Best pours in the neighborhood, easily.",
      "Would come back for the bar alone.",
      "Somebody behind that bar actually cares.",
    ],
    Service: [
      "The staff make this place.",
      "Quick, friendly, never hovering. Rare.",
      "They actually look after you here.",
      "Treated like a regular on the first visit.",
      "Nobody made me feel like a table number.",
    ],
    Ambiance: [
      "The room is the whole point.",
      "Good place to sit a while and not be rushed.",
      "Worth coming for the space alone.",
      "Stayed two hours longer than I meant to.",
      "The kind of room you tell people about.",
    ],
    Value: [
      "Hard to beat for the price.",
      "You get a lot more than you pay for.",
      "Cheapest good meal for blocks.",
      "Left full and the bill still surprised me.",
      "Portions like this at this price shouldn't exist.",
    ],
    "Menu variety": [
      "Menu goes deep — something for everyone.",
      "Took three visits to get through what I wanted to try.",
      "Plenty to pick from, which is rare around here.",
      "Brought a picky group and everyone found something.",
      "Still working my way down the menu.",
    ],
  };

  const GRIPE = {
    Food: [
      "Kitchen is the weak link, though.",
      "Wish the food kept up with the rest of it.",
      "Food didn't do it for me.",
      "The plates were the least interesting part.",
      "Everything else beats what's on the plate.",
    ],
    Drinks: [
      "Drinks felt like an afterthought.",
      "Bar side needs work.",
      "I'd skip the cocktails.",
      "Stick to what's on tap.",
      "Nothing on the drinks list stood out.",
    ],
    Service: [
      "Service dragged, though.",
      "Took a while to get anyone's attention.",
      "Front of house could be sharper.",
      "Waited a long time for a check.",
      "Felt understaffed the whole time.",
    ],
    Ambiance: [
      "Room's a bit grim, though.",
      "Not somewhere you'd linger.",
      "The space could use some love.",
      "Loud enough that we gave up talking.",
      "Get it to go — the room's nothing.",
    ],
    Value: [
      "Pricey for what it is, though.",
      "Bill added up faster than I expected.",
      "Not cheap.",
      "Good, but I felt the price after.",
      "Portions don't match the number at the bottom.",
    ],
    "Menu variety": [
      "Menu's thin, though.",
      "Wish there were more options.",
      "Not much to choose from.",
      "Same few things every visit.",
      "Hard if anyone in your group is picky.",
    ],
  };

  /*
   * Restaurant reviews, which is what the per-aspect block on a restaurant
   * page is built from. The dish posts above are dish reviews and carry no
   * aspect verdicts.
   *
   * Each entry is [bestAspect, worstAspect|null, stars, count], repeated
   * `count` times, so a restaurant ends up with a believable spread rather
   * than one vote per aspect.
   *
   * These four are hand-written because each is a case worth being able to
   * look at. Every other restaurant is generated below — the block used to
   * render on these four pages and nowhere else.
   *
   * Each list touches all six categories, same as the generator, so no page
   * renders a partial row. The trailing single-count entries are the ones
   * carrying a category that the hand-written shape didn't otherwise reach.
   */
  const HAND_WRITTEN = [
    {
      restaurant: "Landini's Pizzeria",
      verdicts: [
        ["Food", null, 5, 7],
        ["Food", "Menu variety", 4, 3],
        ["Value", null, 5, 2],
        ["Ambiance", "Service", 4, 2],
        ["Service", null, 3, 1],
        ["Drinks", null, 4, 1],
      ],
    },
    {
      restaurant: "Sushi Ota",
      verdicts: [
        ["Food", null, 5, 9],
        ["Service", null, 5, 4],
        ["Food", "Value", 4, 4],
        ["Ambiance", "Value", 4, 2],
        ["Menu variety", null, 5, 2],
        ["Drinks", null, 4, 1],
      ],
    },
    {
      restaurant: "Tacos El Gordo",
      verdicts: [
        ["Value", null, 5, 6],
        ["Menu variety", null, 5, 4],
        ["Food", "Ambiance", 4, 5],
        ["Food", "Service", 4, 3],
        ["Drinks", null, 4, 1],
      ],
    },
    {
      restaurant: "Ballast Point Brewing",
      // The case worth seeing on a page: drinks carry it, the kitchen drags.
      verdicts: [
        ["Drinks", "Food", 4, 8],
        ["Ambiance", "Food", 4, 4],
        ["Drinks", null, 5, 3],
        ["Service", "Value", 3, 2],
        ["Menu variety", null, 4, 2],
      ],
    },
  ];

  /*
   * Which aspects a kind of place tends to be praised and faulted for. Used
   * only to give a generated restaurant a shape — a brewery whose drinks and
   * room carry it reads differently from a sandwich counter that wins on food
   * and price, and a page where all six aspects sit on the same number says
   * nothing at all.
   *
   * `strong` is weighted toward its first entry, `also` gets the occasional
   * nod, `weak` is what the complaints land on. Anything omitted still gets a
   * single praise vote in `generateReviews`, so the profile decides a page's
   * shape rather than which categories appear at all.
   */
  const CUISINE_PROFILE = {
    Breweries: { strong: ["Drinks", "Ambiance"], also: ["Menu variety"], weak: ["Food"] },
    Bars: { strong: ["Drinks", "Ambiance"], also: ["Service"], weak: ["Value"] },
    "Tapas Bars": { strong: ["Menu variety", "Drinks"], also: ["Ambiance"], weak: ["Value"] },
    Pizza: { strong: ["Food", "Value"], also: ["Service"], weak: ["Ambiance"] },
    Mexican: { strong: ["Value", "Food"], also: ["Menu variety"], weak: ["Ambiance"] },
    "Sushi Bars": { strong: ["Food", "Service"], also: ["Menu variety"], weak: ["Value"] },
    Seafood: { strong: ["Food", "Ambiance"], also: ["Service"], weak: ["Value"] },
    "New American": { strong: ["Food", "Ambiance"], also: ["Service"], weak: ["Value"] },
    American: { strong: ["Food", "Service"], also: ["Value"], weak: ["Menu variety"] },
    Diners: { strong: ["Service", "Value"], also: ["Menu variety"], weak: ["Food"] },
    "Breakfast & Brunch": { strong: ["Food", "Service"], also: ["Menu variety"], weak: ["Value"] },
    Thai: { strong: ["Food", "Value"], also: ["Service"], weak: ["Ambiance"] },
    Italian: { strong: ["Food", "Service"], also: ["Ambiance"], weak: ["Value"] },
    Barbeque: { strong: ["Food", "Value"], also: ["Menu variety"], weak: ["Service"] },
    Sandwiches: { strong: ["Value", "Food"], also: ["Service"], weak: ["Ambiance"] },
    Korean: { strong: ["Food", "Menu variety"], also: ["Service"], weak: ["Value"] },
  };

  const DEFAULT_PROFILE = { strong: ["Food", "Service"], also: ["Ambiance"], weak: ["Value"] };

  /** Stable per-restaurant seed, so re-seeding doesn't reshuffle every page. */
  function seedOf(text) {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  /**
   * A believable review spread for one restaurant, as a flat list of
   * { best, worst, stars }.
   *
   * The star ratings are built to average back to the restaurant's own real
   * Yelp/Google rating rather than to an invented number — that average is
   * what src/lib/aspectScores.ts uses as the baseline every aspect moves away
   * from, so the whole block stays anchored to the one figure here that came
   * from outside.
   */
  function generateReviews(restaurant) {
    const profile = CUISINE_PROFILE[restaurant.cuisine] ?? DEFAULT_PROFILE;
    const seed = seedOf(`${restaurant.id}:${restaurant.name}`);
    const count = 9 + (seed % 5); // 9-13 reviews

    // Start everyone at 4 stars, then move as many as it takes to 5 (or down
    // to 3) for the mean to land on the real rating.
    const stars = Array(count).fill(4);
    let remainder = Math.round(restaurant.rating * count) - 4 * count;
    for (let i = 0; remainder > 0 && i < count; i++, remainder--) stars[i] = 5;
    for (let i = count - 1; remainder < 0 && i >= 0; i--, remainder++) stars[i] = 3;

    // Praise is drawn from a weighted bag; the leading strength comes up
    // roughly twice as often as the second, which is what makes one aspect
    // clearly top the list instead of a flat tie.
    const bag = [];
    profile.strong.forEach((aspect, i) => {
      for (let n = 0; n < (i === 0 ? 3 : 2); n++) bag.push(aspect);
    });
    for (const aspect of profile.also ?? []) bag.push(aspect);

    /* Whatever the profile didn't name gets a single nod each, so a page rates
       the whole vocabulary instead of leaving two columns blank. One vote is
       the lightest touch that still counts as a signal: damping keeps it a
       hair above the overall rating, which reads as "came up once, nobody
       complained" — not as a strength.

       `weak` is deliberately NOT filled in here. It reaches the page through
       the faults below, which is the honest way for a category to show up
       low rather than being praised once and faulted three times. */
    const named = new Set([...profile.strong, ...(profile.also ?? []), ...profile.weak]);
    for (const aspect of BEST_AT_LABELS) if (!named.has(aspect)) bag.push(aspect);

    /* The generator relies on `count >= bag.length` to guarantee every entry
       is drawn — `best` walks consecutive indices, so a bag longer than the
       review count would silently drop whichever aspects fall off the end. */
    if (bag.length > count) {
      throw new Error(
        `${restaurant.name}: ${bag.length} praise slots but only ${count} reviews — ` +
          `some categories would never be voted on.`,
      );
    }

    // A well-rated place collects fewer complaints. They attach to the lowest
    // -starred reviews, since that's who was disappointed.
    const faults = Math.max(1, Math.round(count * (4.6 - restaurant.rating) * 0.5));

    return stars.map((rating, i) => {
      const best = bag[(i + seed) % bag.length];
      let worst = null;
      if (i >= count - faults) {
        const weak = profile.weak;
        worst = weak[(i + seed) % weak.length];
        // A review can't call the same aspect both the best thing and the
        // letdown — and post_aspect_votes is keyed on (post_id, aspect), so
        // the second row would be dropped anyway.
        if (worst === best) worst = weak.find((w) => w !== best) ?? null;
      }
      return { best, worst, stars: rating };
    });
  }

  /** Expands the hand-written [best, worst, stars, count] tuples to the same
      flat shape the generator returns. */
  function expand(verdicts) {
    return verdicts.flatMap(([best, worst, stars, count]) =>
      Array.from({ length: count }, () => ({ best, worst, stars })),
    );
  }

  const handWritten = new Map(
    HAND_WRITTEN.map((entry) => [entry.restaurant, expand(entry.verdicts)]),
  );

  /* Every restaurant gets reviews — the aspect block is part of what a
     restaurant page is, and 32 of the 36 pages were rendering without one. */
  const ASPECT_REVIEWS = restaurants.map((restaurant) => ({
    restaurant: restaurant.name,
    reviews: handWritten.get(restaurant.name) ?? generateReviews(restaurant),
  }));

  /*
   * Deliberately uneven: a flat round-robin across ~400 reviews hands every
   * demo eater the same number of 10-point awards and flattens the leaderboard
   * the HISTORY block below is shaping.
   */
  const REVIEW_AUTHORS = [
    "diego", "maya", "diego", "ben", "priya", "maya",
    "diego", "sam", "priya", "maya", "ben", "diego",
  ];

  let reviewSeq = 0;
  for (const entry of ASPECT_REVIEWS) {
    const restaurant = findRestaurant(entry.restaurant);
    // Per-restaurant caption counters, so a page's comment rail cycles through
    // the whole pool before it repeats a line.
    const said = {};
    const pick = (pool, key) => {
      const n = said[key] ?? 0;
      said[key] = n + 1;
      return pool[n % pool.length];
    };

    /* One restaurant's reviews go in together. Each review is still ordered
       internally — the vote rows reference the post — but 36 batches instead
       of ~1,400 serial round trips is the difference between a seed that takes
       seconds and one that takes minutes. */
    const writes = entry.reviews.map(({ best, worst, stars }) => {
      const author = REVIEW_AUTHORS[reviewSeq % REVIEW_AUTHORS.length];
      const hours = 6 + reviewSeq * 3;
      const postId = randomUUID();
      const createdAt = hoursAgo(hours);
      reviewSeq++;

      const caption = [
        pick(PRAISE[best], `+${best}`),
        worst ? pick(GRIPE[worst], `-${worst}`) : null,
      ]
        .filter(Boolean)
        .join(" ");

      return (async () => {
        await sql`
          INSERT INTO posts (id, user_id, text, restaurant, restaurant_id, restaurant_lat,
                             restaurant_lng, rating, rating_kind, vibe, photos_public, created_at)
          VALUES (${postId}, ${ids[author]}, ${caption},
                  ${entry.restaurant}, ${restaurant.id}, ${restaurant.lat}, ${restaurant.lng},
                  ${stars}, 'restaurant', ${best}, true, ${createdAt.toISOString()})
        `;
        await sql`
          INSERT INTO post_aspect_votes (post_id, aspect, sentiment)
          VALUES (${postId}, ${best}, 'praise') ON CONFLICT DO NOTHING
        `;
        if (worst) {
          await sql`
            INSERT INTO post_aspect_votes (post_id, aspect, sentiment)
            VALUES (${postId}, ${worst}, 'fault') ON CONFLICT DO NOTHING
          `;
        }
        await award(author, 10, `post:${postId}`, createdAt);
      })();
    });
    await Promise.all(writes);
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

  // Everyone is mutual friends with Maya and Diego, so opening the demo and
  // switching to the Friends tab shows something rather than the empty state.
  // friendships has no direction, but its rows are stored under a canonical
  // (user_a < user_b) ordering, same as acceptFriendRequest in lib/db.ts.
  for (const u of USERS) {
    for (const target of ["maya", "diego"]) {
      if (u.key === target) continue;
      const [a, b] = ids[u.key] < ids[target] ? [ids[u.key], ids[target]] : [ids[target], ids[u.key]];
      await sql`
        INSERT INTO friendships (user_a, user_b)
        VALUES (${a}, ${b}) ON CONFLICT DO NOTHING
      `;
    }
  }

  /*
   * Friend every real account on this database with Maya, Diego and Priya, so
   * the Friends tab has something in it the moment you sign in.
   *
   * This lives in the seed rather than a one-off script because the DELETE at
   * the top of main() drops the demo users, and friendships cascade with
   * them — so any friendship made by hand disappears on the next re-seed and
   * the tab silently goes empty again. Dev convenience only: it assumes every
   * non-demo account on this database is yours.
   */
  const realUsers = await sql`
    SELECT id FROM users WHERE email NOT LIKE '%@demo.platemaps.app'
  `;
  for (const real of realUsers) {
    for (const key of ["maya", "diego", "priya"]) {
      const [a, b] = real.id < ids[key] ? [real.id, ids[key]] : [ids[key], real.id];
      await sql`
        INSERT INTO friendships (user_a, user_b) VALUES (${a}, ${b}) ON CONFLICT DO NOTHING
      `;
    }
  }

  console.log(
    `Seeded ${USERS.length} demo eaters, ${POSTS.length} plates and ${reviewSeq} restaurant ` +
      `reviews across ${ASPECT_REVIEWS.length} places, and friended ${realUsers.length} ` +
      `real account(s) with Maya, Diego and Priya.`,
  );
}

main();

