/*
 * Asserts the dish-level picks in "Your taste" (src/lib/dishTaste.ts) and the
 * lines the feature holds: the pill, the See all link and the cuisine chip row
 * are gone for the accounts on lib/forMeGate.ts, and everyone else renders what
 * origin/main ships.
 *
 *   npm run forme:check
 *
 * Three layers, no test framework (same shape as taste:check):
 *  1. A synthetic corpus of 200 places with menus: a dish match, the places
 *     that must never come back, diversity, a higher rating ranking higher,
 *     neutral with too little data, and a reason that says only what is true.
 *  2. The source, pinned: no For me route, pill, link or chip row for the
 *     access path, and the private route stays private.
 *  3. A child render (check-forme-render.cts) of both Your taste sections for
 *     every viewer, against origin/main's button classes.
 * Nothing here reads the database or prints a secret.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DISH_TASTE, buildDishIndex, clipWords, dishPickLog, displayDish, passesFloor, rankDishes, termsOf } from "../src/lib/dishTaste.ts";
import { evidenceOf } from "../src/lib/tasteEvidence.ts";
import {
  BIT_DEMOTED, BIT_DESSERT, FA, FLAVOR_ATTRS, N_FLAVOR, anchorAttr, buildFlavorProfile, claimsOf, flavorFit, gradeOf, mergeMasks,
  captionSours, nameEvidence, tagCaption, tagDish,
} from "../src/lib/flavor.ts";
import { EMPTY_PREFS } from "../src/lib/taste.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = (p) => readFileSync(root + p, "utf8");
let n = 0;
const ok = (name, fn) => {
  try {
    fn();
    n++;
  } catch (err) {
    console.error(`forme:check FAILED: ${name}`);
    throw err;
  }
};

/* ---------- 1. the recommender ---------- */

const NOW = Date.UTC(2026, 10, 1);
const DAY = 86_400_000;
const ALL = 200;
const restaurants = [];
const dishes = [];
const place = (id, name, cuisine, rating, reviews, menu, lat = 32.72, lng = -117.16) => {
  restaurants.push({
    id, name, cuisine, cuisineTags: "", neighborhood: "North Park", distance: "1.0 mi", hours: null,
    lat, lng, rating, reviewCount: reviews, priceBand: null,
  });
  for (const m of menu) dishes.push({ rid: id, name: m[0], description: m[1] ?? null, price: m[2] ?? null, section: m[3] ?? null });
};

// The viewer's three places, and what they ordered there.
place("hA", "Honey Hut", "American", 4.5, 600, [["Hot Honey Chicken", "fried thigh, hot honey, pickles", "$14"]]);
place("hB", "Noodle Tomo", "Japanese", 4.4, 500, [["Mushroom Kimchi Ramen", null, "$17"], ["Spicy Miso Ramen"]]);
place("hC", "Better Beans", "Coffee & Tea", 4.6, 700, [["Banana Matcha", null, "$7", "Drinks"]]);
// Hot honey: two good, one weak (rated low), the three that must stay out, and a far one.
place("m1", "Nashville Stand", "American", 4.8, 900, [["Hot Honey Chicken Sandwich", null, "$15"]]);
place("m2", "Poor Fork", "American", 3.0, 80, [["Hot Honey Chicken Plate", null, "$13"]]);
place("m3", "Hive Bar", "American", 4.4, 900, [["Hot Honey Chicken Plate", null, "$12"]]);
place("been", "Been Burger", "American", 4.7, 900, [["Hot Honey Chicken Burger", null, "$13"]]);
place("hid", "Hidden Hive", "American", 4.7, 900, [["Hot Honey Chicken Wrap", null, "$13"]]);
place("branch", "Honey Hut East", "American", 4.7, 900, [["Hot Honey Chicken Basket", null, "$13"]]);
place("far", "Faraway Fried", "American", 4.9, 900, [["Hot Honey Chicken Tenders", null, "$13"]], 33.9, -118.4);
// Ramen: a real match, and a place that only shares the word "ramen".
place("m4", "Tonkotsu Lab", "Japanese", 4.6, 700, [["Kimchi Ramen Bowl", null, "$16"]]);
place("m5", "Ramen House", "Japanese", 4.7, 700, [["Plain Ramen"]]);
place("r6", "Noodle Bar Six", "Japanese", 4.5, 300, [["Tonkotsu Ramen"]]);
place("r7", "Noodle Bar Seven", "Japanese", 4.5, 300, [["Shoyu Ramen"], ["Kimchi Fried Rice"]]);
// Drinks: a coffee shop matches the matcha, a taqueria must not.
place("m6", "Bean There", "Coffee & Tea", 4.7, 800, [["Matcha Banana Latte", null, "$7", "Drinks"]]);
place("m7", "Casa Verde", "Mexican", 4.7, 800, [["Banana Matcha", null, "$6", "Drinks"]]);
// American places with nothing in common with the posts: the cuisine-only filler.
for (let i = 0; i < 10; i++) place(`am${i}`, `Grill ${String.fromCharCode(97 + i)}${i}`, "American", 4.4 + (i % 3) / 10, 400, [[`Dish${i}am`]]);
// Everything else is menu noise that no term survives.
for (let i = restaurants.length; i < ALL; i++) place(`f${i}`, `Filler ${i}`, i % 2 ? "Thai" : "Mexican", 4.0, 200, [[`Dish${i}xx`]]);

const index = buildDishIndex(restaurants.map((r) => r.id), dishes, []);
const post = (restaurantId, dishName, daysAgo = 10, extra = {}) => ({
  restaurantId, dishName, at: NOW - daysAgo * DAY, price: null, dishDescription: null, dishSection: null, ...extra,
});
const POSTS = [
  post("hA", "Hot Honey Chicken", 10, { dishDescription: "fried thigh, hot honey, pickles", price: "$14" }),
  post("hB", "Mushroom Kimchi Ramen", 20, { price: "$17" }),
  post("hC", "Banana Matcha", 5, { dishSection: "Drinks", price: "$7" }),
];
const rank = (over = {}) =>
  rankDishes({ index, restaurants, plates: {}, ratingMean: 4.3, posts: POSTS, prefs: EMPTY_PREFS, now: NOW, ...over });
const ids = (picks) => picks.map((p) => p.restaurant.id);

ok("terms: words and pairs, stemmed, no stop words", () => {
  const t = termsOf("Hot Honey Chicken Wings & the Fries");
  for (const want of ["hot", "honey", "hot honey", "honey chicken", "wing"]) assert.ok(t.includes(want), want);
  assert.ok(!t.includes("the"));
});

ok("a clipped item keeps whole words and loses only the tail", () => {
  assert.equal(clipWords("Crispy Hot Honey Chicken Sandwich Combo", 30), "Crispy Hot Honey Chicken…");
  assert.equal(clipWords("Koji-Marinated Chicken Wings Basket", 28), "Koji-Marinated Chicken…");
  assert.equal(clipWords("Pad Thai", 20), "Pad Thai");
  assert.equal(displayDish("BABY BACK RIB TICKLER®"), "Baby Back Rib Tickler");
  assert.equal(displayDish("Seafood Bucatini"), "Seafood Bucatini");
});

ok("a dish the viewer posted finds the same dish elsewhere", () => {
  const picks = rank();
  assert.ok(picks, "enough seeds to rank");
  const got = ids(picks);
  assert.ok(got.includes("m1"), "the hot honey sandwich is found");
  assert.equal(picks.find((p) => p.restaurant.id === "m4")?.reason.kind, "dish", "the kimchi ramen is found");
  assert.ok(got.includes("m6"), "the matcha latte is found at a coffee shop");
  const m1 = picks.find((p) => p.restaurant.id === "m1");
  assert.equal(m1.reason.kind, "dish");
  assert.match(m1.reason.text, /Hot Honey Chicken Sandwich/);
  assert.match(m1.reason.text, /your Hot Honey Chicken at Honey Hut/);
});

ok("a shared common word alone is not a match", () => {
  const m5 = rank().find((p) => p.restaurant.id === "m5");
  assert.ok(!m5 || m5.reason.kind === "cuisine", "Plain Ramen shares only 'ramen'");
});

ok("exclusions: posted, been, hidden, their chains, and the far away", () => {
  const picks = rank({ prefs: { ...EMPTY_PREFS, been: ["been"], hidden: ["hid"] } });
  const got = new Set(ids(picks));
  for (const id of ["hA", "hB", "hC", "been", "hid", "branch", "far"]) assert.ok(!got.has(id), `${id} leaked`);
});

ok("a poorly rated place is not recommended on a dish alone", () => {
  assert.ok(!ids(rank()).includes("m2"));
});

ok("quality floor: rating above 4.0 on 5+ reviews, never backfilled below it", () => {
  const rs = [];
  const ds = [];
  const add = (id, rating, reviews, cuisine, dish) => {
    rs.push({
      id, name: "Floor " + id, cuisine, cuisineTags: "", neighborhood: "North Park", distance: "1.0 mi", hours: null,
      lat: 32.72, lng: -117.16, rating, reviewCount: reviews, priceBand: null,
    });
    ds.push({ rid: id, name: dish });
  };
  add("hA", 4.5, 600, "American", "Hot Honey Chicken");
  add("hB", 4.4, 500, "Japanese", "Mushroom Kimchi Ramen");
  add("hC", 4.6, 700, "Coffee & Tea", "Banana Matcha");
  add("ok1", 4.8, 900, "American", "Hot Honey Chicken Sandwich");
  add("small", 4.6, 6, "Japanese", "Kimchi Ramen Bowl");
  add("few", 5.0, 4, "Coffee & Tea", "Matcha Banana Latte");
  add("edge", 4.0, 800, "American", "Hot Honey Chicken Wrap");
  add("low", 3.9, 800, "Japanese", "Spicy Kimchi Ramen");
  add("none", null, null, "American", "Hot Honey Chicken Basket");
  add("cuis", 4.0, 300, "American", "Dish9zz");
  const idx = buildDishIndex(rs.map((r) => r.id), ds, []);
  const got = ids(rankDishes({ index: idx, restaurants: rs, plates: {}, ratingMean: 4.3, posts: POSTS, prefs: EMPTY_PREFS, now: NOW }));
  assert.ok(got.includes("ok1"), "a well-rated match stays");
  assert.ok(got.includes("small"), "4.6 on 6 reviews is included");
  for (const id of ["few", "edge", "low", "none", "cuis"]) assert.ok(!got.includes(id), id + " is under the floor");
  assert.ok(got.length < 12, "the row is shorter rather than backfilled");
  assert.equal(DISH_TASTE.pickRatingAbove, 4.0);
  assert.equal(DISH_TASTE.pickMinReviews, 5);
});

ok("higher-rated ranks higher at equal match", () => {
  const got = ids(rank({ prefs: { ...EMPTY_PREFS, been: ["been"], hidden: ["hid"] } }));
  assert.ok(got.includes("m3") && got.indexOf("m1") < got.indexOf("m3"), "4.8 before 4.4");
});

ok("the drink seed never picks a restaurant that is not a drinks place", () => {
  assert.ok(!ids(rank()).includes("m7"));
});

ok("diversity: one per chain, few per cuisine, few that share a word", () => {
  const picks = rank();
  const names = picks.map((p) => p.restaurant.name.split(" ").slice(0, 2).join(" ").toLowerCase() + p.restaurant.cuisine);
  assert.equal(new Set(names).size, picks.length, "a chain twice");
  const per = {};
  for (const p of picks) per[p.restaurant.cuisine] = (per[p.restaurant.cuisine] ?? 0) + 1;
  for (const [c, k] of Object.entries(per)) assert.ok(k <= DISH_TASTE.perCuisine, `${c} has ${k}`);
  const honey = picks.filter((p) => p.reason.kind === "dish" && /honey/i.test(p.reason.text.split(" — ")[0]));
  assert.ok(honey.length <= DISH_TASTE.perSeed, `${honey.length} hot honey picks`);
  assert.ok(picks.length <= DISH_TASTE.limit);
});

ok("the cuisine-only filler says it is cuisine, and nothing more", () => {
  const filler = rank().filter((p) => p.reason.kind === "cuisine");
  for (const p of filler) assert.equal(p.reason.text, `${p.restaurant.cuisine}, a cuisine you eat`);
});

