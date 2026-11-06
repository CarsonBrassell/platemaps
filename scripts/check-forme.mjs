/*
 * Asserts "For me", Discover's personal order (probe/for-me/PLAN.md): rankTaste
 * over scoreAll (src/lib/taste.ts), the menu-profile similarity it reads
 * (src/lib/profileTraits.ts), and the privacy line the route holds.
 *
 *   npm run forme:check
 *
 * Three layers, no test framework (same shape as taste:check):
 *  1. A small deterministic corpus with menu profiles covers the plan's cases:
 *     the one-post gate, cold start, exclusions, chains and shared menus,
 *     reasons, imputed profiles, the cuisine cap, determinism.
 *  2. The route and the client, without a server: the GET refuses `foryou`
 *     (400, no-store) before it touches anything, and the source is pinned so
 *     the personal path cannot drift onto a cacheable response.
 *  3. The live corpus and profiles (read-only, the same SELECTs Discover runs).
 *     Viewers are synthesised from real places with a seeded generator, among
 *     them people who have been to one or two places. No user data is read.
 *     Skipped with a note if the database is unreachable, so the check still
 *     runs offline. No secret is ever printed.
 *
 * The profile maths is pinned by its shape and its constants, not by numbers
 * written out here: tuning WEIGHTS or SIM_WEIGHTS should not break this file.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_PREFS,
  WEIGHTS,
  chainKey,
  historyConfidence,
  rankTaste,
  scoreAll,
  scoreTaste,
  tasteExclusions,
} from "../src/lib/taste.ts";
import {
  CENTROID_TERMS,
  IMPUTED_FACTOR,
  MIN_CENTROID_PROFILES,
  SIM_WEIGHTS,
  buildTraitIndex,
  dishSetKey,
  normalizeDishes,
  similarity,
  similarityParts,
  termLabel,
  traitsOf,
} from "../src/lib/profileTraits.ts";
import { FOR_ME_PARAM, hasCuisine } from "../src/lib/discoverFilters.ts";

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
};
const okAsync = async (name, fn) => {
  await fn();
  n++;
};

/** The module-level clients (db, rate limit) read this at import. */
try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url));
} catch {
  /* env may already be set */
}

/* ---------- shared helpers ---------- */

