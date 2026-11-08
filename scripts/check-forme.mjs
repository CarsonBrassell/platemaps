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
 *     reasons, imputed profiles, the cuisine cap, determinism, the quality
 *     term and the cuisine profile.
 *  2. The route and the client, without a server: the GET knows nothing of
 *     `foryou` (it is an unknown param there, as it is on main), the POST
 *     serves the plain page to everyone but the accounts in lib/forMeGate.ts,
 *     and the source is pinned so the personal path cannot drift onto a
 *     cacheable response.
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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  EMPTY_PREFS,
  FORME_BUDGET,
  FORME_CUISINE,
  FORME_QUALITY,
  FORME_RADIUS,
  FORME_WEIGHTS,
  WEIGHTS,
  budgetOf,
  budgetPoints,
  chainKey,
  distanceFactor,
  historyConfidence,
  meanRating,
  medoidOf,
  placeWeight,
  priceFit,
  qualityFloor,
  radiusOf,
  rankTaste,
  scoreAll,
  scoreTaste,
  shortPlaceName,
  shrunkRating,
  tasteExclusions,
} from "../src/lib/taste.ts";
import {
  CENTROID_TERMS,
  IMPUTED_FACTOR,
  MIN_CENTROID_PROFILES,
  MIN_PRICED_ITEMS,
  SECONDARY_CUISINE_WEIGHT,
  SIM_WEIGHTS,
  buildTraitIndex,
  dishSetKey,
  normalizeDishes,
  similarity,
  similarityParts,
  traitsOf,
} from "../src/lib/profileTraits.ts";
import { milesBetween } from "../src/lib/geo.ts";
import { parsePrice } from "../src/data/priceBands.ts";
import { FOR_ME_PARAM, hasCuisine, hasFilterParams } from "../src/lib/discoverFilters.ts";
import { FOR_ME_USER_IDS, isForMeUser } from "../src/lib/forMeGate.ts";
import { accountJson } from "../src/lib/account.ts";
import {
  QUALITY_HIGH_RATING,
  QUALITY_LABEL_MIN_REVIEWS,
  QUALITY_MIN_REVIEWS,
  QUALITY_WELL_RATING,
  forMeQualityNote,
  qualityNote,
} from "../src/lib/ratingDisplay.ts";

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