ok("neutral: too few posted dishes, or none named, ranks nothing", () => {
  assert.equal(rank({ posts: POSTS.slice(0, 2) }), null);
  assert.equal(rank({ posts: [] }), null);
  const nameless = POSTS.map((p) => ({ ...p, dishName: null }));
  assert.equal(rank({ posts: nameless }), null);
  assert.equal(rank({ posts: [...POSTS.slice(0, 2), ...nameless] }), null);
});

ok("reason truthfulness: every line names a real dish and a real post", () => {
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const menus = new Map();
  for (const d of dishes) menus.set(d.rid, [...(menus.get(d.rid) ?? []), d.name]);
  for (const p of rank()) {
    const { kind, text, short } = p.reason;
    assert.ok(text.length <= DISH_TASTE.textChars && short.length <= DISH_TASTE.shortChars, "length caps");
    assert.ok(!/[★☆]|\d\.\d\/|\bstars?\b/i.test(text), "no star or score in a reason");
    if (kind === "dish") {
      const item = text.split(" — ")[0];
      assert.ok(menus.get(p.restaurant.id).some((m) => m.startsWith(item.replace(/…$/, ""))), `"${item}" is not on ${p.restaurant.name}'s menu`);
      const seed = /your (.+) at (.+)$/.exec(text);
      assert.ok(seed, text);
      assert.ok(POSTS.some((q) => q.dishName === seed[1] && byId.get(q.restaurantId).name === seed[2]), `no post for "${seed[1]}"`);
    } else if (kind === "cuisine") {
      assert.ok(POSTS.some((q) => byId.get(q.restaurantId).cuisine === p.restaurant.cuisine), "a cuisine the viewer never posted");
    }
  }
});

ok("repeatable, and the viewer's other signals are not inputs", () => {
  assert.deepEqual(ids(rank()), ids(rank()));
  const extra = { liked: ["m3"], hearts: ["m1"], upvoted: ["m1"], saved: ["m1"] };
  assert.deepEqual(ids(rank(extra)), ids(rank()), "unknown inputs change nothing");
  const code = src("src/lib/dishTaste.ts").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  assert.ok(!/\b(votes?|hearts?|upvotes?|likers?|liked|saves?|saved)\b/i.test(code), "dishTaste reads only posts, prefs and the corpus");
});

/* ---------- 1b. seeds weighted by the viewer's own rating ---------- */

const W = (spec, profiles = []) => {
  const rs = [];
  const ds = [];
  for (const [id, name, cuisine, rating, menu, lat = 32.72, lng = -117.16] of spec) {
    rs.push({
      id, name, cuisine, cuisineTags: "", neighborhood: "North Park", distance: "1.0 mi", hours: null,
      lat, lng, rating, reviewCount: 600, priceBand: null,
    });
    for (const m of menu) ds.push({ rid: id, name: m[0], description: m[1] ?? null, price: null, section: m[2] ?? null });
  }
  // Each menu line also on a far-away place: terms need a few places behind them to count, and these are never picks.
  spec.forEach(([, , , , menu], k) => {
    menu.forEach((m, j) => {
      rs.push({
        id: `pad${k}_${j}`, name: `Pad ${k} ${j}`, cuisine: "Fusion", cuisineTags: "", neighborhood: "X", distance: "1.0 mi", hours: null,
        lat: 33.9, lng: -118.4, rating: 4.0, reviewCount: 200, priceBand: null,
      });
      ds.push({ rid: `pad${k}_${j}`, name: m[0], description: m[1] ?? null, price: null, section: m[2] ?? null });
    });
  });
  for (let i = 0; i < 160; i++) {
    const id = `z${i}`;
    rs.push({
      id, name: `Zed ${i}`, cuisine: i % 2 ? "Thai" : "Mexican", cuisineTags: "", neighborhood: "North Park",
      distance: "1.0 mi", hours: null, lat: 32.72, lng: -117.16, rating: 4.0, reviewCount: 200, priceBand: null,
    });
    ds.push({ rid: id, name: `Dish${i}zz` });
  }
  const idx = buildDishIndex(rs.map((r) => r.id), ds, profiles);
  return (posts, over = {}) =>
    rankDishes({ index: idx, restaurants: rs, plates: {}, ratingMean: 4.3, posts, prefs: EMPTY_PREFS, now: NOW, ...over });
};
const rated = (rid, dish, rating, extra = {}) => post(rid, dish, 10, { rating, ...extra });

const SEEDS3 = [
  ["hA", "Honey Hut", "American", 4.5, [["Hot Honey Chicken"]]],
  ["hB", "Noodle Tomo", "Japanese", 4.4, [["Mushroom Kimchi Ramen"]]],
  ["hC", "Better Beans", "Coffee & Tea", 4.6, [["Banana Matcha", null, "Drinks"]]],
  ["hD", "Taco Stop", "Mexican", 4.5, [["Brisket Tacos"]]],
];
const RATED = [
  rated("hA", "Hot Honey Chicken", 95),
  rated("hB", "Mushroom Kimchi Ramen", 60),
  rated("hC", "Banana Matcha", 80),
  rated("hD", "Brisket Tacos", 40),
];

ok("evidence: only a low rating counts against; the rest are likes, the best-rated strongest; unrated reads as their average", () => {
  const at = Date.UTC(2026, 0, 5);
  const E = (ratings) => evidenceOf(ratings.map((rating, i) => ({ restaurantId: "e" + i, at, rating }))).e;
  const w = E([95, 60, 80, 40, null, 70]);
  assert.ok(w[3] < 0, "under 50 counts against");
  assert.ok(w.every((x, i) => i === 3 || x > 0), "everything else is a like");
  assert.equal(Math.max(...w), w[0], "the highest-rated weighs most");
  assert.ok(w[1] < w[5] && w[5] < w[2] && w[2] < w[0], "monotone");
  assert.ok(w[1] < w[4] && w[4] < w[2], "unrated sits between their low and high likes");
  const flat = E([70, 70]);
  assert.ok(flat[0] > 0 && flat[0] === flat[1], "no spread, no preference");
  const none = E([undefined, null]);
  assert.ok(none[0] > 0 && none[0] === none[1], "nothing rated, all equal likes");
  assert.ok(E([90, 90, 90, 90, 62])[4] < 0, "under 70 and well below their own usual counts against");
  assert.ok(E([72, 70, 66, 64, 62])[4] > 0, "the same 62 from someone who rates everything about there is still a like");
});

ok("a high-rated seed outranks an equal match from a low-rated one", () => {
  const rank2 = W([...SEEDS3,
    ["c1", "Nashville Stand", "American", 4.5, [["Hot Honey Chicken Sandwich"]]],
    ["c2", "Tonkotsu Lab", "Japanese", 4.5, [["Kimchi Ramen Bowl"]]],
  ]);
  const got = ids(rank2(RATED));
  assert.ok(got.includes("c1") && got.includes("c2"), "both found");
  assert.ok(got.indexOf("c1") < got.indexOf("c2"), "the 95 leads the 60");
});

ok("a low-rated seed still yields a pick when nothing else contests it", () => {
  const rank2 = W([...SEEDS3, ["c2", "Tonkotsu Lab", "Japanese", 4.5, [["Kimchi Ramen Bowl"]]]]);
  const c2 = rank2(RATED).find((p) => p.restaurant.id === "c2");
  assert.ok(c2, "the 60-rated ramen still seeds a pick");
  assert.match(c2.reason.text, /your Mushroom Kimchi Ramen at Noodle Tomo/);
});

ok("a dish rated under 50 seeds nothing; an unrated one still does", () => {
  const rank2 = W([...SEEDS3,
    ["c3", "Smoke House", "Mexican", 4.7, [["Brisket Tacos Plate"]]],
    ["c1", "Nashville Stand", "American", 4.5, [["Hot Honey Chicken Sandwich"]]],
  ]);
  const picks = rank2(RATED);
  assert.ok(!picks.some((p) => /Brisket/.test(p.reason.text) && p.reason.kind === "dish"), "the 40-rated brisket seeds no dish pick");
  const unrated = RATED.map((p) => (p.dishName === "Hot Honey Chicken" ? { ...p, rating: null } : p));
  assert.ok(ids(rank2(unrated)).includes("c1"), "an unrated post still seeds");
});

ok("a dish rated low shades the lines that carry its name; a middling rating, or a liked copy of the dish, does not", () => {
  const rank2 = W([
    ["hA", "Sushi Uno", "Japanese", 4.5, [["California Roll"]]],
    ["hB", "Noodle Tomo", "Japanese", 4.4, [["Mushroom Kimchi Ramen"]]],
    ["hC", "Better Beans", "Coffee & Tea", 4.6, [["Banana Matcha", null, "Drinks"]]],
    ["hD", "Sushi Stop", "Japanese", 4.5, [["Spicy Tuna Roll"], ["Garlic Edamame"]]],
    ["hE", "Sushi Tres", "Japanese", 4.5, [["Spicy Tuna Roll"]]],
    ["cX", "Roll House", "Japanese", 4.6, [["Spicy Tuna California Roll"]]],
    ["cY", "Maki Bar", "Japanese", 4.6, [["California Roll Combo"]]],
    ["cZ", "Ramen Lab", "Japanese", 4.6, [["Kimchi Ramen Bowl"]]],
  ]);
  const liked = [rated("hA", "California Roll", 95), rated("hB", "Mushroom Kimchi Ramen", 85), rated("hC", "Banana Matcha", 90)];
  // Both lines stand on the liked California Roll; only cX's also carries the name of the other dish.
  const scores = (extra) => {
    const out = rank2([...liked, ...extra]);
    const s = (id) => {
      const p = out.find((q) => q.restaurant.id === id);
      assert.ok(p && p.reason.kind === "dish", id + " is a dish pick");
      return dishPickLog(p).score;
    };
    return { x: s("cX"), y: s("cY") };
  };
  const level = (s) => Math.abs(s.x - s.y) < 0.5;
  // The control rates another dish at the same place just as low, so the place itself counts the same in both.
  for (const low of [40, 62]) {
    const other = scores([rated("hD", "Garlic Edamame", low)]);
    const same = scores([rated("hD", "Spicy Tuna Roll", low)]);
    assert.ok(level(other), "a " + low + " on another dish leaves the two lines level");
    assert.ok(Math.abs(same.y - other.y) < 0.5, "the line without the low dish's name is untouched");
    assert.ok(same.x < same.y * 0.8, "a " + low + " on the dish shades the line that carries its name");
  }
  assert.ok(level(scores([rated("hD", "Spicy Tuna Roll", 75)])), "a middling rating shades nothing");
  assert.ok(
    level(scores([rated("hD", "Spicy Tuna Roll", 40), rated("hE", "Spicy Tuna Roll", 92)])),
    "a liked copy of the same dish lifts the shade",
  );
});

ok("a match needs the dish's head noun, not a modifier alone", () => {
  const rank2 = W([
    ["hA", "Mkutano", "African", 4.5, [["Koji-Marinated Chicken Wings"]]],
    ["hB", "Noodle Tomo", "Japanese", 4.4, [["Mushroom Kimchi Ramen"]]],
    ["hC", "Better Beans", "Coffee & Tea", 4.6, [["Banana Matcha", null, "Drinks"]]],
    ["bad", "Koji Table", "Japanese", 4.7, [["Koji Harami"]]],
    ["good", "Koji Wing Bar", "American", 4.6, [["Koji Chicken Wings"]]],
  ]);
  const posts = [rated("hA", "Koji-Marinated Chicken Wings", 90), rated("hB", "Mushroom Kimchi Ramen", 70), rated("hC", "Banana Matcha", 80)];
  const picks = rank2(posts);
  const bad = picks.find((p) => p.restaurant.id === "bad");
  assert.ok(!bad || bad.reason.kind !== "dish", "Koji Harami is not a chicken wing");
  assert.equal(picks.find((p) => p.restaurant.id === "good")?.reason.kind, "dish", "Koji Chicken Wings is");
});