/** mulberry32: a small seeded generator, so the live viewers are the same every run. */
const prng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const shuffled = (arr, rnd) => {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const KINDS = new Set(["like", "pick", "friends", "cuisine", "rated"]);
const idCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cmpScore = (a, b) => b.score - a.score || b.plate - a.plate || idCmp(a.r.id, b.r.id);
const cmpTail = (a, b) => b.tail - a.tail || b.plate - a.plate || idCmp(a.r.id, b.r.id);
const isMatch = (s) => (s.A >= WEIGHTS.matchGate || s.F > 0) && !s.sibling;
const sameSet = (a, b) => idCmp([...a].sort().join("|"), [...b].sort().join("|")) === 0;

/** Ids the viewer must never be shown, worked out from the input alone. */
function expectedExclude({ restaurants, corpus, prefs, postedIds }) {
  const universe = corpus ?? restaurants;
  const present = new Set(universe.map((r) => r.id));
  const gone = new Set([...postedIds, ...prefs.been].filter((id) => present.has(id)));
  for (const id of prefs.hidden) gone.add(id);
  const out = new Set();
  for (const r of universe) {
    if (gone.has(r.id) || (r.cuisine && prefs.skips.includes(r.cuisine))) out.add(r.id);
  }
  return out;
}

/**
 * Everything that must hold for any viewer, however they were made: one list
 * with nothing excluded in it, matches that deserve the name, a tail ordered by
 * quality, a reason on every row that fits the card and never lies about its
 * kind. Returns the independent scan so a caller can look at the scores.
 */
function checkRank(label, input, res) {
  const { restaurants, traits } = input;
  const fail = (m) => `${label}: ${m}`;
  const want = expectedExclude(input);

  // The list.
  assert.equal(new Set(res.order).size, res.order.length, fail("duplicate id in order"));
  assert.equal(res.rank.size, res.order.length, fail("rank map size"));
  res.order.forEach((id, i) => assert.equal(res.rank.get(id), i, fail("rank map position")));
  const candidates = new Set(restaurants.map((r) => r.id));
  for (const id of res.order) {
    assert.ok(candidates.has(id), fail(`${id} is not a candidate`));
    assert.ok(!want.has(id), fail(`excluded id ${id} leaked into the list`));
  }
  assert.ok(sameSet(res.exclude, want), fail("exclude set"));
  assert.ok(sameSet(tasteExclusions(input), want), fail("tasteExclusions disagrees with rankTaste"));
  assert.equal(
    res.order.length,
    restaurants.filter((r) => !want.has(r.id)).length,
    fail("every candidate that is not excluded is listed"),
  );
  assert.ok(res.matched >= 0 && res.matched <= res.order.length, fail("matched range"));
  assert.ok(res.seeds >= 0 && res.seeds <= WEIGHTS.maxSeeds, fail("seed cap"));
  for (const id of [...want].slice(0, 8)) assert.equal(res.reasonOf(id), null, fail("reason for an excluded id"));
  assert.equal(res.reasonOf("no-such-place"), null, fail("reason for an unknown id"));

  // Scores, recomputed on the side.
  const scan = scoreAll(input);
  const scored = new Map(scan.scored.map((s) => [s.r.id, s]));
  assert.equal(scored.size, res.order.length, fail("scan and list disagree on size"));

  // Reasons: present, short, normalized, kinds that match the block.
  for (let i = 0; i < res.order.length; i++) {
    const id = res.order[i];
    const reason = res.reasonOf(id);
    assert.ok(reason, fail(`no reason for ${id}`));
    assert.ok(KINDS.has(reason.kind), fail(`reason kind ${reason.kind}`));
    assert.ok(
      reason.text.length > 0 && reason.text.length <= WEIGHTS.reasonMaxChars,
      fail(`reason length ${reason.text.length}: ${reason.text}`),
    );
    assert.equal(reason.text, reason.text.normalize("NFC"), fail("reason is not NFC"));
    assert.equal(res.reasonOf(id), reason, fail("reason is not kept"));
    if (i < res.matched) {
      assert.notEqual(reason.kind, "rated", fail(`match ${id} reads as well rated`));
    } else {
      assert.equal(reason.kind, "rated", fail(`tail ${id} claims ${reason.kind}`));
    }
    if (reason.kind === "like") {
      // A "Like X: dish" line needs a real profile on both sides.
      const s = scored.get(id);
      const a = traitsOf(traits, id);
      const b = traitsOf(traits, scan.seeds[s.seed].id);
      assert.ok(a && b && !a.imputed && !b.imputed, fail(`like reason from an imputed profile: ${reason.text}`));
      assert.ok(reason.text.startsWith("Like "), fail(reason.text));
    }
  }

  // Block 1: gate, siblings, one per chain, one per menu, best score first.
  const chains = new Set();
  const menus = new Set();
  const menuKey = (s) => {
    const t = traitsOf(traits, s.r.id);
    return t && !t.empty && !t.imputed ? `${dishSetKey(t)}|${s.r.cuisine ?? ""}` : null;
  };
  for (const id of res.order.slice(0, res.matched)) {
    const s = scored.get(id);
    assert.ok(isMatch(s), fail(`${id} is a match without earning it`));
    const ck = chainKey(s.r);
    assert.ok(!chains.has(ck), fail(`two matches from one chain: ${ck}`));
    chains.add(ck);
    const mk = menuKey(s);
    if (mk) {
      assert.ok(!menus.has(mk), fail(`two matches on one menu: ${s.r.name}`));
      menus.add(mk);
    }
  }
  if (res.matched > 0) {
    const lead = scored.get(res.order[0]);
    for (const s of scan.scored) if (isMatch(s)) assert.ok(cmpScore(lead, s) <= 0, fail("first match is not the best score"));
  }

  // Block 2: ordered by quality; nothing the viewer has been to is a match; what
  // earned a slot and is in the tail was set aside for a duplicate.
  const tail = res.order.slice(res.matched).map((id) => scored.get(id));
  for (let i = 1; i < tail.length; i++) assert.ok(cmpTail(tail[i - 1], tail[i]) <= 0, fail("tail order"));
  for (const s of tail) {
    if (!isMatch(s)) continue;
    const mk = menuKey(s);
    assert.ok(chains.has(chainKey(s.r)) || (mk && menus.has(mk)), fail(`${s.r.name} dropped out of the matches without a duplicate`));
  }
  for (const s of scan.scored) {
    if (s.sibling) assert.ok(res.rank.get(s.r.id) >= res.matched, fail(`${s.r.name} is a sibling and a match`));
  }
  return scan;
}

/** Ahist and sim recomputed from `similarity` alone, for a sample of candidates. */
function checkAhist(label, input, scan, step = 1) {
  const idx = input.traits;
  const seedTraits = scan.seeds.map((r) => traitsOf(idx, r.id));
  const k = seedTraits.length;
  const conf = Math.min(1, WEIGHTS.confBase + WEIGHTS.confStep * (k - 1));
  assert.ok(Math.abs(conf - historyConfidence(k)) < 1e-12, `${label}: confidence`);
  for (let i = 0; i < scan.scored.length; i += step) {
    const s = scan.scored[i];
    const t = traitsOf(idx, s.r.id);
    let wantAhist = 0;
    let wantSim = 0;
    if (scan.historyActive && t && !t.empty) {
      const sims = seedTraits.map((x) => similarity(t, x)).sort((a, b) => b - a);
      const [t1 = 0, t2 = 0, t3 = 0] = sims;
      wantSim = t1;
      const raw = conf * (WEIGHTS.maxInAhist * t1 + (WEIGHTS.top3InAhist * (t1 + t2 + t3)) / Math.min(3, k));
      wantAhist = Math.min(1, Math.max(0, raw));
    }
    assert.ok(Math.abs(s.Ahist - wantAhist) < 1e-9, `${label}: Ahist of ${s.r.name} is ${s.Ahist}, expected ${wantAhist}`);
    assert.ok(Math.abs(s.sim - wantSim) < 1e-9, `${label}: sim of ${s.r.name}`);
  }
}

/* ---------- fixture ---------- */

let seq = 0;
const R = (name, cuisine, o = {}) => ({
  id: `r${String(++seq).padStart(3, "0")}`,
  name,
  cuisine,
  cuisineSecondary: o.secondary,
  neighborhood: o.hood ?? "Downtown",
  rating: o.rating === undefined ? 4.5 : o.rating,
  reviewCount: o.reviews ?? 300,
  photo: "photo" in o ? o.photo : "p.jpg",
});

const corpus = [];
const rows = [];
/** A restaurant, and (when dishes are given) its menu profile row. */
const place = (name, cuisine, dishes, service, o) => {
  const r = R(name, cuisine, o);
  corpus.push(r);
  if (dishes) rows.push({ restaurantId: r.id, dishTypes: dishes, service: service ?? null });
  return r;
};
const group = (names, cuisine, core, extras, service, o) =>
  names.map((nm, i) => place(nm, cuisine, [...core, extras[i]], service, o));

const HIGH = { rating: 4.9, reviews: 900 };
const MID = { rating: 4.5, reviews: 300 };

// Japanese: three clusters that share a cuisine and little else.
const ramen = group(
  ["Ichiban Ramen House", "Hakata Ramen Bar", "Kuro Noodle Lab", "Menya Tonkotsu", "Shio Ramen Stand", "Miso Ramen Garden", "Tsuke Noodle Co", "Santouka Ramen Hall"],
  "Japanese",
  ["ramen", "gyoza", "tonkotsu"],
  ["karaage", "edamame", "chashu", "mazesoba", "tsukemen", "onigiri", "katsu", "takoyaki"],
  "counter",
  HIGH,
);
// The same menu as ramen[0] under another name: one of the two earns the slot.
const twin = place("Twin Noodle Bar", "Japanese", ["ramen", "gyoza", "tonkotsu", "karaage"], "counter", HIGH);
const izakaya = group(
  ["Torii Yakitori", "Sake Alley Pub", "Robata Corner", "Tsuki Izakaya"],
  "Japanese",
  ["yakitori", "karaage", "edamame"],
  ["skewer", "sake", "tsukune", "udon"],
  "bar",
  HIGH,
);
const sushi = group(
  ["Blue Nigiri", "Kai Sushi Counter", "Umi Roll Bar", "Sora Sashimi House"],
  "Japanese",
  ["nigiri", "sashimi", "roll"],
  ["tempura", "miso soup", "uni", "unagi"],
  "full_service",
  HIGH,
);
const thai = group(
  ["Siam Orchid", "Bangkok Bowl", "Lanna Table", "Basil Leaf Thai", "Chiang Mai Kitchen", "Phuket Pantry"],
  "Thai",
  ["pad thai", "green curry", "tom yum"],
  ["papaya salad", "satay", "mango rice", "larb", "pad see ew", "khao soi"],
  "full_service",
  MID,
);
const italian = group(
  ["Napoli Oven", "Trattoria Rosa", "Casa Verde Pizzeria", "Mama Lucia", "Roma Kitchen", "Nonna's Table"],
  "Italian",
  ["pizza", "pasta", "tiramisu"],
  ["gnocchi", "risotto", "calzone", "bruschetta", "lasagna", "panini"],
  "full_service",
  MID,
);
const burgers = group(
  ["Patty Shack", "Stack House", "Smash Corner", "Grill Daddy", "Bun Theory", "Flame Burger Co"],
  "Burgers",
  ["burger", "fry", "shake"],
  ["onion ring", "hot dog", "wing", "salad", "chili", "slider"],
  "fast_casual",
  MID,
);
const rubios = ["La Jolla", "Pacific Beach", "Mission Valley"].map((loc) =>
  place(`Rubio's Baja Grill ${loc}`, "Mexican", ["fish taco", "burrito", "churro"], "fast_casual", MID),
);
const taquerias = [
  place("Tacos Lupita", "Mexican", ["carne asada taco", "burrito", "horchata"], "counter", MID),
  place("El Gordo Taqueria", "Mexican", ["al pastor taco", "burrito", "agua fresca"], "counter", MID),
  place("Carnitas Rey", "Mexican", ["carnitas taco", "burrito", "tamale"], "counter", MID),
];

// Edge places: long text, no rating, no photo, accents.
const longName = place("The Extraordinarily Long Named Restaurant That Never Ends Grill", "Italian", ["pizza", "pasta", "tiramisu", "porchetta"], "full_service", MID);
const accent = place("Café Roma", "Italian", ["pizza", "pasta", "tiramisu", "cannoli"], "cafe", MID);
const dimBistro = place("Dim Corner Bistro", "Italian", ["pizza", "pasta", "ravioli", "focaccia"], "full_service", { rating: 3.9, reviews: 12, photo: null });
const unrated = place("Unrated Trattoria", "Italian", ["pizza", "pasta", "osso buco", "minestrone"], "full_service", { rating: null });
const LONG_HOOD = "A Very Long Neighborhood Name That Easily Exceeds The Limit";
const longHood = place("Overlook Pasta House", "Italian", ["pizza", "pasta", "carbonara", "arancini"], "full_service", { ...HIGH, hood: LONG_HOOD });

// Cuisines with too few profiles for a centroid.
const greek = [
  place("Olive Branch", "Greek", ["gyro", "souvlaki", "baklava"], "full_service", MID),
  place("Aegean Table", "Greek", ["gyro", "moussaka", "spanakopita"], "full_service", MID),
];
const impGreek = place("Zorba Corner", "Greek", null, null, MID);

// No usable profile: imputed from the cuisine's centroid, or from nothing.
const impJp = place("Sakura Corner Cafe", "Japanese", null, null, MID);
const impJp2 = place("Matcha Moon Cafe", "Japanese", null, null, MID);
const impTh = place("Golden Elephant", "Thai", null, null, MID);
const impEth = place("Addis Table", "Ethiopian", null, null, MID);
const impGeneric = place("Generic Grill", "Italian", ["Appetizers", "Desserts"], "full_service", MID);
const fusionP = place("Fusion Lab", "Japanese", ["ramen", "pad thai", "curry"], "full_service", { secondary: ["Thai"], rating: 3.9, reviews: 20, photo: null });
const fusionI = place("Fusion Cafe", "Japanese", null, null, { ...MID, secondary: ["Thai"] });
const empty = place("Mystery Kitchen", null, null, null, { rating: 5 });
const noCuisine = place("Nameless Pantry", null, ["soup", "bread", "stew"], "cafe", MID);
const LONG_CUISINE = "Contemporary Pan-Asian Street Food And Noodles";
const longCuisine = ["Wok Wagon", "Noodle Nomad", "Street Orchid"].map((nm) => place(nm, LONG_CUISINE, null, null, MID));
const fillers = Array.from({ length: 40 }, (_, i) => place(`Filler${i} Diner`, "American", null, null, MID));

const idx = buildTraitIndex(corpus, rows);
const base = { restaurants: corpus, plates: {}, prefs: EMPTY_PREFS, postedIds: [], friendVisits: [], traits: idx };
const rank = (o = {}) => rankTaste({ ...base, ...o });
const scan = (o = {}) => scoreAll({ ...base, ...o });
const prefs = (p) => ({ ...EMPTY_PREFS, ...p });
const run = (label, o = {}) => {
  const input = { ...base, ...o };
  const res = rankTaste(input);
  const sc = checkRank(label, input, res);
  return { res, sc, input };
};
const scoredOf = (sc, r) => sc.scored.find((s) => s.r.id === r.id);
const matchesOf = (res) => res.order.slice(0, res.matched);
const ids = (rs) => rs.map((r) => r.id);
const byIdMap = new Map(corpus.map((r) => [r.id, r]));
const cuisineOfId = (id) => byIdMap.get(id).cuisine;
const friend = (r, friendId, name) => ({ restaurantId: r.id, friendId, name });

/* ---------- the gate: one place is enough ---------- */

ok("one post is history", () => {
  const { res, sc, input } = run("1 post", { postedIds: [ramen[0].id] });
  assert.equal(res.basis, "history");
  assert.equal(res.seeds, 1);
  assert.equal(res.header, "Based on 1 place so far; post more to sharpen this");
  assert.ok(res.matched > 0);
  // The place that looks most like the one place: its twin on every count.
  assert.equal(res.order[0], twin.id);
  const lead = scoredOf(sc, twin);
  assert.ok(Math.abs(lead.Ahist - historyConfidence(1)) < 1e-9, "a perfect twin scores the confidence of one seed");
  assert.match(res.reasonOf(twin.id).text, /^Like Ichiban Ramen House: /);
  assert.equal(res.reasonOf(twin.id).kind, "like");
  checkAhist("1 post", input, sc);
});

ok("Your taste keeps its three-post gate", () => {
  const one = scoreTaste({ restaurants: corpus, plates: {}, prefs: EMPTY_PREFS, postedIds: [ramen[0].id], friendVisits: [] });
  assert.equal(one.basis, "none");
  assert.deepEqual(one.picks, []);
});

ok("two posts, three posts, and the headers", () => {
  const two = run("2 posts", { postedIds: [ramen[0].id, thai[0].id] });
  assert.equal(two.res.basis, "history");
  assert.equal(two.res.seeds, 2);
  assert.equal(two.res.header, "Based on 2 places so far; post more to sharpen this");
  checkAhist("2 posts", two.input, two.sc);

  const three = run("3 posts", { postedIds: [ramen[0].id, thai[0].id, italian[0].id] });
  assert.equal(three.res.seeds, 3);
  assert.equal(three.res.header, "From the 3 places you've been");
  checkAhist("3 posts", three.input, three.sc);

  const six = run("6 posts", { postedIds: [ramen[0].id, thai[0].id, italian[0].id, burgers[0].id, izakaya[0].id, rubios[0].id] });
  assert.equal(six.res.header, "From the 6 places you've been");
  checkAhist("6 posts", six.input, six.sc);
});

ok("confidence grows with seeds and stops at one", () => {
  assert.ok(historyConfidence(1) < historyConfidence(2));
  assert.ok(historyConfidence(2) < historyConfidence(3));
  assert.equal(historyConfidence(3), 1);
  assert.equal(historyConfidence(30), 1);
  for (let k = 1; k <= 30; k++) assert.ok(historyConfidence(k) > 0 && historyConfidence(k) <= 1);
});

ok("marked-been counts like a post", () => {
  const a = rank({ prefs: prefs({ been: [ramen[0].id] }) });
  const b = rank({ postedIds: [ramen[0].id] });
  assert.equal(a.basis, "history");
  assert.equal(a.header, b.header);
  assert.deepEqual(a.order, b.order);
  run("been", { prefs: prefs({ been: [ramen[0].id] }) });
});

ok("a seed needs something to compare on", () => {
  // Visited, and so left out of the list, but nothing to read taste from.
  const only = run("empty place", { postedIds: [empty.id] });
  assert.equal(only.res.basis, "none");
  assert.equal(only.res.seeds, 0);
  assert.equal(only.res.header, "Pick what you like to tune this");
  assert.equal(only.res.matched, 0);
  assert.ok(!only.res.order.includes(empty.id));

  const withReal = run("empty plus real", { postedIds: [empty.id, ramen[0].id] });
  assert.equal(withReal.res.seeds, 1);
  assert.equal(withReal.res.basis, "history");

  const strangers = run("unknown ids", { postedIds: ["gone-1"], prefs: prefs({ been: ["gone-2"], hidden: ["gone-3"] }) });
  assert.equal(strangers.res.basis, "none");
  assert.equal(strangers.res.order.length, corpus.length);

  // A place with a menu and no cuisine is a perfectly good seed.
  const menuOnly = run("menu without cuisine", { postedIds: [noCuisine.id] });
  assert.equal(menuOnly.res.seeds, 1);
  assert.equal(menuOnly.res.basis, "history");
});

ok("seeds: newest been first, then posts, no repeats, at most thirty", () => {
  const a = fillers[0];
  const b = fillers[1];
  const c = fillers[2];
  const s = scan({ prefs: prefs({ been: [a.id, b.id] }), postedIds: [c.id, a.id] });
  assert.deepEqual(ids(s.seeds), [b.id, a.id, c.id]);

  const posted = fillers.map((r) => r.id);
  const many = run("40 posts", { postedIds: posted });
  assert.equal(many.res.seeds, WEIGHTS.maxSeeds);
  assert.equal(many.res.header, `From the ${WEIGHTS.maxSeeds} places you've been`);
  assert.equal(ids(many.sc.seeds).join(), posted.slice(0, WEIGHTS.maxSeeds).join(), "posts keep the order given");
  // Every one of the forty is still left out, seed or not.
  for (const id of posted) assert.ok(!many.res.order.includes(id));
  assert.equal(many.res.order.length, corpus.length - 40);

  const old = fillers.map((r) => r.id);
  const newest = scan({ prefs: prefs({ been: old }) });
  assert.equal(newest.seeds[0].id, old[old.length - 1], "the last been is the newest");
  assert.equal(newest.seeds.length, WEIGHTS.maxSeeds);
  assert.ok(!ids(newest.seeds).includes(old[0]), "the oldest fall off the end");
});

/* ---------- cold start: nothing to go on ---------- */

ok("cold start is the well-rated list", () => {
  const { res, sc } = run("cold");
  assert.equal(res.basis, "none");
  assert.equal(res.header, "Pick what you like to tune this");
  assert.equal(res.seeds, 0);
  assert.equal(res.matched, 0);
  assert.equal(res.order.length, corpus.length);
  for (const id of res.order) assert.equal(res.reasonOf(id).kind, "rated");
  // Best quality first, then plate score, then id.
  const q = res.order.map((id) => scoredOf(sc, byIdMap.get(id)).Q);
  for (let i = 1; i < q.length; i++) assert.ok(q[i - 1] >= q[i] - 1e-12, "tail is ordered by quality");
  assert.ok(res.rank.get(ramen[0].id) < res.rank.get(dimBistro.id), "a high-quality place leads a low one");
  // A fixture place with every part of quality is read aloud with its hood.
  assert.equal(res.reasonOf(ramen[0].id).text, "Well rated in Downtown");
  assert.equal(res.reasonOf(longHood.id).text.length <= WEIGHTS.reasonMaxChars, true);
  assert.ok(res.reasonOf(longHood.id).text.startsWith("Well rated in A Very Long"));
  assert.ok(res.reasonOf(longHood.id).text.endsWith("…"));
  // No rating, or a poor and photoless one: no claim of quality.
  assert.equal(res.reasonOf(unrated.id).text, "Worth a look");
  assert.equal(res.reasonOf(dimBistro.id).text, "Worth a look");
});

ok("a signed-in viewer with history and a weak tail place reads 'different'", () => {
  const { res } = run("tail wording", { postedIds: [ramen[0].id] });
  assert.equal(res.reasonOf(dimBistro.id).text, "Different from your usual");
  assert.equal(res.reasonOf(ramen[1].id).kind, "like");
});

ok("cold start with friends", () => {
  const friendVisits = [
    friend(thai[2], "f1", "Ana"),
    friend(thai[2], "f2", "Ben"),
    friend(thai[2], "f2", "Ben"),
    friend(italian[1], "f1", "Ana"),
    friend(burgers[3], "f1", "Ana"),
    friend(burgers[3], "f2", "Ben"),
    friend(burgers[3], "f3", "Cam"),
  ];
  const { res } = run("friends", { friendVisits });
  assert.equal(res.basis, "none");
  assert.equal(res.header, "Where your friends eat");
  assert.equal(res.matched, 3);
  assert.deepEqual(new Set(matchesOf(res)), new Set([thai[2].id, italian[1].id, burgers[3].id]));
  // Two friends fill the friend term; a third adds nothing, so it falls to quality.
  assert.equal(res.reasonOf(thai[2].id).text, "2 friends have been");
  assert.equal(res.reasonOf(burgers[3].id).text, "3 friends have been");
  assert.equal(res.reasonOf(italian[1].id).text, "1 friend has been");
  assert.equal(res.reasonOf(thai[2].id).kind, "friends");
  assert.ok(res.rank.get(thai[2].id) < res.rank.get(italian[1].id), "two friends beat one");
  assert.ok(res.rank.get(burgers[3].id) < res.rank.get(italian[1].id), "three friends beat one");
});

ok("friends at places the viewer cannot see do not show", () => {
  const friendVisits = [friend(ramen[0], "f1", "Ana"), friend(ramen[1], "f1", "Ana"), friend(ramen[2], "f1", "Ana")];
  const { res } = run("friends excluded", {
    postedIds: [ramen[0].id],
    prefs: prefs({ hidden: [ramen[1].id] }),
    friendVisits,
  });
  assert.ok(!res.order.includes(ramen[0].id) && !res.order.includes(ramen[1].id));
  assert.ok(res.order.includes(ramen[2].id));
  assert.equal(res.reasonOf(ramen[2].id).kind, "like", "a better fit for the same place speaks first");
});

/* ---------- picks ---------- */

ok("picks are a basis of their own", () => {
  const one = run("loves thai", { prefs: prefs({ loves: ["Thai"] }) });
  assert.equal(one.res.basis, "picks");
  assert.equal(one.res.seeds, 0);
  assert.equal(one.res.header, "Based on your picks: Thai");
  for (const t of thai) assert.ok(one.res.rank.get(t.id) < one.res.matched, `${t.name} is a match`);
  for (const id of matchesOf(one.res)) {
    assert.equal(one.res.reasonOf(id).kind, "pick");
    // A main-cuisine match is "picked"; a secondary-only one says so, because it is not the same claim.
    assert.equal(one.res.reasonOf(id).text, cuisineOfId(id) === "Thai" ? "You picked Thai" : "Also serves Thai");
  }
  assert.ok(matchesOf(one.res).every((id) => cuisineOfId(id) === "Thai" || byIdMap.get(id).cuisineSecondary?.includes("Thai")));

  const two = run("loves two", { prefs: prefs({ loves: ["Thai", "Italian"] }) });
  assert.equal(two.res.header, "Based on your picks: Thai and Italian");
  const three = run("loves three", { prefs: prefs({ loves: ["Thai", "Italian", "Burgers"] }) });
  assert.equal(three.res.header, "Based on your picks: Thai, Italian and Burgers");
});

ok("a favorite cuisine speaks as one", () => {
  const { res } = run("favorite", { prefs: prefs({ loves: ["Thai"] }), favoriteCuisine: "Burgers" });
  assert.equal(res.basis, "picks");
  assert.equal(res.header, "Based on your picks: Thai and Burgers");
  assert.equal(res.reasonOf(burgers[0].id).text, "Your favorite: Burgers");
  assert.equal(res.reasonOf(thai[0].id).text, "You picked Thai");
});

ok("a skip beats a love, and an unknown cuisine is ignored", () => {
  const skipped = run("skip wins", { prefs: prefs({ loves: ["Thai"], skips: ["Thai"] }) });
  assert.equal(skipped.res.basis, "none");
  for (const t of thai) assert.ok(skipped.res.exclude.has(t.id));
  const unknown = run("unknown love", { prefs: prefs({ loves: ["Atlantean"], skips: ["Atlantean"] }) });
  assert.equal(unknown.res.basis, "none");
  assert.equal(unknown.res.order.length, corpus.length);
});

ok("picks and history together", () => {
  const { res, sc } = run("mixed", { postedIds: [ramen[0].id], prefs: prefs({ loves: ["Thai"] }) });
  assert.equal(res.basis, "history");
  assert.equal(res.header, "Based on 1 place so far, plus Thai; post more to sharpen this");
  const t = scoredOf(sc, thai[0]);
  assert.ok(Math.abs(t.A - (WEIGHTS.pickInA * t.Apick + WEIGHTS.histInA * t.Ahist)) < 1e-9, "A mixes the two");
  assert.equal(res.reasonOf(thai[0].id).text, "You picked Thai");
  assert.equal(res.reasonOf(twin.id).kind, "like");
  const three = run("mixed header", { postedIds: [ramen[0].id, ramen[1].id, ramen[2].id], prefs: prefs({ loves: ["Thai"] }) });
  assert.equal(three.res.header, "From the 3 places you've been, plus Thai");
});

/* ---------- what never shows ---------- */

ok("visited, hidden and skipped places are left out", () => {
  const input = {
    postedIds: [ramen[0].id, thai[0].id],
    prefs: prefs({ been: [italian[0].id], hidden: [burgers[0].id, "gone-1"], skips: ["Mexican", "Atlantean"], loves: ["Burgers"] }),
  };
  const { res } = run("exclusions", input);
  for (const r of [ramen[0], thai[0], italian[0], burgers[0], ...rubios, ...taquerias]) {
    assert.ok(res.exclude.has(r.id), `${r.name} is excluded`);
    assert.ok(!res.order.includes(r.id), `${r.name} is not listed`);
    assert.equal(res.rank.has(r.id), false);
  }
  // Only the main cuisine counts for a skip, and no cuisine is never skipped.
  assert.ok(res.order.includes(fusionP.id) && res.order.includes(empty.id));
  assert.equal(res.order.length + res.exclude.size, corpus.length);

  const none = run("hide everything", { prefs: prefs({ hidden: corpus.map((r) => r.id) }) });
  assert.deepEqual(none.res.order, []);
  assert.equal(none.res.matched, 0);
});

ok("a filtered candidate list still reads the whole corpus", () => {
  // What the route does: rank every candidate that survived a filter, but read
  // seeds and exclusions from the corpus behind it.
  const candidates = [...thai, ...italian, ...burgers];
  const input = { ...base, restaurants: candidates, corpus, postedIds: [ramen[0].id, thai[0].id], prefs: prefs({ skips: ["Burgers"] }) };
  const res = rankTaste(input);
  checkRank("candidates", input, res);
  assert.equal(res.seeds, 2, "seeds come from the corpus, not from the candidates");
  assert.ok(!res.order.includes(thai[0].id) && !res.order.some((id) => cuisineOfId(id) === "Burgers"));
  assert.ok(res.exclude.has(ramen[0].id), "a visited place outside the candidates is still excluded");
  assert.equal(res.order.length, thai.length - 1 + italian.length);
});

/* ---------- chains and shared menus ---------- */

ok("branches of a chain the viewer has been to are never matches", () => {
  const { res } = run("sibling", { postedIds: [rubios[0].id] });
  for (const r of [rubios[1], rubios[2]]) {
    assert.ok(res.order.includes(r.id), "still listed");
    assert.ok(res.rank.get(r.id) >= res.matched, `${r.name} sits in the tail`);
    assert.equal(res.reasonOf(r.id).kind, "rated");
  }
  // Even with a friend there: a place you have effectively been is not news.
  const withFriend = run("sibling with friend", { postedIds: [rubios[0].id], friendVisits: [friend(rubios[1], "f1", "Ana")] });
  assert.ok(withFriend.res.rank.get(rubios[1].id) >= withFriend.res.matched);
});

ok("one branch per chain among the matches", () => {
  const { res } = run("chain", { prefs: prefs({ loves: ["Mexican"] }) });
  const inMatches = rubios.filter((r) => res.rank.get(r.id) < res.matched);
  assert.equal(inMatches.length, 1);
  assert.equal(inMatches[0].id, rubios[0].id, "the tie goes to the lowest id");
  for (const t of taquerias) assert.ok(res.rank.get(t.id) < res.matched);
});

ok("one place per menu in a cuisine", () => {
  const { res } = run("same menu", { postedIds: [ramen[1].id] });
  const both = [ramen[0], twin];
  const kept = both.filter((r) => res.rank.get(r.id) < res.matched);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, ramen[0].id);
  assert.ok(res.rank.get(twin.id) >= res.matched, "the other drops to the tail");
  assert.equal(res.reasonOf(twin.id).kind, "rated");
});

