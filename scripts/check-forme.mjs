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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DISH_TASTE, buildDishIndex, rankDishes, termsOf } from "../src/lib/dishTaste.ts";
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
place("m3", "Hive Bar", "American", 4.4, 900, [["Hot Honey Chicken Bites", null, "$12"]]);
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
      assert.ok(menus.get(p.restaurant.id).some((m) => m.startsWith(item)), `"${item}" is not on ${p.restaurant.name}'s menu`);
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

/* ---------- 2. the source ---------- */

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

/* ---------- 3. render parity ---------- */

const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const render = fileURLToPath(new URL("./check-forme-render.cts", import.meta.url));
process.stdout.write(execFileSync(process.execPath, [tsx, render], { encoding: "utf8", cwd: root }));

console.log(`forme:check  ${n} recommender and source cases ok`);
process.exit(0);