ok("one seed fills at most one of the first six and two of the first twelve, and never two in a row", () => {
  const spec = [...SEEDS3];
  for (let i = 0; i < 14; i++) spec.push([`h${i}`, `Honey Place ${i}`, i % 3 ? "American" : i % 2 ? "Southern" : "Fusion", 4.7, [[`Hot Honey Chicken Style${i}`]]]);
  spec.push(["r1", "Ramen Ichi", "Japanese", 4.4, [["Kimchi Ramen Bowl"]]], ["r2", "Matcha Mori", "Coffee & Tea", 4.5, [["Matcha Banana Latte", null, "Drinks"]]]);
  const picks = W(spec)(RATED);
  const seedOf = (p) => /your (.+?) at /.exec(p.reason.text)?.[1] ?? "";
  const count = (list, s) => list.filter((p) => seedOf(p) === s).length;
  for (const s of new Set(picks.map(seedOf).filter(Boolean))) {
    assert.ok(count(picks.slice(0, DISH_TASTE.top), s) <= DISH_TASTE.perSeedTop, `${s} twice in the first ${DISH_TASTE.top}`);
    assert.ok(count(picks.slice(0, 12), s) <= DISH_TASTE.perSeed, `${s} more than ${DISH_TASTE.perSeed} in the first 12`);
  }
  for (let i = 1; i < picks.length; i++) {
    const [a, b] = [seedOf(picks[i - 1]), seedOf(picks[i])];
    assert.ok(!a || a !== b, `${a} twice in a row`);
  }
});