/* ---------- reasons ---------- */

ok("a like reason names the seed and the dishes they share", () => {
  const { res, input } = run("like", { postedIds: [ramen[0].id] });
  const a = traitsOf(idx, ramen[1].id);
  const b = traitsOf(idx, ramen[0].id);
  const parts = similarityParts(idx, a, b);
  assert.ok(parts.shared.length >= 2 && !parts.imputed);
  const [t1, t2] = parts.shared.map((t) => termLabel(idx, t));
  assert.equal(res.reasonOf(ramen[1].id).text, `Like Ichiban Ramen House: ${t1}, ${t2}`);
  void input;
});

ok("with no dish in common it falls back to the cuisine", () => {
  const { res } = run("both cuisine", { postedIds: [ramen[0].id] });
  const parts = similarityParts(idx, traitsOf(idx, sushi[0].id), traitsOf(idx, ramen[0].id));
  assert.equal(parts.shared.length, 0);
  assert.deepEqual(parts.sharedCuisines, ["Japanese"]);
  assert.ok(res.rank.get(sushi[0].id) < res.matched);
  assert.equal(res.reasonOf(sushi[0].id).text, "Like Ichiban Ramen House: both Japanese");
});

ok("friends outweigh a weak fit, a strong fit outweighs friends", () => {
  const friendVisits = [friend(burgers[0], "f1", "Ana"), friend(burgers[0], "f2", "Ben"), friend(ramen[1], "f1", "Ana")];
  const { res } = run("who speaks first", { postedIds: [ramen[0].id], friendVisits });
  assert.equal(res.reasonOf(burgers[0].id).text, "2 friends have been");
  assert.equal(res.reasonOf(ramen[1].id).kind, "like");
});