const KINDS = new Set(["like", "pick", "friends", "cuisine", "price", "near", "rated"]);
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
  const seedNames = new Map(restaurants.map((r) => [r.id, r.name]));
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
      // The tail never says why it fits, only how it is rated, that it fits their
      // plate (inside their usual price range), or that it is close (inside their
      // usual distance, from where they are).
      assert.ok(
        reason.kind === "rated" || reason.kind === "price" || reason.kind === "near",
        fail(`tail ${id} claims ${reason.kind}`),
      );
    }
    // Pr, Pf and the points are one fact: no fit, no points; a fit needs a price.
    {
      const s = scored.get(id);
      if (s.Pf == null) assert.equal(s.budgetPts, 0, fail(`${id}: points without a fit`));
      if (s.Pf != null) assert.ok(s.Pr != null && scan.budget, fail(`${id}: a fit without a price or a usual plate`));
      if (reason.kind === "price") {
        assert.ok(scan.budget && scan.budget.conf >= FORME_BUDGET.reasonConf, fail("price reason without a trusted usual plate"));
        assert.ok(s.Pr != null && s.Pf != null && s.Pf >= FORME_BUDGET.reasonFit, fail(`price reason off a fit of ${s.Pf}`));
        // The sentence prints the range, so the place's own price must sit inside what is printed.
        assert.ok(Math.round(s.Pr) >= scan.budget.lo && Math.round(s.Pr) <= scan.budget.hi, fail(`price reason for $${s.Pr} outside the printed $${scan.budget.lo}-${scan.budget.hi}`));
        assert.ok(/^Fits your usual \$\d+(\u2013\d+)? plate$/.test(reason.text), fail(`price wording: ${reason.text}`));
      }
    }
    // Distance: D is 1 in range and for a place with no position, never under the
    // floor, and always 1 without a radius (Your taste). "Near" needs a real
    // position, a range read off three places, and a place inside it.
    {
      const s = scored.get(id);
      assert.ok(Number.isFinite(s.D) && s.D > 0 && s.D <= 1, fail(`${id}: D ${s.D}`));
      if (!scan.radius) {
        assert.ok(s.D === 1 && s.dist == null, fail(`${id}: distance without a radius`));
      } else {
        assert.ok(s.D >= scan.radius.floor - 1e-12, fail(`${id}: D ${s.D} under the floor`));
        if (s.dist == null || s.dist <= scan.radius.miles) assert.equal(s.D, 1, fail(`${id}: in range but D is ${s.D}`));
        if (!scan.radius.anchor) assert.equal(s.dist, null, fail(`${id}: a distance from nowhere`));
      }
      if (reason.kind === "near") {
        const r = scan.radius;
        assert.ok(r && r.source === "here" && r.points >= FORME_RADIUS.minPoints, fail(`${id}: near without a position and a range`));
        assert.ok(s.dist != null && s.dist <= r.miles, fail(`${id}: near but ${s.dist} mi past ${r.miles}`));
        assert.equal(reason.text, `Within your usual ${Math.round(r.miles)} mi`, fail("near wording"));
      }
    }
    // Friends: first names beside a reason about something else, the line itself
    // when the reason is about friends; never a count, and no key when there are none.
    {
      const fr = scored.get(id).friends;
      assert.ok(!/\b\d+ friends?\b/.test(reason.text), fail(`a friend count in the reason: ${reason.text}`));
      if (reason.kind === "friends") {
        assert.ok(fr.length > 0, fail(`friends reason without friends: ${reason.text}`));
        assert.ok(!("friends" in reason), fail("friends line repeated beside itself"));
        assert.ok(/ (has|have) been$/.test(reason.text) || reason.text.endsWith("…"), fail(reason.text));
      } else if (fr.length > 0) {
        assert.equal(typeof reason.friends, "string", fail(`friends missing beside ${reason.kind}`));
        assert.ok(reason.friends.length > 0 && reason.friends.length <= WEIGHTS.reasonMaxChars, fail(reason.friends));
        assert.equal(reason.friends, reason.friends.normalize("NFC"), fail("friends line is not NFC"));
        assert.ok(!/\d/.test(reason.friends), fail(`a count in the friends line: ${reason.friends}`));
        assert.ok(/ (has|have) been$/.test(reason.friends) || reason.friends.endsWith("…"), fail(reason.friends));
      } else {
        assert.ok(!("friends" in reason), fail("friends key without friends"));
      }
    }
    if (reason.kind === "like") {
      // Names the seed place the viewer went to, and nothing about dishes. The
      // seed still needs a real profile on both sides to have been chosen.
      const s = scored.get(id);
      const seed = scan.seeds[s.seed];
      const a = traitsOf(traits, id);
      const b = traitsOf(traits, seed.id);
      assert.ok(a && b && !a.imputed && !b.imputed, fail(`like reason from an imputed profile: ${reason.text}`));
      const want = `Because you went to ${shortPlaceName(seedNames.get(seed.id))}`;
      assert.ok(
        reason.text === want || (reason.text.endsWith("…") && want.startsWith(reason.text.slice(0, -1))),
        fail(`${reason.text} is not ${want}`),
      );
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

/**
 * The cuisine profile recomputed on the side, from the constants alone: every
 * place the viewer has posted at or marked been weighs recency (halved per
 * half-life since the latest post, down to the floor) times repeat (a step per
 * further posting day, up to the cap); a been with no post weighs 1 and a
 * secondary cuisine counts at its weight. Null while there are under 3 seeds,
 * or when nothing visited has a cuisine.
 */
function expectedShares(input, scan) {
  if (scan.seeds.length < 3) return null;
  const universe = input.corpus ?? input.restaurants;
  const byId = new Map(universe.map((r) => [r.id, r]));
  const visited = new Set([...input.postedIds, ...input.prefs.been].filter((id) => byId.has(id)));
  const posted = new Map((input.postedSignals ?? []).map((x) => [x.restaurantId, x]));
  const now = input.now ?? Date.now();
  const sum = new Map();
  let total = 0;
  for (const id of visited) {
    const x = posted.get(id);
    let w = 1;
    if (x) {
      const age = Math.max(0, (now - x.lastAt) / 86400000);
      w =
        Math.max(FORME_CUISINE.recencyFloor, Math.pow(0.5, age / FORME_CUISINE.halfLifeDays)) *
        Math.min(FORME_CUISINE.repeatCap, 1 + FORME_CUISINE.repeatStep * (x.days - 1));
    }
    const r = byId.get(id);
    if (!r.cuisine) continue;
    const parts = [[r.cuisine, 1], ...(r.cuisineSecondary ?? []).filter((c) => c && c !== r.cuisine).map((c) => [c, SECONDARY_CUISINE_WEIGHT])];
    for (const [c, k] of parts) {
      sum.set(c, (sum.get(c) ?? 0) + w * k);
      total += w * k;
    }
  }
  const out = new Map();
  if (total > 0) for (const [c, v] of sum) out.set(c, v / total);
  // No cuisine anywhere in the history is no profile at all, not a profile that scores everyone zero.
  return out.size > 0 ? out : null;
}

/** The candidate's Acuis from those shares; null for a place with no cuisine. */
function expectedAcuis(r, shares) {
  if (!r.cuisine) return null;
  const parts = [[r.cuisine, 1], ...(r.cuisineSecondary ?? []).filter((c) => c && c !== r.cuisine).map((c) => [c, SECONDARY_CUISINE_WEIGHT])];
  return Math.min(1, Math.max(...parts.map(([c, k]) => k * (shares.get(c) ?? 0))) / FORME_CUISINE.fullShare);
}

/**
 * Ahist and sim recomputed from `similarity` alone, for a sample of candidates,
 * and, from 3 seeds, blended with the cuisine profile as the spec says.
 */
function checkAhist(label, input, scan, step = 1) {
  const idx = input.traits;
  const shares = expectedShares(input, scan);
  if (shares) {
    assert.equal(scan.cuisineShare.size, shares.size, `${label}: cuisine profile size`);
    for (const [c, v] of shares) {
      assert.ok(Math.abs((scan.cuisineShare.get(c) ?? -1) - v) < 1e-9, `${label}: share of ${c}`);
    }
  } else {
    assert.equal(scan.cuisineShare.size, 0, `${label}: a profile under 3 seeds`);
    assert.deepEqual(scan.topCuisines, [], `${label}: top cuisines under 3 seeds`);
  }
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
    let wantAcuis = null;
    if (shares && s.r.cuisine) {
      wantAcuis = expectedAcuis(s.r, shares);
      wantAhist = (1 - FORME_CUISINE.cuisineInAhist) * wantAhist + FORME_CUISINE.cuisineInAhist * wantAcuis;
    }
    if (wantAcuis == null) assert.equal(s.Acuis, null, `${label}: Acuis of ${s.r.name} should be absent`);
    else assert.ok(Math.abs(s.Acuis - wantAcuis) < 1e-9, `${label}: Acuis of ${s.r.name} is ${s.Acuis}, expected ${wantAcuis}`);
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

// Edge places: long text, no rating, no photo, accents. dimBistro is poor and
// well reviewed on purpose: the same rating off a dozen reviews would be pulled
// toward the mean, and its own cases are in the quality-term block.
const longName = place("The Extraordinarily Long Named Restaurant That Never Ends Grill", "Italian", ["pizza", "pasta", "tiramisu", "porchetta"], "full_service", MID);
const accent = place("Café Roma", "Italian", ["pizza", "pasta", "tiramisu", "cannoli"], "cafe", MID);
const dimBistro = place("Dim Corner Bistro", "Italian", ["pizza", "pasta", "ravioli", "focaccia"], "full_service", { rating: 3.6, reviews: 400, photo: null });
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
const LONG_CUISINE = "Contemporary Pan-Asian Street Food And Noodles From Many Regions";
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
  assert.equal(res.reasonOf(twin.id).text, "Because you went to Ichiban Ramen House");
  assert.equal(res.reasonOf(twin.id).kind, "like");
  assert.ok(!("friends" in res.reasonOf(twin.id)), "no friends, no friends key");
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
  // A fixture place with every part of quality is read aloud with its hood: a
  // 4.9 off 900 reviews is still over 4.5 once shrunk toward the mean.
  assert.equal(res.reasonOf(ramen[0].id).text, "Highly rated in Downtown");
  assert.equal(res.reasonOf(longHood.id).text.length <= WEIGHTS.reasonMaxChars, true);
  assert.ok(res.reasonOf(longHood.id).text.startsWith("Highly rated in A Very Long"));
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
  // By first name, never a count: one, two, and three or more.
  assert.equal(res.reasonOf(thai[2].id).text, "Ana and Ben have been");
  assert.equal(res.reasonOf(burgers[3].id).text, "Ana, Ben and others have been");
  assert.equal(res.reasonOf(italian[1].id).text, "Ana has been");
  assert.equal(res.reasonOf(thai[2].id).kind, "friends");
  assert.ok(!("friends" in res.reasonOf(thai[2].id)), "the friends reason does not repeat itself");
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

ok("a like reason names the place they went to, not the dishes they share", () => {
  const { res } = run("like", { postedIds: [ramen[0].id] });
  const a = traitsOf(idx, ramen[1].id);
  const b = traitsOf(idx, ramen[0].id);
  const parts = similarityParts(idx, a, b);
  assert.ok(parts.shared.length >= 2 && !parts.imputed, "this pair does share dishes, and the line still leaves them out");
  assert.equal(res.reasonOf(ramen[1].id).text, "Because you went to Ichiban Ramen House");
  assert.equal(res.reasonOf(ramen[1].id).kind, "like");
});

ok("with no dish in common it falls back to the cuisine", () => {
  const { res } = run("both cuisine", { postedIds: [ramen[0].id] });
  const parts = similarityParts(idx, traitsOf(idx, sushi[0].id), traitsOf(idx, ramen[0].id));
  assert.equal(parts.shared.length, 0);
  assert.deepEqual(parts.sharedCuisines, ["Japanese"]);
  assert.ok(res.rank.get(sushi[0].id) < res.matched);
  assert.equal(res.reasonOf(sushi[0].id).text, "Because you went to Ichiban Ramen House");
});

ok("friends outweigh a weak fit, a strong fit outweighs friends", () => {
  const friendVisits = [friend(burgers[0], "f1", "Ana"), friend(burgers[0], "f2", "Ben"), friend(ramen[1], "f1", "Ana")];
  const { res } = run("who speaks first", { postedIds: [ramen[0].id], friendVisits });
  assert.equal(res.reasonOf(burgers[0].id).text, "Ana and Ben have been");
  assert.equal(res.reasonOf(ramen[1].id).kind, "like");
  // The friend who has been to the strong fit is not lost: she rides beside the reason.
  assert.equal(res.reasonOf(ramen[1].id).friends, "Ana has been");
});

ok("reasons fit the card", () => {
  // A seed whose name alone is longer than the line.
  const long = run("long seed", { postedIds: [longName.id] });
  const like = long.res.reasonOf(italian[0].id);
  assert.equal(like.kind, "like");
  assert.ok(like.text.startsWith("Because you went to The Extraordinarily"));
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
  assert.equal(withFriend.res.reasonOf(empty.id).text, "Ana has been");
});

/* ---------- reasons: names, friends, quality ---------- */

ok("shortPlaceName cuts a listing tagline and nothing else", () => {
  assert.equal(shortPlaceName("Ichiban Ramen House"), "Ichiban Ramen House");
  assert.equal(shortPlaceName("sweetgreen - Healthy Salads, Wraps, and Bowls"), "sweetgreen");
  assert.equal(shortPlaceName("Em Coffee House \u2013 Mission Valley"), "Em Coffee House");
  assert.equal(shortPlaceName("Taco Hall \u2014 Downtown"), "Taco Hall");
  assert.equal(shortPlaceName("Bar | Kitchen & Co"), "Bar");
  assert.equal(shortPlaceName("Tacos: El Rey"), "Tacos");
  assert.equal(shortPlaceName("Oak: Grill - Patio"), "Oak", "the earliest separator wins");
  assert.equal(shortPlaceName("A - Z Diner"), "A - Z Diner", "a head under 3 characters keeps the full name");
  assert.equal(shortPlaceName("Jack-in-the-Box"), "Jack-in-the-Box", "a hyphen inside a name is not a separator");
  assert.equal(shortPlaceName("  Caf\u00e9 Roma  "), "Caf\u00e9 Roma", "trimmed");
  assert.equal(shortPlaceName("Cafe\u0301 Roma - Downtown"), "Caf\u00e9 Roma", "composed");
  assert.ok(WEIGHTS.reasonMaxChars >= 56, "a 20-character lead-in still leaves a seed name 36 characters");
});

ok("friends ride beside the reason, by first name and never a count", () => {
  const friendVisits = [
    friend(ramen[1], "f1", "Ana Lopez"), friend(ramen[1], "f2", "Ben Ray"), friend(ramen[1], "f3", "Cam Diaz"),
    friend(ramen[2], "f2", "Ben Ray"), friend(ramen[2], "f1", "Ana Lopez"),
    friend(twin, "f3", "Cam Diaz"),
    friend(ramen[3], "f1", "Ana Lopez"), friend(ramen[3], "f4", "Ana Kim"),
  ];
  const { res } = run("friends beside", { postedIds: [ramen[0].id], friendVisits });
  const line = (r) => (r.kind === "friends" ? r.text : r.friends);
  assert.equal(line(res.reasonOf(ramen[1].id)), "Ana, Ben and others have been");
  assert.equal(line(res.reasonOf(ramen[2].id)), "Ana and Ben have been");
  assert.equal(line(res.reasonOf(twin.id)), "Cam has been");
  assert.equal(line(res.reasonOf(ramen[3].id)), "Ana has been", "two friends called Ana are one name");
  for (const r of [ramen[1], ramen[2], ramen[3], twin]) {
    const reason = res.reasonOf(r.id);
    assert.ok(!/Lopez|Ray|Diaz|Kim/.test(reason.text + " " + (reason.friends ?? "")), "first names only");
  }
  assert.ok(!("friends" in res.reasonOf(ramen[4].id)), "no friend has been: no key");
  // The friends reason is the line itself, so it does not carry a second copy.
  const cold = run("friends cold", { friendVisits: [friend(thai[2], "f1", "Ana Lopez")] });
  assert.equal(cold.res.reasonOf(thai[2].id).kind, "friends");
  assert.ok(!("friends" in cold.res.reasonOf(thai[2].id)));
});

ok("qualityNote says why a place is good in words, never the rating", () => {
  assert.equal(qualityNote(null, null), null);
  assert.equal(qualityNote(4.8, null), null);
  assert.equal(qualityNote(4.8, undefined), null);
  assert.equal(qualityNote(4.8, QUALITY_MIN_REVIEWS - 1), null, "too few reviews to say anything");
  assert.deepEqual(qualityNote(4.8, QUALITY_MIN_REVIEWS), { label: null, reviews: QUALITY_MIN_REVIEWS }, "a count, no tier word, on a thin sample");
  assert.deepEqual(
    qualityNote(4.9, QUALITY_LABEL_MIN_REVIEWS - 1),
    { label: null, reviews: QUALITY_LABEL_MIN_REVIEWS - 1 },
  );
  assert.deepEqual(qualityNote(QUALITY_HIGH_RATING, QUALITY_LABEL_MIN_REVIEWS), { label: "Highly rated", reviews: QUALITY_LABEL_MIN_REVIEWS });
  assert.deepEqual(qualityNote(4.6, 1017), { label: "Highly rated", reviews: 1017 });
  assert.equal(qualityNote(QUALITY_HIGH_RATING - 0.01, 500).label, "Well rated");
  assert.equal(qualityNote(QUALITY_WELL_RATING, 500).label, "Well rated");
  assert.equal(qualityNote(QUALITY_WELL_RATING - 0.01, 500).label, null, "under 4.0 gets the count and no word");
  assert.equal(qualityNote(null, 500).label, null);
  assert.deepEqual(qualityNote(null, 500), { label: null, reviews: 500 });
  for (const rating of [3.2, 4.0, 4.4, 4.5, 5]) {
    assert.deepEqual(Object.keys(qualityNote(rating, 300)).sort(), ["label", "reviews"], "the rating is never in the note");
  }
});

ok("forMeQualityNote: no reason, no line; a tail card never says well rated twice", () => {
  const row = { rating: 4.7, reviewCount: 800 };
  assert.equal(forMeQualityNote(row), null, "not a For me row");
  assert.equal(forMeQualityNote({ ...row, reason: null }), null);
  for (const kind of ["like", "pick", "friends", "cuisine"]) {
    assert.deepEqual(forMeQualityNote({ ...row, reason: { kind } }), { label: "Highly rated", reviews: 800 }, kind);
  }
  assert.deepEqual(forMeQualityNote({ ...row, reason: { kind: "rated" } }), { label: null, reviews: 800 });
  assert.equal(forMeQualityNote({ rating: 4.7, reviewCount: 5, reason: { kind: "rated" } }), null);
  assert.equal(forMeQualityNote({ rating: 4.7, reviewCount: null, reason: { kind: "like" } }), null);
  assert.equal(forMeQualityNote({ rating: null, reviewCount: 400, reason: { kind: "like" } })?.label, null);
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
// Poor with weight behind it: a thin rating is lifted toward the corpus mean now,
// so a poor place has to have the reviews to stay poor.
const POOR = { rating: 3.6, reviews: 400, photo: null };
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

ok("a seed's listing tagline is cut from the like reason", () => {
  const world = miniWorld([
    ["s1", "Seed Ramen Bar - Mission Valley", "Japanese", BOWL],
    ["s2", "Candidate Kitchen", "Japanese", ["ramen", "gyoza", "tonkotsu", "chashu"]],
  ]);
  const reason = miniRank(world, { postedIds: ["s1"] }).reasonOf("s2");
  assert.equal(reason.kind, "like");
  assert.equal(reason.text, "Because you went to Seed Ramen Bar");
  assert.ok(!reason.text.includes(" - ") && !("friends" in reason));
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
  // GET: the public, CDN-cached read. It is main's: it never names the mode (a
  // `foryou` there is an unknown param, answered like any other), there is no
  // 400, and nothing personal is in it.
  assert.ok(!getFn.includes("FOR_ME_PARAM") && !/status:\s*400/.test(getFn), "GET has no For me refusal any more");
  assert.match(getFn, /return cachedJson\(req, toWire\(page\)\);/);
  for (const word of ["getCurrentUser", "rankTaste", "resolveTasteContext", "limitForMe", "isForMeUser", "prefs", "forMe", "PRIVATE_HEADERS"]) {
    assert.ok(!getFn.includes(word), `GET mentions ${word}`);
  }
  assert.ok(!/FOR_ME_PARAM/.test(routeCode), "the route does not import the mode's name at all");
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
  // The account gate: right after the session is read and before anything is
  // spent on the viewer -- the For me rate limit, the corpus read, the profile
  // traits, the taste context -- and the branch it takes is the public one.
  const gate = postFn.indexOf("!isForMeUser(");
  assert.ok(postFn.indexOf("getCurrentUser(") < gate, "the gate follows the session read");
  for (const later of ["limitForMe(", "loadCorpus(", "loadProfileTraits(", "resolveTasteContext(", "rankTaste("]) {
    assert.ok(gate < postFn.indexOf(later), `the gate comes before ${later}`);
  }
  assert.ok(postFn.indexOf("limitOrReject(") < postFn.indexOf("req.json()"), "the shared limit runs first, for everyone");
  const gated = postFn.slice(gate, postFn.indexOf("limitForMe("));
  assert.match(gated, /!isForMeUser\(user\?\.id\)/, "an anonymous caller is outside the list too");
  for (const word of ["PRIVATE_HEADERS", "rankTaste", "forMe:", "status: 403", "status:403"]) {
    assert.ok(!gated.includes(word), `the gated branch mentions ${word}`);
  }
  assert.match(gated, /getDiscoverPage\(search, \{ shown: limit, here \}\)/, "and it serves what the unpersonalised branch serves");
});

/* ---------- the quality term: shrunk rating, soft floor, tail wording ---------- */

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const clampTo01 = (x) => Math.min(1, Math.max(0, x));
const byRestaurant = (world, id) => world.restaurants.find((r) => r.id === id);
const scoredId = (sc, id) => sc.scored.find((s) => s.r.id === id);

ok("quality term: For me has its own weights and constants; Your taste keeps its own", () => {
  assert.deepEqual({ ...FORME_WEIGHTS }, { affinity: 0.4, friends: 0.2, quality: 0.3, neighborhood: 0.1, budget: 0.06 });
  const sum = FORME_WEIGHTS.affinity + FORME_WEIGHTS.friends + FORME_WEIGHTS.quality + FORME_WEIGHTS.neighborhood;
  assert.ok(near(sum, 1, 1e-12), "the four weights sum to one, so a perfect place is 100 before the budget term");
  assert.deepEqual([WEIGHTS.affinity, WEIGHTS.friends, WEIGHTS.quality, WEIGHTS.neighborhood], [0.5, 0.2, 0.2, 0.1]);
  assert.equal(FORME_QUALITY.minReviews, 10);
  assert.equal(FORME_QUALITY.priorReviews, 50);
  assert.equal(FORME_QUALITY.rawGuardReviews, 15);
  assert.equal(FORME_QUALITY.floorUnrated, 0.92);
  assert.equal(FORME_QUALITY.wellRatedFrom, 4.2);
  assert.equal(FORME_QUALITY.highlyRatedFrom, 4.5);
  assert.ok(!("wellRatedQ" in WEIGHTS), "the tail wording reads R', not Q");
});

ok("quality term: C is the mean of the rated places; R' is a pull toward it that thins with reviews", () => {
  const rows = (...xs) => xs.map(([rating, reviewCount]) => ({ rating, reviewCount }));
  assert.ok(near(meanRating(rows([4, 100], [5, 100])), 4.5));
  assert.ok(
    near(meanRating(rows([4, 100], [5, 100], [1, 9], [2, null], [null, 500], [NaN, 500])), 4.5),
    "thin, countless, unrated and unreadable ratings stay out of C",
  );
  assert.equal(meanRating([]), null);
  assert.equal(meanRating(rows([5, 3], [null, 100])), null, "nothing rated: no mean");

  assert.ok(near(shrunkRating(4, 50, 4.6), 4.3), "50 reviews against a prior of 50 is the midpoint");
  assert.ok(near(shrunkRating(5, 10, 4.4), (10 * 5 + 50 * 4.4) / 60));
  assert.equal(shrunkRating(5, 9, 4.4), null, "under ten reviews is unrated");
  assert.equal(shrunkRating(5, null, 4.4), null);
  assert.equal(shrunkRating(5, undefined, 4.4), null);
  assert.equal(shrunkRating(null, 500, 4.4), null);
  assert.equal(shrunkRating(undefined, 500, 4.4), null);
  assert.equal(shrunkRating(NaN, 500, 4.4), null);
  assert.equal(shrunkRating(4.1, 30, null), 4.1, "no corpus mean: nothing to pull toward");
  assert.equal(shrunkRating(4.1, 30, NaN), 4.1);

  let last = Infinity;
  for (const nn of [10, 20, 50, 100, 400, 2000, 50000]) {
    const v = shrunkRating(4.9, nn, 4.3);
    assert.ok(v > 4.3 && v < 4.9, `R' sits between the rating and the mean (n=${nn})`);
    assert.ok(4.9 - v < last, "and nearer the rating the more reviews stand behind it");
    last = 4.9 - v;
  }
  assert.ok(near(shrunkRating(4.9, 50000, 4.3), 4.9, 1e-3));
  assert.ok(shrunkRating(3.2, 40, 4.4) > 3.2, "a low thin rating is lifted too: thin is not poor");
});

ok("quality term: the soft floor g is 1, 0.8, 0.65, straight between, and 0.92 unrated", () => {
  const g = (rs) => qualityFloor(rs, rs, 12); // 12 reviews: under the raw-rating guard
  for (const rs of [4.2, 4.5, 5]) assert.equal(g(rs), 1);
  assert.ok(near(g(4.0), 0.9));
  assert.ok(near(g(3.8), 0.8));
  assert.ok(near(g(3.65), 0.725));
  assert.ok(near(g(3.5), 0.65));
  for (const rs of [3.2, 1, 0]) assert.equal(g(rs), 0.65);
  assert.equal(qualityFloor(null, 5, 500), 0.92, "unrated, whatever the raw number says");
  assert.equal(qualityFloor(null, null, null), 0.92);

  let prev = g(2);
  for (let x = 2.01; x <= 5.5; x += 0.01) {
    const v = g(x);
    assert.ok(Number.isFinite(v) && v >= 0.65 && v <= 1, `g(${x}) = ${v}`);
    assert.ok(v >= prev - 1e-12, `g never falls as R' rises (${x})`);
    assert.ok(v - prev < 0.01, `g has no step (${x})`);
    prev = v;
  }

  // From fifteen reviews the raw rating can only lower it.
  assert.ok(near(qualityFloor(4.5, 3.9, 20), 0.85), "20 reviews at a raw 3.9 are judged on 3.9");
  assert.equal(qualityFloor(4.5, 3.9, 14), 1, "14 reviews: the shrunk rating stands alone");
  assert.ok(near(qualityFloor(4.5, 3.9, 15), 0.85), "the guard starts at 15");
  assert.ok(near(qualityFloor(4.0, 4.7, 400), 0.9), "a raw rating above R' does not raise g");
  assert.ok(near(qualityFloor(4.0, null, 400), 0.9));
});

ok("quality term: Q reads R' and g scales the score; missing data is neutral", () => {
  const C = 4.4;
  // One menu for all of them, so affinity is the same and only quality differs.
  const menu = ["pad thai", "green curry"];
  const world = miniWorld([
    ["q1", "Great Place", "Thai", menu, { rating: 4.8, reviews: 800, photo: null }],
    ["q2", "Good Place", "Thai", menu, { rating: 4.4, reviews: 800, photo: null }],
    ["q3", "Okay Place", "Thai", menu, { rating: 3.9, reviews: 800, photo: null }],
    ["q4", "Poor Place", "Thai", menu, { rating: 3.3, reviews: 800, photo: null }],
    ["q5", "Thin Raving", "Thai", menu, { rating: 5, reviews: 9, photo: null }],
    ["q6", "No Rating", "Thai", menu, { rating: null, photo: null }],
    ["q7", "No Count", "Thai", menu, { rating: 4.8, photo: null }],
    ["q8", "Steady Place", "Thai", menu, { rating: 4.5, reviews: 300, photo: null }],
    ["q9", "Landmark Place", "Thai", menu, { rating: 4.5, reviews: 5000, photo: null }],
    ["q10", "Photo Place", "Thai", menu, { rating: 4.4, reviews: 800 }],
    ["g1", "Guarded Place", "Thai", menu, { rating: 3.9, reviews: 20, photo: null }],
    ["g2", "Young Place", "Thai", menu, { rating: 3.9, reviews: 14, photo: null }],
  ]);
  byRestaurant(world, "q7").reviewCount = null;
  const picks = prefs({ loves: ["Thai"] });
  const scanned = (o = {}) => scoreAll({ ...base, ...world, prefs: picks, ratingMean: C, ...o });
  const sc = scanned();
  const at = (s, id) => scoredId(s, id);
  assert.equal(sc.mode, "similarity", "fixture: For me scoring");
  assert.ok(near(at(sc, "q1").A, at(sc, "q4").A) && near(at(sc, "q1").N, at(sc, "q4").N), "fixture: same menu, same affinity and hood");

  // The score is g times the sum, every term from the same scored row.
  for (const s of sc.scored) {
    const sum =
      100 *
      (FORME_WEIGHTS.affinity * s.A * s.D + FORME_WEIGHTS.friends * s.F + FORME_WEIGHTS.quality * s.Q + FORME_WEIGHTS.neighborhood * s.N * s.D);
    assert.ok(near(s.score, s.G * (sum + s.budgetPts), 1e-9), `${s.r.name}: score is g * (the weighted sum + the budget points)`);
    for (const v of [s.score, s.tail, s.Q, s.G, s.A]) assert.ok(Number.isFinite(v), `${s.r.name}: finite`);
    assert.ok(near(s.tail, 100 * (WEIGHTS.qualityInTail * s.Q + WEIGHTS.hoodInTail * s.N)), "the tail formula is unchanged");
  }

  // Q is the stars of R' alone, and R' is the formula.
  for (const id of ["q1", "q2", "q3", "q4", "q8", "q9"]) {
    const s = at(sc, id);
    const r = s.r;
    assert.ok(near(s.Rs, (r.reviewCount * r.rating + 50 * C) / (r.reviewCount + 50)), `${id}: R'`);
    assert.ok(near(s.Rs, shrunkRating(r.rating, r.reviewCount, C)));
    assert.ok(near(s.Q, WEIGHTS.sourceOnlyInQ * clampTo01((s.Rs - WEIGHTS.ratingFloor) / WEIGHTS.ratingSpan)), `${id}: Q`);
  }
  assert.equal(at(sc, "q1").G, 1);
  assert.ok(at(sc, "q3").G < 1 && at(sc, "q4").G === 0.65);
  assert.ok(
    at(sc, "q1").score > at(sc, "q2").score && at(sc, "q2").score > at(sc, "q3").score && at(sc, "q3").score > at(sc, "q4").score,
    "better rated, higher score, all else equal",
  );

  // No volume factor: 300 reviews and 5,000 at the same rating differ only by the thin pull.
  assert.ok(Math.abs(at(sc, "q8").Q - at(sc, "q9").Q) < 0.02, "a landmark is not rewarded for its crowd");
  assert.ok(at(sc, "q9").Q >= at(sc, "q8").Q, "but a bigger sample is never trusted less");

  // Missing data: neither rewarded nor punished, never a NaN.
  for (const id of ["q5", "q6", "q7"]) {
    const s = at(sc, id);
    assert.equal(s.Rs, null, `${id} is unrated`);
    assert.equal(s.Q, WEIGHTS.unratedQ, `${id}: Q stays at the unrated value`);
    assert.equal(s.G, 0.92, `${id}: g is the unrated factor`);
  }
  assert.ok(near(at(sc, "q5").score, at(sc, "q6").score), "nine glowing reviews buy nothing");
  assert.ok(near(at(sc, "q7").score, at(sc, "q6").score), "a rating with no count buys nothing");
  assert.ok(
    at(sc, "q2").score > at(sc, "q5").score && at(sc, "q5").score > at(sc, "q3").score,
    "unrated sits between a good place and a mediocre one",
  );

  // Photo and plate branches are the ones they were.
  assert.ok(near(at(sc, "q10").Q, Math.min(1, at(sc, "q2").Q + WEIGHTS.photoInQ)));
  const plate90 = { percent: 90, dishCount: 5, ratingCount: 30, ready: true };
  const plated = scanned({ plates: { q2: plate90, q6: plate90 } });
  const p = clampTo01((90 - WEIGHTS.plateFloorPct) / WEIGHTS.plateSpanPct);
  const srcB = clampTo01((at(plated, "q2").Rs - WEIGHTS.ratingFloor) / WEIGHTS.ratingSpan);
  assert.ok(near(at(plated, "q2").Q, WEIGHTS.plateInQ * p + WEIGHTS.sourceInQ * srcB), "plate branch over R'");
  assert.ok(near(at(plated, "q6").Q, WEIGHTS.plateInQ * p + WEIGHTS.sourceInQ * WEIGHTS.unratedQ), "plate branch, unrated source");
  assert.equal(at(plated, "q6").G, 0.92, "a plate score does not change the floor");

  // The raw-rating guard, seen through the scan.
  const guarded = scanned({ ratingMean: 4.6 });
  assert.ok(near(at(guarded, "g1").Rs, (20 * 3.9 + 50 * 4.6) / 70));
  assert.ok(near(at(guarded, "g1").G, 0.85), "20 reviews at 3.9 are held to 3.9");
  assert.equal(at(guarded, "g2").G, 1, "14 reviews at 3.9 are lifted by the prior");

  // No corpus mean: ratings stand as they are. No hint at all: C is read off the corpus.
  const noMean = scanned({ ratingMean: null });
  assert.equal(at(noMean, "q1").Rs, 4.8);
  assert.equal(at(noMean, "q5").Rs, null);
  const derived = scanned({ ratingMean: undefined });
  const fromCorpus = meanRating(world.restaurants);
  for (const s of derived.scored) assert.equal(s.Rs, shrunkRating(s.r.rating, s.r.reviewCount, fromCorpus));
  assert.deepEqual(
    derived.scored.map((s) => s.score),
    scanned({ ratingMean: fromCorpus }).scored.map((s) => s.score),
  );

  // A corpus with nothing rated, and with one rated place: finite, and the lone rating stands.
  for (const [label, specs, want] of [
    ["unrated", [["n1", "A Cafe", "Thai", ["a"], { rating: null }], ["n2", "B Cafe", "Thai", ["b"], { rating: 5, reviews: 3 }]], null],
    ["alone", [["n1", "A Cafe", "Thai", ["a"], { rating: 4.2, reviews: 30 }], ["n2", "B Cafe", "Thai", ["b"], { rating: null }]], 4.2],
  ]) {
    const lone = scoreAll({ ...base, ...miniWorld(specs), prefs: picks });
    for (const s of lone.scored) for (const v of [s.score, s.tail, s.Q, s.G]) assert.ok(Number.isFinite(v), `${label}: finite`);
    assert.equal(scoredId(lone, "n1").Rs, want, `${label}: R'`);
  }
});

ok("quality term: Your taste never sees R', g or the new weights", () => {
  const world = miniWorld([
    ["y1", "Great Place", "Thai", ["a"], { rating: 4.8, reviews: 800 }],
    ["y2", "Thin Raving", "Thai", ["b"], { rating: 5, reviews: 9, photo: null }],
    ["y3", "No Rating", "Thai", ["c"], { rating: null }],
    ["y4", "No Count", "Thai", ["d"], { rating: 4.4, photo: null }],
    ["y5", "Poor Place", "Thai", ["e"], { rating: 3.4, reviews: 600, photo: null }],
  ]);
  byRestaurant(world, "y4").reviewCount = null;
  const plates = {
    y1: { percent: 80, dishCount: 5, ratingCount: 30, ready: true },
    y3: { percent: 95, dishCount: 5, ratingCount: 30, ready: true },
  };
  const input = { ...base, restaurants: world.restaurants, traits: undefined, plates, prefs: prefs({ loves: ["Thai"] }) };
  const legacyQ = (r, plate) => {
    const src =
      r.rating == null
        ? WEIGHTS.unratedQ
        : clampTo01((r.rating - WEIGHTS.ratingFloor) / WEIGHTS.ratingSpan) *
          Math.min(1, Math.log10(1 + (r.reviewCount ?? 0)) / WEIGHTS.reviewLogDivisor);
    let b;
    if (plate?.ready && plate.percent != null) {
      b = WEIGHTS.plateInQ * clampTo01((plate.percent - WEIGHTS.plateFloorPct) / WEIGHTS.plateSpanPct) + WEIGHTS.sourceInQ * src;
    } else b = r.rating == null ? WEIGHTS.unratedQ : WEIGHTS.sourceOnlyInQ * src;
    return r.photo ? Math.min(1, b + WEIGHTS.photoInQ) : b;
  };
  for (const mean of [undefined, null, 1, 9]) {
    const s0 = scoreAll({ ...input, ratingMean: mean });
    assert.equal(s0.mode, "cuisine");
    for (const s of s0.scored) {
      assert.equal(s.Rs, null, "no shrunk rating in the cuisine-share mode");
      assert.equal(s.G, 1, "no floor in the cuisine-share mode");
      assert.equal(s.Q, legacyQ(s.r, plates[s.r.id]), `${s.r.name}: Q is the raw-rating formula`);
      assert.equal(
        s.score,
        100 * (WEIGHTS.affinity * s.A + WEIGHTS.friends * s.F + WEIGHTS.quality * s.Q + WEIGHTS.neighborhood * s.N),
        `${s.r.name}: score on WEIGHTS`,
      );
    }
  }
});

ok("quality term: the tail says Well rated from R' 4.2 and Highly rated from 4.5, off R' alone", () => {
  const C = 4.4;
  const sweep = [3.4, 3.7, 3.9, 4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 5.0];
  const id = (i) => `t${String(i).padStart(2, "0")}`;
  const specs = sweep.map((rating, i) => [id(i), `Sweep ${i} Cafe`, "Thai", [`d${i}`, "pad thai"], { rating, reviews: 400, photo: null }]);
  specs.push(["tu", "Unrated Cafe", "Thai", ["u1"], { rating: null, photo: null }]);
  specs.push(["tn", "Thin Raving Cafe", "Thai", ["u2"], { rating: 5, reviews: 9, photo: null }]);
  specs.push(["tp", "Plate Only Cafe", "Thai", ["u3"], { rating: null, photo: null }]);
  const world = miniWorld(specs);
  const plates = { tp: { percent: 95, dishCount: 6, ratingCount: 40, ready: true } };
  const res = miniRank(world, { ratingMean: C, plates });
  const sc = scoreAll({ ...base, ...world, ratingMean: C, plates });
  assert.equal(res.matched, 0, "fixture: cold start, everything is tail");

  const seen = new Set();
  for (const s of sc.scored) {
    const reason = res.reasonOf(s.r.id);
    const want =
      s.Rs != null && s.Rs >= 4.5 ? "Highly rated in Downtown" : s.Rs != null && s.Rs >= 4.2 ? "Well rated in Downtown" : "Worth a look";
    assert.equal(reason.text, want, `${s.r.name} (R' ${s.Rs})`);
    seen.add(want);
    // The card's own line never repeats the claim.
    const note = forMeQualityNote({ rating: s.r.rating, reviewCount: s.r.reviewCount, reason });
    assert.ok(!(/rated/.test(reason.text) && note?.label), `${s.r.name}: reason and quality line both say rated`);
  }
  assert.equal(seen.size, 3, "the sweep covers all three wordings");
  assert.equal(res.reasonOf("tp").text, "Worth a look", "a strong plate score with no sourced rating is not 'well rated'");
  assert.ok(scoredOf(sc, byRestaurant(world, "tp")).Q > 0.5, "fixture: its Q is high enough that the old wording would have said it");

  // The tail runs best rated first; thin and unrated places tie at the unrated value.
  const rankOf = (rid) => res.rank.get(rid);
  for (let i = 2; i < sweep.length - 1; i++) {
    assert.ok(rankOf(id(i + 1)) < rankOf(id(i)), `${sweep[i + 1]} leads ${sweep[i]}`);
  }
  assert.ok(near(scoredId(sc, "tu").tail, scoredId(sc, "tn").tail), "nine glowing reviews tie with no rating");
  assert.ok(rankOf("tu") < rankOf(id(0)) && rankOf(id(10)) < rankOf("tu"), "unrated sits between the poor and the excellent");
});

ok("quality term: the corpus carries C and the route hands it to the ranker", () => {
  const discoverCode = stripComments(read("../src/lib/discover.ts"));
  assert.match(discoverCode, /ratingMean:\s*number \| null;/, "Corpus has the field");
  assert.match(discoverCode, /ratingMean:\s*meanRating\(restaurants\)/, "computed where the corpus is read, so it is cached with it");
  assert.match(postFn, /ratingMean:\s*corpus\.ratingMean/, "the route passes the cached value");
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
  assert.match(hook, /if \(access && wanted === null && answer !== null\) setAnswer\(null\)/);
  assert.match(hook, /const failed = wanted !== null && failedKey === wanted/);
  assert.match(hook, /setFailedKey\(wanted\)/);
  assert.equal((hook.match(/setFailedKey\(wanted\)/g) ?? []).length, 2, "a bad status and a thrown error both fail");
  assert.match(hook, /setAttempt\(\(n\) => n \+ 1\)/);
  assert.match(hook, /\[wanted, answerKey, search, shown, coords, forMe, waitingForSession, access, attempt\]/, "retry re-runs the effect");
  assert.match(hook, /const waitingForSession = forMe && !resolved;/, "only For me waits on the session");
  assert.equal((hook.match(/if \(access && !cancelled\) setFailedKey\(wanted\)/g) ?? []).length, 2, "and a failure is only said to the accounts that see For me");
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

ok("both For me cards print why it is for them and why it is good", () => {
  const grid = stripComments(read("../src/components/mobile/PhoneRestaurantCardGrid.tsx"));
  const card = stripComments(read("../src/components/RestaurantCard.tsx"));
  const pick = stripComments(read("../src/components/TastePickCard.tsx"));
  const web = stripComments(read("../src/components/DiscoverBrowser.tsx"));
  const phone = stripComments(read("../src/components/mobile/PhoneTasteSection.tsx"));
  const qline = stripComments(read("../src/components/QualityLine.tsx"));
  const taste = stripComments(read("../src/components/TasteSection.tsx"));

  // Call sites: the For me lists pass all three; Your taste passes none of the new two.
  assert.match(
    phone,
    /reason=\{restaurant\.reason\?\.text \?\? null\}\s*friends=\{restaurant\.reason\?\.friends \?\? null\}\s*quality=\{forMeQualityNote\(restaurant\)\}/,
  );
  assert.match(
    web,
    /reason=\{restaurant\.reason\?\.text\}\s*friends=\{restaurant\.reason\?\.friends\}\s*quality=\{forMeQualityNote\(restaurant\)\}/,
  );
  assert.match(pick, /reason=\{reason\}\s*friends=\{friends\}\s*quality=\{quality\}/);
  assert.ok(!/friends=|quality=/.test(taste), "Your taste strips keep their own line");

  // The phone grid: 11px, wrapping to two lines, friends then quality.
  assert.match(grid, /\{friends && \(\s*<p className="mt-0\.5 line-clamp-2 text-\[11px\]/);
  assert.match(grid, /\{quality && \(\s*<QualityLine[^>]*line-clamp-2 text-\[11px\]/);
  assert.match(grid, /\{reason && \(\s*<p className="mt-1 line-clamp-2 text-\[11px\][^"]*">\s*<ReasonText text=\{reason\} \/>/);

  // The web card: the reason wraps to two lines instead of truncating; text-xs.
  assert.match(card, /line-clamp-2 text-xs font-medium text-zinc-600">\s*<ReasonText text=\{reason\} \/>/);
  assert.ok(!/truncate text-xs font-medium text-zinc-600">/.test(card), "the reason no longer truncates");
  assert.match(card, /\{friends && <p className="line-clamp-2 text-xs text-zinc-600">\{friends\}<\/p>\}/);
  assert.match(card, /\{quality && <QualityLine quality=\{quality\} className="text-xs text-zinc-500" \/>\}/);

  // The number stays retired: the line is words and a review count, the star is still gated.
  assert.ok(!/StarIcon|blendLabel|\.rating\b|SHOW_BLEND_STARS/.test(qline), "the quality line never reads the rating");
  assert.match(qline, /font-mono tabular-nums/, "the review count is a number");
  assert.match(grid, /SHOW_BLEND_STARS && restaurant\.rating != null/);
  assert.match(card, /SHOW_BLEND_STARS && restaurant\.rating != null/);
});

/*
 * The discover route, run for real with its collaborators swapped for
 * recorders. A temporary copy of route.ts has each `@/lib/...` import pointed at
 * either the real module or a stand-in (the session, the rate limiter, the
 * corpus and the ranker are stand-ins), so the handler's own branching is what
 * runs: no database, no cookies, no server, and nothing written anywhere.
 */
function loadRouteWithStandIns() {
  const dir = mkdtempSync(join(tmpdir(), "forme-route-"));
  const recorder = () => globalThis.__formeRoute;
  const standIns = {
    "@/lib/loginThrottle": `export const clientIp = () => "203.0.113.7";`,
    "@/lib/session": `export const getCurrentUser = async () => { const s = globalThis.__formeRoute; s.calls.push("getCurrentUser"); return s.user; };`,
    "@/lib/rateLimit": `
      export const limitOrReject = async (o) => { globalThis.__formeRoute.calls.push("limitOrReject:" + o.scope); return null; };
      export const limitForMe = async () => { globalThis.__formeRoute.calls.push("limitForMe"); return null; };`,
    "@/lib/discover": `
      export const getDiscoverPage = async (search, opts) => { const s = globalThis.__formeRoute; s.calls.push("getDiscoverPage"); s.pages.push({ search, opts }); return { page: true }; };
      export const loadCorpus = async () => { globalThis.__formeRoute.calls.push("loadCorpus"); return { restaurants: [], plates: [], ratingMean: null }; };
      export const loadProfileTraits = async () => { globalThis.__formeRoute.calls.push("loadProfileTraits"); return []; };`,
    "@/lib/discoverWire": `export const toWire = (page) => ({ wire: page });`,
    "@/lib/profileTraits": `export const traitIndexFor = () => { globalThis.__formeRoute.calls.push("traitIndexFor"); return {}; };`,
    "@/lib/taste": `export const rankTaste = () => { globalThis.__formeRoute.calls.push("rankTaste"); return { ranked: true }; };`,
    "@/lib/tasteContext": `export const resolveTasteContext = async () => { globalThis.__formeRoute.calls.push("resolveTasteContext"); return { prefs: {}, postedIds: [], favoriteCuisine: null, friendVisits: [], postedSignals: [], platePrices: [] }; };`,
  };
  const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
  const source = routeSrc
    .replace(/from "(@\/lib\/[^"]+)"/g, (_m, spec) =>
      spec in standIns
        ? `from "${dataUrl(standIns[spec])}"`
        : `from "${new URL(`../src/lib/${spec.slice("@/lib/".length)}.ts`, import.meta.url).href}"`,
    )
    .replace('from "next/server"', `from "${import.meta.resolve("next/server")}"`);
  assert.ok(!source.includes('"@/'), "every alias import was rewritten");
  const file = join(dir, "route.mts");
  writeFileSync(file, source);
  return { dir, file, recorder };
}

await okAsync("the discover route, with a mocked session: only the listed accounts get For me", async () => {
  const hadDb = !!process.env.DATABASE_URL;
  // loginThrottle builds its client at import and never connects; a stand-in
  // only keeps that import quiet when there is no .env.local.
  if (!hadDb) process.env.DATABASE_URL = "postgresql://forme:check@dummy.invalid/forme";
  globalThis.__formeRoute = { calls: [], pages: [], user: null };
  const state = globalThis.__formeRoute;
  const loaded = loadRouteWithStandIns();
  try {
    const route = await import(pathToFileURL(loaded.file).href);
    assert.equal(typeof route.GET, "function");
    assert.equal(typeof route.POST, "function");

    const post = async (body, user) => {
      state.calls.length = 0;
      state.pages.length = 0;
      state.user = user;
      const res = await route.POST(
        new Request("http://localhost/api/restaurants/discover", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      );
      return {
        status: res.status,
        headers: [...res.headers].sort(),
        body: await res.json(),
        calls: [...state.calls],
        pages: structuredClone(state.pages),
      };
    };

    // The guards that run before any read, and the shared limit that is first.
    const bad = await post("{nope", null);
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.calls, ["limitOrReject:discover:ip"]);
    const missing = await post({ forMe: true }, null);
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.calls, ["limitOrReject:discover:ip"], "nothing about the viewer is read for a malformed body");

    // What main serves: the same request without the flag. Nothing reads the
    // session, there is no private header, and the page is the unpersonalised one.
    const here = { lat: 32.7157, lng: -117.1611 };
    const request = { search: "cuisine=Thai", shown: 48, coords: here };
    const plain = await post(request, null);
    assert.equal(plain.status, 200);
    assert.deepEqual(plain.calls, ["limitOrReject:discover:ip", "getDiscoverPage"]);
    assert.deepEqual(plain.pages, [{ search: "cuisine=Thai", opts: { shown: 48, here } }]);
    assert.deepEqual(plain.body, { wire: { page: true } });
    // Coordinates are numbers or nothing: null, an empty string or a list is not the equator.
    for (const bogus of [{ lat: null, lng: null }, { lat: "", lng: "" }, { lat: [], lng: [] }, { lat: false, lng: true }, { lat: 91, lng: 0 }, { lat: 0 }, "32.7,-117.1", null]) {
      const bogusPlain = await post({ search: "cuisine=Thai", shown: 48, coords: bogus }, null);
      assert.equal(bogusPlain.status, 200);
      assert.equal(bogusPlain.pages[0].opts.here, null, `coords ${JSON.stringify(bogus)} are no position`);
    }
    const origin = await post({ search: "cuisine=Thai", shown: 48, coords: { lat: 0, lng: 0 } }, null);
    assert.deepEqual(origin.pages[0].opts.here, { lat: 0, lng: 0 }, "a real 0,0 is still a number");
    assert.ok(!plain.headers.some(([k]) => k === "cache-control" || k === "vary"), "main sets no cache headers on this answer");

    // Everyone outside the list, signed in or out, asking for For me with prefs
    // in hand, gets that answer byte for byte: same status, same headers, same
    // body, same arguments, and none of the work For me costs is done. Never a 403.
    const strangers = [null, { id: "00000000-0000-4000-8000-000000000000" }, { id: "not-a-uuid" }, { id: "" }, {}];
    for (const user of strangers) {
      const asked = await post({ ...request, forMe: true, prefs: { loves: ["Thai"], skips: [], been: [], hidden: [] } }, user);
      assert.equal(asked.status, 200, `a non-allowlisted ${JSON.stringify(user)} is not refused`);
      assert.deepEqual(asked.headers, plain.headers, "same headers as main");
      assert.deepEqual(asked.body, plain.body, "same body as main");
      assert.deepEqual(asked.pages, plain.pages, "getDiscoverPage is asked exactly what main asks");
      assert.ok(!("forMe" in asked.pages[0].opts), "and never to rank");
      assert.deepEqual(
        asked.calls,
        ["limitOrReject:discover:ip", "getCurrentUser", "getDiscoverPage"],
        "the shared limit, the session, the plain page -- no For me limit, corpus, profiles, taste or ranking",
      );
    }

    // The listed accounts get the personal list, privately, in the order the
    // guards promise.
    assert.ok(FOR_ME_USER_IDS.size >= 1);
    for (const id of FOR_ME_USER_IDS) {
      const mine = await post({ ...request, forMe: true, prefs: {} }, { id });
      assert.equal(mine.status, 200);
      assert.deepEqual(mine.calls, [
        "limitOrReject:discover:ip",
        "getCurrentUser",
        "limitForMe",
        "loadCorpus",
        "loadProfileTraits",
        "resolveTasteContext",
        "traitIndexFor",
        "rankTaste",
        "getDiscoverPage",
      ]);
      assert.deepEqual(mine.pages[0].opts.forMe, { ranked: true });
      const header = (k) => mine.headers.find(([name]) => name === k)?.[1];
      assert.equal(header("cache-control"), "private, no-store");
      assert.equal(header("vary"), "Cookie");

      // Without a literal `forMe: true` even they get the plain page and no session read.
      for (const flag of [undefined, false, "true", 1, null]) {
        const notAsked = await post({ ...request, forMe: flag }, { id });
        assert.deepEqual(notAsked.calls, ["limitOrReject:discover:ip", "getDiscoverPage"]);
        assert.deepEqual(notAsked.headers, plain.headers);
      }
    }

    // The public GET: `foryou` is just another param, as on main -- served, not
    // refused, and handed to the page builder untouched.
    for (const q of ["foryou=1", "foryou=0", "foryou", "cuisine=Thai&foryou=1&shown=48", "q=ramen&foryou=true&nav=x"]) {
      state.calls.length = 0;
      state.pages.length = 0;
      const res = await route.GET(new Request(`http://localhost/api/restaurants/discover?${q}`));
      assert.equal(res.status, 200, `GET ?${q}`);
      assert.deepEqual(state.calls, ["getDiscoverPage"], "the GET reads no session and no limiter");
      assert.equal(state.pages[0].opts.here, null);
      assert.ok(!("forMe" in state.pages[0].opts));
      const expected = new URLSearchParams(q);
      expected.delete("shown");
      assert.equal(state.pages[0].search, expected.toString());
      assert.notEqual(res.headers.get("cache-control"), "no-store", "still the public, cacheable answer");
    }
  } finally {
    rmSync(loaded.dir, { recursive: true, force: true });
    delete globalThis.__formeRoute;
    if (!hadDb) delete process.env.DATABASE_URL;
  }
});

ok("the gate: isForMeUser lists exactly the accounts in FOR_ME_USER_IDS, and accountJson says so", () => {
  for (const id of FOR_ME_USER_IDS) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "ids are uuids");
    assert.equal(isForMeUser(id), true);
    assert.equal(isForMeUser(id.toUpperCase()), false, "an id is matched exactly, not loosely");
    assert.equal(isForMeUser(` ${id}`), false);
    assert.equal(isForMeUser(`${id}0`), false);
    assert.equal(isForMeUser(id.slice(0, -1)), false);
  }
  for (const other of [undefined, null, "", " ", "0", "undefined", "null", "00000000-0000-4000-8000-000000000000"]) {
    assert.equal(isForMeUser(other), false, `${JSON.stringify(other)} is outside`);
  }
  assert.equal(isForMeUser(), false);

  const user = (id) => ({
    id,
    name: "Name",
    email: "n@example.com",
    points: 3,
    avatarUrl: undefined,
    sharePhotosPublicly: false,
    favoriteCuisine: undefined,
    favoriteRestaurantId: undefined,
    hideFromLeaderboard: false,
    discoverableByUsername: false,
    friendRequestsOpen: true,
    emailVerifiedAt: undefined,
    pendingEmail: undefined,
    photoNoticeSeen: false,
    tourSeen: false,
  });
  // main's account JSON, key for key: the flag is not present at all for anyone else
  const mainKeys = [
    "id", "name", "email", "points", "avatarUrl", "sharePhotosPublicly", "favoriteCuisine",
    "favoriteRestaurantId", "hideFromLeaderboard", "discoverableByUsername", "friendRequestsOpen",
    "emailVerified", "pendingEmail", "photoNoticeSeen", "tourSeen",
  ];
  const other = accountJson(user("00000000-0000-4000-8000-000000000000"));
  assert.deepEqual(Object.keys(other), mainKeys, "an outsider's account is exactly main's");
  assert.ok(!JSON.stringify(other).includes("forMe"));
  for (const id of FOR_ME_USER_IDS) {
    const mine = accountJson(user(id));
    assert.deepEqual(Object.keys(mine), [...mainKeys, "forMe"]);
    assert.equal(mine.forMe, true);
    const rest = { ...mine };
    delete rest.forMe;
    assert.deepEqual(rest, { ...other, id }, "nothing else differs");
  }
  const authSrc = stripComments(read("../src/lib/auth.tsx"));
  assert.match(authSrc, /export function useForMeAccess\(\): boolean \{\s*return useAuth\(\)\.account\?\.forMe === true;/);
});

ok("the gate: every branch-only surface asks useForMeAccess, and the else side is the one main had", () => {
  const src = (rel) => stripComments(read(rel)).replace(/\r\n/g, "\n");
  const web = src("../src/components/DiscoverBrowser.tsx");
  const phoneScreen = src("../src/components/mobile/PhoneDiscoverScreen.tsx");
  const phoneResults = src("../src/components/mobile/PhoneDiscoverResults.tsx");
  const rail = src("../src/components/DiscoverFilters.tsx");
  const nearby = src("../src/lib/nearby.ts");

  // The pill, the rail's pill and the For me section exist only with access.
  assert.match(web, /\{access && <ForMePill on=\{forMeOn\} onToggle=\{toggleForMe\} \/>\}/, "web: the pill");
  assert.match(web, /forMe=\{access \? forMeOn : undefined\}\s*onForMe=\{access \? toggleForMe : undefined\}/, "web: the rail's pill");
  assert.match(rail, /\{onForMe && \(/, "the rail draws the pill only when handed one");
  assert.match(phoneScreen, /forMe=\{access \? \{ on: forMeOn, href: forMeHref \} : undefined\}/, "phone: the pill and its link");
  // Typing a search drops the mode only where the mode exists.
  assert.match(web, /navigate\(access && next\.q \? withoutForMe\(search\) : search, null\)/);
  // A card's distance is the old seeded label for everyone else, the live one for the list.
  assert.match(web, /distance=\{access \? distanceLabel\(restaurant, nearby\.coords\) : undefined\}/);
  assert.match(src("../src/components/RestaurantCard.tsx"), /\{distance !== null && \(\s*<span[^>]*>\s*\{distance \?\? restaurant\.distance\}\s*<\/span>\s*\)\}/);
  // Main's "ask for a position when a filter is on" effect still runs for them, and only them.
  for (const [name, code] of [["web", web], ["phone", phoneResults]]) {
    assert.match(code, /if \(!access && active > 0 && !nearby\.coords && nearby\.state === "idle"\) requestLocation\(\);/, `${name}: main's location prompt`);
  }
  assert.match(phoneResults, /\{access && \(/, "phone: the Show distance button");
  // The taste strips: the See-all link, the distance and the For me wording.
  for (const rel of ["../src/components/TasteSection.tsx", "../src/components/mobile/PhoneTasteSection.tsx"]) {
    const code = src(rel);
    assert.match(code, /useForMeAccess\(\)/, `${rel} asks`);
    if (rel.includes("mobile")) {
      assert.match(code, /distance=\{access \? distanceLabel\(p\.restaurant, coords\) : null\}/, "phone: no distance on a card for everyone else");
      assert.match(code, /\{access \? \(\s*<PickButtons/, "phone: the compact buttons are the For me accounts'");
    } else {
      assert.match(code, /\{access \? \(\s*<Link\s+href=\{`\/\?\$\{FOR_ME_PARAM\}=1`\}/, "web: See all is a link only for the For me accounts");
      assert.match(code, /\{all \? "Show fewer" : "See all"\}/, "and the old toggle is what everyone else has");
      assert.match(code, /access \? \(\s*<TastePickCard/, "web: the For me card (distance, reason) is theirs alone");
    }
  }
  // The position hook: a saved address and the Permissions answer behave as on main for everyone else.
  assert.match(nearby, /if \(access && getSavedLocationSnapshot\(\)\) return;/);
  assert.match(nearby, /if \(access\) setPermission\(answer\);\s*if \(answer === "granted"\) request\(\);/);
  // Nothing outside the lists names the gate's ids: it lives in one file.
  const gateFile = read("../src/lib/forMeGate.ts");
  for (const id of FOR_ME_USER_IDS) {
    for (const rel of ["../src/lib/account.ts", "../src/lib/auth.tsx", "../src/app/api/restaurants/discover/route.ts", "../src/components/DiscoverBrowser.tsx"]) {
      assert.ok(!read(rel).includes(id), `${rel} does not repeat the id`);
    }
    assert.ok(gateFile.includes(id));
  }
});

await okAsync("the client turns the URL into a POST body, not a GET", async () => {
  let filterQueryOf;
  let wantsPositionOf;
  try {
    ({ filterQueryOf, wantsPositionOf } = await import("../src/lib/useDiscoverQuery.ts"));
  } catch {
    filterQueryOf = null;
  }
  if (!filterQueryOf) return; // a "use client" module that will not load here; the source checks above cover it
  // A bare landing never asks for a position, whatever a link brought along; a
  // filter or the For me mode does.
  for (const bare of ["", "utm_source=ig", "fbclid=abc&gclid=x", "shown=48&nav=x&cols=2", "in=dish", "cuisine=", "q=%20"]) {
    assert.equal(wantsPositionOf(bare, true), false, `"${bare}" is a bare landing`);
  }
  for (const asks of ["foryou=1", "foryou=1&utm_source=ig", "cuisine=Thai", "utm_source=ig&cuisine=Thai&shown=48"]) {
    assert.equal(wantsPositionOf(asks, true), true, `"${asks}" asks for a position`);
  }
  const a = filterQueryOf("foryou=1&cuisine=Thai&shown=48&nav=x&cols=2", true);
  assert.deepEqual(a, { search: "cuisine=Thai", shown: 48, forMe: true });
  assert.ok(!a.search.includes("foryou"));
  const b = filterQueryOf("cuisine=Thai", true);
  assert.equal(b.forMe, false);
  assert.equal(filterQueryOf("foryou=0", true).forMe, false, "only foryou=1 asks for it");
  assert.equal(filterQueryOf("foryou=1&q=ramen", true).search, "q=ramen");

  // Everyone else: `foryou` is an unknown key like any other, left in `search`
  // for the cached GET to ignore, and it never turns the mode on or asks for a
  // position. `shown`, `nav` and `cols` are split off exactly as before.
  const o = filterQueryOf("foryou=1&cuisine=Thai&shown=48&nav=x&cols=2", false);
  assert.deepEqual(o, { search: "foryou=1&cuisine=Thai", shown: 48, forMe: false });
  assert.deepEqual(filterQueryOf("foryou=1", false), { search: "foryou=1", shown: 24, forMe: false });
  assert.equal(wantsPositionOf("foryou=1", false), false, "a pasted foryou=1 asks for nothing");
  assert.equal(wantsPositionOf("foryou=1&utm_source=ig", false), false);
  assert.equal(wantsPositionOf("", false), false);
});

ok("hasFilterParams counts only real filters, not whatever a link brought along", () => {
  // Tracking and unknown keys, empty or blank values, and a scope with no term.
  for (const search of [
    "",
    "utm_source=ig&fbclid=abc",
    "gclid=abc123",
    "ref=newsletter",
    "in=dish",
    "cuisine=",
    "neighborhood=%20",
    "q=%20",
    "dish=",
    "nearby=0",
    "price=free",
    "aspect=nothing",
    "quick=bogus",
    "quick=",
  ]) {
    assert.equal(hasFilterParams(search), false, `"${search}" has no filter`);
  }
  // Each real key, alone and under a tracking param.
  for (const search of [
    "cuisine=Thai",
    "neighborhood=North+Park",
    "nearby=1",
    "price=%24%24",
    "aspect=Service",
    "quick=open-now",
    "quick=bogus,top-rated",
    "q=ramen",
    "dish=ramen",
    "utm_source=ig&cuisine=Thai",
    "fbclid=abc&q=ramen&in=dish",
  ]) {
    assert.equal(hasFilterParams(search), true, `"${search}" has a filter`);
  }

  // The button and the hook agree on the rule: it waits for the Permissions
  // answer, stands down while a filter or For me is about to ask, and a saved
  // address never offers.
  const button = stripComments(read("../src/components/ShowDistanceButton.tsx"));
  assert.match(button, /!nearby\.offerable/, "no offer until no silent fix is coming");
  assert.match(button, /wantsPositionOf\(useQueryString\(\), access\)/, "the offer stands down under a filter or For me");
  assert.match(button, /if \(!access \|\| nearby\.coords \|\| !nearby\.offerable\) return null;/, "and it is not offered at all outside the list");
  assert.match(button, /asking && nearby\.state === "idle"/);
  const nearbySrc = stripComments(read("../src/lib/nearby.ts"));
  assert.match(nearbySrc, /offerable: false,\s*saved: \{ label: saved\.label \}/, "a saved address never offers");
  assert.match(nearbySrc, /offerable: permission === "prompt"/, "offered only once the permission is known to prompt");
  assert.match(nearbySrc, /useState<"unknown" \| "granted" \| "prompt" \| "denied">\(\s*"unknown"/, "unknown until the browser answers");
  const hook = stripComments(read("../src/lib/useDiscoverQuery.ts"));
  assert.match(hook, /const wantsPosition = access && \(forMe \|\| hasFilterParams\(search\)\)/);
  assert.ok(!/function narrows/.test(hook), "the loose any-key rule is gone");
});

/* ---------- the cuisine profile: what the viewer eats a lot of ---------- */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 12);
/** A posting signal: last posted `daysAgo` before NOW, on `days` distinct days. */
const sig = (restaurantId, daysAgo, days = 1) => ({ restaurantId, lastAt: NOW - daysAgo * DAY, days });
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
/** Every number a scan hands the ranking, for comparing two scans exactly. */
const numbers = (sc) => sc.scored.map((s) => [s.r.id, s.score, s.A, s.Ahist, s.Acuis, s.F, s.Q, s.N]);

// Mexican x3, a Thai and an Italian the viewer can have been to. The "cx" candidates
// have no menu rows, so what their Ahist gains from the cuisine is the cuisine's doing.
const cw = miniWorld([
  ["cm1", "Taco Uno", "Mexican", ["taco", "burrito", "salsa"]],
  ["cm2", "Taco Dos", "Mexican", ["taco", "quesadilla", "salsa"]],
  ["cm3", "Taco Tres", "Mexican", ["taco", "enchilada", "salsa"]],
  ["ct1", "Thai Uno", "Thai", ["pad thai", "curry", "satay"]],
  ["ci1", "Pasta Uno", "Italian", ["pasta", "pizza", "tiramisu"]],
  ["cxm", "Cantina Nueva", "Mexican", null],
  ["cxt", "Bangkok Nuevo", "Thai", null],
  ["cxi", "Trattoria Nuova", "Italian", null],
  ["cxg", "Zorba Nuevo", "Greek", null],
  ["cxn", "Nameless Nook", null, null],
  ["cxd", "Dishes Only", null, ["taco", "burrito", "salsa"]],
  ["cxb", "Bar With Tacos", "Greek", null, { ...MID, secondary: ["Mexican"] }],
  ["cym", "Taco Cuatro", "Mexican", ["taco", "burrito", "salsa"]],
]);
const cwRun = (label, o = {}) => {
  const out = run(label, { ...cw, now: NOW, ...o });
  checkAhist(label, out.input, out.sc);
  return out;
};
const cwScan = (o = {}) => scoreAll({ ...base, ...cw, now: NOW, ...o });

// Eight cuisines of one place each, so every share is an eighth and below full affinity.
const G_CUISINES = ["Mexican", "Thai", "Italian", "Greek", "Korean", "Indian", "French", "Vietnamese"];
const G_MENUS = [
  ["taco", "burrito", "salsa"],
  ["pad thai", "curry", "satay"],
  ["pasta", "pizza", "tiramisu"],
  ["gyro", "souvlaki", "baklava"],
  ["bibimbap", "kimchi", "bulgogi"],
  ["tikka", "naan", "samosa"],
  ["croissant", "baguette", "crepe"],
  ["pho", "banh mi", "spring roll"],
];
const gw = miniWorld([
  ...G_CUISINES.map((c, i) => [`g${i}`, `${c} Seed`, c, G_MENUS[i]]),
  ["gx", "Mexican Candidate", "Mexican", null],
  ["gt", "Thai Candidate", "Thai", null],
  ["gi", "Italian Candidate", "Italian", null],
  ["gy", "Bar With Tacos", "Bar", null, { ...MID, secondary: ["Mexican"] }],
  ["gz", "Bar Without", "Bar", null],
]);
const gSeeds = G_CUISINES.map((_, i) => `g${i}`);
const gScan = (o = {}) => scoreAll({ ...base, ...gw, now: NOW, postedIds: gSeeds, ...o });

ok("cuisine profile: the constants", () => {
  assert.deepEqual(
    { ...FORME_CUISINE },
    {
      halfLifeDays: 120,
      recencyFloor: 0.4,
      repeatStep: 0.5,
      repeatCap: 2,
      fullShare: 0.25,
      cuisineInAhist: 0.3,
      minSeeds: 3,
      topCount: 3,
      topMinShare: 0.1,
      reasonShare: 0.2,
      reasonPlaces: 3,
    },
  );
});

ok("cuisine profile: a place weighs recency x repeat, and a missing date weighs one", () => {
  const hl = FORME_CUISINE.halfLifeDays;
  assert.equal(placeWeight(undefined, NOW), 1, "a been with no post");
  assert.equal(placeWeight(sig("x", 0, 1), NOW), 1, "posted today, once");
  assert.ok(near(placeWeight(sig("x", hl, 1), NOW), 0.5), "one half-life ago is half");
  assert.ok(near(placeWeight(sig("x", hl / 2, 1), NOW), Math.SQRT1_2), "half a half-life");
  assert.equal(placeWeight(sig("x", 2 * hl, 1), NOW), FORME_CUISINE.recencyFloor, "two half-lives is under the floor, so the floor");
  assert.equal(placeWeight(sig("x", 3650, 1), NOW), FORME_CUISINE.recencyFloor, "a decade is the floor too");
  assert.ok(near(placeWeight(sig("x", 0, 2), NOW), 1.5), "a second day adds half");
  assert.equal(placeWeight(sig("x", 0, 3), NOW), 2, "a third day reaches the cap");
  assert.equal(placeWeight(sig("x", 0, 9), NOW), 2, "and the cap holds");
  assert.ok(near(placeWeight(sig("x", hl, 3), NOW), 1), "the two multiply");
  assert.ok(near(placeWeight(sig("x", 2 * hl, 3), NOW), 0.8), "a floored recency times a capped repeat");
  // Older never weighs more, and more days never weigh less.
  for (let d = 1; d <= 4; d++) {
    let last = Infinity;
    for (const ago of [0, 10, 60, 120, 240, 600, 3000]) {
      const w = placeWeight(sig("x", ago, d), NOW);
      assert.ok(w <= last + 1e-12, "older never weighs more");
      last = w;
    }
  }
  for (const ago of [0, 90, 400]) {
    let last = 0;
    for (let d = 1; d <= 5; d++) {
      const w = placeWeight(sig("x", ago, d), NOW);
      assert.ok(w >= last - 1e-12, "more days never weigh less");
      last = w;
    }
  }
  // Rubbish in is a plain weight out: finite and inside [floor, cap], never NaN.
  const junk = [NaN, Infinity, -Infinity, 1e18, -1e18, 0, -3, undefined, null];
  for (const lastAt of junk) {
    for (const days of junk) {
      const w = placeWeight({ restaurantId: "x", lastAt, days }, NOW);
      assert.ok(isNum(w) && w >= FORME_CUISINE.recencyFloor && w <= FORME_CUISINE.repeatCap, `weight ${w} for ${lastAt}/${days}`);
    }
  }
  for (const now of [NaN, Infinity, undefined]) assert.equal(placeWeight(sig("x", 500, 1), now), 1, "no clock, no decay");
  assert.equal(placeWeight({ restaurantId: "x", lastAt: NaN, days: 1 }, NOW), 1);
  assert.equal(placeWeight({ restaurantId: "x", lastAt: NOW + 5 * DAY, days: 1 }, NOW), 1, "a post from the future is today");
});

ok("cuisine profile: a hand-worked profile, shares that sum to one, and Acuis", () => {
  // cm1 today once (1), cm2 a half-life ago on 2 days (0.5 x 1.5), ct1 today on 3 days (2), cm3 been (1).
  const { sc, res } = cwRun("hand-worked", {
    postedIds: ["cm1", "cm2", "ct1"],
    prefs: prefs({ been: ["cm3"] }),
    postedSignals: [sig("cm1", 0, 1), sig("cm2", FORME_CUISINE.halfLifeDays, 2), sig("ct1", 0, 3)],
  });
  assert.equal(sc.seeds.length, 4);
  const mex = 1 + 0.75 + 1;
  const thai = 2;
  assert.ok(near(sc.cuisineShare.get("Mexican"), mex / (mex + thai)));
  assert.ok(near(sc.cuisineShare.get("Thai"), thai / (mex + thai)));
  assert.equal(sc.cuisineShare.size, 2);
  assert.ok(near([...sc.cuisineShare.values()].reduce((a, b) => a + b, 0), 1), "shares sum to one");
  assert.deepEqual(
    sc.topCuisines.map((c) => [c.cuisine, c.places]),
    [
      ["Mexican", 3],
      ["Thai", 1],
    ],
  );
  assert.ok(near(sc.topCuisines[0].share, mex / (mex + thai)));
  assert.deepEqual(res.topCuisines, sc.topCuisines, "rankTaste hands the same list on");
  // Over a quarter of the history is full affinity; a cuisine never eaten is none; no cuisine is null.
  assert.equal(scoredId(sc, "cxm").Acuis, 1);
  assert.equal(scoredId(sc, "cxt").Acuis, 1);
  assert.equal(scoredId(sc, "cxi").Acuis, 0);
  assert.equal(scoredId(sc, "cxg").Acuis, 0);
  assert.equal(scoredId(sc, "cxn").Acuis, null);
  assert.ok(scoredId(sc, "cxi").Ahist < scoredId(sc, "cxm").Ahist, "the cuisine lifts a place the viewer eats");
});

ok("cuisine profile: graded affinity, and a secondary cuisine counts at its weight", () => {
  const sc = gScan();
  assert.equal(sc.seeds.length, 8);
  for (const c of G_CUISINES) assert.ok(near(sc.cuisineShare.get(c), 1 / 8), `${c} is an eighth`);
  assert.ok(near(scoredId(sc, "gx").Acuis, 0.5), "an eighth is half of full");
  assert.ok(near(scoredId(sc, "gy").Acuis, 0.2), "a bar that also files under Mexican: 0.4 of that half");
  assert.equal(scoredId(sc, "gz").Acuis, 0);
  checkAhist("graded", { ...base, ...gw, now: NOW, postedIds: gSeeds }, sc);
  assert.deepEqual(
    sc.topCuisines.map((c) => c.cuisine),
    ["French", "Greek", "Indian"],
    "ties settle on the name",
  );
  assert.ok(sc.topCuisines.every((c) => near(c.share, 1 / 8)));
});

ok("cuisine profile: under three seeds it does nothing, at three it starts", () => {
  const plain = cwScan({ postedIds: ["cm1", "ct1"] });
  assert.equal(plain.seeds.length, 2);
  assert.equal(plain.cuisineShare.size, 0);
  assert.deepEqual(plain.topCuisines, []);
  for (const s of plain.scored) assert.equal(s.Acuis, null, `${s.r.name} has an Acuis under two seeds`);
  // Signals change nothing there, whatever they say.
  const withSignals = cwScan({ postedIds: ["cm1", "ct1"], postedSignals: [sig("cm1", 0, 9), sig("ct1", 900, 1)] });
  assert.deepEqual(numbers(withSignals), numbers(plain));
  cwRun("two seeds", { postedIds: ["cm1", "ct1"] });
  cwRun("no seeds");
  const none = cwScan();
  assert.equal(none.cuisineShare.size, 0);
  const three = cwScan({ postedIds: ["cm1", "ct1", "ci1"] });
  assert.equal(three.seeds.length, 3);
  assert.equal(three.cuisineShare.size, 3, "three seeds is enough");
  assert.equal(scoredId(three, "cxm").Acuis, 1);
  cwRun("three seeds", { postedIds: ["cm1", "ct1", "ci1"] });
});

ok("cuisine profile: missing or bad data is exactly neutral", () => {
  const seeds = { postedIds: ["cm1", "cm2", "ct1"], prefs: prefs({ been: ["cm3"] }) };
  const none = cwScan(seeds);
  const empty = cwScan({ ...seeds, postedSignals: [] });
  const stranger = cwScan({ ...seeds, postedSignals: [sig("cxm", 0, 9), sig("nobody", 3, 3)] });
  const junk = cwScan({
    ...seeds,
    postedSignals: [
      { restaurantId: "cm1", lastAt: NaN, days: NaN },
      { restaurantId: "cm2", lastAt: Infinity, days: -4 },
      { restaurantId: "ct1", lastAt: undefined, days: null },
    ],
  });
  assert.deepEqual(numbers(empty), numbers(none), "an empty list is no list");
  assert.deepEqual(numbers(stranger), numbers(none), "signals for places not visited are not read");
  assert.deepEqual(numbers(junk), numbers(none), "a signal with nothing usable is a plain been");
  assert.ok(near(none.cuisineShare.get("Mexican"), 3 / 4), "with no dates every place weighs one");
  for (const sc of [none, empty, stranger, junk]) {
    for (const s of sc.scored) {
      for (const v of [s.score, s.A, s.Ahist, s.F, s.Q, s.N, s.tail]) assert.ok(isNum(v), `${s.r.name}: a number is not finite`);
      assert.ok(s.Acuis == null || (isNum(s.Acuis) && s.Acuis >= 0 && s.Acuis <= 1));
      assert.ok(s.Ahist >= 0 && s.Ahist <= 1 && s.A >= 0 && s.A <= 1);
    }
  }
  // A place with no cuisine has nothing to compare: Ahist is its menu's alone, untouched by the blend.
  const { sc } = cwRun("no cuisine on the candidate", seeds);
  assert.equal(scoredId(sc, "cxn").Acuis, null);
  assert.equal(scoredId(sc, "cxd").Acuis, null);
  assert.ok(scoredId(sc, "cxd").Ahist > 0, "its menu still counts");
  assert.equal(scoredOf(scan({ postedIds: [ramen[0].id, thai[0].id, italian[0].id] }), noCuisine).Acuis, null);

  // History with no cuisine in it at all: no profile, no top cuisines, nothing moves.
  const blank = miniWorld([
    ["n1", "Nowhere One", null, ["taco", "burrito", "salsa"]],
    ["n2", "Nowhere Two", null, ["pasta", "pizza", "tiramisu"]],
    ["n3", "Nowhere Three", null, ["pho", "banh mi", "spring roll"]],
    ["n4", "Candidate Taco", "Mexican", null],
    ["n5", "Candidate Pasta", "Italian", ["pasta", "pizza", "bread"]],
  ]);
  const blankInput = { ...base, ...blank, now: NOW, postedIds: ["n1", "n2", "n3"] };
  const b = scoreAll(blankInput);
  assert.equal(b.seeds.length, 3);
  assert.equal(b.cuisineShare.size, 0);
  assert.deepEqual(b.topCuisines, []);
  for (const s of b.scored) assert.equal(s.Acuis, null);
  checkAhist("blank", blankInput, b);

  // No candidates at all is not an error.
  const nothing = rankTaste({ ...base, ...cw, restaurants: [], now: NOW, ...seeds });
  assert.deepEqual(nothing.order, []);
});

ok("cuisine profile: recency and repeat move the shares, and the score with them", () => {
  const fresh = gScan({ postedSignals: gSeeds.map((id) => sig(id, 0)) });
  for (const c of G_CUISINES) assert.ok(near(fresh.cuisineShare.get(c), 1 / 8));
  // The Thai place was last posted nearly three years ago: it still counts, at the floor.
  const stale = gScan({ postedSignals: gSeeds.map((id) => sig(id, id === "g1" ? 1000 : 0)) });
  assert.ok(near(stale.cuisineShare.get("Thai"), 0.4 / 7.4));
  assert.ok(near(stale.cuisineShare.get("Mexican"), 1 / 7.4));
  const ancient = gScan({ postedSignals: gSeeds.map((id) => sig(id, id === "g1" ? 4000 : 0)) });
  assert.equal(ancient.cuisineShare.get("Thai"), stale.cuisineShare.get("Thai"), "the floor is the floor");
  // Three days at the Italian place doubles it.
  const loyal = gScan({ postedSignals: gSeeds.map((id) => sig(id, 0, id === "g2" ? 3 : 1)) });
  assert.ok(near(loyal.cuisineShare.get("Italian"), 2 / 9));
  assert.ok(near(loyal.cuisineShare.get("Mexican"), 1 / 9));
  // A place with no post weighs one, more than the same place posted long ago; one both marked been
  // and posted takes the post's weight, once.
  const beenOnly = gScan({
    postedIds: gSeeds.filter((id) => id !== "g0"),
    prefs: prefs({ been: ["g0"] }),
    postedSignals: gSeeds.map((id) => sig(id, 0)),
  });
  assert.ok(near(beenOnly.cuisineShare.get("Mexican"), 1 / 8));
  const both = gScan({ prefs: prefs({ been: ["g0"] }), postedSignals: gSeeds.map((id) => sig(id, id === "g0" ? 1000 : 0)) });
  assert.ok(near(both.cuisineShare.get("Mexican"), 0.4 / 7.4), "the post's weight, not a been's one");

  // The menu part of a candidate's Ahist is the same for all of these viewers (same seeds), so it
  // moves by exactly the cuisine's part of the change; its score follows the direction.
  const k = FORME_CUISINE.cuisineInAhist;
  for (const [id, a, b] of [
    ["gx", fresh, loyal],
    ["gt", fresh, stale],
    ["gi", fresh, loyal],
    ["gi", fresh, stale],
  ]) {
    const x = scoredId(a, id);
    const y = scoredId(b, id);
    assert.ok(near(y.Ahist - x.Ahist, k * (y.Acuis - x.Acuis)), `${id}: Ahist moves by the cuisine's part only`);
    assert.equal(Math.sign(y.score - x.score), Math.sign(y.Acuis - x.Acuis), `${id}: the score follows the affinity`);
  }
  assert.ok(scoredId(loyal, "gi").Acuis > scoredId(fresh, "gi").Acuis, "more Italian eaten, more affinity for an Italian place");
  assert.ok(scoredId(loyal, "gx").Acuis < scoredId(fresh, "gx").Acuis, "and less for a Mexican one");
  assert.ok(scoredId(stale, "gt").Acuis < scoredId(fresh, "gt").Acuis, "a stale Thai visit counts for less");
  assert.ok(scoredId(loyal, "gi").score > scoredId(fresh, "gi").score);
});

ok("cuisine profile: the order of the input does not move it", () => {
  const visits = ["cm1", "cm2", "cm3", "ct1", "ci1"];
  const signals = [sig("cm1", 12, 2), sig("cm2", 130, 1), sig("ct1", 400, 4), sig("ci1", 0, 1)];
  const a = cwScan({ postedIds: visits.slice(0, 3), prefs: prefs({ been: visits.slice(3) }), postedSignals: signals });
  for (let seed = 1; seed <= 5; seed++) {
    const rnd = prng(seed);
    const all = shuffled(visits, rnd);
    const cut = 1 + Math.floor(rnd() * 3);
    const b = cwScan({ postedIds: all.slice(0, cut), prefs: prefs({ been: all.slice(cut) }), postedSignals: shuffled(signals, rnd) });
    assert.deepEqual([...b.cuisineShare].sort(), [...a.cuisineShare].sort(), "the profile, to the last bit");
    assert.deepEqual(b.topCuisines, a.topCuisines);
  }
});

ok("cuisine profile: the top cuisines, at most three and each at a tenth or more", () => {
  const counted = (counts) => {
    const specs = [];
    for (const [c, k] of Object.entries(counts)) {
      for (let i = 0; i < k; i++) specs.push([`${c}${i}`, `${c} Place ${i}`, c, ["taco", "burrito", "salsa"]]);
    }
    const world = miniWorld(specs);
    return scoreAll({ ...base, ...world, now: NOW, postedIds: world.restaurants.map((r) => r.id) });
  };
  const names = (sc) => sc.topCuisines.map((c) => c.cuisine);
  const four = counted({ Alpha: 4, Bravo: 3, Charlie: 2, Delta: 1 });
  assert.deepEqual(names(four), ["Alpha", "Bravo", "Charlie"], "three at most; Delta is a tenth but fourth");
  assert.deepEqual(
    four.topCuisines.map((c) => c.places),
    [4, 3, 2],
  );
  assert.ok(four.topCuisines.every((c, i, all) => i === 0 || c.share <= all[i - 1].share));
  const tied = counted({ Alpha: 5, Bravo: 2, Echo: 1, Charlie: 1, Delta: 1 });
  assert.deepEqual(names(tied), ["Alpha", "Bravo", "Charlie"], "a tie settles on the name; a tenth exactly counts");
  const one = counted({ Alpha: 5 });
  assert.deepEqual(one.topCuisines, [{ cuisine: "Alpha", share: 1, places: 5 }]);
  const spread = counted(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`C${String(i).padStart(2, "0")}`, 1])));
  assert.deepEqual(spread.topCuisines, [], "twelve cuisines of a twelfth each: nothing is a tenth");
  assert.deepEqual(names(counted({ Alpha: 8, Bravo: 1, Charlie: 1 })), ["Alpha", "Bravo", "Charlie"]);
  assert.deepEqual(names(counted({ Alpha: 10, Bravo: 1, Charlie: 1 })), ["Alpha"], "a twelfth is under a tenth");
});

ok("cuisine profile: the whole history counts, not just the thirty seeds", () => {
  const over = fillers.map((r) => r.id);
  assert.ok(over.length > WEIGHTS.maxSeeds);
  const { sc } = run("over the cap", {
    prefs: prefs({ been: over.slice(0, 20) }),
    postedIds: [...over.slice(20), thai[0].id],
    now: NOW,
  });
  assert.equal(sc.seeds.length, WEIGHTS.maxSeeds);
  assert.ok(near(sc.cuisineShare.get("American"), over.length / (over.length + 1)), "all of the American places, not thirty");
  assert.ok(near(sc.cuisineShare.get("Thai"), 1 / (over.length + 1)));
});

ok("cuisine profile: the reason says it only when nothing stronger can", () => {
  const seeds = { postedIds: ["cm1", "cm2", "cm3", "ct1"] };
  const { res, sc } = cwRun("eat a lot", seeds);
  // Mexican is 3 of 4 places. Nothing shared with a seed to name, so the cuisine speaks.
  assert.deepEqual(res.reasonOf("cxm"), { kind: "cuisine", text: "You eat a lot of Mexican" });
  assert.ok(matchesOf(res).includes("cxm"));
  // Thai is a quarter of the history but one place: not enough to say "a lot".
  assert.ok(!res.reasonOf("cxt").text.startsWith("You eat"), res.reasonOf("cxt").text);
  assert.equal(scoredId(sc, "cxt").Acuis, 1);
  // A real shared dish with a seed names that seed; the cuisine does not push it out.
  assert.equal(res.reasonOf("cym").kind, "like");
  assert.match(res.reasonOf("cym").text, /^Because you went to /);
  // A place whose main cuisine is something else is not claimed for Mexican, whatever its secondary.
  assert.ok(matchesOf(res).includes("cxb"), "a bar that also files under Mexican still earns its place");
  assert.ok(!res.reasonOf("cxb").text.startsWith("You eat"), res.reasonOf("cxb").text);
  // A pick and a friend come first.
  const picked = cwRun("pick first", { ...seeds, prefs: prefs({ loves: ["Mexican"] }) });
  assert.deepEqual(picked.res.reasonOf("cxm"), { kind: "pick", text: "You picked Mexican" });
  const withFriend = cwRun("friend first", { ...seeds, friendVisits: [friend({ id: "cxm" }, "f1", "Maya")] });
  assert.equal(withFriend.res.reasonOf("cxm").kind, "friends");
  // The tail never claims it: every tail card reads as rated (checkRank holds that too).
  for (const id of res.order.slice(res.matched)) assert.equal(res.reasonOf(id).kind, "rated");

  // The share has to be a fifth of the history: three Mexican places among twenty are not.
  const crowd = Array.from({ length: 17 }, (_, i) => [`x${i}`, `Crowd ${i}`, `Cuisine${i}`, ["taco", "burrito", "salsa"]]);
  const wide = miniWorld([
    ["cm1", "Taco Uno", "Mexican", ["taco", "burrito", "salsa"]],
    ["cm2", "Taco Dos", "Mexican", ["taco", "quesadilla", "salsa"]],
    ["cm3", "Taco Tres", "Mexican", ["taco", "enchilada", "salsa"]],
    ...crowd,
    ["cxm", "Cantina Nueva", "Mexican", null],
  ]);
  const diluted = run("diluted", { ...wide, now: NOW, postedIds: wide.restaurants.filter((r) => r.id !== "cxm").map((r) => r.id) });
  assert.ok(near(diluted.sc.cuisineShare.get("Mexican"), 3 / 20));
  assert.ok(!diluted.res.reasonOf("cxm").text.startsWith("You eat"), diluted.res.reasonOf("cxm").text);
  assert.ok(near(scoredId(diluted.sc, "cxm").Acuis, 0.6));

  // Two places visited on many days are a big share of two places: still not "a lot".
  const few = cwRun("two places", {
    postedIds: ["cm1", "cm2", "ct1", "ci1"],
    postedSignals: [sig("cm1", 0, 3), sig("cm2", 0, 3), sig("ct1", 0, 1), sig("ci1", 0, 1)],
  });
  assert.ok(few.sc.cuisineShare.get("Mexican") >= FORME_CUISINE.reasonShare);
  assert.ok(!few.res.reasonOf("cxm").text.startsWith("You eat"), few.res.reasonOf("cxm").text);

  // A long label is clipped like every other reason.
  const longs = miniWorld([
    ["l1", "Wok Wagon", LONG_CUISINE, ["taco", "burrito", "salsa"]],
    ["l2", "Noodle Nomad", LONG_CUISINE, ["pasta", "pizza", "tiramisu"]],
    ["l3", "Street Orchid", LONG_CUISINE, ["pho", "banh mi", "spring roll"]],
    ["l4", "Fourth Wok", LONG_CUISINE, null],
  ]);
  const long = run("long label", { ...longs, now: NOW, postedIds: ["l1", "l2", "l3"] });
  const text = long.res.reasonOf("l4").text;
  assert.ok(text.startsWith("You eat a lot of Contemporary") && text.endsWith("…"), text);
  assert.ok(text.length <= WEIGHTS.reasonMaxChars);
});

ok("cuisine profile: Your taste never sees it", () => {
  const input = { ...base, postedIds: [ramen[0].id, thai[0].id, italian[0].id, burgers[0].id], now: NOW };
  const signals = [sig(ramen[0].id, 0, 5), sig(thai[0].id, 900, 1)];
  const without = scoreAll({ ...input, traits: undefined });
  const withSignals = scoreAll({ ...input, traits: undefined, postedSignals: signals });
  assert.equal(without.mode, "cuisine");
  assert.deepEqual(numbers(withSignals), numbers(without));
  for (const sc of [without, withSignals]) {
    assert.equal(sc.cuisineShare.size, 0);
    assert.deepEqual(sc.topCuisines, []);
    for (const s of sc.scored) assert.equal(s.Acuis, null);
  }
  const takes = (extra) =>
    scoreTaste({ restaurants: corpus, plates: {}, prefs: EMPTY_PREFS, postedIds: input.postedIds, friendVisits: [], ...extra });
  assert.deepEqual(takes({ postedSignals: signals, now: NOW }), takes({}));
  const src = stripComments(read("../src/lib/taste.ts"));
  const start = src.indexOf("export function scoreTaste");
  const yourTaste = src.slice(start, src.indexOf("\nexport ", start + 1));
  assert.ok(start > 0 && !/postedSignals|cuisineShare|FORME_CUISINE|Acuis/.test(yourTaste), "scoreTaste does not reach the profile");
});

ok("cuisine profile: the posting dates are read only for For me, and only to read", () => {
  assert.match(postFn, /resolveTasteContext\(\{[^}]*postedSignals:\s*true/);
  assert.match(postFn, /postedSignals:\s*ctx\.postedSignals/);
  assert.ok(!getFn.includes("postedSignals"), "the public GET never asks for the viewer's dates");
  const taste = stripComments(read("../src/app/api/account/taste/route.ts"));
  assert.ok(!taste.includes("postedSignals"), "Your taste's route does not ask either");
  const ctxSrc = stripComments(read("../src/lib/tasteContext.ts"));
  assert.match(ctxSrc, /opts\.postedSignals === true \? postedSignalsBy\(user\.id\)/);
  const dbSrc = stripComments(read("../src/lib/db.ts")).replace(/\r\n/g, "\n");
  const from = dbSrc.indexOf("export async function postedSignalsBy");
  const fn = dbSrc.slice(from, dbSrc.indexOf("\nexport ", from + 1));
  assert.match(fn, /SELECT restaurant_id,/);
  assert.match(fn, /WHERE user_id = \$\{userId\} AND restaurant_id IS NOT NULL/);
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(fn), "it only reads");
  // The existing reader is main's, query for query: Your taste and account
  // deletion call it and never look at the order. The recency order For me
  // needs is a second function that only the For me context asks for.
  const old = dbSrc.indexOf("export async function restaurantIdsPostedBy(");
  const same = dbSrc.slice(old, dbSrc.indexOf("\nexport ", old + 1));
  assert.match(same, /SELECT DISTINCT restaurant_id FROM posts\s+WHERE user_id = \$\{userId\} AND restaurant_id IS NOT NULL\s+`/);
  assert.ok(!/ORDER BY|GROUP BY/.test(same), "the original reader keeps its query");
  const recentAt = dbSrc.indexOf("export async function restaurantIdsPostedByRecent");
  const recent = dbSrc.slice(recentAt, dbSrc.indexOf("\nexport ", recentAt + 1));
  assert.match(recent, /SELECT restaurant_id FROM posts\s+WHERE user_id = \$\{userId\} AND restaurant_id IS NOT NULL\s+GROUP BY restaurant_id\s+ORDER BY max\(created_at\) DESC, restaurant_id/);
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(recent), "it only reads");
  assert.match(ctxSrc, /opts\.recentFirst === true\s*\?\s*restaurantIdsPostedByRecent\(user\.id\)\s*:\s*restaurantIdsPostedBy\(user\.id\)/, "only the For me context asks for the recency order");
});

/* ---------- the budget term: B, the fit, the points, the wording ---------- */

// Calvin's ten priced posts (2026-11), the case the term was designed against.
const CALVIN_PLATES = [5, 7, 9.99, 11.99, 13.95, 13.99, 14, 19.25, 38, 41];
const DASH = "–";

/** The spec written out a second time, with its numbers literal, so budgetOf is not checked against itself. */
const refQuantile = (xs, p) => {
  const s = xs.slice().sort((a, b) => a - b);
  const at = p * (s.length - 1);
  const i = Math.floor(at);
  return s[i] + (at - i) * (s[Math.min(i + 1, s.length - 1)] - s[i]);
};
function refBudget(plates, places) {
  const kept = plates.filter((v) => Number.isFinite(v) && v >= 3);
  const m0 = kept.length ? refQuantile(kept, 0.5) : 0;
  const rest = kept.filter((v) => v <= 2.5 * m0);
  const known = places.filter((v) => Number.isFinite(v) && v > 0);
  const fromPlates =
    rest.length >= 3
      ? { median: refQuantile(rest, 0.5), lo: refQuantile(rest, 0.25), hi: refQuantile(rest, 0.75), conf: Math.min(1, rest.length / 6) }
      : null;
  const fromPlaces =
    known.length >= 3
      ? { median: refQuantile(known, 0.5), lo: refQuantile(known, 0.25), hi: refQuantile(known, 0.75), conf: Math.min(0.5, known.length / 6) }
      : null;
  if (fromPlates && fromPlaces) {
    const mix = (a, b) => 0.6 * a + 0.4 * b;
    return {
      median: mix(fromPlates.median, fromPlaces.median),
      lo: mix(fromPlates.lo, fromPlaces.lo),
      hi: mix(fromPlates.hi, fromPlaces.hi),
      conf: Math.max(fromPlates.conf, fromPlaces.conf),
    };
  }
  return fromPlates ?? fromPlaces;
}
function refFit(price, b) {
  const x = Math.log(price / b.median);
  const up = Math.max(Math.log(1.3), 0.5 * Math.log(b.hi / b.lo));
  const down = Math.log(1.6);
  if (x > up) return Math.exp(-(((x - up) / 0.35) ** 2));
  if (x < -down) return Math.exp(-((-down - x) / 0.7));
  return 1;
}
const sameBudget = (a, b, label) => {
  if (b === null) return assert.equal(a, null, `${label}: no B`);
  assert.ok(a, `${label}: B expected`);
  for (const k of ["median", "lo", "hi", "conf"]) assert.ok(near(a[k], b[k], 1e-9), `${label}: ${k} ${a[k]} vs ${b[k]}`);
};

ok("budget: the constants are the spec's, and the weight is the sixth of a point", () => {
  assert.deepEqual(
    { ...FORME_BUDGET },
    {
      minPlate: 3,
      outlierRatio: 2.5,
      minPlates: 3,
      platesForFull: 6,
      minPlaces: 3,
      placeConfCap: 0.5,
      plateInB: 0.6,
      upperFloor: Math.log(1.3),
      lower: Math.log(1.6),
      upperWidth: 0.35,
      lowerWidth: 0.7,
      reasonFit: 0.9,
      reasonConf: 0.5,
    },
  );
  assert.equal(FORME_WEIGHTS.budget, 0.06);
  assert.equal(MIN_PRICED_ITEMS, 4, "a menu's median counts from four priced items");
  // The four old weights still make one; the budget term sits beside them.
  assert.ok(near(FORME_WEIGHTS.affinity + FORME_WEIGHTS.friends + FORME_WEIGHTS.quality + FORME_WEIGHTS.neighborhood, 1, 1e-12));
});

ok("budget: a plate's price is read the way the menu's are, and junk reads as none", () => {
  assert.equal(parsePrice("$13.99 - $29.99"), 13.99, "a range reads as its low end");
  assert.equal(parsePrice("$9.99"), 9.99);
  assert.equal(parsePrice("12"), 12);
  for (const none of ["", "free", "$0", "0.00", "n/a"]) assert.equal(parsePrice(none), null, `"${none}"`);
  assert.deepEqual(
    ["$5", "$7", "$9.99", "$11.99", "$13.95", "$13.99", "$14", "$19.25", "$38", "$41"].map(parsePrice),
    CALVIN_PLATES,
  );
});

ok("budget: Calvin's ten plates give B = $12.97, the two splurges dropped", () => {
  const b = budgetOf(CALVIN_PLATES, []);
  assert.ok(b, "B exists");
  // median of all ten is 13.97, so the cut is 34.925: $38 and $41 go, $19.25 stays; the 8 left are
  //   5, 7, 9.99, 11.99, 13.95, 13.99, 14, 19.25
  assert.ok(near(b.median, (11.99 + 13.95) / 2, 1e-9), `median ${b.median}`);
  assert.ok(near(b.lo, 7 + 0.75 * (9.99 - 7), 1e-9), `lo ${b.lo}`);
  assert.ok(near(b.hi, 13.99 + 0.25 * (14 - 13.99), 1e-9), `hi ${b.hi}`);
  assert.equal(b.conf, 1, "eight kept plates are full trust");
  // The same however they arrive.
  const rnd = prng(2026);
  for (let i = 0; i < 25; i++) sameBudget(budgetOf(shuffled(CALVIN_PLATES, rnd), []), b, `shuffle ${i}`);
  // And the line it would print.
  assert.deepEqual([Math.round(b.lo), Math.round(b.hi)], [9, 14]);
});

ok("budget: junk is dropped, a splurge is a splurge only past two and a half times the median", () => {
  const three = budgetOf([10, 11, 12], []);
  assert.ok(three && three.conf === 0.5);
  // Under $3 is a side or a typo; $3 itself is a plate.
  sameBudget(budgetOf([2.99, 1, 0.5, 10, 11, 12], []), three, "under $3");
  sameBudget(budgetOf([0, -5, 10, 11, 12], []), three, "zero and negative");
  sameBudget(budgetOf([NaN, Infinity, -Infinity, 10, 11, 12], []), three, "not numbers");
  assert.ok(near(budgetOf([3, 10, 11, 12], []).conf, 4 / 6), "$3 is kept");
  // Median of the plates that pass $3, times 2.5: the line itself is kept.
  assert.ok(near(budgetOf([10, 10, 10, 25], []).conf, 4 / 6), "exactly 2.5x the median stays");
  assert.ok(near(budgetOf([10, 10, 10, 25.01], []).conf, 3 / 6), "a hair over goes");
  sameBudget(budgetOf([10, 10, 10, 10, 100, 250], []), budgetOf([10, 10, 10, 10], []), "two splurges");
  // A lone plate, or two, are not a budget.
  for (const few of [[], [10], [10, 12], [2, 2, 2, 30]]) assert.equal(budgetOf(few, []), null, JSON.stringify(few));
  // The cut is made off the median of what passed $3, so a majority of big plates is the budget.
  const big = budgetOf([40, 45, 50, 55, 60], []);
  assert.ok(big && big.conf === 5 / 6 && near(big.median, 50));
});

ok("budget: trust grows with the plates, to one at six", () => {
  const run6 = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  assert.equal(budgetOf(run6.slice(0, 2), []), null);
  for (let k = 3; k <= 9; k++) assert.ok(near(budgetOf(run6.slice(0, k), []).conf, Math.min(1, k / 6)), `k=${k}`);
  assert.equal(budgetOf(run6, []).conf, 1);
});

ok("budget: without plates B is the median menu price of the places they have been, at half trust at most", () => {
  assert.equal(budgetOf([], []), null);
  assert.equal(budgetOf([], [10, 12]), null, "two places are not enough");
  const three = budgetOf([], [10, 12, 14]);
  assert.ok(three && near(three.median, 12) && three.conf === 0.5);
  assert.equal(budgetOf([], [10, 12, 14, 16, 18, 20, 22]).conf, 0.5, "capped at half");
  sameBudget(budgetOf([], [0, -3, NaN, 10, 12, 14]), three, "non-positive places do not count");
  // Too few plates fall back to the places rather than blending with nothing.
  sameBudget(budgetOf([10, 11], [10, 12, 14]), three, "two plates and three places");
});

ok("budget: with both, B is 0.6 of the plates and 0.4 of the places, and trust is the larger", () => {
  const b = budgetOf([10, 10, 10, 10], [20, 20, 20]);
  assert.ok(b && near(b.median, 14) && near(b.lo, 14) && near(b.hi, 14));
  assert.ok(near(b.conf, 4 / 6), "the plates' 4/6 beats the places' 1/2");
  assert.ok(near(budgetOf([10, 10, 10], [20, 20, 20, 20, 20, 20]).conf, 0.5));
  assert.equal(budgetOf([10, 10, 10, 10, 10, 10], [20, 20, 20]).conf, 1);
  const wide = budgetOf([8, 10, 12, 14], [20, 30, 40, 50]);
  assert.ok(wide.lo <= wide.median && wide.median <= wide.hi, "the blend keeps its order");
});

ok("budget: budgetOf matches the spec written out again, on 400 seeded price lists", () => {
  const rnd = prng(11);
  const price = () => {
    const roll = rnd();
    if (roll < 0.08) return 0.5 + rnd() * 2.4; // under $3
    if (roll < 0.1) return NaN;
    if (roll < 0.2) return 40 + rnd() * 200; // a splurge
    return Math.exp(1.8 + rnd() * 1.6);
  };
  let withB = 0;
  for (let i = 0; i < 400; i++) {
    const plates = Array.from({ length: Math.floor(rnd() * 14) }, price);
    const places = Array.from({ length: Math.floor(rnd() * 9) }, () => Math.exp(1.8 + rnd() * 1.6));
    const want = refBudget(plates, places);
    const got = budgetOf(plates, places);
    sameBudget(got, want, `list ${i}`);
    if (got) {
      withB++;
      assert.ok(got.median > 0 && got.lo > 0 && got.lo <= got.median && got.median <= got.hi && got.conf > 0 && got.conf <= 1, `list ${i}: sane`);
      for (let j = 0; j < 6; j++) {
        const p = Math.exp(rnd() * 7 - 1);
        const f = priceFit(p, got);
        assert.ok(near(f, refFit(p, got), 1e-12), `list ${i}: fit of ${p}`);
        assert.ok(Number.isFinite(f) && f >= 0 && f <= 1, `list ${i}: fit ${f} is a fraction`);
      }
    }
  }
  assert.ok(withB > 150 && withB < 400, `the lists should be a mix (${withB} had a B)`);
});

ok("budget: the fit is 1 inside the range, falls fast above it and slowly below it", () => {
  const b = { median: 12, lo: 10, hi: 14, conf: 1 }; // half the spread is 0.168, so the floor of ln 1.3 rules
  const up = Math.log(1.3);
  const down = Math.log(1.6);
  assert.equal(priceFit(12, b), 1);
  assert.ok(near(priceFit(12 * 1.3, b), 1, 1e-9), "the top of the range");
  assert.ok(near(priceFit(12 / 1.6, b), 1, 1e-9), "the bottom of the range");
  assert.ok(near(priceFit(12 * Math.exp(up + 0.35), b), Math.exp(-1), 1e-9), "one width above");
  assert.ok(near(priceFit(12 * Math.exp(-down - 0.7), b), Math.exp(-1), 1e-9), "one width below");
  // Above falls faster than below, the same log distance out.
  assert.ok(priceFit(12 * Math.exp(up + 0.3), b) < priceFit(12 * Math.exp(-down - 0.3), b));
  // The range widens upward with a wide spread, never downward.
  const wide = { median: 12, lo: 6, hi: 24, conf: 1 }; // half the spread is 0.693
  const p = 12 * Math.exp(0.6);
  assert.ok(near(priceFit(p, wide), 1, 1e-12) && priceFit(p, b) < 0.5, "a wide spread forgives a dearer plate");
  assert.equal(priceFit(12 / 1.7, wide), priceFit(12 / 1.7, b), "the lower edge does not move");
  // Continuous at both edges, monotone away from them, always a fraction.
  for (const e of [1e-6, 1e-9]) {
    assert.ok(Math.abs(priceFit(12 * Math.exp(up + e), b) - 1) < 1e-5);
    assert.ok(Math.abs(priceFit(12 * Math.exp(-down - e), b) - 1) < 1e-5);
  }
  let last = 1;
  for (let p2 = 16; p2 <= 400; p2 += 4) {
    const f = priceFit(p2, b);
    assert.ok(f <= last + 1e-15 && f >= 0, `falling above at ${p2}`);
    last = f;
  }
  last = 1;
  for (let p2 = 7.5; p2 >= 0.05; p2 -= 0.05) {
    const f = priceFit(p2, b);
    assert.ok(f <= last + 1e-15 && f > 0, `falling below at ${p2}`);
    last = f;
  }
  for (const price of [0.01, 1, 3, 12, 400, 1e4, 1e9]) {
    for (const bb of [b, wide, { median: 3, lo: 3, hi: 3, conf: 0.5 }, { median: 250, lo: 1, hi: 900, conf: 1 }]) {
      const f = priceFit(price, bb);
      assert.ok(Number.isFinite(f) && f >= 0 && f <= 1, `fit of ${price} against ${JSON.stringify(bb)} is ${f}`);
    }
  }
});

ok("budget: the points run from a penalty to a bonus, scaled by trust, and are exactly zero with none", () => {
  assert.ok(near(budgetPoints(1, 1), 6));
  assert.ok(near(budgetPoints(0.5, 1), 0));
  assert.ok(near(budgetPoints(0, 1), -6));
  assert.ok(near(budgetPoints(1, 0.5), 3));
  assert.ok(near(budgetPoints(0, 0.5), -3));
  assert.ok(near(budgetPoints(0.75, 2 / 3), 100 * FORME_WEIGHTS.budget * (2 / 3) * 0.5));
  for (let f = 0; f <= 1; f += 0.05) for (let c = 0.5; c <= 1; c += 0.1) assert.ok(Math.abs(budgetPoints(f, c)) <= 6 + 1e-12);
});

/** A throwaway world of one Thai menu (or the entry's own), each place with the median plate price on the menu it was given. */
const THAI_MENU = ["pad thai", "green curry", "tom yum", "satay"];
const THAI_NAMES = ["Alder", "Birch", "Cedar", "Dune", "Elm", "Fir", "Gale", "Heath", "Iris", "Juniper"];
function priceWorld(list) {
  const restaurants = [];
  const rows = [];
  list.forEach(([id, price, cuisine, dishes], i) => {
    restaurants.push({ ...R(`${THAI_NAMES[i % 10]} ${cuisine ?? "Thai"} ${i}`, cuisine ?? "Thai", MID), id });
    rows.push({
      restaurantId: id,
      dishTypes: dishes ?? THAI_MENU,
      service: "counter",
      menuStats: price == null ? null : { median: price, priced: 8 },
    });
  });
  return { restaurants, traits: buildTraitIndex(restaurants, rows) };
}
const USUAL = [10, 11, 12, 12, 13, 14]; // B: median 12, quartiles 11.25 and 12.75, full trust
const THAI_PRICES = [
  ["u1", 12],
  ["u2", 13],
  ["u3", 30],
  ["u4", null],
  ["u5", 5],
  ["u6", 100],
  ["u7", 17],
  ["u8", 8],
  ["u9", 18.5],
];
const unpriced = THAI_PRICES.map(([id]) => [id, null]);
const forMeScan = (world, o = {}) => scoreAll({ ...base, ...world, prefs: prefs({ loves: ["Thai"] }), ...o });

ok("budget: the traits index keeps a menu's median only from four priced items, and only if it is a real price", () => {
  const places = [
    { id: "a", name: "A", cuisine: "Thai", cuisineSecondary: undefined },
    { id: "b", name: "B", cuisine: "Thai", cuisineSecondary: undefined },
    { id: "c", name: "C", cuisine: "Thai", cuisineSecondary: undefined },
    { id: "d", name: "D", cuisine: "Thai", cuisineSecondary: undefined },
    { id: "e", name: "E", cuisine: "Thai", cuisineSecondary: undefined },
    { id: "f", name: "F", cuisine: "Thai", cuisineSecondary: undefined },
    { id: "g", name: "G", cuisine: "Thai", cuisineSecondary: undefined },
    { id: "h", name: "H", cuisine: "Thai", cuisineSecondary: undefined },
  ];
  const row = (restaurantId, menuStats, dishTypes = THAI_MENU) => ({ restaurantId, dishTypes, service: "counter", menuStats });
  const index = buildTraitIndex(places, [
    row("a", { median: 12, priced: 8 }),
    row("b", { median: 12, priced: 3 }), // under four
    row("c", { median: 9.5, priced: MIN_PRICED_ITEMS }), // exactly four
    row("d", { median: 0, priced: 10 }),
    row("e", { median: Number.NaN, priced: 10 }),
    row("f", { median: -4, priced: 10 }),
    row("g", null),
    row("h", undefined),
    row("zz", { median: 20, priced: 9 }), // not a listed place
    row("a", { median: 99, priced: 9 }), // a second row for a: the first stands
  ]);
  assert.deepEqual([...index.prices].sort(), [["a", 12], ["c", 9.5]]);
  // Pricing does not need a profile.
  const bare = buildTraitIndex(places, [row("a", { median: 14, priced: 5 }, [])]);
  assert.equal(bare.prices.get("a"), 14);
  // And the profile does not depend on pricing.
  const plain = buildTraitIndex(places, [row("a", null), row("c", null)]);
  assert.equal(plain.prices.size, 0);
  assert.equal(plain.profiled, index.profiled === 0 ? 0 : plain.profiled);
  assert.equal(buildTraitIndex(places, []).prices.size, 0);
});

ok("budget: a fitting price lifts a place, a far one sinks it, and the move is g times the points", () => {
  const withPrices = priceWorld(THAI_PRICES);
  const bare = priceWorld(unpriced);
  const sc = forMeScan(withPrices, { platePrices: USUAL });
  const flat = forMeScan(bare, { platePrices: USUAL });
  assert.equal(sc.mode, "similarity");
  const want = refBudget(USUAL, []);
  const at = (s, id) => scoredId(s, id);
  assert.deepEqual(
    { median: sc.budget.median, lo: sc.budget.lo, hi: sc.budget.hi, conf: sc.budget.conf },
    { median: 12, lo: 11, hi: 13, conf: 1 },
    "B is exposed in whole dollars",
  );
  for (const [id, price] of THAI_PRICES) {
    const s = at(sc, id);
    const f = at(flat, id);
    assert.ok(near(s.A, f.A) && near(s.N, f.N) && near(s.Q, f.Q) && near(s.G, f.G), `${id}: the same place but for its price`);
    assert.equal(s.tail, f.tail, `${id}: the tail formula never reads the price`);
    for (const v of [s.score, s.budgetPts]) assert.ok(Number.isFinite(v), `${id}: finite`);
    assert.ok(Math.abs(s.budgetPts) <= 6 + 1e-12, `${id}: at most six points either way`);
    if (price == null) {
      assert.equal(s.Pr, null);
      assert.equal(s.Pf, null);
      assert.equal(s.budgetPts, 0, `${id}: no price, no points`);
      assert.equal(s.score, f.score, `${id}: an unknown price leaves the score exactly where it was`);
    } else {
      assert.equal(s.Pr, price);
      assert.ok(near(s.Pf, refFit(price, want), 1e-12), `${id}: fit`);
      assert.ok(near(s.budgetPts, budgetPoints(refFit(price, want), want.conf), 1e-12), `${id}: points`);
      assert.ok(near(s.score - f.score, s.G * s.budgetPts, 1e-9), `${id}: the score moved by g * the points`);
    }
    // The flat world has prices for nobody.
    assert.equal(f.Pr, null);
    assert.equal(f.budgetPts, 0);
  }
  const pts = (id) => at(sc, id).budgetPts;
  assert.ok(near(pts("u1"), 6) && near(pts("u2"), 6), "inside the range: the full bonus");
  assert.ok(pts("u8") > 5.9, "a cheaper plate inside the lower edge is still a full bonus");
  assert.ok(pts("u7") > 4 && pts("u7") < 6, "just past the top of the range, a little less");
  assert.ok(pts("u3") < -5.5 && pts("u6") < -5.99, "far above: nearly the full penalty");
  assert.ok(pts("u5") > -1 && pts("u5") < 2, "well under: a light touch");
  assert.ok(pts("u6") < pts("u3") && pts("u3") < pts("u9") && pts("u9") < pts("u7") && pts("u7") < pts("u1"), "dearer is worse once past the range");
  // Same place, a dearer menu: lower on the score list.
  const order = sc.scored.slice().sort(cmpScore).map((s) => s.r.id);
  assert.ok(order.indexOf("u1") < order.indexOf("u3") && order.indexOf("u3") < order.indexOf("u6"));
});

ok("budget: every case with no B or no price is exactly neutral, not close", () => {
  const withPrices = priceWorld(THAI_PRICES);
  const bare = priceWorld(unpriced);
  const flat = forMeScan(bare);
  const flatScores = new Map(flat.scored.map((s) => [s.r.id, s.score]));
  const sameAsFlat = (sc, label) => {
    assert.equal(sc.scored.length, flat.scored.length, label);
    for (const s of sc.scored) {
      assert.equal(s.score, flatScores.get(s.r.id), `${label}: ${s.r.id}`);
      assert.equal(s.budgetPts, 0, `${label}: ${s.r.id} points`);
      assert.equal(s.Pf, null, `${label}: ${s.r.id} fit`);
      assert.ok(Number.isFinite(s.score) && !Number.isNaN(s.budgetPts), label);
    }
  };
  // Prices on every menu, but nothing to compare them with.
  for (const [label, o] of [
    ["no plate prices", {}],
    ["empty plate prices", { platePrices: [] }],
    ["two plates", { platePrices: [10, 12] }],
    ["plates all under $3", { platePrices: [1, 2, 2.5, 1.5] }],
    ["plates not numbers", { platePrices: [NaN, Infinity, 0, -4] }],
  ]) {
    const sc = forMeScan(withPrices, o);
    assert.equal(sc.budget, null, `${label}: no B`);
    sameAsFlat(sc, label);
  }
  // A B, and a world with no menu prices at all.
  const noMenus = forMeScan(bare, { platePrices: USUAL });
  assert.ok(noMenus.budget);
  sameAsFlat(noMenus, "B but no menu prices");
  // Prices below the four-item floor are no price.
  const thin = priceWorld(THAI_PRICES.map(([id, p]) => [id, p]));
  const thinRows = thin.restaurants.map((r) => ({ restaurantId: r.id, dishTypes: THAI_MENU, service: "counter", menuStats: { median: 12, priced: MIN_PRICED_ITEMS - 1 } }));
  const sparse = forMeScan({ restaurants: thin.restaurants, traits: buildTraitIndex(thin.restaurants, thinRows) }, { platePrices: USUAL });
  sameAsFlat(sparse, "menus with under four priced items");
  // The unpriced place in a priced world, with a B, is the one that does not move.
  const sc = forMeScan(withPrices, { platePrices: USUAL });
  assert.equal(scoredId(sc, "u4").score, flatScores.get("u4"));
  // The order they ask for the same thing in changes nothing.
  const again = forMeScan(withPrices, { platePrices: shuffled(USUAL, prng(5)) });
  for (const s of sc.scored) assert.equal(scoredId(again, s.r.id).score, s.score, `${s.r.id}: order of the plate prices`);
});

ok("budget: with no plates B comes from the places they have been, at half the weight", () => {
  // Three places they have been, each pricing near $12, and the candidates beside them.
  const list = [["v1", 10], ["v2", 12], ["v3", 14], ...THAI_PRICES];
  const world = priceWorld(list);
  const been = prefs({ loves: ["Thai"], been: ["v1", "v2", "v3"] });
  const sc = scoreAll({ ...base, ...world, prefs: been });
  assert.ok(sc.budget && sc.budget.conf === 0.5, "half trust");
  assert.deepEqual([sc.budget.median, sc.budget.lo, sc.budget.hi], [12, 11, 13]);
  const want = refBudget([], [10, 12, 14]);
  for (const [id, price] of THAI_PRICES) {
    const s = scoredId(sc, id);
    if (price == null) assert.equal(s.budgetPts, 0);
    else assert.ok(near(s.budgetPts, budgetPoints(refFit(price, want), 0.5), 1e-12), `${id}: points at half trust`);
    assert.ok(Math.abs(s.budgetPts) <= 3 + 1e-12, `${id}: at most three points`);
  }
  assert.equal(scoredId(sc, "v1"), undefined, "the places they have been are not scored");
  // Two places been is not enough to say.
  const two = scoreAll({ ...base, ...world, prefs: prefs({ loves: ["Thai"], been: ["v1", "v2"] }) });
  assert.equal(two.budget, null);
  // Posted places count the same as been ones.
  const posted = scoreAll({ ...base, ...world, prefs: prefs({ loves: ["Thai"] }), postedIds: ["v1", "v2", "v3"] });
  assert.deepEqual(posted.budget, sc.budget);
  // With plates as well, 0.6 plates and 0.4 places, and trust the larger.
  const both = scoreAll({ ...base, ...world, prefs: been, platePrices: [20, 20, 20, 20, 20, 20] });
  // median 0.6 * 20 + 0.4 * 12 = 16.8, quartiles 0.6 * 20 + 0.4 * 11 = 16.4 and 0.6 * 20 + 0.4 * 13 = 17.2
  assert.deepEqual([both.budget.median, both.budget.lo, both.budget.hi, both.budget.conf], [17, 16, 17, 1]);
});

ok("budget: the reason is the price line only on a tail place that fits, and never says a price is wrong", () => {
  const world = priceWorld(THAI_PRICES);
  const input = { ...base, ...world, prefs: prefs({ loves: ["Thai"] }), platePrices: USUAL };
  const res = rankTaste(input);
  checkRank("budget reasons", input, res);
  assert.equal(res.matched, 1, "one menu, one match");
  assert.ok(res.budget && res.budget.lo === 11 && res.budget.hi === 13, "the rank carries B for the profile line");
  const kindOf = (id) => res.reasonOf(id).kind;
  const matchId = res.order[0];
  assert.ok(["like", "pick", "friends", "cuisine"].includes(kindOf(matchId)), `the match says why it was picked: ${kindOf(matchId)}`);
  const wording = `Fits your usual $11${DASH}13 plate`;
  const fits = ["u1", "u2"].filter((id) => id !== matchId);
  for (const id of fits) {
    assert.deepEqual(res.reasonOf(id).kind, "price", `${id} fits`);
    assert.equal(res.reasonOf(id).text, wording);
  }
  // A poor fit, a price nobody wrote down: the rating line it always had.
  for (const id of ["u3", "u4", "u5", "u6", "u9"]) assert.equal(kindOf(id), "rated", `${id} is not claimed to fit`);
  // A fit of 0.9 or more is not enough: u7 ($17, fit 0.94) and u8 ($8, fit 1) score as fits
  // but sit outside the printed $11-13, so the line is not said of them.
  for (const id of ["u7", "u8"]) {
    assert.ok(scoredId(scoreAll(input), id).Pf >= FORME_BUDGET.reasonFit, `${id} scores as a fit`);
    if (id !== matchId) assert.equal(kindOf(id), "rated", `${id} is outside the printed range`);
  }
  // The text is words and two numbers; the dash is an en dash.
  assert.ok(wording.includes(DASH) && !wording.includes("-") && wording.length <= WEIGHTS.reasonMaxChars);
  const all = res.order.map((id) => res.reasonOf(id).text).join("\n");
  assert.ok(!/too (dear|expensive|pricey|cheap)|over budget|splurge|afford|above your|below your|outside your|pricier|cheaper/i.test(all), "never negative wording");
  // The boundary: the fit that earns the line is 0.9.
  assert.ok(scoredId(scoreAll(input), "u7").Pf >= FORME_BUDGET.reasonFit && scoredId(scoreAll(input), "u9").Pf < FORME_BUDGET.reasonFit);
  // It speaks for a match too when nothing else could: a menu no one else shares and no history.
  const quiet = priceWorld([["w1", 12, "Italian", ["pizza", "pasta", "tiramisu", "gnocchi"]]]);
  const quietRes = rankTaste({ ...base, ...quiet, prefs: prefs({ loves: ["Thai"] }), platePrices: USUAL });
  assert.equal(quietRes.matched, 0, "nothing matches a Thai pick");
  assert.equal(quietRes.reasonOf("w1").kind, "price");
  assert.equal(quietRes.reasonOf("w1").text, wording);
});

ok("budget: a like, a pick, a friend or a cuisine reason is kept over the price one", () => {
  // Like: they went to s1, and the candidates share its menu.
  const world = priceWorld([["s1", 12], ...THAI_PRICES]);
  const liked = { ...base, ...world, prefs: prefs({ been: ["s1"] }), platePrices: USUAL };
  const likedRes = rankTaste(liked);
  checkRank("budget like", liked, likedRes);
  assert.equal(likedRes.reasonOf(likedRes.order[0]).kind, "like", "the match keeps its like reason though its price fits");
  assert.ok(likedRes.order.slice(likedRes.matched).some((id) => likedRes.reasonOf(id).kind === "price"), "and the tail says price");
  // Friends: a place with a menu of its own that a friend has been to.
  const mixed = priceWorld([
    ["fr", 12, "Italian", ["pizza", "pasta", "tiramisu", "gnocchi"]],
    ...THAI_PRICES,
  ]);
  const fr = byRestaurant(mixed, "fr");
  const friendly = { ...base, ...mixed, prefs: prefs({ loves: ["Thai"] }), platePrices: USUAL, friendVisits: [friend(fr, "f1", "Ana")] };
  const friendRes = rankTaste(friendly);
  checkRank("budget friends", friendly, friendRes);
  assert.equal(friendRes.reasonOf("fr").kind, "friends", "a friend there beats the price line");
  // Cuisine share: posted at several Thai places, a Thai candidate says what they eat a lot of.
  const eats = priceWorld([["x1", 12], ["x2", 12], ["x3", 12], ["x4", 12], ...THAI_PRICES]);
  const eating = { ...base, ...eats, prefs: prefs({ loves: ["Thai"] }), postedIds: ["x1", "x2", "x3", "x4"], platePrices: USUAL };
  const eatRes = rankTaste(eating);
  checkRank("budget cuisine", eating, eatRes);
  for (const id of eatRes.order.slice(0, eatRes.matched)) assert.notEqual(eatRes.reasonOf(id).kind, "price", `${id} is a match with a reason of its own`);
});

ok("budget: one price, said as one dollar", () => {
  // u10 prices $12.40, which rounds to the one dollar the line prints.
  const world = priceWorld([...THAI_PRICES, ["u10", 12.4]]);
  const input = { ...base, ...world, prefs: prefs({ loves: ["Thai"] }), platePrices: [12, 12, 12, 12, 12, 12] };
  const res = rankTaste(input);
  checkRank("budget one price", input, res);
  assert.equal(res.budget.lo, 12);
  assert.equal(res.budget.hi, 12);
  const tailFit = res.order.slice(res.matched).find((id) => res.reasonOf(id).kind === "price");
  assert.ok(tailFit, "someone fits $12");
  assert.equal(res.reasonOf(tailFit).text, "Fits your usual $12 plate");
  // $13 scores as a full fit too, but is not "$12": it gets no price line.
  assert.equal(scoredId(scoreAll(input), "u2").Pf, 1);
  if (res.order.indexOf("u2") >= res.matched) assert.equal(res.reasonOf("u2").kind, "rated");
});

ok("budget: it is private to the viewer's own POST, and Your taste never sees it", () => {
  // The cuisine-share mode is Your taste's: no traits, no budget, nothing moves.
  const world = priceWorld(THAI_PRICES);
  const cuisineMode = (o) => scoreAll({ ...base, ...world, traits: undefined, prefs: prefs({ loves: ["Thai"] }), ...o });
  const a = cuisineMode({});
  const b = cuisineMode({ platePrices: USUAL });
  assert.equal(a.mode, "cuisine");
  assert.equal(b.budget, null);
  assert.deepEqual(b.scored.map((s) => s.score), a.scored.map((s) => s.score));
  for (const s of b.scored) {
    assert.equal(s.Pr, null);
    assert.equal(s.Pf, null);
    assert.equal(s.budgetPts, 0);
  }
  const takes = (extra) => scoreTaste({ restaurants: world.restaurants, plates: {}, prefs: prefs({ loves: ["Thai"] }), postedIds: [], friendVisits: [], ...extra });
  assert.deepEqual(takes({ platePrices: USUAL }), takes({}), "scoreTaste ignores what it was not built to read");
  const src = stripComments(read("../src/lib/taste.ts"));
  const start = src.indexOf("export function scoreTaste");
  const yourTaste = src.slice(start, src.indexOf("\nexport ", start + 1));
  assert.ok(start > 0 && !/budget|platePrices|priceFit|FORME_BUDGET|\bPr\b/.test(yourTaste), "scoreTaste does not reach the budget");

  // The route: only the POST asks, only for the viewer, and nothing about it goes on the wire.
  assert.match(postFn, /resolveTasteContext\(\{[^}]*platePrices:\s*true/);
  assert.match(postFn, /platePrices:\s*ctx\.platePrices/);
  assert.ok(!getFn.includes("platePrices"), "the public GET never asks for the viewer's prices");
  assert.ok(!stripComments(read("../src/app/api/account/taste/route.ts")).includes("platePrices"), "Your taste's route does not ask either");
  assert.ok(!/\.budget\b|usualPlate|\bPr\b|platePrices\s*[,}]\s*$/m.test(postFn.replace(/platePrices:\s*ctx\.platePrices/, "")), "the route does not send B back");
  const ctxSrc = stripComments(read("../src/lib/tasteContext.ts"));
  assert.match(ctxSrc, /opts\.platePrices === true \? platePricesBy\(user\.id\)/);
  const dbSrc = stripComments(read("../src/lib/db.ts")).replace(/\r\n/g, "\n");
  const from = dbSrc.indexOf("export async function platePricesBy");
  const fn = dbSrc.slice(from, dbSrc.indexOf("\nexport ", from + 1));
  assert.ok(from > 0);
  assert.match(fn, /SELECT price FROM posts/);
  assert.match(fn, /WHERE user_id = \$\{userId\}/);
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(fn), "it only reads");
  // The wire carries no B and no menu price: a reason is its kind, its words and a friends line.
  const wire = stripComments(read("../src/lib/discoverWire.ts"));
  // ...except the profile line's own plate range, which is the viewer's, rounded, and on their private answer only.
  const profileAt = wire.indexOf("export type ForMeProfile");
  const profileEnd = wire.indexOf("};", profileAt) + 2;
  assert.ok(profileAt > 0, "the profile type is on the wire");
  const wireRest = wire.slice(0, profileAt) + wire.slice(profileEnd);
  assert.ok(!/budget|platePrice|usualPlate|\bPr\b|\bPf\b/.test(wireRest), "ForMeInfo and ForMeReason carry no budget");
  assert.match(wire, /kind: "like" \| "pick" \| "friends" \| "cuisine" \| "price" \| "near" \| "rated"/);
  const disc = stripComments(read("../src/lib/discover.ts"));
  const info = disc.slice(disc.indexOf("function forMeInfo"));
  assert.ok(!/budget/i.test(info.slice(0, info.indexOf("\n}\n"))), "forMeInfo does not read B");
  // The own-ratings line: nothing the viewer rated, liked, hearted, upvoted or saved reaches the prices.
  assert.ok(!/rating|likes|hearts|upvotes|saves|comments/i.test(fn), "only the price column of their posts");
});

ok("budget: both cards set the reason's numbers in mono, and Your taste's own lines are untouched", () => {
  const card = stripComments(read("../src/components/RestaurantCard.tsx"));
  const grid = stripComments(read("../src/components/mobile/PhoneRestaurantCardGrid.tsx"));
  for (const [name, src] of [["web card", card], ["phone grid", grid]]) {
    assert.match(src, /import \{ ReasonText \} from "@\/components\/ReasonText"/, `${name} imports the helper`);
    assert.match(src, /<ReasonText text=\{reason\} \/>/, `${name} renders the reason through it`);
  }
  const taste = stripComments(read("../src/components/TasteSection.tsx"));
  assert.ok(!taste.includes("ReasonText"), "the Your taste strip has no reason line");
  const helper = stripComments(read("../src/components/ReasonText.tsx"));
  assert.match(helper, /font-mono tabular-nums/);
});

await okAsync("budget: ReasonText sets dollars, distances and numerals in mono and leaves the prose alone", async () => {
  let ReasonText;
  let renderToStaticMarkup;
  let createElement;
  try {
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ createElement } = await import("react"));
    ({ ReasonText } = await import("../src/components/ReasonText.tsx"));
  } catch {
    ReasonText = null;
  }
  if (!ReasonText) return; // the source checks above cover it where the component will not load
  const html = (text) => renderToStaticMarkup(createElement(ReasonText, { text }));
  const mono = (s) => `<span class="font-mono tabular-nums">${s}</span>`;
  assert.equal(html(`Fits your usual $11${DASH}13 plate`), `Fits your usual ${mono(`$11${DASH}13`)} plate`);
  assert.equal(html("Fits your usual $12 plate"), `Fits your usual ${mono("$12")} plate`);
  assert.equal(html("Fits your usual $9.99-$14.50 plate"), `Fits your usual ${mono("$9.99-$14.50")} plate`);
  assert.equal(html("Fits your usual $1,200 plate"), `Fits your usual ${mono("$1,200")} plate`);
  assert.equal(html("0.4 mi away"), `${mono("0.4 mi")} away`);
  assert.equal(html("2 mi"), mono("2 mi"));
  assert.equal(html("Because you went to Pho 79"), `Because you went to Pho ${mono("79")}`);
  for (const plain of ["Highly rated in Downtown", "Worth a look", "Different from your usual", "Because you went to Siam Orchid", ""]) {
    assert.equal(html(plain), plain, `"${plain}" has no number to set`);
  }
  // Words are never swallowed: strip the spans and the text comes back whole.
  for (const text of [`Fits your usual $11${DASH}13 plate`, "Because you went to Pho 79", "You have eaten at 3 places, 1.5 mi apart"]) {
    assert.equal(html(text).replace(/<\/?span[^>]*>/g, ""), text);
  }
});

/* ---------- travel radius and the profile line ---------- */

const EARTH_MI = 3958.8;
const MI_PER_DEG = (EARTH_MI * Math.PI) / 180;
const ORIGIN = { lat: 32.7157, lng: -117.1611 };
/** A point `miles` north of the origin, on its meridian, where the great-circle distance is the arc length. */
const northOf = (miles) => ({ lat: ORIGIN.lat + miles / MI_PER_DEG, lng: ORIGIN.lng });
const pt = (id, miles) => ({ id, ...northOf(miles) });

/**
 * A throwaway world: [id, miles north of the origin (null: no coordinates),
 * cuisine, dishes, median price], each with its own menu row. Thai on the Thai
 * menu unless it says otherwise, so a Thai history sees every Thai place alike.
 */
function geoWorld(list) {
  const restaurants = [];
  const rows = [];
  list.forEach(([id, miles, cuisine, dishes, price], i) => {
    const c = cuisine ?? "Thai";
    restaurants.push({ ...R(`${THAI_NAMES[i % 10]} ${c} ${i}`, c, MID), id, ...(miles == null ? {} : northOf(miles)) });
    rows.push({
      restaurantId: id,
      dishTypes: dishes ?? THAI_MENU,
      service: "counter",
      menuStats: price == null ? null : { median: price, priced: 8 },
    });
  });
  return { restaurants, traits: buildTraitIndex(restaurants, rows) };
}
const PIZZA_MENU = ["margherita", "calzone", "tiramisu", "garlic knots"];
const withoutCoords = (restaurants) =>
  restaurants.map((r) => {
    const bare = { ...r };
    delete bare.lat;
    delete bare.lng;
    return bare;
  });
const expectedSum = (s) =>
  s.G *
  (100 * (FORME_WEIGHTS.affinity * s.A * s.D + FORME_WEIGHTS.friends * s.F + FORME_WEIGHTS.quality * s.Q + FORME_WEIGHTS.neighborhood * s.N * s.D) +
    s.budgetPts);

/** The radius recomputed on the side, by the spec and nothing shared with the module but the distance. */
function refRadius(points) {
  const n = points.length;
  if (n < 3) return { miles: 7, floor: 0.75 };
  const sorted = points.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  let best = null;
  let bestSum = Infinity;
  for (const a of sorted) {
    const sum = sorted.reduce((t, b) => t + milesBetween(a, b), 0);
    if (sum < bestSum - 1e-9) {
      best = a;
      bestSum = sum;
    }
  }
  const away = sorted.filter((p) => p !== best).map((p) => milesBetween(best, p)).sort((x, y) => x - y);
  const at = (away.length - 1) * 0.75;
  const p75 = away[Math.floor(at)] + (away[Math.ceil(at)] - away[Math.floor(at)]) * (at - Math.floor(at));
  const mix = (n * p75 + 3 * 7) / (n + 3);
  return { miles: Math.min(20, Math.max(3, mix)), floor: 0.55, medoid: best };
}

ok("radius: the constants are the spec's", () => {
  assert.deepEqual(
    { ...FORME_RADIUS },
    { minPoints: 3, priorPlaces: 3, priorMiles: 7, minMiles: 3, maxMiles: 20, floor: 0.55, floorFew: 0.75 },
  );
});

ok("radius: the medoid is the most central point, ties to the lower id, whatever the order", () => {
  assert.equal(medoidOf([]), null);
  assert.equal(medoidOf([pt("solo", 5)]).id, "solo", "one point is its own medoid");
  // 0, 1, 2 mi: the middle one has the least summed distance (2, against 3 and 3).
  const three = [pt("h1", 0), pt("h2", 1), pt("h3", 2)];
  assert.equal(medoidOf(three).id, "h2");
  assert.equal(medoidOf(three.slice().reverse()).id, "h2");
  // Two points tie on summed distance: the lower id.
  assert.equal(medoidOf([pt("b", 10), pt("a", 0)]).id, "a");
  assert.equal(medoidOf([pt("a", 10), pt("b", 0)]).id, "a");
  // One far trip does not drag it: a mean would sit near 100 mi.
  const trip = [pt("a", 0), pt("b", 0.5), pt("c", 1), pt("far", 400)];
  const m = medoidOf(trip);
  assert.ok(m.id !== "far" && milesBetween(m, northOf(0.5)) <= 0.5 + 1e-9, "the outlier does not move the medoid");
  // Coincident points: still the lowest id, never a crash.
  assert.equal(medoidOf([pt("z", 3), pt("y", 3), pt("x", 3)]).id, "x");
});

ok("radius: R = (n * p75 + 21) / (n + 3), within 3 to 20 mi, and 7 under three points", () => {
  const radius = (points, here) => radiusOf(points, here);
  // No history, one place, two places: R is the prior and the floor is the soft one.
  for (const points of [[], [pt("a", 0)], [pt("a", 0), pt("b", 30)]]) {
    const r = radius(points);
    assert.equal(r.miles, 7);
    assert.equal(r.floor, 0.75);
    assert.equal(r.points, points.length);
  }
  // Three places at 0, 2, 10 mi: medoid 2, the other two are 2 and 8 away, p75 = 6.5.
  const three = radius([pt("h1", 0), pt("h2", 2), pt("h3", 10)]);
  assert.ok(near(three.miles, (3 * 6.5 + 21) / 6, 1e-6), `R is 6.75, got ${three.miles}`);
  assert.equal(three.floor, 0.55);
  assert.equal(three.points, 3);
  // Three at 0, 1, 2: p75 = 1, R = 4.
  assert.ok(near(radius([pt("h1", 0), pt("h2", 1), pt("h3", 2)]).miles, 4, 1e-6));
  // Nine on a line, 0 to 8: medoid 4, distances 1 1 2 2 3 3 4 4, p75 = 3.25, R = 50.25 / 12.
  const nine = radius(Array.from({ length: 9 }, (_, i) => pt(`p${i}`, i)));
  assert.ok(near(nine.miles, (9 * 3.25 + 21) / 12, 1e-6), `nine points: ${nine.miles}`);
  // The clamps: a stay-at-home history is 3 mi, never less; a far-flung one is 20 mi, never more.
  assert.equal(radius(Array.from({ length: 10 }, (_, i) => pt(`s${i}`, 0))).miles, 3);
  assert.equal(radius(Array.from({ length: 6 }, (_, i) => pt(`f${i}`, i * 200))).miles, 20);
  // Two points a world apart are still R = 7: the prior, not 20.
  assert.equal(radius([pt("a", 0), pt("b", 2000)]).miles, 7);
});

ok("radius: the anchor is `here` when it is a real position, else the medoid, else nothing", () => {
  const history = [pt("h1", 0), pt("h2", 1), pt("h3", 2)];
  const here = northOf(9);
  const withHere = radiusOf(history, here);
  assert.equal(withHere.source, "here");
  assert.deepEqual(withHere.anchor, here);
  const medoidOnly = radiusOf(history);
  assert.equal(medoidOnly.source, "medoid");
  assert.ok(near(medoidOnly.anchor.lat, northOf(1).lat, 1e-12) && medoidOnly.anchor.lng === ORIGIN.lng);
  for (const bad of [null, undefined, { lat: Number.NaN, lng: 1 }, { lat: 1, lng: Number.POSITIVE_INFINITY }]) {
    const r = radiusOf(history, bad);
    assert.equal(r.source, "medoid", "an unusable position falls back to the medoid");
    assert.deepEqual(r.anchor, medoidOnly.anchor);
  }
  // here does not change R, only where it is measured from.
  assert.equal(withHere.miles, medoidOnly.miles);
  const none = radiusOf([]);
  assert.equal(none.anchor, null);
  assert.equal(none.source, null);
  const standing = radiusOf([], here);
  assert.equal(standing.source, "here");
  assert.equal(standing.miles, 7);
  assert.equal(standing.points, 0);
});

ok("radius: it matches an independent computation over random histories", () => {
  const rnd = prng(20261107);
  for (let t = 0; t < 250; t++) {
    const k = Math.floor(rnd() * 31);
    const spread = [0.2, 3, 12, 60][Math.floor(rnd() * 4)];
    const points = Array.from({ length: k }, (_, i) => ({
      id: `id${String(Math.floor(rnd() * 1e6)).padStart(7, "0")}-${i}`,
      lat: ORIGIN.lat + (rnd() - 0.5) * spread * 0.03,
      lng: ORIGIN.lng + (rnd() - 0.5) * spread * 0.035,
    }));
    const want = refRadius(points);
    const got = radiusOf(points);
    assert.ok(near(got.miles, want.miles, 1e-9), `n=${k}: R ${got.miles} against ${want.miles}`);
    assert.equal(got.floor, want.floor);
    assert.ok(got.miles >= (k >= 3 ? 3 : 7) && got.miles <= (k >= 3 ? 20 : 7));
    // The order the points arrive in cannot change it.
    const shuffledPoints = shuffled(points, rnd);
    assert.deepEqual(radiusOf(shuffledPoints), got);
    if (k >= 3) assert.deepEqual(got.anchor, { lat: want.medoid.lat, lng: want.medoid.lng });
  }
});

ok("radius: D is 1 up to R, then 1 / (1 + ((d - R) / R)^2), never under the floor", () => {
  for (const floor of [0.55, 0.75]) {
    for (const R_ of [3, 4, 7, 20]) {
      assert.equal(distanceFactor(0, R_, floor), 1);
      assert.equal(distanceFactor(R_ / 2, R_, floor), 1);
      assert.equal(distanceFactor(R_, R_, floor), 1);
      let last = 1;
      for (let d = R_; d <= R_ * 8; d += R_ / 10) {
        const v = distanceFactor(d, R_, floor);
        assert.ok(v >= floor - 1e-12 && v <= 1 && v <= last + 1e-12, `D(${d}) for R ${R_}: ${v}`);
        last = v;
      }
      assert.equal(distanceFactor(R_ * 1000, R_, floor), floor, "far out it rests on the floor");
    }
  }
  // Spot values, written out: R = 4.
  assert.ok(near(distanceFactor(6, 4, 0.55), 0.8, 1e-12), "half an R past: 1 / 1.25");
  assert.ok(near(distanceFactor(5, 4, 0.55), 1 / (1 + 0.0625), 1e-12));
  assert.equal(distanceFactor(8, 4, 0.55), 0.55, "an R past: 0.5, held at the floor");
  assert.equal(distanceFactor(8, 4, 0.75), 0.75);
  assert.equal(distanceFactor(Number.NaN, 4, 0.55), 1, "not a number is no penalty");
});

ok("radius: it softens A and N by D and leaves every other term alone", () => {
  // History at 0, 1, 2 mi: medoid 1 mi, R = 4. Candidates 3, 4, 6, 8 mi (and the south side, and none) from the medoid.
  const places = [
    ["h1", 0],
    ["h2", 1],
    ["h3", 2],
    ["n1", 4], // 3 mi out: inside
    ["n2", 5], // 4 mi out: on the edge
    ["n3", 7], // 6 mi out: D = 0.8
    ["n4", 9], // 8 mi out: 0.5, held at 0.55
    ["n5", null], // no coordinates
    ["n6", -5], // 6 mi out, the other way: D = 0.8
  ];
  const world = geoWorld(places);
  const input = { ...base, ...world, prefs: prefs({}), postedIds: ["h1", "h2", "h3"], ratingMean: 4.4 };
  const sc = scoreAll(input);
  const at = (id) => scoredId(sc, id);
  assert.equal(sc.mode, "similarity");
  assert.ok(sc.radius && near(sc.radius.miles, 4, 1e-6) && sc.radius.source === "medoid" && sc.radius.points === 3);
  const want = { n1: [3, 1], n2: [4, 1], n3: [6, 0.8], n4: [8, 0.55], n5: [null, 1], n6: [6, 0.8] };
  for (const [id, [d, D]] of Object.entries(want)) {
    const s = at(id);
    if (d == null) assert.equal(s.dist, null, `${id} has no distance`);
    else assert.ok(near(s.dist, d, 1e-6), `${id}: ${s.dist} mi, expected ${d}`);
    assert.ok(near(s.D, D, 1e-6), `${id}: D ${s.D}, expected ${D}`);
  }
  for (const s of sc.scored) {
    assert.ok(near(s.score, expectedSum(s), 1e-9), `${s.r.name}: score is g * (100 * (a A D + f F + q Q + n N D) + budget points)`);
    assert.ok(Number.isFinite(s.score) && Number.isFinite(s.D) && s.D >= 0.55 && s.D <= 1);
  }
  // The same world with no coordinates anywhere: D is 1 everywhere, and nothing but the score differs.
  const flat = scoreAll({ ...input, restaurants: withoutCoords(world.restaurants) });
  assert.equal(flat.radius.anchor, null, "no points, no anchor");
  assert.equal(flat.radius.miles, 7);
  for (const s of flat.scored) {
    assert.equal(s.D, 1);
    assert.equal(s.dist, null);
    const t = at(s.r.id);
    for (const key of ["A", "F", "Q", "N", "G", "tail", "budgetPts", "Ahist", "sim"]) assert.equal(t[key], s[key], `${s.r.name}: ${key} moves with distance`);
    assert.ok(near(s.score, expectedSum(s), 1e-9));
    assert.ok(t.score <= s.score + 1e-9, "distance only ever lowers a score");
    if (t.D === 1) assert.ok(near(t.score, s.score, 1e-9), `${s.r.name}: in range, nothing changes`);
    else assert.ok(t.score < s.score, `${s.r.name}: out of range, the score drops`);
  }
  // Alike in everything but distance, the nearer place scores more.
  assert.ok(at("n1").score > at("n3").score && at("n3").score > at("n4").score);
  assert.ok(near(at("n3").score, at("n6").score, 1e-9), "north or south, the same distance is the same factor");
  assert.ok(at("n5").score === at("n1").score, "no coordinates: not penalised, not helped");
  // Membership is decided on the raw A: the same places are matches either way.
  const ids_ = (s) => s.filter(isMatch).map((x) => x.r.id).sort();
  assert.deepEqual(ids_(sc.scored), ids_(flat.scored));
  const near1 = rankTaste(input);
  const flat1 = rankTaste({ ...input, restaurants: withoutCoords(world.restaurants) });
  assert.equal(near1.matched, flat1.matched, "distance never removes a match");
  assert.deepEqual([...near1.exclude].sort(), [...flat1.exclude].sort());
  assert.equal(near1.order.length, flat1.order.length);
  assert.equal(new Set(near1.order).size, flat1.order.length);
  // Deterministic, and blind to the order things arrive in.
  const reordered = rankTaste({ ...input, restaurants: world.restaurants.slice().reverse(), postedIds: ["h3", "h1", "h2"] });
  assert.deepEqual(reordered.order, near1.order);
  assert.deepEqual(rankTaste(input).order, near1.order);
});

ok("radius: `here` moves the anchor, not R; an unusable one changes nothing", () => {
  const world = geoWorld([
    ["h1", 0],
    ["h2", 1],
    ["h3", 2],
    ["n1", 4],
    ["n3", 7],
    ["n5", null],
    ["n7", 21],
  ]);
  const input = { ...base, ...world, prefs: prefs({}), postedIds: ["h1", "h2", "h3"], ratingMean: 4.4 };
  const plain = scoreAll(input);
  const scores = (sc) => sc.scored.map((s) => [s.r.id, s.score, s.D, s.dist]);
  // Standing on the medoid is the medoid.
  assert.deepEqual(scores(scoreAll({ ...input, here: northOf(1) })), scores(plain));
  // No here, a null one, a NaN one: all the same as none.
  for (const bad of [null, { lat: Number.NaN, lng: 0 }, { lat: 0, lng: Number.NaN }]) {
    assert.deepEqual(scores(scoreAll({ ...input, here: bad })), scores(plain));
  }
  // Standing 20 mi north, everything near the history is far from you.
  const far = scoreAll({ ...input, here: northOf(20) });
  assert.equal(far.radius.source, "here");
  assert.ok(near(far.radius.miles, plain.radius.miles, 1e-12), "R is read from where they have been, not where they are");
  const dist = (id) => scoredId(far, id).dist;
  assert.ok(near(dist("n1"), 16, 1e-6) && near(dist("n3"), 13, 1e-6) && near(dist("n7"), 1, 1e-6));
  assert.equal(scoredId(far, "n1").D, 0.55, "16 mi past a 4 mi range: the floor");
  assert.equal(scoredId(far, "n7").D, 1, "across the street from you");
  assert.equal(scoredId(far, "n5").D, 1);
  assert.ok(scoredId(far, "n7").score > scoredId(far, "n1").score, "near you outscores near your history");
  // No history at all: here alone sets the anchor and R is the prior.
  const cold = scoreAll({ ...input, postedIds: [], prefs: prefs({ loves: ["Thai"] }), here: northOf(0) });
  assert.equal(cold.radius.source, "here");
  assert.equal(cold.radius.miles, 7);
  assert.equal(cold.radius.points, 0);
  assert.equal(scoredId(cold, "n1").D, 1, "4 mi is inside 7");
  assert.equal(scoredId(cold, "n7").D, 0.75, "21 mi, 14 past: the soft floor");
});

ok("radius: history without coordinates, repeats and strangers are not points", () => {
  const world = geoWorld([
    ["h1", 0],
    ["h2", 1],
    ["h3", 2],
    ["h4", null],
    ["n1", 4],
  ]);
  const input = { ...base, ...world, prefs: prefs({}), postedIds: ["h1", "h2", "h3"], ratingMean: 4.4 };
  const plain = scoreAll(input).radius;
  assert.equal(plain.points, 3);
  // A fourth place with no coordinates, a repeat, an id the corpus does not have: still three points.
  const noisy = scoreAll({ ...input, postedIds: ["h1", "h2", "h3", "h4", "nowhere"], prefs: prefs({ been: ["h1", "h2"] }) }).radius;
  assert.deepEqual(noisy, plain);
  // Two with coordinates and one without is two points: R is the prior.
  const two = scoreAll({ ...input, postedIds: ["h1", "h2", "h4"] }).radius;
  assert.equal(two.points, 2);
  assert.equal(two.miles, 7);
});

ok("radius: Your taste never reads it", () => {
  const world = geoWorld([
    ["h1", 0],
    ["h2", 1],
    ["h3", 2],
    ["n1", 4],
    ["n4", 9],
    ["n5", null],
  ]);
  // The cuisine-share mode is Your taste's: no traits, no radius, no distance.
  const cuisineMode = (o) => scoreAll({ ...base, restaurants: world.restaurants, traits: undefined, prefs: prefs({ loves: ["Thai"] }), postedIds: ["h1", "h2", "h3"], ...o });
  const a = cuisineMode({});
  const b = cuisineMode({ here: northOf(20) });
  assert.equal(a.mode, "cuisine");
  assert.equal(b.radius, null);
  assert.deepEqual(b.scored.map((s) => s.score), a.scored.map((s) => s.score));
  for (const s of b.scored) {
    assert.equal(s.D, 1);
    assert.equal(s.dist, null);
  }
  const takes = (extra) => scoreTaste({ restaurants: world.restaurants, plates: {}, prefs: prefs({ loves: ["Thai"] }), postedIds: ["h1", "h2", "h3"], friendVisits: [], ...extra });
  assert.deepEqual(takes({ here: northOf(20) }), takes({}), "scoreTaste ignores a position");
  const src = stripComments(read("../src/lib/taste.ts"));
  const start = src.indexOf("export function scoreTaste");
  const yourTaste = src.slice(start, src.indexOf("\nexport ", start + 1));
  assert.ok(start > 0 && !/radius|distanceFactor|medoid|\.here\b|FORME_RADIUS|\.dist\b/.test(yourTaste), "scoreTaste does not reach the radius");
  // And the strip's source has no reason line and no profile line.
  for (const file of ["TasteSection", "TasteChips"]) {
    const s = stripComments(read(`../src/components/${file}.tsx`));
    assert.ok(!/ForMeProfileLine|\.profile\b/.test(s), `${file} shows no profile line`);
  }
});

ok("radius: 'Within your usual N mi' needs `here`, a range read off three places, and nothing stronger to say", () => {
  const places = [
    ["h1", 0],
    ["h2", 1],
    ["h3", 2],
    ["m1", 2], // a Thai match, 1 mi from the medoid: says why it was picked, not where it is
    ["t1", 3, "Italian", PIZZA_MENU], // tail, 2 mi out
    ["t2", 12, "Italian", PIZZA_MENU], // tail, 11 mi out
    ["t3", null, "Italian", PIZZA_MENU], // tail, nowhere
    ["t4", 3, "Italian", PIZZA_MENU, 12], // tail, 2 mi out, fits a $12 plate
    ["fr", 2, "Italian", PIZZA_MENU], // tail place a friend has been to
    ["t5", 4.9, "Italian", PIZZA_MENU], // tail, 3.9 mi from `here`: just inside
    ["t6", 5.5, "Italian", PIZZA_MENU], // tail, 4.5 mi from `here`: just past
  ];
  const world = geoWorld(places);
  const friendAt = friend(byRestaurant(world, "fr"), "f1", "Ana");
  const history = { postedIds: ["h1", "h2", "h3"], prefs: prefs({}), ratingMean: 4.4 };
  const go = (label, o = {}) => {
    const input = { ...base, ...world, ...history, ...o };
    const res = rankTaste(input);
    checkRank(label, input, res);
    return res;
  };
  const here = northOf(1);
  const withHere = go("near with here", { here });
  const kind = (res, id) => res.reasonOf(id).kind;
  assert.equal(kind(withHere, "t1"), "near");
  assert.equal(withHere.reasonOf("t1").text, "Within your usual 4 mi");
  assert.equal(kind(withHere, "t5"), "near", "just inside is inside");
  assert.equal(kind(withHere, "t6"), "rated", "just past it is not");
  assert.equal(kind(withHere, "t2"), "rated", "beyond R");
  assert.equal(kind(withHere, "t3"), "rated", "no coordinates: nothing to be near");
  assert.ok(withHere.reasonOf("t1").text.length <= WEIGHTS.reasonMaxChars);
  assert.ok(!("friends" in withHere.reasonOf("t1")), "no friends, no friends line");
  // The match keeps the reason it had.
  assert.ok(["like", "pick", "friends", "cuisine"].includes(kind(withHere, "m1")), `a match says why: ${kind(withHere, "m1")}`);
  // Without `here`, or with an unusable one: never off the medoid.
  for (const [label, extra] of [["no here", {}], ["null here", { here: null }], ["NaN here", { here: { lat: Number.NaN, lng: 1 } }]]) {
    const res = go(label, extra);
    assert.ok(res.order.every((id) => kind(res, id) !== "near"), `${label}: nothing is near`);
    assert.equal(kind(res, "t1"), "rated");
  }
  // Under three places the range is a prior, not something they did.
  const two = go("near with two places", { here, postedIds: ["h1", "h2"] });
  assert.ok(two.order.every((id) => kind(two, id) !== "near"), "two places: no claim of 'usual'");
  assert.equal(two.profile.radiusMi, null);
  // A price that fits, a friend there, a like: each is kept over it.
  const priced = go("near and price", { here, platePrices: USUAL });
  assert.equal(kind(priced, "t4"), "price", "a fit is the stronger line");
  assert.equal(kind(priced, "t1"), "near", "and the unpriced neighbour still gets near");
  const social = go("near and friends", { here, friendVisits: [friendAt] });
  assert.equal(kind(social, "fr"), "friends");
  const liked = go("near and like", { here, postedIds: ["h1", "h2", "h3"] });
  assert.ok(liked.order.slice(0, liked.matched).every((id) => kind(liked, id) !== "near"), "a match never reads as near");
  // The rated line it replaced is still there for everything else.
  assert.ok(withHere.order.some((id) => kind(withHere, id) === "rated"));
  // The wording has one number, a whole mile count, and nothing negative.
  const lines = withHere.order.map((id) => withHere.reasonOf(id).text).filter((t) => t.startsWith("Within"));
  assert.ok(lines.length > 0 && lines.every((t) => /^Within your usual \d+ mi$/.test(t)));
});

ok("profile: the For me answer carries the line's parts from the viewer's own data", () => {
  const places = [
    ["h1", 0],
    ["h2", 1],
    ["h3", 2],
    ["t1", 3, "Italian", PIZZA_MENU],
    ["t2", 12, "Italian", PIZZA_MENU],
  ];
  const world = geoWorld(places);
  const input = { ...base, ...world, prefs: prefs({}), postedIds: ["h1", "h2", "h3"], platePrices: USUAL, ratingMean: 4.4 };
  const res = rankTaste(input);
  checkRank("profile", input, res);
  const sc = scoreAll(input);
  assert.deepEqual(Object.keys(res.profile).sort(), ["budget", "cuisines", "radiusMi"]);
  assert.deepEqual(res.profile.budget, { lo: 11, hi: 13 });
  assert.equal(res.profile.radiusMi, Math.round(sc.radius.miles));
  assert.equal(res.profile.radiusMi, 4);
  assert.deepEqual(res.profile.cuisines, sc.topCuisines.map((c) => c.cuisine));
  assert.deepEqual(res.profile.cuisines, ["Thai"]);
  // The range is the usual plate as the reason prints it, in whole dollars, lo first.
  assert.ok(Number.isInteger(res.profile.budget.lo) && Number.isInteger(res.profile.budget.hi) && res.profile.budget.lo <= res.profile.budget.hi);
  assert.deepEqual(res.profile.budget, { lo: res.budget.lo, hi: res.budget.hi });
  // Where they are, who their friends are, what they would see on the list: none of it enters.
  assert.deepEqual(rankTaste({ ...input, here: northOf(15) }).profile, res.profile);
  assert.deepEqual(rankTaste({ ...input, friendVisits: [friend(byRestaurant(world, "t1"), "f1", "Ana")] }).profile, res.profile);
  // It is the viewer's own and carries no id, no name, no coordinates.
  const json = JSON.stringify(res.profile);
  assert.ok(!/h1|h2|h3|t1|t2|f1|Ana|lat|lng|\d\d\.\d/.test(json), `nothing identifying: ${json}`);
  // Too little to say: each part is null or empty on its own, never made up.
  const cold = rankTaste({ ...base, ...world, prefs: prefs({ loves: ["Thai"] }), ratingMean: 4.4 });
  assert.deepEqual(cold.profile, { budget: null, radiusMi: null, cuisines: [] });
  const noPrices = rankTaste({ ...input, platePrices: [] });
  assert.equal(noPrices.profile.budget, null);
  assert.equal(noPrices.profile.radiusMi, 4);
  const tooFew = rankTaste({ ...input, postedIds: ["h1", "h2"] });
  assert.equal(tooFew.profile.radiusMi, null, "two places is not a pattern");
  assert.deepEqual(tooFew.profile.cuisines, [], "and the cuisines wait for three too");
  const noCoords = rankTaste({ ...input, restaurants: withoutCoords(world.restaurants) });
  assert.equal(noCoords.profile.radiusMi, null, "no coordinates, no radius to claim");
  assert.deepEqual(noCoords.profile.budget, { lo: 11, hi: 13 });
});

ok("profile: it rides the private answer only, built in one place", () => {
  const wire = stripComments(read("../src/lib/discoverWire.ts"));
  const block = wire.slice(wire.indexOf("export type ForMeProfile"), wire.indexOf("};", wire.indexOf("export type ForMeProfile")) + 2);
  assert.match(block, /budget: \{ lo: number; hi: number \} \| null;/);
  assert.match(block, /radiusMi: number \| null;/);
  assert.match(block, /cuisines: string\[\];/);
  assert.equal((block.match(/^\s+\w+:/gm) ?? []).length, 3, "the profile has three parts and no more");
  assert.match(wire, /profile\?: ForMeProfile;/);
  assert.match(wire, /kind: "like" \| "pick" \| "friends" \| "cuisine" \| "price" \| "near" \| "rated"/);
  // forMeInfo passes it through on an answer, and a paused answer has none.
  const disc = stripComments(read("../src/lib/discover.ts")).replace(/\r\n/g, "\n");
  const fn = disc.slice(disc.indexOf("function forMeInfo"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /\.\.\.\(personal\.profile && \{ profile: personal\.profile \}\)/);
  assert.ok(/paused: true \}/.test(body) && !/paused: true[^\n]*profile/.test(body), "a paused answer carries no profile");
  assert.match(disc, /profile\?: ForMeProfile;/);
  // The route: `here` reaches the ranker (it was already validated for the page), and only the POST ranks.
  assert.match(postFn, /rankTaste\(\{[\s\S]*?\bhere,\s*\}\)/);
  assert.ok(!getFn.includes("rankTaste") && !getFn.includes("profile"), "the public GET has neither");
  assert.ok(!stripComments(read("../src/app/api/account/taste/route.ts")).match(/\bprofile\b|\bhere\b/), "Your taste's route has neither");
  // The ranker returns it; Your taste's result has no such key.
  const taste = stripComments(read("../src/lib/taste.ts"));
  assert.match(taste, /profile: profileOf\(scan\)/);
  assert.ok(!/profile/.test(taste.slice(taste.indexOf("export function scoreTaste"), taste.indexOf("\nexport ", taste.indexOf("export function scoreTaste") + 1))));
});

await okAsync("profile: the line is one sentence, numbers in mono, parts left out, nothing when empty", async () => {
  let ForMeProfileLine;
  let profileParts;
  let renderToStaticMarkup;
  let createElement;
  try {
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ createElement } = await import("react"));
    ({ ForMeProfileLine, profileParts } = await import("../src/components/ForMeProfileLine.tsx"));
  } catch {
    ForMeProfileLine = null;
  }
  assert.ok(ForMeProfileLine, "the line component loads");
  const html = (profile, className) => renderToStaticMarkup(createElement(ForMeProfileLine, { profile, className }));
  const text = (markup) => markup.replace(/<[^>]*>/g, "");
  const mono = (s) => `<span class="font-mono tabular-nums">${s}</span>`;
  const full = { budget: { lo: 11, hi: 18 }, radiusMi: 7, cuisines: ["Pizza", "Coffee", "Breakfast"] };
  const sentence = `Tuned to you · $11${DASH}18 a plate · usually within 7 mi · Pizza, Coffee, Breakfast`;
  const markup = html(full, "x-line");
  assert.equal(text(markup), sentence);
  assert.equal(markup, `<p class="x-line">Tuned to you · ${mono(`$11${DASH}18`)} a plate · usually within ${mono("7 mi")} · Pizza, Coffee, Breakfast</p>`);
  // Each part is left out on its own, in order, with no stray separator.
  assert.equal(text(html({ ...full, budget: null })), "Tuned to you · usually within 7 mi · Pizza, Coffee, Breakfast");
  assert.equal(text(html({ ...full, radiusMi: null })), `Tuned to you · $11${DASH}18 a plate · Pizza, Coffee, Breakfast`);
  assert.equal(text(html({ ...full, cuisines: [] })), `Tuned to you · $11${DASH}18 a plate · usually within 7 mi`);
  assert.equal(text(html({ budget: null, radiusMi: 12, cuisines: [] })), "Tuned to you · usually within 12 mi");
  assert.equal(text(html({ budget: { lo: 12, hi: 12 }, radiusMi: null, cuisines: [] })), "Tuned to you · $12 a plate");
  // The stored casing, as the cards below print it: acronyms, nationalities and dish names alike.
  // (`text` only strips tags, so the markup's escaped ampersand stays escaped.)
  assert.equal(text(html({ budget: null, radiusMi: null, cuisines: ["BBQ", "African", "Coffee & Tea"] })), "Tuned to you · BBQ, African, Coffee &amp; Tea");
  // Nothing to say, nothing printed: no "Tuned to you" on its own.
  assert.equal(html({ budget: null, radiusMi: null, cuisines: [] }, "x-line"), "");
  assert.deepEqual(profileParts({ budget: null, radiusMi: null, cuisines: [] }), []);
  // Every number is set in mono and the words are not swallowed.
  const digits = text(markup).match(/\d+/g).length;
  assert.equal((markup.match(/font-mono tabular-nums/g) ?? []).length, 2, "the range and the distance");
  assert.equal(digits, 3, "11, 18 and 7");
  assert.ok(!/\bmi\b/.test(markup.replace(mono("7 mi"), "")), "the unit stays inside the mono span");
  assert.ok(!/friend|follower/i.test(markup));

  // Both surfaces: the same component, mounted in the header, quiet and in the colours already there.
  const phone = stripComments(read("../src/components/mobile/PhoneTasteSection.tsx")).replace(/\r\n/g, "\n");
  const web = stripComments(read("../src/components/DiscoverBrowser.tsx"));
  for (const [name, src] of [["phone", phone], ["web", web]]) {
    assert.match(src, /import \{ ForMeProfileLine \} from "@\/components\/ForMeProfileLine"/, `${name} imports it`);
    assert.equal((src.match(/<ForMeProfileLine/g) ?? []).length, 1, `${name} mounts it once`);
    assert.match(src, /\{info\.profile && \(\s*<ForMeProfileLine\s+profile=\{info\.profile\}/, `${name} mounts it only with a profile`);
    // The header sentence carries a number ("From the 14 places you've been"), so it is set in mono like every other.
    assert.match(src, /import \{ ReasonText \} from "@\/components\/ReasonText"/, `${name} imports ReasonText`);
    assert.match(src, /<p[^>]*>\s*<ReasonText text=\{info\.header\} \/>\s*<\/p>/, `${name}: the header goes through ReasonText`);
    assert.ok(!/\{info\.header\}\s*<\/p>/.test(src), `${name}: no bare header text`);
  }
  {
    const { ReasonText } = await import("../src/components/ReasonText.tsx");
    const header = renderToStaticMarkup(createElement(ReasonText, { text: "From the 14 places you've been, plus Breakfast & Brunch" }));
    assert.equal(header, `From the ${mono("14")} places you&#x27;ve been, plus Breakfast &amp; Brunch`);
  }
  const phoneUse = /<ForMeProfileLine\s+profile=\{info\.profile\}\s+className="([^"]+)"/.exec(phone);
  assert.ok(phoneUse, "the phone passes a class");
  for (const cls of ["text-[13px]", "leading-snug", "text-pm-grey-text"]) assert.ok(phoneUse[1].split(" ").includes(cls), `phone line is ${cls}`);
  assert.ok(!/orange|zinc|bg-|border|shadow|uppercase|mono-label/.test(phoneUse[1]), "no new colours, no chrome");
  assert.ok(
    phone.indexOf("{info.header}") < phone.indexOf("<ForMeProfileLine") && phone.indexOf("<ForMeProfileLine") < phone.search(/Tune\s*<\/button>/),
    "phone: under the header sentence, ahead of the Tune button",
  );
  const webRow = 'className="mb-3 flex flex-wrap items-center gap-x-2 px-1 text-[13px] text-pm-grey-text"';
  const rowAt = web.indexOf(webRow);
  const webAt = web.indexOf("<ForMeProfileLine");
  assert.ok(rowAt > 0 && webAt > rowAt && !web.slice(rowAt, webAt).includes("</div>"), "web: inside the header row, which is already the quiet colour");
  const webUse = /<ForMeProfileLine\s+profile=\{info\.profile\}\s+className="([^"]+)"/.exec(web);
  assert.ok(webUse && webUse[1].split(" ").includes("basis-full"), "web: on a line of its own");
  assert.ok(!/orange|zinc|bg-|border|shadow|uppercase|mono-label/.test(webUse[1]));
  // Rendered with each surface's own class: the line is there, and it is the same sentence.
  assert.equal(text(html(full, phoneUse[1])), sentence);
  assert.equal(text(html(full, webUse[1])), sentence);
  assert.equal(html({ budget: null, radiusMi: null, cuisines: [] }, phoneUse[1]), "");
  assert.equal(html({ budget: null, radiusMi: null, cuisines: [] }, webUse[1]), "");
  // The component itself carries no colour, no star, no blend number.
  const comp = stripComments(read("../src/components/ForMeProfileLine.tsx"));
  assert.ok(!/orange|zinc|text-pm|star|blend|rating/i.test(comp));
  assert.match(comp, /import \{ ReasonText \} from "@\/components\/ReasonText"/);
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
    // comes after every main match of equal quality: the same cuisine on the side is
    // not the same pick. (Quality weighs 0.30 and the gate g can cost a poor place a
    // third, so an excellent side place may pass a poor main one on purpose.)
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
      const sc = new Map(v.sc.scored.map((x) => [x.r.id, x]));
      for (const id of mains) {
        for (const sd of sides) {
          const a = sc.get(id);
          const b = sc.get(sd);
          if (a.Q >= b.Q && a.G >= b.G) {
            assert.ok(
              v.res.rank.get(id) < v.res.rank.get(sd),
              `${cu}: a secondary-only place ranked above a main-cuisine one that is no worse on quality`,
            );
          }
        }
      }
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
    assert.equal(v.res.reasonOf(spots[0].id)?.text, "Ana and Ben have been");
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
  assert.ok(!JSON.stringify(publicPage).includes("Because you went to"), "nothing personal in the public page");
  assert.ok(!JSON.stringify(publicPage).includes("have been\""), "no friends line in the public page");
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