ok("a dish nobody else serves falls back to what its place is known for", () => {
  const profiles = [{ rid: "hP", styles: [], dishTypes: ["ribs", "bbq"], median: null }, { rid: "p1", styles: [], dishTypes: ["ribs", "bbq"], median: null }];
  const rank2 = W([...SEEDS3,
    ["hP", "Phil's BBQ", "American", 4.6, [["Baby Back Rib Tickler"]]],
    ["p1", "Smokey Joe", "American", 4.7, [["Smoked Ribs Plate"]]],
  ], profiles);
  const p1 = rank2([...RATED, rated("hP", "Baby Back Rib Tickler", 85)]).find((p) => p.restaurant.id === "p1");
  assert.ok(p1 && p1.reason.kind !== "cuisine", "the ribs place is found through the BBQ place's types");
  assert.match(p1.reason.text, /Phil's BBQ/);
});

ok("a reason is a whole sentence: the place is never cut, only the item gives way", () => {
  const rank2 = W([...SEEDS3,
    ["c1", "Nashville Stand", "American", 4.5, [["Hot Honey Chicken Sandwich With Pickled Slaw And Extra Sauce On Brioche"]]],
  ]);
  const c1 = rank2([rated("hA", "Hot Honey Chicken", 95, { restaurantName: "sweetgreen" }), ...RATED.slice(1)]).find((p) => p.restaurant.id === "c1");
  assert.ok(c1.reason.short.length <= DISH_TASTE.shortChars);
  assert.match(c1.reason.short, /like your Hot Honey Chicken at Honey Hut$/, c1.reason.short);
});

/* ---------- 1c. dish families: a favourite pizza, burrito, wings ... seeds picks from places that specialise in it ---------- */

const prof = (rid, mainCuisine, styles, dishTypes, signatures = [], service = null) => ({ rid, styles, dishTypes, median: null, signatures, service, mainCuisine });
const FAM_SPEC = [
  ["sP", "Prince Street", "Pizza", 4.6, [["The Naughty Pie"]]],
  ["sB", "Eggies", "Breakfast & Brunch", 4.6, [["Burrito"]]],
  ["sW", "Mkutano", "Chicken", 4.6, [["Koji-Marinated Chicken Wings"]]],
  ["sH", "Hot Chickz", "Chicken", 4.6, [["Hot Honey Chickz Combo"]]],
  ["sS", "Cannonball", "Japanese", 4.6, [["House Roll"]]],
  ["sC", "Vin De Syrah", "American", 4.6, [["Syrah Caesar"]]],
  ["sO", "Pho Hoa", "Vietnamese", 4.6, [["Number 1"]]],
  ["sR", "Phils BBQ", "BBQ", 4.6, [["Baby Back Rib Tickler"]]],
  ["sM", "Better Buzz", "Coffee & Tea", 4.6, [["Banana matcha", null, "Drinks"]]],
  ["sU", "Marisi", "Italian", 4.6, [["Seafood Bucatini"]]],
  // candidates
  ["pz1", "Slice Shop", "Pizza", 4.8, [["Spicy Vodka Pie"], ["Bucatini Pomodoro"]]],
  ["pz2", "Brick Oven Pizza", "Pizza", 4.7, [["Margherita Pizza"]]],
  ["pz3", "Corner Pizzeria", "Pizza", 4.7, [["Pepperoni Pizza"]]],
  ["su1", "Wave Sushi", "Japanese", 4.8, [["Dragon Roll"], ["Salmon Nigiri"]]],
  ["su2", "Yasai", "Japanese", 4.9, [["Ramen Bowl"]]],
  ["ph1", "Pho Pasteur", "Vietnamese", 4.8, [["Pho Dac Biet"]]],
  ["ph2", "Pho Saigon", "Vietnamese", 4.7, [["Pho Tai"]]],
  ["wg1", "Wing Lab", "Chicken", 4.7, [["Garlic Parmesan Wings"]]],
  ["hc1", "Nash House", "Chicken", 4.7, [["Nashville Hot Chicken Sandwich"]]],
  ["sa1", "Green Bowl", "Salad", 4.7, [["Kale Caesar Salad"]]],
  ["bu1", "Burrito Barn", "Mexican", 4.6, [["Carne Asada Burrito"]]],
  ["bq1", "Smoke Pit", "BBQ", 4.6, [["Baby Back Ribs"]]],
  ["ma1", "Matcha Moon", "Coffee & Tea", 4.9, [["Banana Matcha Latte", null, "Drinks"]]],
  ["tp1", "Tap Room", "Bar", 4.9, [["Pizza Bites"]]],
];
const FAM_PROFILES = [
  prof("sP", "Pizza", ["ny-style", "slice shop"], ["pizza", "slices"], ["The Naughty Pie"]),
  prof("sB", "Breakfast & Brunch", ["breakfast"], ["breakfast burrito", "burrito"], ["Burrito"]),
  prof("sW", "Chicken", [], ["wings", "chicken"], ["Koji Wings"]),
  prof("sH", "Chicken", ["nashville"], ["hot chicken"], ["Hot Chickz Combo"]),
  prof("sS", "Japanese", ["sushi bar", "japanese fusion"], ["sushi", "rolls"], ["House Roll"]),
  prof("sC", "American", ["wine bar"], ["salad", "wine"], ["Syrah Caesar"]),
  prof("sO", "Vietnamese", [], ["pho", "noodle soup"], ["Pho Number 1"]),
  prof("sR", "BBQ", ["bbq"], ["ribs", "bbq"], ["Rib Tickler"]),
  prof("sM", "Coffee & Tea", [], ["matcha", "coffee"]),
  prof("sU", "Italian", [], ["pasta"]),
  prof("pz1", "Pizza", ["ny-style", "slice shop"], ["pizza", "slices"], ["Spicy Vodka Pie"]),
  prof("pz2", "Pizza", ["wood-fired"], ["pizza"], ["Margherita Pizza"]),
  prof("pz3", "Pizza", [], ["pizza"], ["Pepperoni Pizza"]),
  prof("su1", "Japanese", ["sushi bar"], ["sushi", "rolls"], ["Dragon Roll"]),
  prof("su2", "Japanese", ["japanese fusion"], ["ramen", "noodles"], ["Ramen Bowl"]),
  prof("ph1", "Vietnamese", [], ["pho"], ["Pho Dac Biet"]),
  prof("ph2", "Vietnamese", [], ["pho"], ["Pho Tai"]),
  prof("wg1", "Chicken", [], ["wings", "chicken"], ["Garlic Parmesan Wings"]),
  prof("hc1", "Chicken", ["nashville"], ["hot chicken"], ["Nashville Hot Chicken Sandwich"]),
  prof("sa1", "Salad", [], ["salad", "bowls"], ["Kale Caesar Salad"]),
  prof("bu1", "Mexican", [], ["burrito", "tacos"], ["Carne Asada Burrito"]),
  prof("bq1", "BBQ", ["bbq"], ["ribs", "bbq"], ["Baby Back Ribs"]),
  prof("ma1", "Coffee & Tea", [], ["matcha", "coffee"]),
  prof("tp1", "Bar", [], ["pizza", "bites"], ["Pizza Bites"], "bar"),
];
const FAM_POSTS = [
  rated("sP", "The Naughty Pie", 92),
  rated("sS", null, 96),
  rated("sC", "Syrah Caesar", 92),
  rated("sO", "Number 1", 90),
  rated("sW", "Koji-Marinated Chicken Wings", 90),
  rated("sH", "Hot Honey Chickz Combo", 90),
  rated("sB", "Burrito", 88),
  rated("sR", "Baby Back Rib Tickler", 85),
  rated("sM", "Banana matcha", 85),
  rated("sU", "Seafood Bucatini", 79),
];
const famPicks = W(FAM_SPEC, FAM_PROFILES)(FAM_POSTS);
const famIds = ids(famPicks);
const famOf = (p) => p.reason.text;

ok("(a) a favourite dish family seeds picks, named by the pick's own signature and the seed's style", () => {
  const pz = famPicks.find((p) => p.restaurant.id === "pz1");
  assert.ok(pz, "the NY-style pie place is picked");
  assert.match(pz.reason.text, /Spicy Vodka Pie/, pz.reason.text);
  assert.match(pz.reason.text, /NY-style like your (The )?Naughty Pie at Prince Street/, pz.reason.text);
  const su = famPicks.find((p) => p.restaurant.id === "su1");
  assert.ok(su && /like Cannonball|at Cannonball/.test(su.reason.text), "a dishless post seeds from its place's specialty");
  for (const id of ["ph1", "wg1", "hc1", "sa1", "bu1", "bq1"]) assert.ok(famIds.includes(id), `${id} is a family pick`);
});

ok("(b) the viewer's 90+ seeds fill most of the first six", () => {
  const six = famPicks.slice(0, 6).map(famOf).join(" | ");
  const high = (six.match(/Naughty Pie|Cannonball|Syrah Caesar|Number 1|Koji|Hot Honey Chickz/g) ?? []).length;
  assert.ok(high >= 5, `only ${high} of the first six come from a 90+ dish: ${six}`);
  assert.ok(!/Bucatini|Banana/.test(six), "the 79 and the drink do not lead");
});

ok("(c) one pick per dish family in the first six, two in twelve, two per cuisine in the first six", () => {
  const fam = (p) => (/Pie|Pizza/.test(p.reason.text) ? "pizza" : /Roll|Nigiri/.test(p.reason.text) ? "sushi" : /Pho/.test(p.reason.text) ? "pho" : /Wings/.test(p.reason.text) ? "wings" : /Hot Chicken|Nashville/.test(p.reason.text) ? "hot" : /Salad|Caesar/.test(p.reason.text) ? "salad" : /Burrito/.test(p.reason.text) ? "burrito" : /Ribs/.test(p.reason.text) ? "bbq" : "");
  const six = famPicks.slice(0, 6);
  for (const f of new Set(six.map(fam).filter(Boolean))) assert.equal(six.filter((p) => fam(p) === f).length, 1, `${f} twice in the first six`);
  const twelve = famPicks.slice(0, 12);
  for (const f of new Set(twelve.map(fam).filter(Boolean))) assert.ok(twelve.filter((p) => fam(p) === f).length <= 2, `${f} more than twice in twelve`);
  const cu = {};
  for (const p of six) cu[p.restaurant.cuisine] = (cu[p.restaurant.cuisine] ?? 0) + 1;
  assert.ok(Math.max(...Object.values(cu)) <= 2, "no cuisine more than twice in the first six");
});

ok("(d) drinks and bar bites wait behind real meals; a style with no shared dish family says nothing", () => {
  const at = (id) => famIds.indexOf(id);
  if (at("ma1") >= 0) assert.ok(at("ma1") >= 6, "the matcha place is not among the first six");
  if (at("tp1") >= 0) assert.ok(at("tp1") >= 6, "the bar bite is not among the first six");
  const yasai = famPicks.find((p) => p.restaurant.id === "su2");
  assert.ok(!yasai || !/Cannonball/.test(yasai.reason.text), "a fusion ramen shop is not picked as Cannonball's kin");
});

ok("(e) a family specialist is never picked for an off-family item", () => {
  const pz = famPicks.find((p) => p.restaurant.id === "pz1");
  assert.ok(pz && !/Bucatini/i.test(pz.reason.text), "the pizzeria is not recommended for its bucatini");
  assert.ok(!/Marisi/.test(pz.reason.text), "and not through the bucatini seed");
});

/* ---------- 1d. flavor: the tagger, the profile, the claims, and the picks that stand on them ---------- */

const fm = (name, desc = null, section = null, asian = false) => tagDish(name, desc, section, asian);
const fg = (mask, a) => gradeOf(mask, FA[a]);
const fclaims = (name, desc = null, section = null) => claimsOf(name, desc, section, false);
const flabels = (cs) => cs.map((c) => c.label);

ok("tagger: a flavor in the dish's own name is graded 2, is name evidence, and may be claimed", () => {
  for (const [name, section] of [
    ["Honey Buffalo Wings", "Wings"],
    ["Pop's Hot Honey", "Sandwiches"],
    ["Sweet & Spicy Brussels Sprouts", "Starters"],
    ["Mike's Hot Honey Pie", "Pizza"],
  ]) {
    const m = fm(name, null, section);
    assert.equal(fg(m, "sweetheat"), 2, `${name} is sweet heat`);
    assert.ok(nameEvidence(m, FA.sweetheat), `${name}: the name says so`);
    assert.ok(flabels(fclaims(name, null, section)).includes("sweet heat"), `${name} may claim sweet heat`);
  }
  assert.ok(flabels(fclaims("Carolina Brisket", "smoked brisket", "Mains")).includes("smoky"));
  assert.ok(flabels(fclaims("Crispy Chicken Bowl", "fried chicken over rice", "Bowls")).includes("crispy"), "crispy from the name");
  assert.ok(!flabels(fclaims("Pop's Hot Honey", "fried chicken sandwich", "Sandwiches")).includes("crispy"), "crispy from a description is never claimed");
});

ok("tagger: a choice list, a condiment or a side is one option, never the dish's own flavor", () => {
  for (const [name, desc, section] of [
    ["Dipper Fries", "choose your sauce: gochujang bbq, ranch, or honey mustard", "Sides"],
    ["Wings", "your choice of sauce (buffalo, bbq, sweet chili or garlic parmesan)", "Wings"],
    ["Turkey Club", "turkey, bacon, lettuce, tomato, sweet-hot mustard", "Sandwiches"],
    ["Thai Salad", "crisp greens, cucumber, peanuts, tossed with your choice of sweet chili or peanut dressing", "Salads"],
  ]) {
    const m = fm(name, desc, section);
    for (const a of ["spicy", "sweet", "sweetheat"]) assert.ok(fg(m, a) <= 1, `${name}: ${a} at most 1`);
    const bad = flabels(fclaims(name, desc, section)).filter((l) => l === "sweet heat" || l === "spicy" || l === "sweet");
    assert.deepEqual(bad, [], `${name} claims nothing it only offers`);
  }
  assert.ok(!flabels(fclaims("Wings", "comes with hot honey dip", "Wings")).includes("sweet heat"), "a dip on the side is not the dish");
  assert.ok(fg(fm("Wings", "comes with hot honey dip", "Wings"), "sweetheat") <= 1);
  assert.ok(fg(fm("Chicken Tenders", "served with a side of hot honey for dipping", "Kids"), "sweetheat") <= 1);
});

ok("tagger: a topping is the dish; a negation or an add-on says nothing; a slight kick is 1, a real one 2", () => {
  const desc = "Pepperoni pizza turned up with Mike's Hot Honey.";
  assert.equal(fg(fm("The Hot Shot", desc, "Pizza"), "sweetheat"), 2);
  const c = fclaims("The Hot Shot", desc, "Pizza");
  assert.equal(c[0].label, "sweet heat");
  assert.equal(c[0].quote, "mike's hot honey", "the claim quotes the dish's own words");
  assert.equal(fg(fm("Crispy Chicken Bowl", "fried chicken over rice, not spicy", "Bowls"), "spicy"), 0, "not spicy");
  assert.equal(fg(fm("Mild Wings", "add jalapenos for $1", "Wings"), "spicy"), 0, "an add-on");
  assert.deepEqual(flabels(fclaims("Mild Wings", "add jalapenos for $1", "Wings")), []);
  assert.equal(fg(fm("GOAST Toast", "A thick slice, tomato jelly, balsamic to give it a little kick.", "Food"), "spicy"), 1);
  assert.equal(fg(fm("Kick Bowl", "rice, chicken, a real kick of heat", "Bowls"), "spicy"), 2);
});

ok("tagger: a dessert and a drink make no claim", () => {
  assert.ok(fm("Ice cream sundae", "hot fudge, honey", "Desserts") & BIT_DESSERT);
  assert.deepEqual(fclaims("Ice cream sundae", "hot fudge, honey", "Desserts"), []);
  assert.deepEqual(fclaims("Hot Honey Brownie", null, "Desserts"), []);
  assert.deepEqual(fclaims("Banana Matcha", "banana, matcha, oat milk", "Drinks"), []);
});

ok("captions: praise slang is never a taste, and a caption is a nudge: grade 1 at most, no name evidence", () => {
  assert.equal(tagCaption("this was fire, gas, slay!"), 0);
  assert.equal(tagCaption("sooo fire, absolute banger, insane"), 0);
  assert.equal(tagCaption(null), 0);
  assert.equal(tagCaption("   "), 0);
  for (const cap of ["loved the smoky sweet heat", "hot honey chicken is spicy", "so spicy and crispy, so good"]) {
    const m = tagCaption(cap);
    assert.ok(m !== 0, `${cap} says something`);
    for (let a = 0; a < N_FLAVOR; a++) {
      assert.ok(gradeOf(m, a) <= 1, `${cap}: ${FLAVOR_ATTRS[a]} stays at 1`);
      assert.ok(!nameEvidence(m, a), `${cap}: a caption is never name evidence`);
    }
    assert.ok(!(m & BIT_DEMOTED));
  }
});

ok("masks: ten 2-bit grades and the flags fit a positive 32-bit int, and merging keeps the strongest grade", () => {
  const all = [
    ["Spicy Miso Ramen"],
    ["Carolina Brisket", "smoked brisket", "Mains"],
    ["Naughty Pie", "pepperoni, hot honey, mozzarella", "Pizza"],
    ["Ice cream sundae", "hot fudge, honey", "Desserts"],
    ["Dipper Fries", "choose your sauce: gochujang bbq, ranch", "Sides"],
    ["Banana Matcha", null, "Drinks"],
  ];
  for (const [name, desc, section] of all) {
    const m = fm(name, desc ?? null, section ?? null);
    assert.ok(Number.isInteger(m) && m >= 0 && m < 2 ** 31, `${name} packs to ${m}`);
    for (let a = 0; a < N_FLAVOR; a++) assert.ok(gradeOf(m, a) <= 2);
  }
  const a = fm("Spicy Miso Ramen");
  const b = fm("Carolina Brisket", "smoked brisket", "Mains");
  const mm = mergeMasks(a, b);
  for (let i = 0; i < N_FLAVOR; i++) assert.equal(gradeOf(mm, i), Math.max(gradeOf(a, i), gradeOf(b, i)));
  assert.ok(nameEvidence(mm, FA.spicy), "name evidence survives a merge");
  assert.ok(mergeMasks(fm("Ice cream sundae", "hot fudge, honey", "Desserts"), a) & BIT_DESSERT, "the dessert flag survives a merge");
});

// Profiles from hand-built masks, so the maths is tested on its own.
const mk = (o) => Object.entries(o).reduce((m, [k, g]) => m | (g << (2 * FA[k])), 0);
const FBASE = FLAVOR_ATTRS.map(() => 0.1);
FBASE[FA.sweetheat] = 0.01;
FBASE[FA.spicy] = 0.08;
FBASE[FA.creamy] = 0.15;
const FCFG = {
  K: DISH_TASTE.flavorK,
  anchorBeta: DISH_TASTE.flavorAnchorBeta,
  anchorMinPosts: DISH_TASTE.flavorAnchorMinPosts,
  spreadMin: DISH_TASTE.flavorSpreadMin,
  flatWeight: DISH_TASTE.flavorFlat,
};
const fseed = (id, mask, rating, pw = 1) => ({ id, mask, pw, c: 1, r: 1, rating });
const HOT = mk({ spicy: 2, sweet: 2, sweetheat: 2 });
const CALVINISH = (ratings = [95, 90, 85, 70, 60]) => [
  fseed(0, HOT, ratings[0], 1),
  fseed(1, HOT, ratings[1], 0.9),
  fseed(2, mk({ spicy: 2, umami: 2 }), ratings[2], 0.7),
  fseed(3, mk({ sweet: 1, fruity: 2 }), ratings[3], 0.5),
  fseed(4, mk({ smoky: 1 }), ratings[4], 0.4),
];

ok("profile: sweet heat and spicy anchor; plain sweet does not when every sweet seed is sweet heat", () => {
  const p = buildFlavorProfile(CALVINISH(), FBASE, FCFG);
  assert.ok(p.anchors.includes(FA.sweetheat) && p.anchors.includes(FA.spicy));
  assert.ok(!p.anchors.includes(FA.sweet), "the independence rule");
  assert.deepEqual(p.seedsByAttr[FA.sweetheat], [0, 1], "the seeds behind sweet heat, strongest first");
  assert.equal(anchorAttr(p, HOT), FA.sweetheat, "sweet heat wins the tie");
  assert.equal(anchorAttr(p, mk({ spicy: 2 })), FA.spicy);
  assert.equal(anchorAttr(p, mk({ sweet: 2 })), -1, "sweet alone is no anchor");
  assert.equal(anchorAttr(p, HOT | BIT_DESSERT), -1, "a dessert never anchors");
  assert.equal(anchorAttr(p, mk({ spicy: 1 })), -1, "grade 1 is only a hint");
  assert.ok(flavorFit(p, HOT) > flavorFit(p, mk({ sweet: 1, fruity: 2 })), "a sweet heat dish fits better than a fruity one");
  const sweetOnly = buildFlavorProfile(
    [fseed(0, mk({ sweet: 2 }), 95), fseed(1, mk({ sweet: 2 }), 90, 0.9), fseed(2, mk({ sweet: 2 }), 85, 0.7), fseed(3, mk({ smoky: 2 }), 60, 0.4)],
    FBASE,
    FCFG,
  );
  assert.ok(sweetOnly.anchors.includes(FA.sweet), "three plain sweet seeds do anchor sweet");
});

ok("profile: a ceiling rater and a harsh rater read the same taste; ratings that barely differ weigh the same", () => {
  const ceiling = buildFlavorProfile(CALVINISH([100, 100, 100, 100, 100]), FBASE, FCFG);
  assert.equal(ceiling.weight.get(0), FCFG.flatWeight, "flat ratings get the flat weight");
  assert.equal(ceiling.weight.get(4), FCFG.flatWeight);
  const harsh = buildFlavorProfile(CALVINISH([64, 60, 56, 52, 50]), FBASE, FCFG);
  assert.equal(harsh.weight.get(0), 1, "a real spread keeps the user's own weights");
  assert.equal(harsh.weight.get(4), 0.4);
  const wide = buildFlavorProfile(CALVINISH(), FBASE, FCFG);
  for (const p of [ceiling, harsh]) assert.deepEqual([...p.anchors].sort(), [...wide.anchors].sort(), "the same anchors");
});

ok("profile: no flavor in the text, a single post, or a salty and creamy palate never anchors sweet heat", () => {
  const none = buildFlavorProfile([0, 1, 2, 3].map((i) => fseed(i, 0, 95 - i * 5, 1 - i * 0.1)), FBASE, FCFG);
  assert.deepEqual(none.anchors, []);
  assert.equal(none.anchorBits, 0);
  assert.equal(anchorAttr(none, HOT), -1, "no anchor, no flavor pick");
  const one = buildFlavorProfile([fseed(0, HOT, 95)], FBASE, FCFG);
  assert.deepEqual(one.anchors, [], "one post is not a pattern");
  const salty = buildFlavorProfile([0, 1, 2, 3].map((i) => fseed(i, mk({ umami: 2, creamy: 2 }), 95 - i * 3, 1 - i * 0.1)), FBASE, FCFG);
  assert.ok(salty.anchors.includes(FA.umami));
  assert.ok(!salty.anchors.includes(FA.sweetheat) && !salty.anchors.includes(FA.spicy));
  assert.ok(flavorFit(salty, HOT) <= 0, "a sweet heat dish does not fit a salty palate");
  assert.deepEqual(
    fclaims("Truffle Mac and Cheese", "cream sauce, parmesan, truffle", "Mains").filter((c) => c.label === "creamy" || c.label === "umami"),
    [],
    "nothing about creamy or umami is ever claimed",
  );
});

ok("the gate: a fit of 0.62 opens it, 0.60 does not; the floor is above 4.0 on 5 reviews", () => {
  const v = (F) => DISH_TASTE.flavorV * Math.min(1, Math.max(0, (F - DISH_TASTE.flavorF0) / DISH_TASTE.flavorFSpan));
  assert.ok(v(0.62) >= DISH_TASTE.gate && v(0.6) < DISH_TASTE.gate);
  assert.equal(passesFloor({ rating: 4.0, reviewCount: 600 }), false, "4.0 itself fails");
  assert.equal(passesFloor({ rating: 4.1, reviewCount: 5 }), true);
  assert.equal(passesFloor({ rating: 4.1, reviewCount: 4 }), false);
  assert.equal(passesFloor({ rating: null, reviewCount: 600 }), false);
  assert.equal(passesFloor({ rating: 4.6, reviewCount: null }), false);
});

// A corpus built for flavor: the viewer's rated dishes, sweet heat dishes nobody posted at places of every kind.
const FW = (spec, profiles = [], fillers = 160) => {
  const rs = [];
  const ds = [];
  for (const [id, name, cuisine, rating, menu, reviews = 600] of spec) {
    rs.push({
      id, name, cuisine, cuisineTags: "", neighborhood: "North Park", distance: "1.0 mi", hours: null,
      lat: 32.72, lng: -117.16, rating, reviewCount: reviews, priceBand: null,
    });
    for (const m of menu) ds.push({ rid: id, name: m[0], description: m[1] ?? null, price: null, section: m[2] ?? null });
  }
  spec.forEach(([, , , , menu], k) => {
    menu.forEach((m, j) => {
      rs.push({
        id: `pad${k}_${j}`, name: `Pad ${k} ${j}`, cuisine: "Fusion", cuisineTags: "", neighborhood: "X", distance: "1.0 mi", hours: null,
        lat: 33.9, lng: -118.4, rating: 4.0, reviewCount: 200, priceBand: null,
      });
      ds.push({ rid: `pad${k}_${j}`, name: m[0], description: m[1] ?? null, price: null, section: m[2] ?? null });
    });
  });
  for (let i = 0; i < fillers; i++) {
    rs.push({
      id: `z${i}`, name: `Zed ${i}`, cuisine: i % 2 ? "Thai" : "Mexican", cuisineTags: "", neighborhood: "North Park",
      distance: "1.0 mi", hours: null, lat: 32.72, lng: -117.16, rating: 4.0, reviewCount: 200, priceBand: null,
    });
    ds.push({ rid: `z${i}`, name: `Dish${i}zz` });
  }
  const idx = buildDishIndex(rs.map((r) => r.id), ds, profiles);
  return (posts, over = {}) =>
    rankDishes({ index: idx, restaurants: rs, plates: {}, ratingMean: 4.3, posts, prefs: EMPTY_PREFS, now: NOW, ...over });
};
const FSPEC = [
  ["hA", "Honey Hut", "American", 4.5, [["Hot Honey Chicken", "fried thigh, hot honey, pickles"]]],
  ["hB", "Noodle Tomo", "Japanese", 4.4, [["Spicy Miso Ramen"]]],
  ["hC", "Sprout Social", "Vegan", 4.4, [["Sweet & Spicy Brussels Sprouts"]]],
  ["hD", "Better Beans", "Coffee & Tea", 4.6, [["Banana Matcha", null, "Drinks"]]],
  ["hE", "Taco Stop", "Mexican", 4.5, [["Brisket Tacos"]]],
  ["u1", "Plain Place", "Deli", 4.4, [["Plain Rice Bowl"]]],
  ["u2", "Leaf House", "Salads", 4.4, [["Garden Salad"]]],
  ["m1", "Nashville Stand", "Southern", 4.7, [["Hot Honey Chicken Sandwich"]]],
  ["f1", "Fire Pit", "Seafood", 4.6, [["Ghost Pepper Shrimp"]]],
  ["f3", "Cauli Co", "Mediterranean", 4.4, [["Honey Sriracha Cauliflower"]], 200],
  ["f4", "Hot Hand", "Thai", 4.0, [["Honey Sriracha Shrimp"]]],
  ["f4b", "Warm Hand", "Cuban", 4.0, [["Honey Sriracha Squid"]], 900],
  ["f5", "Tiny Heat", "Peruvian", 4.6, [["Honey Sriracha Tofu"]], 4],
  ["f5c", "Sixty Alarm", "Ethiopian", 4.6, [["Honey Sriracha Lentils"]], 60],
  ["f6", "Sweet Tooth", "Bakery", 4.7, [["Hot Honey Brownie", null, "Desserts"]]],
  ["f7", "Mild Mile", "Japanese", 4.7, [["Teriyaki Bowl", "not spicy, mild sauce"]]],
  ["f8", "No Menu Gyro", "Greek", 4.6, []],
  ["f9", "No Menu Wings", "Korean", 4.6, []],
];
const FPROF = [
  { rid: "f8", styles: [], dishTypes: [], median: null, signatures: ["Honey Sriracha Gyro", "Plain Rice"] },
  { rid: "f9", styles: [], dishTypes: ["wings"], median: null, summary: "Known for fiery sweet-and-spicy wings.", spice: "lots" },
];
const hotPosts = (r = [95, 85, 90, 70, 60]) => [
  rated("hA", "Hot Honey Chicken", r[0], { dishDescription: "fried thigh, hot honey, pickles" }),
  rated("hB", "Spicy Miso Ramen", r[1]),
  rated("hC", "Sweet & Spicy Brussels Sprouts", r[2]),
  rated("hD", "Banana Matcha", r[3], { dishSection: "Drinks" }),
  rated("hE", "Brisket Tacos", r[4]),
];
const flavorWorld = FW(FSPEC, FPROF);
const fpicks = flavorWorld(hotPosts());
const fby = (picks, id) => picks.find((p) => p.restaurant.id === id);
const FLINES = (rid) => [...(FSPEC.find((s) => s[0] === rid)?.[4] ?? []), ...(FPROF.find((p) => p.rid === rid)?.signatures ?? []).map((n) => [n])];

ok("a sweet heat palate finds sweet heat dishes nobody posted, at menu places and by signature at menu-less ones", () => {
  assert.ok(fpicks, "enough seeds to rank");
  // A vegetable small plate carries the flavor but is no dish to be sent for on flavor alone (the form guard).
  assert.ok(fby(fpicks, "f3")?.reason.kind !== "dish", "a cauliflower small plate is no flavor pick");
  const f8 = fby(fpicks, "f8");
  assert.equal(f8?.reason.kind, "dish", "a place with no menu is eligible through its signature dish");
  assert.match(f8.reason.text, /^New for you — Honey Sriracha Gyro, same sweet heat as your /);
  assert.ok(fby(fpicks, "f5c"), "5 or more reviews is enough");
});

ok("a reason claims a flavor only when the candidate's own text supports it", () => {
  let claimed = 0;
  for (const p of fpicks) {
    // "X — sweet heat, like your Y" and "New for you — X, same sweet heat as your Y" both claim a flavor.
    const m = /^(?:New for you — )?(.+?)(?: — |, same )(sweet heat|spicy|smoky|crispy|sweet|heat|smoke|crunch|sweetness)\b/.exec(p.reason.text);
    if (!m) continue;
    claimed++;
    const label = { heat: "spicy", smoke: "smoky", crunch: "crispy", sweetness: "sweet" }[m[2]] ?? m[2];
    const item = m[1].replace(/…$/, "").replace(/ \(plant-based\)$/, "").toLowerCase();
    const line = FLINES(p.restaurant.id).find(([n]) => n.toLowerCase().startsWith(item));
    assert.ok(line, `${p.restaurant.id}: ${m[1]} is on its menu`);
    assert.ok(flabels(claimsOf(line[0], line[1] ?? null, line[2] ?? null, false)).includes(label), `${p.restaurant.id}: ${m[1]} supports "${label}"`);
  }
  assert.ok(claimed >= 3, "and the fixture does make claims");
});

ok("the quality floor holds on every flavor pick, and the same place with enough reviews is found", () => {
  const got = ids(fpicks);
  for (const bad of ["f4", "f4b", "f5"]) assert.ok(!got.includes(bad), `${bad} is under the floor`);
  for (const p of fpicks) assert.ok(passesFloor(p.restaurant), `${p.restaurant.id} clears the floor`);
});

ok("a dessert, a negated dish and a place known only by its profile text are never a flavor pick", () => {
  for (const id of ["f6", "f7", "f9"]) assert.ok(fby(fpicks, id)?.reason.kind !== "dish", `${id} is no dish pick`);
  assert.ok(!fpicks.some((p) => p.restaurant.id === "f9" && /sweet heat|spicy/.test(p.reason.text)));
});

ok("without a flavor to stand on there is no flavor pick: unflavored posts, praise slang and captions cannot anchor", () => {
  const plain = [
    rated("u1", "Plain Rice Bowl", 90),
    rated("u2", "Garden Salad", 85),
    rated("hD", "Banana Matcha", 80, { dishSection: "Drinks" }),
    rated("hE", "Brisket Tacos", 70),
  ];
  const noFlavor = (posts) => {
    const out = flavorWorld(posts);
    assert.ok(!out || !out.some((p) => /— (sweet heat|spicy|smoky|crispy|sweet)\b/.test(p.reason.text)), "no flavor claim");
    assert.ok(!out || !out.some((p) => ["f3", "f8", "f5c"].includes(p.restaurant.id)), "no flavor-only pick");
  };
  noFlavor(plain);
  noFlavor(plain.map((p) => ({ ...p, caption: "so fire, gas, slay, absolute banger" })));
  noFlavor(plain.map((p) => ({ ...p, caption: "loving the sweet heat, so spicy and smoky" })));
});

ok("ratings under 50 teach no flavor, and fewer than three seeds keep the ordinary picks", () => {
  const low = [
    rated("hA", "Hot Honey Chicken", 40, { dishDescription: "fried thigh, hot honey, pickles" }),
    rated("hB", "Spicy Miso Ramen", 45),
    rated("hC", "Sweet & Spicy Brussels Sprouts", 49),
    rated("u1", "Plain Rice Bowl", 90),
    rated("u2", "Garden Salad", 85),
    rated("hD", "Banana Matcha", 80, { dishSection: "Drinks" }),
  ];
  const out = flavorWorld(low);
  assert.ok(!out || !out.some((p) => /— (sweet heat|spicy)\b/.test(p.reason.text)), "a dish rated under 50 anchors nothing");
  assert.equal(flavorWorld(hotPosts().slice(0, 2)), null, "two posts: the caller keeps its ordinary picks");
});

ok("a ceiling rater and a harsh rater both find the sweet heat dishes", () => {
  for (const r of [[100, 100, 100, 100, 100], [64, 60, 58, 54, 50]]) {
    const out = flavorWorld(hotPosts(r));
    assert.ok(out && ids(out).includes("f5c"), `ratings ${r.join("/")} still find the sweet heat lentils`);
  }
});

ok("flavor-only picks fill at most flavorOnlyTop of the first six, and the rest of them follow", () => {
  // Ten places that share nothing with the posts but a bang bang dish, beside four that match a dish the viewer posted.
  const spec = FSPEC.filter((s) => /^h/.test(s[0]) && s[0] !== "hC");
  spec.push(["hC", "Wing Wiz", "Wings", 4.4, [["Sriracha Honey Wings"]]]);
  const kinds = ["Salmon", "Shrimp", "Tofu", "Lentils", "Squid", "Eggplant", "Cauliflower", "Mushrooms", "Carrots", "Beans"];
  const cuisines = ["Greek", "Thai", "Peruvian", "Cuban", "Ethiopian", "Indian", "Korean", "Turkish", "Lebanese", "Persian"];
  kinds.forEach((k, i) => spec.push([`x${i}`, `Heat Place ${i}`, cuisines[i], 4.6, [[`Bang Bang ${k}`, "crispy and spicy, tossed in bang bang sauce"]], 300]));
  spec.push(["p1", "Ramen Ya", "Japanese", 4.6, [["Miso Ramen Bowl"]], 300]);
  spec.push(["p2", "Tacos Dos", "Mexican", 4.6, [["Brisket Tacos Plate"]], 300]);
  spec.push(["p3", "Chicken Shack", "Southern", 4.6, [["Hot Honey Chicken Tenders"]], 300]);
  spec.push(["p4", "Wing Spot", "American", 4.6, [["Sriracha Honey Wings Basket"]], 300]);
  const posts = [
    rated("hA", "Hot Honey Chicken", 95, { dishDescription: "fried thigh, hot honey, pickles" }),
    rated("hB", "Spicy Miso Ramen", 85),
    rated("hC", "Sriracha Honey Wings", 90),
    rated("hD", "Banana Matcha", 70, { dishSection: "Drinks" }),
    rated("hE", "Brisket Tacos", 60),
  ];
  const out = FW(spec, [], 1200)(posts);
  const isX = (p) => p.restaurant.id.startsWith("x");
  const first = out.slice(0, DISH_TASTE.top);
  assert.ok(first.filter(isX).length <= DISH_TASTE.flavorOnlyTop, `${first.filter(isX).length} flavor-only picks in the first ${DISH_TASTE.top}`);
  assert.ok(first.filter((p) => !isX(p)).length >= DISH_TASTE.top - DISH_TASTE.flavorOnlyTop, "the rest of the first row stands on posted dishes");
  assert.ok(out.filter(isX).length > DISH_TASTE.flavorOnlyTop, "and more of them follow once the row is full");
});

/* ---- a few adventurous picks: the same flavor, somewhere new ---- */
// Eight places in cuisines the viewer never posted, each with a honey sriracha dish; seven that match a dish they posted.
// The viewer posts chicken: an adventurous pick keeps the form (chicken) and changes the cuisine.
const ADV_KINDS = ["Karaage", "Drumettes", "Nuggets", "Drumsticks", "Karaage Bites", "Nugget Bites", "Drumette Bites", "Drumstick Bites"];
const ADV_CUISINES = ["Greek", "Peruvian", "Cuban", "Ethiopian", "Indian", "Turkish", "Lebanese", "Persian"];
// Filler lines so a place is not a one-dish specialist (a specialist is only sent to for its own dish family).
const ADV_PAD = [["Vegetable Soup"], ["Rice Pilaf"], ["Seasonal Special"]];
const ADV_POSTED = ["American", "Japanese", "Wings", "Coffee & Tea", "Mexican"];
const advSpec = () => {
  const spec = FSPEC.filter((s) => /^h/.test(s[0]) && s[0] !== "hC");
  spec.push(["hC", "Wing Wiz", "Wings", 4.4, [["Sriracha Honey Wings"]]]);
  ADV_KINDS.forEach((k, i) => spec.push([`x${i}`, `Heat Place ${i}`, ADV_CUISINES[i], 4.6, [[`Bang Bang ${k}`, "crispy and spicy, tossed in bang bang sauce"], ...ADV_PAD], 300]));
  spec.push(["p1", "Ramen Ya", "Japanese", 4.6, [["Miso Ramen Bowl"]], 300]);
  spec.push(["p2", "Tacos Dos", "Mexican", 4.6, [["Brisket Tacos Plate"]], 300]);
  spec.push(["p3", "Chicken Shack", "Southern", 4.6, [["Hot Honey Chicken Tenders"]], 300]);
  spec.push(["p4", "Wing Spot", "American", 4.6, [["Sriracha Honey Wings Basket"]], 300]);
  spec.push(["p5", "Noodle Lab", "Ramen", 4.6, [["Spicy Miso Ramen Shoyu"]], 300]);
  spec.push(["p6", "Taco Truck", "Tex-Mex", 4.6, [["Brisket Tacos Combo"]], 300]);
  spec.push(["p7", "Hen House", "Chicken", 4.6, [["Hot Honey Chicken Plate"]], 300]);
  // Enough known-territory picks that the row is not filled by new cuisines beyond the adventurous slots.
  spec.push(["p8", "Noodle Bar Two", "Japanese", 4.6, [["Spicy Miso Ramen Tonkotsu"]], 300]);
  spec.push(["p9", "Taco Haus", "Mexican", 4.6, [["Brisket Tacos Grande"]], 300]);
  spec.push(["p10", "Hot Wing Hut", "Wings", 4.6, [["Sriracha Honey Wings Bucket"]], 300]);
  spec.push(["p11", "Matcha Lab", "Coffee & Tea", 4.6, [["Banana Matcha Latte", null, "Drinks"]], 300]);
  return spec;
};
// All five are likes: none is rated low enough, against their own average, to count against its dish.
const advPosts = (r = [95, 85, 90, 75, 70]) => [
  rated("hA", "Hot Honey Chicken", r[0], { dishDescription: "fried thigh, hot honey, pickles" }),
  rated("hB", "Spicy Miso Ramen", r[1]),
  rated("hC", "Sriracha Honey Wings", r[2]),
  rated("hD", "Banana Matcha", r[3], { dishSection: "Drinks" }),
  rated("hE", "Brisket Tacos", r[4]),
];
const NEW_RE = /^New for you — (.+), same (sweet heat|heat|smoke|crunch|sweetness) as your (.+)$/;
const NEW_LABEL = { "sweet heat": "sweet heat", heat: "spicy", smoke: "smoky", crunch: "crispy", sweetness: "sweet" };
const isNew = (p) => p.reason.text.startsWith("New for you — ");
/** Asserts what every adventurous pick owes: a flavor its own line shows, a posted dish to compare with, the floor. */
const checkNew = (out, spec, posts, postedCuisines) => {
  const names = posts.map((p) => p.dishName.toLowerCase());
  for (const p of out.filter(isNew)) {
    const m = NEW_RE.exec(p.reason.text);
    assert.ok(m, `${p.restaurant.id}: reads "New for you — <dish>, same <flavor> as your <dish>": ${p.reason.text}`);
    const item = m[1].replace(/…$/, "").toLowerCase();
    const line = (spec.find((s) => s[0] === p.restaurant.id)?.[4] ?? []).find(([n]) => n.toLowerCase().startsWith(item));
    assert.ok(line, `${p.restaurant.id}: ${m[1]} is on its menu`);
    assert.ok(
      flabels(claimsOf(line[0], line[1] ?? null, line[2] ?? null, false)).includes(NEW_LABEL[m[2]]),
      `${p.restaurant.id}: its own text shows ${NEW_LABEL[m[2]]}`,
    );
    const mine = m[3].replace(/…$/, "").toLowerCase();
    assert.ok(names.some((n) => n.includes(mine)), `${p.restaurant.id}: "${m[3]}" is a dish they posted`);
    assert.ok(passesFloor(p.restaurant), `${p.restaurant.id} clears the floor`);
    assert.ok(!postedCuisines.includes(p.restaurant.cuisine), `${p.restaurant.id}: ${p.restaurant.cuisine} is new to them`);
    assert.equal(p.reason.kind, "dish");
  }
};

ok("a few adventurous picks: 2-3 of the 12, spread, none in the first three, each on a flavor its own text shows", () => {
  const spec = advSpec();
  const posts = advPosts();
  const out = FW(spec, [], 1200)(posts);
  assert.equal(out.length, DISH_TASTE.limit);
  const at = out.flatMap((p, i) => (isNew(p) ? [i] : []));
  assert.ok(at.length >= 2 && at.length <= DISH_TASTE.advMax, `${at.length} adventurous picks`);
  assert.ok(at[0] >= DISH_TASTE.advFirst && at[0] >= 3, `the first is at ${at[0]}, not in the first three`);
  at.forEach((x, k) => k > 0 && assert.ok(x - at[k - 1] >= 2, `picks ${at[k - 1]} and ${x} are not side by side`));
  checkNew(out, spec, posts, ADV_POSTED);
  // The others are known territory: they stand on a dish they posted, not on flavor alone in a new cuisine.
  for (const p of out.filter((q) => !isNew(q))) assert.ok(!NEW_RE.test(p.reason.text));
  for (const p of out) assert.ok(p.reason.text.length <= DISH_TASTE.textChars && p.reason.short.length <= DISH_TASTE.shortChars, "the reason fits");
});

ok("a low-rated dish among the posts: its look-alikes leave the row, and the adventurous picks stay sound", () => {
  const spec = advSpec();
  const posts = advPosts([95, 85, 90, 70, 60]);
  const out = FW(spec, [], 1200)(posts);
  // The 60 sits well under what this viewer usually gives, so the brisket places stop being picks at all.
  const brisket = spec.filter((s) => /^p/.test(s[0]) && /Brisket/.test(s[4][0][0])).map((s) => s[0]);
  assert.equal(brisket.length, 3);
  assert.ok(!ids(out).some((id) => brisket.includes(id)), "no place is picked for the dish they rated low");
  assert.ok(!out.some((p) => /Brisket/.test(p.reason.text)), "and no reason cites it");
  // With three fewer known-territory places the row runs short, and new cuisines fill what is left of it
  // (the same row as when those three places are simply not on offer).
  assert.ok(out.length >= DISH_TASTE.limit - 1, out.length + " picks");
  const at = out.flatMap((p, i) => (isNew(p) ? [i] : []));
  assert.ok(at.length >= 1 && at.every((x) => x >= 3), "adventurous picks remain, none in the first three");
  checkNew(out, spec, posts, ADV_POSTED);
});

ok("the adventurous count scales with the row: none in a row of four, at most two in eight", () => {
  const spec = advSpec();
  const world = FW(spec, [], 1200);
  assert.equal(world(advPosts(), { limit: 4 }).filter(isNew).length, 0, "a row of four is all known territory");
  const eight = world(advPosts(), { limit: 8 });
  const at = eight.flatMap((p, i) => (isNew(p) ? [i] : []));
  assert.ok(at.length >= 1 && at.length <= 2, `${at.length} in eight`);
  assert.ok(at.every((x) => x >= DISH_TASTE.advFirst), "none before the fifth");
});

ok("any palate gets them: a ceiling rater and a harsh rater keep 2-3, never in the first three", () => {
  const spec = advSpec();
  for (const r of [[100, 100, 100, 100, 100], [64, 60, 58, 54, 50]]) {
    const posts = advPosts(r);
    const out = FW(spec, [], 1200)(posts);
    const at = out.flatMap((p, i) => (isNew(p) ? [i] : []));
    assert.ok(at.length >= 2 && at.length <= DISH_TASTE.advMax, `ratings ${r.join("/")}: ${at.length} adventurous picks`);
    assert.ok(at.every((x) => x >= DISH_TASTE.advFirst), `ratings ${r.join("/")}: none in the first three`);
    checkNew(out, spec, posts, ADV_POSTED);
  }
});

ok("a smoky palate gets smoky ones, and a bread or a dip is never the adventurous pick", () => {
  const posts = [
    rated("sA", "Hickory Smoked Brisket", 95),
    rated("sB", "Smoked Pulled Pork Sandwich", 90),
    rated("sC", "Mesquite Grilled Chicken", 85),
    rated("sD", "Applewood Smoked Bacon Burger", 80),
    rated("sE", "Pit Smoked Ribs", 75),
  ];
  const spec = [
    ["sA", "Pit Boss", "BBQ", 4.5, [["Hickory Smoked Brisket"], ...ADV_PAD]],
    ["sB", "Pig Stand", "Southern", 4.5, [["Smoked Pulled Pork Sandwich"], ...ADV_PAD]],
    ["sC", "Mesquite Hut", "Mexican", 4.5, [["Mesquite Grilled Chicken"], ...ADV_PAD]],
    ["sD", "Bacon Barn", "Burgers", 4.5, [["Applewood Smoked Bacon Burger"], ...ADV_PAD]],
    ["sE", "Rib Shack", "Ribs", 4.5, [["Pit Smoked Ribs"], ...ADV_PAD]],
    ["q1", "Smoke House Two", "BBQ", 4.6, [["Hickory Smoked Brisket Plate"]], 300],
    ["q2", "Pig Stand Two", "Southern", 4.6, [["Smoked Pulled Pork Plate"]], 300],
    ["q3", "Mesquite Too", "Mexican", 4.6, [["Mesquite Grilled Chicken Plate"]], 300],
    ["q4", "Bacon Barn Two", "Burgers", 4.6, [["Applewood Smoked Bacon Burger Deluxe"]], 300],
    ["q5", "Rack Shack", "Texan", 4.6, [["Pit Smoked Ribs Half Rack"]], 300],
    ["q6", "Brisket Deli", "Deli", 4.6, [["Hickory Smoked Brisket Sandwich"]], 300],
    ["q7", "Grill Two", "Grill", 4.6, [["Mesquite Grilled Chicken Dinner"]], 300],
    ["q8", "Pork Tacos", "Tex-Mex", 4.6, [["Smoked Pulled Pork Tacos"]], 300],
    ["q9", "Burger Two", "American", 4.6, [["Applewood Smoked Bacon Burger Two"]], 300],
    ["y0", "Ember Greek", "Greek", 4.6, [["Cherrywood Salmon", "slow smoked over cherrywood with a smoky house rub"], ...ADV_PAD], 300],
    ["y1", "Ember Peru", "Peruvian", 4.6, [["Burnt Ends Shrimp", "slow smoked over cherrywood with a smoky house rub"], ...ADV_PAD], 300],
    ["y2", "Ember Cuba", "Cuban", 4.6, [["Cherrywood Tofu", "slow smoked over cherrywood with a smoky house rub"], ...ADV_PAD], 300],
    ["y3", "Ember Ethiopia", "Ethiopian", 4.6, [["Burnt Ends Lentils", "slow smoked over cherrywood with a smoky house rub"], ...ADV_PAD], 300],
    ["y4", "Ember India", "Indian", 4.6, [["Cherrywood Squid", "slow smoked over cherrywood with a smoky house rub"], ...ADV_PAD], 300],
    ["b1", "Smoke Bakery", "Turkish", 4.8, [["Cherrywood Bread", "slow smoked over cherrywood with a smoky house rub"], ...ADV_PAD], 900],
    ["b2", "Smoke Mezze", "Lebanese", 4.8, [["Cherrywood Eggplant Dip", "slow smoked over cherrywood with a smoky house rub"], ...ADV_PAD], 900],
  ];
  const out = FW(spec, [], 1200)(posts);
  assert.ok(out, "enough seeds to rank");
  const at = out.flatMap((p, i) => (isNew(p) ? [i] : []));
  // Four known-territory picks is all this corpus has, so new cuisines fill the rest of the row, each saying so.
  assert.ok(at.length >= 2, `${at.length} adventurous picks`);
  assert.ok(at.every((x) => x >= DISH_TASTE.advFirst), "none in the first three");
  checkNew(out, spec, posts, ["BBQ", "Southern", "Mexican", "Burgers", "Ribs"]);
  for (const id of ["b1", "b2"]) assert.ok(!isNew(fby(out, id) ?? { reason: { text: "" } }), `${id}: a bread or a dip is not what they are sent somewhere new for`);
  assert.ok(out.filter(isNew).every((p) => /^New for you — .+, same smoke as your /.test(p.reason.text)), "and the flavor is the one they like");
});

ok("a place with no menu can be an adventurous pick, on its profile's signature dish", () => {
  const spec = [...FSPEC.filter((s) => /^h/.test(s[0]) || s[0] === "f8"), ...advSpec().filter((s) => /^p/.test(s[0]))];
  assert.deepEqual(spec.find((s) => s[0] === "f8")[4], [], "no menu lines at all");
  const out = FW(spec, FPROF.filter((p) => p.rid === "f8"), 1200)(hotPosts());
  const f8 = fby(out, "f8");
  assert.ok(f8, "the menu-less place is eligible");
  assert.ok(out.indexOf(f8) >= DISH_TASTE.advFirst, "and it is not in the first three");
  assert.match(f8.reason.text, /^New for you — Honey Sriracha Gyro, same sweet heat as your /);
  assert.equal(f8.reason.kind, "dish");
  assert.ok(passesFloor(f8.restaurant));
});

/* ---- what a flavor pick says and where it stands: kind, best line, plant-based, drink shops, bars, known places ---- */
// A world of places in cuisines the viewer posted (so none of them is an adventurous pick), each with one candidate line.
const KW_BASE = FSPEC.filter((s) => /^h/.test(s[0]) && s[0] !== "hC");
const KW_POSTS = () => [
  rated("hA", "Hot Honey Chicken", 95, { dishDescription: "fried thigh, hot honey, pickles" }),
  rated("hB", "Spicy Miso Ramen", 85),
  rated("hD", "Banana Matcha", 70, { dishSection: "Drinks" }),
  rated("hE", "Brisket Tacos", 60),
];
// Two sweet heat dishes make the palate proven: one hot dish does not send anyone to a noodle shop.
const KW_WINGS = ["hF", "Wing Stop", "American", 4.4, [["Honey Sriracha Wings"]]];
const KW_PROVEN = () => [...KW_POSTS(), rated("hF", "Honey Sriracha Wings", 90)];
const KW_SWEET = ["Honey Sriracha Chicken Plate", "glazed with sriracha honey"];
const kwPlace = (id, cuisine, line = KW_SWEET, rating = 4.6, reviews = 400) => [id, `${id} Place`, cuisine, rating, [line, ...ADV_PAD], reviews];

ok("a flavor pick is compared to a posted dish of its own kind, and cites the line that fits best", () => {
  // Chicken and turkey are poultry: the posted chicken dish is the comparison. A pork or a lamb dish is not, so it is compared to the other sweet heat dish.
  const spec = [
    ...KW_BASE,
    ["hC", "Wing Wiz", "American", 4.4, [["Sweet & Spicy Brussels Sprouts"]]],
    kwPlace("n0", "American", ["Honey Sriracha Chicken Plate", "glazed with sriracha honey"]),
    kwPlace("n1", "American", ["Honey Sriracha Pork Plate", "glazed with sriracha honey"]),
    kwPlace("n2", "Mexican", ["Honey Sriracha Lamb Plate", "glazed with sriracha honey"]),
    // Many lines: the one that fits sweet heat is cited, not the first one or the one that merely mentions chicken.
    ["b1", "Many Lines", "American", 4.6, [["Garden Salad"], ["Spicy Chicken Sandwich", "crispy chicken, spicy mayo"], ["Hot Honey Habanero Chicken Plate", "crispy chicken glazed with hot honey"], ["Plain Rice Bowl"]], 400],
  ];
  const posts = [...KW_POSTS(), rated("hC", "Sweet & Spicy Brussels Sprouts", 90)];
  const out = FW(spec, [], 400)(posts);
  assert.ok(out, "ranked");
  assert.match(fby(out, "n0")?.reason.text ?? "", /your Hot Honey Chicken/, "a chicken line is compared to the chicken dish");
  for (const id of ["n1", "n2"]) {
    const t = fby(out, id)?.reason.text ?? "";
    assert.ok(t.length > 0, `${id}: eligible`);
    assert.doesNotMatch(t, /your Hot Honey Chicken/, `${id}: a pork or a lamb dish is not compared to a chicken one`);
  }
  assert.match(fby(out, "b1")?.reason.text ?? "", /^Hot Honey Habanero Chicken Plate — sweet heat, like your /, "the best-fitting line is the one cited");
});

ok("a meat-free house says so when the dish it is compared to is not meat-free", () => {
  const line = ["Epic Chicken Sandwich", "crispy plant-based chicken, hot honey, pickles"];
  const meaty = ["Epic Chicken Sandwich", "crispy chicken, hot honey, pickles"];
  const spec = [...KW_BASE, kwPlace("v1", "Vegetarian", line, 4.7), kwPlace("v2", "American", meaty, 4.7)];
  const out = FW(spec, [], 400)(KW_POSTS());
  const v1 = fby(out, "v1");
  const v2 = fby(out, "v2");
  assert.ok(v1 && v2, "both eligible");
  assert.match(v1.reason.text, /Epic Chicken Sandwich \(plant-based\)/, "the vegetarian house says what the sandwich is");
  assert.match(v1.reason.short, /\(plant-based\)/, "and the short line too");
  assert.doesNotMatch(v2.reason.text, /plant-based/, "a meat house says nothing of the kind");
  // Compared to a dish of their own from a meat-free house, nothing needs saying.
  const veg = [...KW_BASE.filter((s) => s[0] !== "hA"), ["hA", "Sprout Social", "Vegan", 4.5, [["Hot Honey Chicken", "fried thigh, hot honey, pickles"]]], kwPlace("v1", "Vegetarian", line, 4.7)];
  const out2 = FW(veg, [], 400)(KW_POSTS());
  const w = fby(out2, "v1");
  assert.ok(w, "still eligible");
  assert.doesNotMatch(w.reason.text, /plant-based/, "a plant-based dish compared to a plant-based dish needs no disclosure");
});

ok("a drink shop is not sent to on a flavor line, a bar's waits behind the meals, and a place they name in a caption counts for less", () => {
  // A bakery or a coffee shop holds a savory line, but it is not what anyone goes there for.
  const noodle = ["Honey Sriracha Noodles", null];
  const out = FW([...KW_BASE, KW_WINGS, kwPlace("d1", "Bakery", noodle, 4.7), kwPlace("d2", "Thai", noodle, 4.5), kwPlace("d3", "Coffee & Tea", noodle, 4.7)], [], 400)(KW_PROVEN());
  assert.ok(fby(out, "d2"), "the same line at a Thai place is found");
  assert.ok(!fby(out, "d1"), "a bakery is not");
  assert.notEqual(fby(out, "d3")?.reason.kind, "dish", "nor is a coffee shop (it can only be named for the cuisine they eat)");
  // Four meal places, each matching a different dish they posted, and a bar standing on its flavor line alone, the bar
  // the best rated: it follows the first three.
  const sauce = "glazed in honey sriracha sauce";
  const meals = [["Hot Honey Chicken Plate", "fried chicken, hot honey"], ["Spicy Miso Ramen Bowl", null], ["Brisket Taco Plate", null], ["Honey Sriracha Wings Plate", sauce]];
  const places = ["m1", "m2", "m3", "m4"].map((id, i) => kwPlace(id, i % 2 ? "Japanese" : "American", meals[i], 4.4 - i * 0.01, 400));
  const spec = [...KW_BASE, KW_WINGS, ...places, kwPlace("bar", "American", ["Sticky Turkey Plate", sauce], 4.8, 900)];
  const bar = { rid: "bar", styles: [], dishTypes: [], median: null, signatures: [], service: "bar" };
  const withBar = FW(spec, [bar], 400)(KW_PROVEN());
  const at = withBar.findIndex((p) => p.restaurant.id === "bar");
  assert.ok(at === -1 || at >= 3, `the bar is not in the first three (${at})`);
  const noBar = FW(spec, [], 400)(KW_PROVEN());
  const noBarAt = noBar.findIndex((p) => p.restaurant.id === "bar");
  assert.ok(noBarAt !== -1 && (at === -1 || noBarAt < at), "without the bar profile it sits higher");
  // "better than Dave's": a place they named in a caption is one they already have a view of.
  const dave = [...KW_BASE, kwPlace("c1", "American", ["Hot Honey Chicken Plate", "fried chicken, hot honey"], 4.6, 400), kwPlace("c2", "American", ["Hot Honey Chicken Plate", "fried chicken, hot honey"], 4.5, 400)];
  dave[dave.length - 2][1] = "Daves Hot Chicken";
  const plain = FW(dave, [], 400)(KW_POSTS());
  const named = KW_POSTS();
  named[0] = { ...named[0], caption: "better than Daves" };
  const withCaption = FW(dave, [], 400)(named);
  const rank = (o, id) => o.findIndex((p) => p.restaurant.id === id);
  assert.ok(rank(plain, "c1") < rank(plain, "c2"), "the better rated leads on its own");
  assert.ok(rank(withCaption, "c2") < rank(withCaption, "c1"), "and trails the one they did not name once a caption does");
});

ok("a shared-plate line is never the dish a place is named for; a flavor-led cross pick fills a short row", () => {
  const share = ["st1", "Share Place", "American", 4.8, [["Honey Sriracha Wings", "glazed with sriracha honey", "Share Plates"], ...ADV_PAD], 600];
  const many = FW([...KW_BASE, kwPlace("n0", "American"), kwPlace("n1", "Mexican", ["Honey Sriracha Pork Plate", "glazed with sriracha honey"]), share], [], 400)(KW_POSTS());
  assert.ok(many && fby(many, "n0"), "the meal place is found");
  assert.notEqual(fby(many, "st1")?.reason.kind, "dish", "a shared plate is never the dish a place is named for");
  const alone = FW([...KW_BASE, share], [], 400)(KW_POSTS());
  assert.equal(fby(alone, "st1")?.reason.kind, "cuisine", "alone, it can still come up, for the cuisine they eat");
  // Nothing posted in this cuisine and a different kind of dish: still a pick on its flavor, in the first slot of a short row.
  const cross = FW([...KW_BASE, KW_WINGS, kwPlace("k3", "Mediterranean", ["Chili Glazed Salmon Plate", "roasted, tossed in honey sriracha"], 4.5, 300)], [], 400)(KW_PROVEN());
  const k3 = cross && fby(cross, "k3");
  assert.ok(k3, "a flavor-led pick of another kind fills a short row");
  assert.match(k3.reason.text, /^New for you — Chili Glazed Salmon Plate, same (?:sweet )?heat as your /);
});

/* ---------- 2. the source ---------- */

ok("a caption that complains is a sour one, and praise or a taste is not", () => {
  for (const c of ["Nothing special, honestly", "bland and overpriced", "would not be back... won't order again", "meh", "not my favorite", "a bit disappointing"]) {
    assert.equal(captionSours(c), true, `${c} complains`);
  }
  for (const c of ["so good, would order again", "loving the sweet heat", "this was fire", "", null, undefined]) {
    assert.equal(captionSours(c), false, `${String(c)} does not`);
  }
});

ok("the dish a flavor pick is compared to states the flavor itself, is rated well, and was not complained about", () => {
  const cand = kwPlace("q1", "American", ["Honey Sriracha Chicken Plate", "glazed with sriracha honey"]);
  const spec = [...KW_BASE, KW_WINGS, cand];
  const rest = [rated("hB", "Spicy Miso Ramen", 85), rated("hD", "Banana Matcha", 70, { dishSection: "Drinks" }), rated("hE", "Brisket Tacos", 60)];
  const hot = (rating, extra = {}) => rated("hA", "Hot Honey Chicken", rating, { dishDescription: "fried thigh, hot honey, pickles", ...extra });
  const wing = rated("hF", "Honey Sriracha Wings", 90);
  const said = (posts) => fby(FW(spec, [], 400)(posts) ?? [], "q1")?.reason.text ?? "";
  assert.match(said([hot(95), wing, ...rest]), /your Hot Honey Chicken/, "a well-rated dish that states the flavor is the one named");
  // The poster complained: the dish still teaches the palate, but it is not the one a reason names.
  const sour = said([hot(95, { caption: "bland and overpriced, would not order again" }), wing, ...rest]);
  assert.doesNotMatch(sour, /your Hot Honey Chicken/, "a dish its poster complained about is never cited");
  // Rated far below a dish that states the same flavor: not the one named either.
  const low = said([hot(60), wing, ...rest]);
  assert.doesNotMatch(low, /your Hot Honey Chicken/, "a dish rated well under their best is not cited");
  // A well-rated dish that says nothing of the flavor cannot be cited for it.
  const plain = said([rated("hG", "Plain Chicken Plate", 99), hot(95), wing, ...rest]);
  assert.doesNotMatch(plain, /your Plain Chicken/, "a dish with no flavor in its text is never the comparison");
});

ok("one hot dish is not a palate: a single sweet heat post sends no one to another dish on flavor alone", () => {
  const cand = kwPlace("s1", "Thai", ["Honey Sriracha Shrimp Bowl", "tossed in a honey sriracha glaze"]);
  const one = fby(FW([...KW_BASE, cand], [], 400)(KW_POSTS()) ?? [], "s1");
  assert.doesNotMatch(one?.reason.text ?? "", /same (?:sweet )?heat as/, "one sweet heat post does not carry a flavor claim to a new dish");
  const two = fby(FW([...KW_BASE, KW_WINGS, cand], [], 400)(KW_PROVEN()) ?? [], "s1");
  assert.match(two?.reason.text ?? "", /sweet heat/, "two of them do");
});

ok("a flavor-led pick is one per kind of dish: three hot honey pizzas are one idea", () => {
  const spec = [
    ...KW_BASE, KW_WINGS,
    kwPlace("p1", "Pizza", ["Hot Honey Pepperoni Pizza", "hot honey, pepperoni, mozzarella"]),
    kwPlace("p2", "Italian", ["Hot Honey Margherita Pizza", "hot honey, basil, mozzarella"]),
    kwPlace("p3", "American", ["Hot Honey Sausage Pizza", "hot honey, sausage, mozzarella"]),
    // Enough other ideas to fill the row, so a second pizza has somewhere better to go.
    ...[
      ["Thai", "Honey Sriracha Shrimp Bowl"], ["Japanese", "Honey Sriracha Salmon Plate"], ["Korean", "Honey Sriracha Beef Bowl"],
      ["Chinese", "Honey Sriracha Pork Stir Fry"], ["Vietnamese", "Honey Sriracha Duck Banh Mi"], ["Filipino", "Honey Sriracha Squid Plate"],
      ["French", "Honey Sriracha Cod Plate"], ["Turkish", "Honey Sriracha Lamb Kebab"], ["Cuban", "Honey Sriracha Tofu Plate"],
      ["Greek", "Honey Sriracha Prawn Plate"], ["Indian", "Honey Sriracha Paneer Plate"], ["Peruvian", "Honey Sriracha Scallop Plate"],
    ].map(([cu, nm], i) => kwPlace("o" + i, cu, [nm, "tossed in honey sriracha"])),
  ];
  const out = FW(spec, [], 400)(KW_PROVEN());
  assert.ok(out && out.length >= 10, "a full row");
  const led = out.filter((p) => ["p1", "p2", "p3"].includes(p.restaurant.id) && /sweet heat/.test(p.reason.text));
  assert.ok(led.length <= 1, `at most one flavor-led pizza, got ${led.length}`);
  assert.ok(out.some((p) => ["p1", "p2", "p3"].includes(p.restaurant.id)), "a pizza is still found");
});

ok("a row with no description says nothing of flavor: its reason comes from what the place is known for", () => {
  const spec = [
    ...KW_BASE, KW_WINGS,
    ["w1", "Wing House", "American", 4.6, [["Wings (5 pcs)"], ["Fries"]], 400],
  ];
  const profiles = [{ rid: "w1", styles: ["wings"], dishTypes: ["wings"], median: null, signatures: [], summary: "Known for crispy wings.", spice: null }];
  const out = FW(spec, profiles, 400)(KW_PROVEN());
  const w = fby(out ?? [], "w1");
  assert.ok(w, "the wing house is eligible on its dish family");
  assert.doesNotMatch(w.reason.text, /sweet heat|same (?:sweet )?heat|spicy|smoky/, "no flavor is claimed for a bare row");
});

ok("no For me route, pill, link or chip row is left", () => {
  for (const f of ["src/components/ForMeProfileLine.tsx", "src/lib/profileTraits.ts"]) assert.throws(() => src(f), f);
  const files = [
    "src/components/TasteSection.tsx", "src/components/mobile/PhoneTasteSection.tsx",
    "src/components/DiscoverFilters.tsx", "src/components/DiscoverBrowser.tsx",
    "src/components/mobile/PhoneFilterBar.tsx", "src/components/mobile/PhoneDiscoverScreen.tsx",
    "src/lib/useDiscoverQuery.ts", "src/lib/discoverFilters.ts", "src/lib/discover.ts",
    "src/app/api/restaurants/discover/route.ts", "src/lib/taste.ts",
  ];
  for (const f of files) {
    const s = src(f);
    assert.ok(!/foryou|FOR_ME_PARAM|ForMePill|ForMeGrid|PhoneForMeResults|rankTaste|ForMeProfileLine/.test(s), `${f} still mentions the For me view`);
  }
  assert.ok(!/forMe/.test(src("src/app/api/restaurants/discover/route.ts")), "Discover knows nothing of For me");
});

ok("the chip row and Edit panel are non-access only, on both sections", () => {
  for (const f of ["src/components/TasteSection.tsx", "src/components/mobile/PhoneTasteSection.tsx"]) {
    const s = src(f);
    assert.ok(/!access/.test(s), `${f} gates the chips on access`);
    assert.ok(/Reset my taste/.test(s), `${f} keeps a text reset`);
    assert.ok(!/foryou/.test(s), `${f} links nowhere for See all`);
  }
});

ok("the taste route is private and the dish picks stay behind the gate", () => {
  const s = src("src/app/api/account/taste/route.ts");
  assert.match(s, /no-store/);
  assert.match(s, /isForMeUser\(user\.id\)/);
  assert.match(s, /rankDishes/);
  assert.match(s, /scoreTaste/, "everyone else, and a null or failed ranking, keeps the cuisine picks");
});

ok("the floor holds on the fallback inside the gate, and nothing outside the gate can reach the flavor ranking", () => {
  const s = src("src/app/api/account/taste/route.ts");
  const gate = s.indexOf("isForMeUser(user.id)");
  const floor = s.indexOf("result.picks.filter((p) => passesFloor(p.restaurant))");
  assert.ok(gate > 0 && floor > gate, "the cuisine fallback is floored only for the gated viewer, so everyone else keeps origin/main's picks");
  assert.match(s, /import \{ dishPickLog, passesFloor, rankDishes \} from "@\/lib\/dishTaste"/);
  // rankDishes is called from exactly one place: the gated block of this route.
  const callers = [];
  const walk = (dir) => {
    for (const e of readdirSync(root + dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (/\.(ts|tsx|mts)$/.test(e.name) && /\brankDishes\(/.test(src(`${dir}/${e.name}`))) callers.push(`${dir}/${e.name}`);
    }
  };
  walk("src");
  assert.deepEqual(callers.sort(), ["src/app/api/account/taste/route.ts", "src/lib/dishTaste.ts"]);
  assert.ok(s.indexOf("rankDishes({") > gate, "and only after the gate");
});

ok("flavor is pure and has no switch of its own: no imports, no env var, no database write", () => {
  const f = src("src/lib/flavor.ts");
  assert.ok(!/^\s*import\s/m.test(f), "flavor.ts imports nothing");
  for (const file of ["src/lib/flavor.ts", "src/lib/dishTaste.ts", "src/lib/dishIndex.ts"]) {
    const s = src(file);
    assert.ok(!/PM_FLAVOR|process\.env/.test(s), `${file} reads no env var`);
    assert.ok(!/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE)\s+(?:INTO|TABLE|FROM|\w+\s+SET)/i.test(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), `${file} writes nothing`);
  }
});

ok("Discover has no Show distance button, and distance reaches every card for the gated accounts only", () => {
  assert.throws(() => src("src/components/ShowDistanceButton.tsx"), "the button file is gone");
  for (const f of ["src/components/DiscoverBrowser.tsx", "src/components/mobile/PhoneDiscoverResults.tsx"]) {
    const s = src(f);
    assert.ok(!/ShowDistanceButton|Show distance from you/.test(s), `${f} still has the button`);
    assert.match(s, /useForMeAccess\(\)/, `${f} gates the distance on the account`);
  }
  // Our picks gets the reader's position only through the gate; null prints nothing.
  assert.match(src("src/components/DiscoverBrowser.tsx"), /<OurPicks picks=\{picks\} coords=\{access \? nearby\.coords : null\} served=\{served\} \/>/);
  // The one automatic ask: opt-in, only by the Discover query, and only when the account is gated.
  const near = src("src/lib/nearby.ts");
  assert.match(near, /askOnLoad\s*&&\s*access/, "the ask on load is gated on the account");
  assert.match(near, /claimAutoAsk\(\)/, "and spent once per tab session");
  assert.match(src("src/lib/useDiscoverQuery.ts"), /useNearby\(\{ askOnLoad: true \}\)/);
  const callers = [];
  const walk = (dir) => {
    for (const e of readdirSync(root + dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (/\.(ts|tsx|mts)$/.test(e.name) && /askOnLoad:\s*true/.test(src(`${dir}/${e.name}`))) callers.push(`${dir}/${e.name}`);
    }
  };
  walk("src");
  assert.deepEqual(callers, ["src/lib/useDiscoverQuery.ts"], "no other page asks for a position on load");
  // Coordinates travel in the POST body, never in a URL.
  assert.ok(!/coords[^\n]*(?:\?|&)(?:lat|lng)=/.test(src("src/lib/useDiscoverQuery.ts")), "no coordinates in a URL");
});

/* ---------- 3. render parity ---------- */

const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const render = fileURLToPath(new URL("./check-forme-render.cts", import.meta.url));
process.stdout.write(execFileSync(process.execPath, [tsx, render], { encoding: "utf8", cwd: root }));

console.log(`forme:check  ${n} recommender and source cases ok`);
process.exit(0);