ok("reasons fit the card", () => {
  // A seed whose name alone is longer than the line.
  const long = run("long seed", { postedIds: [longName.id] });
  const like = long.res.reasonOf(italian[0].id);
  assert.equal(like.kind, "like");
  assert.ok(like.text.startsWith("Like The Extraordinarily"));
  assert.ok(like.text.length <= WEIGHTS.reasonMaxChars && like.text.endsWith("…"), like.text);

  // A cuisine whose name alone is longer than the line, on a pair with no dishes.
  const lc = run("long cuisine", { postedIds: [longCuisine[0].id, longCuisine[1].id] });
  const more = lc.res.reasonOf(longCuisine[2].id);
  assert.equal(more.kind, "cuisine");
  assert.ok(more.text.startsWith("More Contemporary Pan-Asian"));
  assert.ok(more.text.length <= WEIGHTS.reasonMaxChars && more.text.endsWith("…"), more.text);
  const pick = run("long pick", { prefs: prefs({ loves: [LONG_CUISINE] }) });
  assert.ok(pick.res.reasonOf(longCuisine[0].id).text.length <= WEIGHTS.reasonMaxChars);
  assert.ok(pick.res.reasonOf(longCuisine[0].id).text.startsWith("You picked Contemporary"));

  // Decomposed accents come out composed, and still fit.
  const acc = run("accent", { postedIds: [accent.id] });
  const text = acc.res.reasonOf(italian[1].id).text;
  assert.ok(text.includes("Café Roma"), text);
  assert.equal(text, text.normalize("NFC"));
});

/* ---------- imputed profiles ---------- */

ok("the index separates profiled, imputed and empty places", () => {
  const usable = rows.filter((r) => normalizeDishes(r.dishTypes).length > 0).length;
  assert.equal(idx.profiled, usable);
  assert.equal(traitsOf(idx, impGeneric.id).imputed, true, "a row of only generic words is no profile");
  assert.equal(traitsOf(idx, impJp.id).imputed, true);
  assert.equal(traitsOf(idx, ramen[0].id).imputed, false);
  assert.equal(traitsOf(idx, empty.id).empty, true);
  assert.equal(traitsOf(idx, noCuisine.id).empty, false);
  assert.equal(traitsOf(idx, impEth.id).empty, false, "a cuisine is something to compare on");
  assert.deepEqual([...traitsOf(idx, impEth.id).dishes], []);
});

ok("centroids need three profiles, and an imputed place wears its cuisine's", () => {
  assert.ok(idx.centroids.has("Japanese") && idx.centroids.has("Thai") && idx.centroids.has("Italian"));
  assert.ok(!idx.centroids.has("Greek"), `Greek has ${greek.length} profiles`);
  assert.ok(greek.length < MIN_CENTROID_PROFILES);
  assert.ok(!idx.centroids.has("Ethiopian") && !idx.centroids.has("American"));
  for (const c of idx.centroids.values()) assert.ok(c.length > 0 && c.length <= CENTROID_TERMS);
  assert.deepEqual([...traitsOf(idx, impJp.id).dishes], [...idx.centroids.get("Japanese")]);
  assert.deepEqual([...traitsOf(idx, impTh.id).dishes], [...idx.centroids.get("Thai")]);
  assert.deepEqual([...traitsOf(idx, impGreek.id).dishes], []);
});

ok("an imputed place never shares a menu, and only its main cuisine counts", () => {
  assert.notEqual(dishSetKey(traitsOf(idx, impJp.id)), dishSetKey(traitsOf(idx, impJp2.id)));
  assert.equal(dishSetKey(traitsOf(idx, ramen[0].id)), dishSetKey(traitsOf(idx, twin.id)));
  assert.deepEqual([...traitsOf(idx, fusionP.id).cuisines], [["Japanese", 1], ["Thai", 0.4]]);
  assert.deepEqual([...traitsOf(idx, fusionI.id).cuisines], [["Japanese", 1]]);
});

ok("similarity: symmetric, bounded, firm ceiling for imputed pairs", () => {
  const ceiling = IMPUTED_FACTOR * (SIM_WEIGHTS.dish + SIM_WEIGHTS.cuisine);
  let imputedPairs = 0;
  for (let i = 0; i < corpus.length; i++) {
    const a = traitsOf(idx, corpus[i].id);
    const self = similarity(a, a);
    assert.equal(self, a.empty ? 0 : 1, `${corpus[i].name} with itself`);
    for (let j = i + 1; j < corpus.length; j++) {
      const b = traitsOf(idx, corpus[j].id);
      const s = similarity(a, b);
      assert.equal(s, similarity(b, a), "symmetric");
      assert.ok(s >= 0 && s <= 1);
      const parts = similarityParts(idx, a, b);
      assert.ok(Math.abs(parts.score - s) < 1e-12, "parts agree with the score");
      if (a.imputed || b.imputed) {
        imputedPairs++;
        assert.ok(s <= ceiling + 1e-12, `${corpus[i].name} / ${corpus[j].name}: ${s} > ${ceiling}`);
        assert.equal(parts.service, 0, "service is unknown on an imputed pair");
        assert.deepEqual(parts.shared, [], "an imputed pair shares no named dish");
        assert.ok(parts.imputed);
        assert.ok(Math.abs(s - IMPUTED_FACTOR * (SIM_WEIGHTS.dish * parts.dish + SIM_WEIGHTS.cuisine * parts.cuisine)) < 1e-9);
      } else {
        assert.ok(!parts.imputed);
        const sum = SIM_WEIGHTS.dish * parts.dish + SIM_WEIGHTS.cuisine * parts.cuisine + SIM_WEIGHTS.service * parts.service;
        assert.ok(Math.abs(s - sum) < 1e-9);
      }
      if (a.empty || b.empty) assert.equal(s, 0);
    }
  }
  assert.ok(imputedPairs > 100);
});

ok("a profiled twin beats an imputed one", () => {
  const { sc } = run("profiled vs imputed", { postedIds: [ramen[0].id] });
  const profiled = scoredOf(sc, ramen[1]);
  const imputed = scoredOf(sc, impJp);
  assert.ok(profiled.sim > imputed.sim, `${profiled.sim} vs ${imputed.sim}`);
  assert.ok(profiled.Ahist > imputed.Ahist);
  assert.ok(imputed.sim <= IMPUTED_FACTOR * (SIM_WEIGHTS.dish + SIM_WEIGHTS.cuisine) + 1e-12);
});

ok("an imputed seed never produces a 'like' reason", () => {
  const { res, sc } = run("imputed seed", { postedIds: [impJp.id] });
  assert.equal(res.basis, "history");
  assert.equal(res.seeds, 1);
  assert.ok(res.matched > 0, "its cuisine centroid finds the ramen shops");
  for (const id of res.order) assert.notEqual(res.reasonOf(id).kind, "like");
  const m = matchesOf(res).map((id) => res.reasonOf(id));
  assert.ok(m.every((r) => r.kind === "cuisine" && r.text === "More Japanese"), JSON.stringify(m.slice(0, 3)));
  void sc;
  // And an imputed candidate against a profiled seed: the same.
  const back = run("imputed candidate", { postedIds: [ramen[0].id] });
  assert.notEqual(back.res.reasonOf(impJp.id).kind, "like");
});

ok("with no profiles at all, every place is imputed from its cuisine", () => {
  const bare = buildTraitIndex(corpus, []);
  assert.equal(bare.profiled, 0);
  assert.equal(bare.centroids.size, 0);
  const input = { ...base, traits: bare };
  const cuisineOnly = IMPUTED_FACTOR * SIM_WEIGHTS.cuisine;
  assert.ok(Math.abs(similarity(traitsOf(bare, ramen[0].id), traitsOf(bare, ramen[1].id)) - cuisineOnly) < 1e-12);

  // One seed: cuisine alone may or may not clear the gate; whichever, the list is whole.
  const one = { ...input, postedIds: [ramen[0].id] };
  const r1 = rankTaste(one);
  checkRank("bare, one seed", one, r1);
  const ahist1 = historyConfidence(1) * (WEIGHTS.maxInAhist + WEIGHTS.top3InAhist) * cuisineOnly;
  assert.equal(r1.matched > 0, ahist1 >= WEIGHTS.matchGate, "the gate is read off the maths, not the data");
  assert.equal(r1.basis, "history");
  assert.equal(r1.order.length, corpus.length - 1);

  // Two seeds in a cuisine: more trust, and the matches say "More Japanese".
  const two = { ...input, postedIds: [ramen[0].id, ramen[1].id] };
  const r2 = rankTaste(two);
  checkRank("bare, two seeds", two, r2);
  const t = (WEIGHTS.top3InAhist * 2 * cuisineOnly) / 2;
  const ahist2 = historyConfidence(2) * (WEIGHTS.maxInAhist * cuisineOnly + t);
  assert.equal(r2.matched > 0, ahist2 >= WEIGHTS.matchGate);
  for (const id of matchesOf(r2)) assert.equal(r2.reasonOf(id).text, "More Japanese");
  for (const id of r2.order) assert.notEqual(r2.reasonOf(id).kind, "like");
});

ok("a place with nothing to compare on is a tail place", () => {
  const { res, sc } = run("empty candidate", { postedIds: [ramen[0].id] });
  const e = scoredOf(sc, empty);
  assert.equal(e.A, 0);
  assert.equal(e.sim, 0);
  assert.ok(res.rank.get(empty.id) >= res.matched);
  assert.equal(res.reasonOf(empty.id).kind, "rated");
  const withFriend = run("empty with friend", { friendVisits: [friend(empty, "f1", "Ana")] });
  assert.ok(withFriend.res.rank.get(empty.id) < withFriend.res.matched, "friends alone make a match");
  assert.equal(withFriend.res.reasonOf(empty.id).text, "1 friend has been");
});

/* ---------- the cuisine cap ---------- */

ok("the cuisine cap holds the top of the list to a mix", () => {
  const loves = ["Japanese", "Thai", "Italian", "Burgers"];
  const { res, sc, input } = run("cap", { prefs: prefs({ loves }) });
  assert.equal(res.basis, "picks");
  const L = 14;
  const count = (arr, c) => arr.filter((id) => cuisineOfId(id) === c).length;
  const top = res.order.slice(0, L);
  for (const c of loves) assert.ok(count(top, c) <= Math.ceil(WEIGHTS.cuisineCapShare * L), `${c} holds ${count(top, c)} of ${L}`);
  assert.ok(new Set(top.map(cuisineOfId)).size >= 3, "at least three cuisines in the top fourteen");

  // The fixture is built so the plain score order would be nearly all Japanese.
  const plain = sc.scored.filter(isMatch).sort(cmpScore).slice(0, L).map((s) => s.r.id);
  assert.ok(count(plain, "Japanese") >= L - 2, `uncapped: ${count(plain, "Japanese")} Japanese`);
  assert.ok(count(top, "Japanese") < count(plain, "Japanese"));
  void input;
});

ok("the cap is waived for a weak alternative, not for a decent one", () => {
  // Decent: the viewer has been to a ramen place, so the Japanese ones are real
  // alternatives to the Thai they picked, and the best of them takes the first capped slot.
  const decent = run("relax decent", { postedIds: [ramen[0].id], prefs: prefs({ loves: ["Thai"] }) });
  const lead = scoredOf(decent.sc, thai[0]);
  assert.ok(scoredOf(decent.sc, twin).score >= WEIGHTS.capRelaxRatio * lead.score, "fixture: the twin is a decent alternative");
  assert.equal(decent.res.order.indexOf(twin.id), WEIGHTS.capFromPosition - 1, "the decent alternative takes the first capped slot");

  // Weak: a friend's visit makes a poorly rated Italian place a match, but it scores
  // under capRelaxRatio of the Thai lead, so it waits in plain score order.
  const weak = run("relax weak", { friendVisits: [friend(dimBistro, "f1", "Fay")], prefs: prefs({ loves: ["Thai"] }) });
  const weakLead = scoredOf(weak.sc, thai[0]);
  const dim = scoredOf(weak.sc, dimBistro);
  assert.ok(dim.score < WEIGHTS.capRelaxRatio * weakLead.score, "fixture: the dim bistro is a weak alternative");
  assert.ok(weak.res.rank.get(dimBistro.id) < weak.res.matched, "fixture: the friend makes it a match");
  // The cap passes over an alternative scoring under capRelaxRatio of the place it would displace,
  // so everything that outscores the dim bistro by that margin still comes first.
  const dimRank = weak.res.rank.get(dimBistro.id);
  assert.ok(dimRank > WEIGHTS.capFromPosition - 1, "the weak one does not take the first capped slot");
  for (const id of matchesOf(weak.res)) {
    if (scoredOf(weak.sc, byIdMap.get(id)).score > dim.score / WEIGHTS.capRelaxRatio) {
      assert.ok(weak.res.rank.get(id) < dimRank, `${byIdMap.get(id).name} outscores it by the margin`);
    }
  }
  for (const t of thai) assert.ok(weak.res.rank.get(t.id) < weak.res.rank.get(dimBistro.id));
});

/* ---------- secondary cuisines ---------- */

ok("a secondary-only pick match is discounted, labelled, and kept in the loved cuisine's group", () => {
  const { res, sc } = run("secondary pick", { prefs: prefs({ loves: ["Thai"] }) });
  const main = scoredOf(sc, thai[0]);
  const side = scoredOf(sc, fusionI);
  assert.ok(Math.abs(main.Apick - 1) < 1e-9, "a main-cuisine pick is full strength");
  assert.ok(Math.abs(side.Apick - 0.4) < 1e-9, "a secondary-only pick is discounted to 0.4");
  assert.ok(side.score < main.score, "so it scores below a main match of the same standing");

  // Truthful reason: it does not claim the viewer's pick is what the place is.
  const reason = res.reasonOf(fusionI.id);
  assert.equal(reason.kind, "pick");
  assert.equal(reason.text, "Also serves Thai");
  assert.equal(res.reasonOf(thai[0].id).text, "You picked Thai");

  // It is the same group as the Thai it was matched on, so the cap does not
  // read it as variety: nothing jumps to the first capped slot, every Thai
  // main place stays ahead of it, and the matches are in plain score order.
  for (const t of thai) assert.ok(res.rank.get(t.id) < res.rank.get(fusionI.id), `${t.name} comes before the side-cuisine place`);
  assert.notEqual(res.order.indexOf(fusionI.id), WEIGHTS.capFromPosition - 1, "it does not take the diversity slot");
  const scores = matchesOf(res).map((id) => scoredOf(sc, byIdMap.get(id)).score);
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i] <= scores[i - 1] + 1e-9, "one group: score order");
});

ok("a secondary match with a favorite cuisine says so, and a long cuisine still fits", () => {
  // A favorite counts as a pick, so a secondary favorite is "Also serves" too.
  const fav = run("secondary favorite", { prefs: prefs({ loves: ["Italian"] }), favoriteCuisine: "Thai" });
  assert.equal(fav.res.reasonOf(fusionI.id).text, "Also serves Thai");
  assert.equal(fav.res.reasonOf(thai[0].id).text, "Your favorite: Thai");

  // A main cuisine wins over a secondary one the place also lists.
  const both = run("main beats secondary", { prefs: prefs({ loves: ["Japanese", "Thai"] }) });
  assert.equal(both.res.reasonOf(fusionI.id).text, "You picked Japanese");

  // A secondary named as long as the line is clipped, never overrun.
  const extra = R("Wok & Bar", "American", { secondary: [LONG_CUISINE] });
  const restaurants = [...corpus, extra];
  const long = run("long secondary", { restaurants, traits: buildTraitIndex(restaurants, rows), prefs: prefs({ loves: [LONG_CUISINE] }) });
  const text = long.res.reasonOf(extra.id).text;
  assert.ok(text.startsWith("Also serves Contemporary"), text);
  assert.ok(text.length <= WEIGHTS.reasonMaxChars && text.endsWith("…"), text);
});

ok("a single-cuisine list is not thinned by the cap", () => {
  const { res, sc } = run("single cuisine", { prefs: prefs({ loves: ["Thai"] }), friendVisits: [], postedIds: [] });
  const plain = sc.scored.filter(isMatch).length;
  assert.ok(res.matched <= plain);
  const only = run("one cuisine in the matches", { prefs: prefs({ loves: ["Mexican"] }) });
  assert.ok(matchesOf(only.res).every((id) => cuisineOfId(id) === "Mexican"));
  assert.equal(only.res.matched, 1 + taquerias.length, "one Rubio's and the taquerias, no more cut by the cap");
});

/* ---------- determinism ---------- */

ok("the same input gives the same answer, in any arrival order", () => {
  const rnd = prng(7);
  const scenarios = [
    {},
    { postedIds: [ramen[0].id] },
    { postedIds: [ramen[0].id, thai[0].id, italian[0].id], prefs: prefs({ loves: ["Burgers"], hidden: [ramen[3].id] }) },
    { prefs: prefs({ loves: ["Thai", "Italian"], skips: ["Burgers"] }) },
    {
      postedIds: [sushi[0].id],
      friendVisits: [friend(burgers[1], "f1", "Ana"), friend(burgers[1], "f2", "Ben"), friend(thai[3], "f1", "Ana")],
    },
    { postedIds: fillers.map((r) => r.id) },
  ];
  for (const [k, o] of scenarios.entries()) {
    const input = { ...base, ...o };
    const first = rankTaste(input);
    const again = rankTaste(input);
    assert.deepEqual(first.order, again.order, `scenario ${k}: repeat`);
    assert.equal(first.header, again.header);
    assert.equal(first.matched, again.matched);
    for (const id of first.order) assert.deepEqual(first.reasonOf(id), again.reasonOf(id), `scenario ${k}: reason`);
    for (let t = 0; t < 4; t++) {
      const mixed = {
        ...input,
        restaurants: shuffled(input.restaurants, rnd),
        friendVisits: shuffled(input.friendVisits, rnd),
        postedIds: shuffled(input.postedIds, rnd),
      };
      const other = rankTaste(mixed);
      assert.deepEqual(other.order, first.order, `scenario ${k}: shuffled arrival`);
      assert.equal(other.matched, first.matched);
    }
  }
});

ok("ties break on plate score, then id", () => {
  // Four identical places, three plate scores: quality ties, so the plate decides.
  const clones = ["Alpha", "Bravo", "Charlie", "Delta"].map((nm, i) => ({
    ...R(`${nm} Clone Grill`, "Clone", { ...MID }),
    id: `z${i}`,
  }));
  const cloneRows = clones.map((r) => ({ restaurantId: r.id, dishTypes: [`dish${r.id}`], service: null }));
  const world = [...clones];
  const plates = {
    z0: { percent: 70, dishCount: 5, ratingCount: 30, ready: true },
    z1: { percent: 90, dishCount: 5, ratingCount: 30, ready: true },
    z2: { percent: 70, dishCount: 5, ratingCount: 30, ready: true },
    z3: { percent: 90, dishCount: 5, ratingCount: 30, ready: true },
  };
  const t = buildTraitIndex(world, cloneRows);
  const res = rankTaste({ ...base, restaurants: world, traits: t, plates });
  // z1 and z3 share a percent (so a quality), z0 and z2 share another: ids settle each pair.
  assert.deepEqual(res.order, ["z1", "z3", "z0", "z2"]);
  const flat = rankTaste({ ...base, restaurants: world.slice().reverse(), traits: t, plates: {} });
  assert.deepEqual(flat.order, ["z0", "z1", "z2", "z3"], "no plates at all: ids");
});

/* ---------- seeds, wording, and lists filtered before they are arranged ---------- */

/** A throwaway world: places with ids of the test's choosing and their menu rows. */
function miniWorld(specs) {
  const restaurants = [];
  const rows = [];
  for (const [id, name, cuisine, dishes, o] of specs) {
    restaurants.push({ ...R(name, cuisine, o ?? MID), id });
    if (dishes) rows.push({ restaurantId: id, dishTypes: dishes, service: "counter" });
  }
  return { restaurants, traits: buildTraitIndex(restaurants, rows) };
}
const miniRank = (world, o = {}) => rankTaste({ ...base, ...world, ...o });
const POOR = { rating: 3.9, reviews: 12, photo: null };
const BOWL = ["ramen", "gyoza", "tonkotsu", "karaage"];

ok("seeds: over the cap been and posts take turns, so neither starves the other", () => {
  assert.ok(WEIGHTS.maxSeeds % 2 === 0 && WEIGHTS.maxSeeds <= 30, "fixture assumes an even cap that 25 + 15 places can fill");
  const half = WEIGHTS.maxSeeds / 2;
  const beenIds = fillers.slice(0, 25).map((r) => r.id);
  const postIds = fillers.slice(25).map((r) => r.id);
  const s = scan({ prefs: prefs({ been: beenIds }), postedIds: postIds });
  const got = ids(s.seeds);
  assert.equal(got.length, WEIGHTS.maxSeeds);
  assert.equal(got.filter((id) => beenIds.includes(id)).length, half, "half the seeds are places been");
  assert.equal(got.filter((id) => postIds.includes(id)).length, half, "half are places posted at");
  assert.equal(got[0], beenIds[beenIds.length - 1], "newest been first");
  assert.equal(got[1], postIds[0], "then the first post");
  assert.ok(got.includes(beenIds[beenIds.length - half]) && !got.includes(beenIds[beenIds.length - half - 1]), "the newest been are the ones kept");

  // A long been list does not push every post out, and the other way round.
  const manyBeen = fillers.slice(0, 37).map((r) => r.id);
  const fewPosts = fillers.slice(37).map((r) => r.id);
  const a = scan({ prefs: prefs({ been: manyBeen }), postedIds: fewPosts });
  assert.equal(a.seeds.length, WEIGHTS.maxSeeds);
  for (const id of fewPosts) assert.ok(ids(a.seeds).includes(id), "a post survives a long been list");
  const fewBeen = fillers.slice(0, 3).map((r) => r.id);
  const manyPosts = fillers.slice(3).map((r) => r.id);
  const b = scan({ prefs: prefs({ been: fewBeen }), postedIds: manyPosts });
  assert.equal(b.seeds.length, WEIGHTS.maxSeeds);
  for (const id of fewBeen) assert.ok(ids(b.seeds).includes(id), "a been survives a long post list");

  // Ranking over them is whole and stable.
  const { res } = run("over the cap, both sources", { prefs: prefs({ been: beenIds }), postedIds: postIds });
  assert.equal(res.seeds, WEIGHTS.maxSeeds);
});

ok("the place a reason names is the same whatever order the seeds came in", () => {
  const world = miniWorld([
    ["t1", "Zulu Cafe", "Japanese", BOWL],
    ["t2", "Alpha Cafe", "Japanese", BOWL],
    ["t3", "Candidate Kitchen", "Japanese", ["ramen", "gyoza", "tonkotsu", "chashu"]],
  ]);
  const forward = miniRank(world, { postedIds: ["t1", "t2"] }).reasonOf("t3");
  const backward = miniRank(world, { postedIds: ["t2", "t1"] }).reasonOf("t3");
  assert.equal(forward.kind, "like");
  assert.deepEqual(forward, backward, "the order the seeds arrived in does not change the reason");
  assert.ok(forward.text.includes("Zulu Cafe"), `the two tie on similarity, so the smaller id (t1) is named: ${forward.text}`);
});

ok("'Different from your usual' is said only of a place that is", () => {
  const world = miniWorld([
    ["w0", "Seed Ramen Bar", "Japanese", BOWL],
    ["w1", "Seed Ramen Annex", "Japanese", BOWL, POOR],
    ["w2", "Kuro Ramen North", "Japanese", BOWL, POOR],
    ["w3", "Kuro Ramen South", "Japanese", ["ramen", "gyoza", "tonkotsu", "chashu"], POOR],
    ["w4", "Dim Pasta House", "Italian", ["pizza", "pasta", "ravioli", "focaccia"], POOR],
  ]);
  const res = miniRank(world, { postedIds: ["w0"] });
  const at = (id) => res.rank.get(id);
  assert.ok(at("w2") < res.matched, "the best branch of the chain is a match");
  assert.ok(at("w3") >= res.matched && at("w1") >= res.matched, "its other branch and the branch of a place been to are in the tail");
  assert.equal(res.reasonOf("w4").text, "Different from your usual", "nothing in common with the history");
  // A branch of a place they have been to, and a second branch the chain rule set
  // aside, fit fine: neither is called unusual.
  assert.equal(res.reasonOf("w1").text, "Worth a look");
  assert.equal(res.reasonOf("w3").text, "Worth a look");
  for (const id of ["w1", "w3", "w4"]) assert.equal(res.reasonOf(id).kind, "rated");

  // Picks count as signal, so a place outside them is "different" too; with no
  // signal at all there is nothing to differ from.
  const picked = miniRank(world, { prefs: prefs({ loves: ["Japanese"] }) });
  assert.equal(picked.reasonOf("w4").text, "Different from your usual");
  assert.equal(miniRank(world).reasonOf("w4").text, "Worth a look");
});

ok("a match on a cuisine the seed shares names that cuisine, not the candidate's own", () => {
  // Fusion Lab is filed as Japanese with Thai on the side, and its menu is Thai.
  // The only place they have been is Thai and has no profile, so the match rests
  // on cuisine alone, and the cuisine it rests on is Thai.
  const world = miniWorld([
    ["c0", "Golden Orchid", "Thai", null],
    ["c1", "Fusion Lab", "Japanese", ["pad thai", "green curry", "tom yum", "satay"], { ...MID, secondary: ["Thai"] }],
    ["c2", "Thai One", "Thai", ["pad thai", "green curry", "tom yum"]],
    ["c3", "Thai Two", "Thai", ["pad thai", "green curry", "satay"]],
    ["c4", "Thai Three", "Thai", ["pad thai", "tom yum", "satay"]],
    ["c5", "Thai Four", "Thai", ["green curry", "tom yum", "satay"]],
  ]);
  const res = miniRank(world, { postedIds: ["c0"] });
  assert.ok(res.rank.get("c1") < res.matched, "fixture: the fusion place is a match");
  assert.deepEqual(res.reasonOf("c1"), { kind: "cuisine", text: "More Thai" });
  for (const id of res.order.slice(0, res.matched)) assert.equal(res.reasonOf(id).text, "More Thai");
});

ok("rankAmong: a filter decides the dedupe, the matches and the header among its own rows", () => {
  // A chain's best branch outside the filter must not leave the branch inside it in the tail.
  const world = miniWorld([
    ["w0", "Seed Ramen Bar", "Japanese", BOWL],
    ["w2", "Kuro Ramen North", "Japanese", BOWL],
    ["w3", "Kuro Ramen South", "Japanese", ["ramen", "gyoza", "tonkotsu", "chashu"]],
    ["w5", "Plain Pasta", "Italian", ["pizza", "pasta", "ravioli", "focaccia"]],
  ]);
  const full = miniRank(world, { postedIds: ["w0"] });
  assert.ok(full.rank.get("w2") < full.matched && full.rank.get("w3") >= full.matched, "fixture: the south branch is set aside in the full list");

  const inside = full.rankAmong(new Set(["w3", "w5"]));
  assert.deepEqual(new Set(inside.order), new Set(["w3", "w5"]));
  assert.ok(inside.rank.get("w3") < inside.matched, "with the north branch filtered out, the south one is a match");
  assert.equal(inside.reasonOf("w3").kind, "like");
  assert.notEqual(full.reasonOf("w3").kind, "like", "and in the full list it was not");
  assert.equal(inside.reasonOf("w2"), null, "a place outside the set has no reason here");
  inside.order.forEach((id, i) => assert.equal(inside.rank.get(id), i, "rank is the position in order"));

  // Ids that are not candidates (the place they have been, a stranger) are ignored.
  const noisy = full.rankAmong(new Set(["w3", "w5", "w0", "nope"]));
  assert.deepEqual(noisy.order, inside.order);
  assert.equal(noisy.matched, inside.matched);
  // A set that covers every candidate is the full arrangement.
  const wide = full.rankAmong(new Set([...full.order, "w0", "nope"]));
  assert.deepEqual(wide.order, full.order);
  assert.equal(wide.matched, full.matched);
  assert.equal(wide.header, full.header);
  // The same question twice gets the same answer.
  assert.deepEqual(full.rankAmong(new Set(["w3", "w5"])).order, inside.order);
  // Nothing left is not an error.
  const none = full.rankAmong(new Set());
  assert.deepEqual(none.order, []);
  assert.equal(none.matched, 0);

  // A menu twin outside the filter is the same story.
  const twinFull = rank({ postedIds: [ramen[1].id] });
  assert.ok(twinFull.rank.get(ramen[0].id) < twinFull.matched, "fixture: one of the twin menus holds the slot");
  assert.ok(twinFull.rank.get(twin.id) >= twinFull.matched, "fixture: the other is set aside");
  const rest = new Set(ids(corpus).filter((id) => id !== ramen[0].id));
  const without = twinFull.rankAmong(rest);
  assert.ok(without.rank.get(twin.id) < without.matched, "the twin takes the slot once its twin is filtered out");
});

ok("rankAmong: the header and the match count are the filtered list's own", () => {
  // Friends have been to one Thai place. Looking at Italian, the list has no
  // friends in it and does not claim to; looking at Thai it does.
  const friendVisits = [friend(thai[2], "f1", "Ana"), friend(thai[2], "f2", "Ben")];
  const full = rank({ friendVisits });
  assert.equal(full.header, "Where your friends eat");
  assert.equal(full.matched, 1);
  const elsewhere = full.rankAmong(new Set(ids(italian)));
  assert.equal(elsewhere.matched, 0);
  assert.equal(elsewhere.header, "Pick what you like to tune this");
  const here = full.rankAmong(new Set(ids(thai)));
  assert.equal(here.matched, 1);
  assert.equal(here.header, "Where your friends eat");
  assert.equal(here.order[0], thai[2].id);
});

ok("rankAmong: any subset is a whole, consistent arrangement", () => {
  const rnd = prng(11);
  const viewer = run("subsets", { postedIds: [ramen[0].id, thai[1].id], prefs: prefs({ loves: ["Italian"] }) });
  const pool = viewer.res.order;
  for (let t = 0; t < 25; t++) {
    const pick = shuffled(pool, rnd).slice(0, 1 + Math.floor(rnd() * pool.length));
    const subset = new Set(pick);
    const arr = viewer.res.rankAmong(subset);
    assert.equal(arr.order.length, subset.size, `subset ${t}: nothing lost or added`);
    assert.deepEqual(new Set(arr.order), subset);
    assert.ok(arr.matched <= arr.order.length);
    arr.order.forEach((id, i) => {
      assert.equal(arr.rank.get(id), i);
      const reason = arr.reasonOf(id);
      assert.ok(reason && reason.text.length > 0 && reason.text.length <= WEIGHTS.reasonMaxChars && KINDS.has(reason.kind));
    });
    const head = arr.order.slice(0, arr.matched).map((id) => scoredOf(viewer.sc, byIdMap.get(id)));
    assert.ok(head.every(isMatch), `subset ${t}: only matches lead`);
    // The tail keeps its quality order, as in the full list.
    const tail = arr.order.slice(arr.matched).map((id) => scoredOf(viewer.sc, byIdMap.get(id)));
    for (let i = 1; i < tail.length; i++) assert.ok(cmpTail(tail[i - 1], tail[i]) <= 0, `subset ${t}: tail order`);
  }
});

/* ---------- the route and the client ---------- */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const routeSrc = read("../src/app/api/restaurants/discover/route.ts");
const routeCode = stripComments(routeSrc);
const getFn = routeCode.slice(routeCode.indexOf("export async function GET"), routeCode.indexOf("const PRIVATE_HEADERS"));
const postFn = routeCode.slice(routeCode.indexOf("export async function POST"));

ok("the route source keeps For me off the cacheable path", () => {
  assert.equal(FOR_ME_PARAM, "foryou");
  // GET: the refusal is the first thing it does, and nothing personal is in it.
  assert.ok(getFn.indexOf("has(FOR_ME_PARAM)") > 0 && getFn.indexOf("has(FOR_ME_PARAM)") < getFn.indexOf("getDiscoverPage"));
  assert.match(getFn, /status:\s*400/);
  assert.match(getFn, /"Cache-Control":\s*"no-store"/);
  for (const word of ["getCurrentUser", "rankTaste", "resolveTasteContext", "limitForMe", "prefs", "forMe", "PRIVATE_HEADERS"]) {
    assert.ok(!getFn.includes(word), `GET mentions ${word}`);
  }
  assert.ok(!/getDiscoverPage\([^)]*forMe/.test(getFn));
  // POST: the headers, the order of the guards, and a public branch that stays public.
  assert.match(routeCode, /const PRIVATE_HEADERS = \{ "Cache-Control": "private, no-store", Vary: "Cookie" \};/);
  assert.equal((postFn.match(/headers:\s*PRIVATE_HEADERS/g) ?? []).length, 2, "both personal answers are private");
  const noForMe = postFn.indexOf("forMe !== true");
  assert.ok(noForMe > 0 && noForMe < postFn.indexOf("getCurrentUser"), "the public branch returns before the session is read");
  const publicBranch = postFn.slice(noForMe, postFn.indexOf("getCurrentUser"));
  assert.ok(!publicBranch.includes("PRIVATE_HEADERS") && !publicBranch.includes("rankTaste") && !publicBranch.includes("forMe:"));
  assert.ok(postFn.indexOf("limitForMe(") > 0 && postFn.indexOf("limitForMe(") < postFn.indexOf("rankTaste("), "rate limit before ranking");
  assert.ok(postFn.indexOf("limitForMe(") < postFn.indexOf("resolveTasteContext("), "rate limit before reading the viewer");
  assert.ok(postFn.indexOf("getCurrentUser(") < postFn.indexOf("limitForMe("));
});

ok("the 429 is private too, and the client keeps foryou out of the shared GET", () => {
  const limitSrc = stripComments(read("../src/lib/rateLimit.ts"));
  const fn = limitSrc.slice(limitSrc.indexOf("export async function limitForMe"));
  assert.match(fn, /limited\?\.headers\.set\("Cache-Control", "private, no-store"\)/);
  assert.match(fn, /scope:\s*"forme:ip"/);
  // A signed-in viewer is counted under its own scope: the taste route's writes
  // (`taste:user`) must not spend the allowance a For me re-read needs.
  assert.match(fn, /scope:\s*"forme:user"/);
  assert.ok(!/taste:user/.test(fn), "For me does not share the taste route's counter");
  const tasteRoute = stripComments(read("../src/app/api/account/taste/route.ts"));
  assert.ok(/taste:user/.test(tasteRoute) || /limitOrReject/.test(tasteRoute), "the taste route keeps its own limiter");
  assert.ok(!/forme:user/.test(tasteRoute), "and does not spend the For me counter");

  const clientCode = stripComments(read("../src/lib/useDiscoverQuery.ts"));
  const gets = clientCode.slice(clientCode.indexOf(": await fetch("), clientCode.indexOf("if (!res.ok)"));
  assert.ok(gets.length > 0 && !/forMe|foryou|prefs/.test(gets), "the GET branch carries nothing personal");
  const posts = clientCode.slice(clientCode.indexOf("coords || forMe"), clientCode.indexOf(": await fetch("));
  assert.match(posts, /method:\s*"POST"/);
  assert.match(posts, /forMe:\s*true,\s*prefs:\s*readLocalTaste\(\)/);
});

ok("the client keeps the list honest: stale answers, undo, failure, reset", () => {
  // useDiscoverQuery: a held answer is dropped when the URL goes back to the
  // shell, and a failure is surfaced with a way to ask again.
  const hook = stripComments(read("../src/lib/useDiscoverQuery.ts"));
  assert.match(hook, /if \(wanted === null && answer !== null\) setAnswer\(null\)/);
  assert.match(hook, /const failed = wanted !== null && failedKey === wanted/);
  assert.match(hook, /setFailedKey\(wanted\)/);
  assert.equal((hook.match(/setFailedKey\(wanted\)/g) ?? []).length, 2, "a bad status and a thrown error both fail");
  assert.match(hook, /setAttempt\(\(n\) => n \+ 1\)/);
  assert.match(hook, /\[wanted, answerKey, search, shown, coords, forMe, resolved, attempt\]/, "retry re-runs the effect");
  assert.match(hook, /failed,\s*retry,/, "both are returned");

  // useTaste: every op that changes what the ranking is built from refetches the
  // list, undoes included; a plain been / hide does not (the card just leaves).
  const taste = stripComments(read("../src/lib/useTaste.ts"));
  const retunes = taste.slice(taste.indexOf("const RETUNES"), taste.indexOf("let tasteRevision"));
  for (const kind of ["love", "unlove", "skip", "unskip", "unbeen", "unhide", "reset"]) {
    assert.ok(retunes.includes(`"${kind}"`), `${kind} refetches the list`);
  }
  for (const kind of ["been", "hide"]) assert.ok(!retunes.includes(`"${kind}"`), `${kind} does not refetch`);

  // Web and phone: Reset my taste puts the waved-off cards and the Undo back.
  const web = stripComments(read("../src/components/DiscoverBrowser.tsx"));
  assert.match(web, /setGone\(new Set\(\)\);\s*setLast\(null\);\s*taste\.apply\(\{ kind: "reset" \}\)/);
  const phone = stripComments(read("../src/components/mobile/PhoneTasteSection.tsx"));
  assert.match(phone, /clearTimeout\(undoTimer\.current\);\s*setUndo\(null\);\s*setGone\(new Set\(\)\);\s*taste\.apply\(\{ kind: "reset" \}\)/);

  // And a failed For me request is said on both: an alert where there was only a
  // skeleton, a status line over a list that is already there, and a retry.
  assert.match(web, /<ForMeSection[^>]*failed=\{failed\}[^>]*onRetry=\{retry\}/s);
  assert.ok(/role="alert"/.test(web) && /onClick=\{onRetry\}/.test(web), "web: alert and retry");
  assert.ok(/role="alert"/.test(phone) && /onClick=\{onRetry\}/.test(phone), "phone: alert and retry");
  const screen = stripComments(read("../src/components/mobile/PhoneDiscoverScreen.tsx"));
  assert.match(screen, /failed,\s*retry,\s*nearby/);
  assert.match(screen, /failed=\{failed\}\s*onRetry=\{retry\}/);
});

await okAsync("the route refuses foryou on GET, unit-level", async () => {
  const hadDb = !!process.env.DATABASE_URL;
  // The client is built at import and never connects; a stand-in only keeps that import quiet offline.
  if (!hadDb) process.env.DATABASE_URL = "postgresql://forme:check@dummy.invalid/forme";
  const route = await import("../src/app/api/restaurants/discover/route.ts");
  assert.equal(typeof route.GET, "function");
  assert.equal(typeof route.POST, "function");
  for (const q of ["foryou=1", "foryou=0", "foryou", "cuisine=Thai&foryou=1&shown=48", "q=ramen&foryou=true&nav=x", "shown=999&foryou=1"]) {
    const res = await route.GET(new Request(`http://localhost/api/restaurants/discover?${q}`));
    assert.equal(res.status, 400, `GET ?${q}`);
    const cc = res.headers.get("cache-control") ?? "";
    assert.equal(cc, "no-store", `GET ?${q} cache-control`);
    assert.equal(res.headers.get("etag"), null);
    assert.ok(!/public|s-maxage|max-age/.test(cc));
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    assert.ok(!("results" in body) && !("forMe" in body));
  }
  // The POST guards that run before any read.
  const bad = await route.POST(new Request("http://localhost/api/restaurants/discover", { method: "POST", body: "{nope" }));
  assert.equal(bad.status, 400);
  const missing = await route.POST(new Request("http://localhost/api/restaurants/discover", { method: "POST", body: JSON.stringify({ forMe: true }) }));
  assert.equal(missing.status, 400);
});

await okAsync("the client turns the URL into a POST body, not a GET", async () => {
  let filterQueryOf;
  try {
    ({ filterQueryOf } = await import("../src/lib/useDiscoverQuery.ts"));
  } catch {
    filterQueryOf = null;
  }
  if (!filterQueryOf) return; // a "use client" module that will not load here; the source checks above cover it
  const a = filterQueryOf("foryou=1&cuisine=Thai&shown=48&nav=x&cols=2");
  assert.deepEqual(a, { search: "cuisine=Thai", shown: 48, forMe: true });
  assert.ok(!a.search.includes("foryou"));
  const b = filterQueryOf("cuisine=Thai");
  assert.equal(b.forMe, false);
  assert.equal(filterQueryOf("foryou=0").forMe, false, "only foryou=1 asks for it");
  assert.equal(filterQueryOf("foryou=1&q=ramen").search, "q=ramen");
});

console.log(`forme:check  ${n} fixture and route cases ok`);

/* ---------- live corpus ---------- */

async function live() {
  if (!process.env.DATABASE_URL) return console.log("forme:check  live corpus skipped (no DATABASE_URL)");
  let discover;
  let c;
  let traits;
  try {
    discover = await import("../src/lib/discover.ts");
    c = await discover.loadCorpus();
    traits = await discover.loadTraitIndex(c.restaurants);
  } catch {
    return console.log("forme:check  live corpus skipped (database unreachable)");
  }
  const { restaurants, plates } = c;
  assert.ok(restaurants.length > 50, "live corpus has restaurants");
  let m = 0;

  const rnd = prng(20261102);
  const sample = (arr, k) => shuffled(arr, rnd).slice(0, k);
  const kindOf = (r) => {
    const t = traitsOf(traits, r.id);
    return !t || t.empty ? "empty" : t.imputed ? "imputed" : "profiled";
  };
  const profiled = restaurants.filter((r) => kindOf(r) === "profiled");
  const imputed = restaurants.filter((r) => kindOf(r) === "imputed");
  const empties = restaurants.filter((r) => kindOf(r) === "empty");
  assert.ok(profiled.length >= 20, "live corpus has menu profiles");
  const perCuisine = new Map();
  for (const r of profiled) {
    if (!r.cuisine) continue;
    if (!perCuisine.has(r.cuisine)) perCuisine.set(r.cuisine, []);
    perCuisine.get(r.cuisine).push(r);
  }
  const topCuisines = [...perCuisine]
    .filter(([, v]) => v.length >= 6)
    .sort((a, b) => b[1].length - a[1].length || idCmp(a[0], b[0]))
    .slice(0, 10)
    .map(([cu]) => cu);
  assert.ok(topCuisines.length >= 3, "live corpus has cuisines with profiles");

  const liveBase = { restaurants, plates, prefs: EMPTY_PREFS, postedIds: [], friendVisits: [], traits };
  const viewer = (label, o, step = 0) => {
    const input = { ...liveBase, ...o };
    const res = rankTaste(input);
    const sc = checkRank(label, input, res);
    if (step) checkAhist(label, input, sc, step);
    m++;
    return { input, res, sc };
  };

  // People who have been to one place, then two: the point of the one-post gate.
  const shareCuisine = (r, seeds) => {
    const mine = new Set(seeds.flatMap((s) => [s.cuisine, ...(s.cuisineSecondary ?? [])]).filter(Boolean));
    return [r.cuisine, ...(r.cuisineSecondary ?? [])].some((x) => x && mine.has(x));
  };
  let leaders = 0;
  let leadersSharing = 0;
  const viewers = [];
  for (const cu of topCuisines) {
    const [p1, p2] = sample(perCuisine.get(cu), 2);
    for (const seeds of [[p1], [p1, p2]]) {
      const v = viewer(`${cu} x${seeds.length}`, { postedIds: ids(seeds) }, 7);
      assert.equal(v.res.basis, "history");
      assert.equal(v.res.seeds, seeds.length);
      assert.equal(
        v.res.header,
        seeds.length === 1 ? "Based on 1 place so far; post more to sharpen this" : "Based on 2 places so far; post more to sharpen this",
      );
      assert.ok(v.res.matched >= 3, `${cu}: only ${v.res.matched} matches from ${seeds.length} place(s)`);
      const lead = v.sc.scored.find((s) => s.r.id === v.res.order[0]);
      assert.ok(lead.sim > 0, `${cu}: the first match has nothing in common with the seeds`);
      leaders++;
      if (shareCuisine(lead.r, seeds)) leadersSharing++;
      const topTen = v.res.order.slice(0, 10).filter((id, i) => i < v.res.matched);
      const sharing = topTen.filter((id) => shareCuisine(restaurants.find((r) => r.id === id), seeds)).length;
      assert.ok(sharing >= Math.ceil(topTen.length / 2), `${cu}: ${sharing} of ${topTen.length} leading matches share a cuisine`);
      viewers.push({ seeds, ...v });
    }
  }
  assert.ok(leadersSharing / leaders >= 0.8, `${leadersSharing} of ${leaders} leading matches share a cuisine with the seed`);

  // A viewer whose only place was imputed or empty.
  if (imputed.length) {
    for (const r of sample(imputed, 4)) {
      const v = viewer(`imputed seed ${r.name}`, { postedIds: [r.id] });
      assert.equal(v.res.basis, "history");
      assert.equal(v.res.seeds, 1);
      for (const id of v.res.order) assert.notEqual(v.res.reasonOf(id).kind, "like");
    }
  }
  if (empties.length) {
    const v = viewer("empty seed", { postedIds: [empties[0].id] });
    assert.equal(v.res.basis, "none");
    assert.equal(v.res.seeds, 0);
  }

  // Bigger histories, a thirty-place cap, marked-been, mixed with picks.
  for (const k of [3, 6, 12]) {
    const mine = sample(profiled, k);
    const v = viewer(`${k} posts`, { postedIds: ids(mine) }, 5);
    assert.equal(v.res.header, `From the ${k} places you've been`);
  }
  {
    const many = sample(restaurants.filter((r) => kindOf(r) !== "empty"), WEIGHTS.maxSeeds + 8);
    const v = viewer("past the seed cap", { prefs: prefs({ been: ids(many) }) }, 9);
    assert.equal(v.res.seeds, WEIGHTS.maxSeeds);
    assert.equal(v.res.order.length + v.res.exclude.size, restaurants.length);
  }
  {
    const v = viewer("history and picks", { postedIds: ids(sample(profiled, 2)), prefs: prefs({ loves: [topCuisines[0]], skips: [topCuisines[2]], hidden: ids(sample(restaurants, 25)) }) }, 9);
    assert.equal(v.res.basis, "history");
    assert.ok(v.res.header.includes(`, plus ${topCuisines[0]}`));
  }

  // Picks only, and the cold start.
  let sideMatches = 0;
  for (const cu of topCuisines.slice(0, 3)) {
    const v = viewer(`loves ${cu}`, { prefs: prefs({ loves: [cu] }) });
    assert.equal(v.res.basis, "picks");
    assert.equal(v.res.header, `Based on your picks: ${cu}`);
    assert.ok(matchesOf(v.res).every((id) => {
      const r = restaurants.find((x) => x.id === id);
      return r.cuisine === cu || r.cuisineSecondary?.includes(cu);
    }));

    // Main cuisine speaks at full strength, a secondary-only match says "Also serves" and
    // comes after every main match: the same cuisine on the side is not the same pick.
    const liveById = new Map(restaurants.map((r) => [r.id, r]));
    const matches = matchesOf(v.res);
    const mains = matches.filter((id) => liveById.get(id).cuisine === cu);
    const sides = matches.filter((id) => liveById.get(id).cuisine !== cu);
    for (const id of mains) assert.equal(v.res.reasonOf(id).text, `You picked ${cu}`);
    for (const id of sides) {
      const reason = v.res.reasonOf(id);
      assert.equal(reason.kind, "pick");
      assert.equal(reason.text, `Also serves ${cu}`);
      assert.ok(reason.text.length <= WEIGHTS.reasonMaxChars);
    }
    if (mains.length && sides.length) {
      assert.ok(
        Math.max(...mains.map((id) => v.res.rank.get(id))) < Math.min(...sides.map((id) => v.res.rank.get(id))),
        `${cu}: a secondary-only place ranked above a main-cuisine one`,
      );
    }
    sideMatches += sides.length;
  }
  assert.ok(sideMatches > 0, "the live corpus has places that list a top cuisine only as a secondary");
  const cold = viewer("cold start", {});
  assert.equal(cold.res.basis, "none");
  assert.equal(cold.res.matched, 0);
  assert.equal(cold.res.order.length, restaurants.length);
  assert.ok(cold.res.order.every((id) => cold.res.reasonOf(id).kind === "rated"));

  // Friends, with the same friend twice at one place and a stranger place.
  {
    const spots = sample(restaurants, 4);
    const friendVisits = [
      friend(spots[0], "f1", "Ana"), friend(spots[0], "f2", "Ben"), friend(spots[0], "f2", "Ben"),
      friend(spots[1], "f1", "Ana"), friend(spots[2], "f3", "Cam"), { restaurantId: "not-a-place", friendId: "f9", name: "Zed" },
    ];
    const v = viewer("friends", { friendVisits });
    assert.equal(v.res.basis, "none");
    assert.equal(v.res.header, "Where your friends eat");
    assert.ok(v.res.matched >= 1 && v.res.matched <= 3);
    assert.equal(v.res.reasonOf(spots[0].id)?.text, "2 friends have been");
  }

  // Determinism on the real thing: repeat, shuffled arrival, and a longer page being the same prefix.
  for (const v of viewers.slice(0, 4)) {
    const again = rankTaste(v.input);
    assert.deepEqual(again.order, v.res.order, "live repeat");
    const mixed = rankTaste({ ...v.input, restaurants: shuffled(v.input.restaurants, rnd), postedIds: shuffled(v.input.postedIds, rnd) });
    assert.deepEqual(mixed.order, v.res.order, "live shuffled arrival");
    m++;
  }

  // Imputed ceiling on the real corpus, and symmetry.
  {
    const ceiling = IMPUTED_FACTOR * (SIM_WEIGHTS.dish + SIM_WEIGHTS.cuisine);
    const pool = sample(restaurants.filter((r) => kindOf(r) !== "empty"), 150);
    let seen = 0;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = traitsOf(traits, pool[i].id);
        const b = traitsOf(traits, pool[j].id);
        const s = similarity(a, b);
        assert.equal(s, similarity(b, a));
        assert.ok(s >= 0 && s <= 1);
        if (a.imputed || b.imputed) {
          seen++;
          assert.ok(s <= ceiling + 1e-12);
        }
      }
    }
    assert.ok(imputed.length === 0 || seen > 0);
    m++;
  }

  // Through Discover's own pipeline, as the private POST drives it.
  const v = viewers.find((x) => x.seeds.length === 2) ?? viewers[0];
  const ex = v.res.exclude;
  const cu = topCuisines[0];
  const publicPage = await discover.getDiscoverPage("", { shown: 24 });
  assert.ok(!("forMe" in publicPage), "the public page has no forMe block");
  assert.ok(publicPage.results.every((r) => !("reason" in r)), "the public page has no reasons");
  assert.ok(!JSON.stringify(publicPage).includes("\"Like "), "nothing personal in the public page");
  {
    const page = await discover.getDiscoverPage("", { shown: 24, forMe: v.res });
    assert.equal(page.results.length, 24);
    assert.equal(page.total, restaurants.length - ex.size, "total describes the list the viewer can see");
    assert.ok(page.results.every((r) => !ex.has(r.id)), "no excluded place on the page");
    const positions = page.results.map((r) => v.res.rank.get(r.id));
    assert.ok(positions.every((p, i) => i === 0 || positions[i - 1] < p), "the page is in rank order");
    assert.ok(page.results.every((r) => r.reason && r.reason.text.length <= WEIGHTS.reasonMaxChars));
    assert.equal(page.forMe.basis, v.res.basis);
    assert.equal(page.forMe.header, v.res.header);
    assert.equal(page.forMe.seeds, v.res.seeds);
    assert.equal(page.forMe.matched, v.res.matched);
    assert.equal(page.forMe.paused, undefined);
    const cuisineCount = restaurants.filter((r) => hasCuisine(r, cu) && !ex.has(r.id)).length;
    assert.equal(page.counts.cuisine.get(cu) ?? 0, cuisineCount, "facet counts measure the visible list");

    const longer = await discover.getDiscoverPage("", { shown: 48, forMe: v.res });
    assert.deepEqual(longer.results.slice(0, 24).map((r) => r.id), page.results.map((r) => r.id), "a longer page extends the shorter");
    m++;

    const filtered = await discover.getDiscoverPage(`cuisine=${encodeURIComponent(cu)}`, { shown: 24, forMe: v.res });
    assert.ok(filtered.results.every((r) => hasCuisine(r, cu) && !ex.has(r.id)));
    assert.equal(filtered.total, restaurants.filter((r) => hasCuisine(r, cu) && !ex.has(r.id)).length);
    // The filtered page is ordered by the arrangement worked out among the rows
    // the filter left (rankAmong), not by the global one filtered afterwards.
    const fIds = new Set(restaurants.filter((r) => hasCuisine(r, cu) && !ex.has(r.id)).map((r) => r.id));
    const arr = v.res.rankAmong(fIds);
    assert.equal(arr.order.length, fIds.size, "the arrangement covers exactly the filtered rows");
    const fp = filtered.results.map((r) => arr.rank.get(r.id));
    assert.ok(fp.every((p) => p !== undefined), "every row on the page has a place in the arrangement");
    assert.ok(fp.every((p, i) => i === 0 || fp[i - 1] < p), "filters compose with the personal order");
    assert.ok(filtered.forMe.matched <= filtered.total);
    assert.equal(filtered.forMe.matched, arr.matched, "the matched count is the filtered list's own");
    assert.equal(filtered.forMe.header, arr.header);
    {
      const wide = v.res.rankAmong(new Set(restaurants.filter((r) => !ex.has(r.id)).map((r) => r.id)));
      assert.deepEqual(wide.order, v.res.order, "a set covering every candidate is the full arrangement");
      assert.equal(wide.matched, v.res.matched);
    }
    m++;

    // Typed text wins: plain relevance, nothing left out, nothing personal printed.
    const named = v.seeds[0];
    const typed = `q=${encodeURIComponent(named.name)}`;
    const plain = await discover.getDiscoverPage(typed, { shown: 24 });
    for (const setup of [v.res, null]) {
      const paused = await discover.getDiscoverPage(typed, { shown: 24, forMe: setup });
      assert.deepEqual(paused.forMe, { basis: "none", header: "", seeds: 0, matched: 0, paused: true });
      assert.deepEqual(paused.results.map((r) => r.id), plain.results.map((r) => r.id), "same order as plain search");
      assert.ok(paused.results.every((r) => !("reason" in r)));
      assert.equal(paused.total, plain.total, "nothing is excluded from a search");
      assert.ok(paused.results.some((r) => r.id === named.id), "the place they typed is found even though they have been");
    }
    m++;
  }

  // The route, over the same corpus: the public paths answer and carry nothing personal.
  {
    const route = await import("../src/app/api/restaurants/discover/route.ts");
    const get = await route.GET(new Request(`http://localhost/api/restaurants/discover?cuisine=${encodeURIComponent(cu)}`));
    assert.equal(get.status, 200);
    const gcc = get.headers.get("cache-control") ?? "";
    assert.ok(!/private|no-store/.test(gcc), `the public GET stays cacheable (${gcc})`);
    const gbody = await get.json();
    assert.ok(!("forMe" in gbody) && gbody.results.every((r) => !("reason" in r)));
    const post = await route.POST(
      new Request("http://localhost/api/restaurants/discover", {
        method: "POST",
        body: JSON.stringify({ search: `cuisine=${encodeURIComponent(cu)}`, shown: 24 }),
      }),
    );
    assert.equal(post.status, 200);
    const pbody = await post.json();
    assert.ok(!("forMe" in pbody) && pbody.results.every((r) => !("reason" in r)));
    m++;
  }

  console.log(`forme:check  ${m} live-corpus cases ok (${restaurants.length} restaurants, ${traits.profiled} profiles, ${imputed.length} imputed)`);
}

await live();
process.exit(0);
