/*
 * Asserts the "Your taste" scorer (src/lib/taste.ts).
 *
 *   npm run taste:check
 *
 * Two layers, no test framework (same shape as tastematch:check):
 *  1. A small deterministic corpus covers every case in probe/your-taste/DESIGN.md.
 *  2. The live corpus (read-only, the same SELECTs Discover runs) is replayed
 *     through the scorer for invariants. Skipped with a note if the database is
 *     unreachable, so the check still runs offline. No secret is ever printed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scoreTaste, chainKey, WEIGHTS, EMPTY_PREFS } from "../src/lib/taste.ts";

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
};

/* ---------- fixture ---------- */

let seq = 0;
const R = (name, cuisine, o = {}) => ({
  id: `r${++seq}`,
  name,
  cuisine,
  neighborhood: o.hood ?? "Downtown",
  rating: o.rating === undefined ? 4.6 : o.rating,
  reviewCount: o.reviews ?? 300,
  photo: "photo" in o ? o.photo : "p.jpg",
});

const corpus = [];
const add = (...rs) => {
  corpus.push(...rs);
  return rs;
};
const jp = add(...Array.from({ length: 14 }, (_, i) => R(`Sushi${i} Kitchen`, "Japanese")));
const th = add(...Array.from({ length: 14 }, (_, i) => R(`Pad${i} Noodle`, "Thai")));
const bg = add(...Array.from({ length: 4 }, (_, i) => R(`Patty${i} Grill`, "Burgers")));
const rubios = add(
  R("Rubio's Baja Grill La Jolla", "Mexican"),
  R("Rubio's Baja Grill Pacific Beach", "Mexican"),
  R("Rubio's Baja Grill Mission Valley", "Mexican"),
);
const tajima = add(R("Tajima Ramen East Village", "Japanese"), R("Tajima Ramen Convoy", "Japanese"));
const mendo = add(R("Mendocino Farms Downtown", "Sandwiches"), R("Mendocino Farms UTC", "Sandwiches"));
const [nullCuisine] = add(R("Mystery Kitchen", null, { rating: 5 }));
const plates = {};
const base = { restaurants: corpus, plates, prefs: EMPTY_PREFS, postedIds: [], friendVisits: [] };
const run = (o = {}) => scoreTaste({ ...base, ...o });
const prefs = (p) => ({ ...EMPTY_PREFS, ...p });
const ids = (res) => res.picks.map((p) => p.restaurant.id);

/* ---------- design cases ---------- */

ok("no signal", () => {
  const res = run();
  assert.equal(res.basis, "none");
  assert.deepEqual(res.picks, []);
  assert.equal(res.header, "");
});

ok("1-2 visits is not history", () => {
  const res = run({ postedIds: [jp[0].id, jp[1].id] });
  assert.equal(res.basis, "none");
  assert.deepEqual(res.picks, []);
  assert.equal(res.counts.visited, 2);
});

ok(">=3 visits is history", () => {
  const res = run({ postedIds: [jp[0].id, jp[1].id, th[0].id] });
  assert.equal(res.basis, "history");
  assert.match(res.header, /^Based on 3 places you've been/);
  assert.equal(res.picks[0].restaurant.cuisine, "Japanese", "most-visited cuisine leads");
  assert.ok(res.picks.every((p) => !["r1", "r2", th[0].id].includes(p.restaurant.id) || false));
  assert.equal(res.picks[0].reason.kind, "history");
});

ok("friends-only", () => {
  const res = run({
    friendVisits: [{ restaurantId: bg[0].id, friendId: "f1", name: "Sam Lee" }],
  });
  assert.equal(res.basis, "friends");
  assert.equal(res.header, "Where your friends eat");
  assert.deepEqual(ids(res), [bg[0].id]);
  assert.equal(res.picks[0].reason.kind, "friend");
  assert.match(res.picks[0].reason.text, /^Sam posted here/);
  assert.ok(!res.picks[0].reason.text.includes("Lee"), "first name only");
});

ok("two friends at one place", () => {
  const res = run({
    friendVisits: [
      { restaurantId: bg[0].id, friendId: "f1", name: "Sam Lee" },
      { restaurantId: bg[0].id, friendId: "f2", name: "Ana Ruiz" },
      { restaurantId: bg[0].id, friendId: "f2", name: "Ana Ruiz" },
    ],
  });
  assert.match(res.picks[0].reason.text, /\+ 1 friend/);
});

ok("picks-only", () => {
  const res = run({ prefs: prefs({ loves: ["Japanese"] }) });
  assert.equal(res.basis, "starting");
  assert.ok(res.picks.length > 0);
  assert.ok(res.picks.every((p) => p.restaurant.cuisine === "Japanese"));
  assert.equal(res.picks[0].reason.kind, "picked");
  assert.equal(res.header, "Based on your picks");
});

ok("visited and hidden are excluded", () => {
  const res = run({
    prefs: prefs({ loves: ["Thai"], been: [th[0].id], hidden: [th[1].id] }),
    postedIds: [th[2].id],
  });
  const got = new Set(ids(res));
  for (const x of [th[0], th[1], th[2]]) assert.ok(!got.has(x.id), `${x.name} leaked`);
  assert.ok(got.size > 0);
});

ok("skipped cuisine never appears", () => {
  const res = run({
    prefs: prefs({ loves: ["Japanese", "Thai"], skips: ["Japanese"] }),
    friendVisits: [{ restaurantId: jp[5].id, friendId: "f1", name: "Sam" }],
  });
  assert.ok(res.picks.every((p) => p.restaurant.cuisine !== "Japanese"));
});

ok("chain branches collapse to one", () => {
  assert.equal(chainKey(rubios[0]), chainKey(rubios[2]));
  assert.equal(chainKey(tajima[0]), chainKey(tajima[1]));
  assert.equal(chainKey(mendo[0]), chainKey(mendo[1]));
  assert.notEqual(chainKey(jp[0]), chainKey(th[0]));
  const res = run({ prefs: prefs({ loves: ["Mexican", "Sandwiches"] }) });
  const jpRes = run({ prefs: prefs({ loves: ["Japanese"] }) });
  assert.equal(jpRes.picks.filter((p) => p.restaurant.name.startsWith("Tajima")).length, 1);
  const keys = res.picks.map((p) => chainKey(p.restaurant));
  assert.equal(new Set(keys).size, keys.length, "duplicate chain key in picks");
  const names = res.picks.map((p) => p.restaurant.name);
  assert.equal(names.filter((x) => x.startsWith("Rubio")).length, 1);
  assert.equal(names.filter((x) => x.startsWith("Mendocino")).length, 1);
});

ok("per-cuisine cap with 2+ cuisines", () => {
  const res = run({ prefs: prefs({ loves: ["Japanese", "Thai"] }) });
  const cap = Math.ceil(WEIGHTS.cuisineCapShare * WEIGHTS.defaultLimit);
  for (const c of ["Japanese", "Thai"]) {
    const k = res.picks.filter((p) => p.restaurant.cuisine === c).length;
    assert.ok(k <= cap && k > 0, `${c}: ${k} vs cap ${cap}`);
  }
  assert.ok(res.picks.length <= WEIGHTS.maxLimit);
});

ok("interleaves cuisines and leads with photo cards", () => {
  const res = run({ prefs: prefs({ loves: ["Japanese", "Thai"] }) });
  const cs = res.picks.slice(0, 6).map((p) => p.restaurant.cuisine);
  for (let i = 1; i < cs.length; i++) assert.notEqual(cs[i], cs[i - 1], `adjacent ${cs}`);
  assert.deepEqual(new Set(cs), new Set(["Japanese", "Thai"]));
  const mx = [R("NoPhoto Taco", "Mexican", { photo: null }), R("Photo Taco", "Mexican")];
  const res2 = scoreTaste({
    ...base,
    restaurants: mx,
    prefs: prefs({ loves: ["Mexican"] }),
  });
  assert.equal(res2.picks[0].restaurant.name, "Photo Taco");
  assert.equal(res2.picks.length, 2, "photo-less places stay");
});

ok("no cap with a single scoring cuisine", () => {
  const res = run({ prefs: prefs({ loves: ["Thai"] }) });
  assert.equal(res.picks.length, th.length);
});

ok("blocked friends are excluded upstream of the scorer", () => {
  // The scorer trusts friendVisits; the filter is in getFriendRestaurantVisits.
  const src = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const i = src.indexOf("export async function getFriendRestaurantVisits");
  assert.ok(i > 0, "getFriendRestaurantVisits missing");
  const body = src.slice(i, src.indexOf("\nexport ", i + 10));
  assert.ok(body.includes("getBlockedEitherWayIds"), "blocks not subtracted");
  assert.ok(body.includes("getFriendIds"), "mutual friends not used");
});

ok("NULL cuisine is never ranked by cuisine", () => {
  const loved = run({ prefs: prefs({ loves: ["Japanese"] }) });
  assert.ok(!ids(loved).includes(nullCuisine.id));
  const hist = run({ postedIds: [jp[0].id, jp[1].id, jp[2].id] });
  assert.ok(!ids(hist).includes(nullCuisine.id));
  // But a friend can still surface it.
  const fr = run({ friendVisits: [{ restaurantId: nullCuisine.id, friendId: "f1", name: "Sam" }] });
  assert.deepEqual(ids(fr), [nullCuisine.id]);
});

ok("a secondary cuisine is not a match in Your taste", () => {
  // Your taste counts the main cuisine only. A place that lists a loved cuisine on
  // the side (For me counts that at a discount, as "Also serves") never qualifies
  // here, not even to pad a short list.
  const side = { ...R("Corner Bar & Grill", "American"), cuisineSecondary: ["Burgers", "Thai"] };
  const withSide = [...corpus, side];
  const thai = run({ restaurants: withSide, prefs: prefs({ loves: ["Thai"] }) });
  assert.ok(!ids(thai).includes(side.id), "a secondary Thai place was picked");
  assert.deepEqual(ids(thai), ids(run({ prefs: prefs({ loves: ["Thai"] }) })), "its presence changes nothing");
  const burgers = run({ restaurants: withSide, prefs: prefs({ loves: ["Burgers"] }) });
  assert.ok(!ids(burgers).includes(side.id), "a secondary Burgers place padded the list");
  assert.equal(burgers.picks.length, bg.length);
  const hist = run({ restaurants: withSide, postedIds: [th[0].id, th[1].id, th[2].id] });
  assert.ok(!ids(hist).includes(side.id), "history matched on a secondary cuisine");
});

ok("never pads under 6", () => {
  const res = run({ prefs: prefs({ loves: ["Burgers"] }) });
  assert.equal(res.picks.length, bg.length);
  assert.ok(res.picks.length < WEIGHTS.minPicksToShow);
  assert.ok(res.picks.every((p) => p.restaurant.cuisine === "Burgers"));
});

ok("ratings and plates only order, never qualify", () => {
  const low = R("Zed Thai", "Thai", { rating: null, reviews: 0 });
  const res = scoreTaste({
    ...base,
    restaurants: [...corpus, low],
    prefs: prefs({ loves: ["Thai"] }),
  });
  assert.ok(ids(res).includes(low.id), "unrated place still eligible");
  assert.equal(res.picks.at(-1).restaurant.id, low.id, "but ranks last");
});

ok("deterministic", () => {
  const a = run({ prefs: prefs({ loves: ["Japanese", "Thai"] }) });
  const b = run({ prefs: prefs({ loves: ["Japanese", "Thai"] }) });
  assert.deepEqual(ids(a), ids(b));
});

console.log(`taste:check  ${n} fixture cases ok`);

/* ---------- live corpus (read-only) ---------- */

async function live() {
  try {
    process.loadEnvFile(new URL("../.env.local", import.meta.url));
  } catch {
    /* env may already be set */
  }
  if (!process.env.DATABASE_URL) return console.log("taste:check  live corpus skipped (no DATABASE_URL)");
  let c;
  try {
    const { loadCorpus } = await import("../src/lib/discover.ts");
    c = await loadCorpus();
  } catch {
    return console.log("taste:check  live corpus skipped (database unreachable)");
  }
  const { restaurants, plates: lp } = c;
  const cuisines = [...new Set(restaurants.map((r) => r.cuisine).filter(Boolean))];
  const byCuisine = (x) => restaurants.filter((r) => r.cuisine === x);
  const top = cuisines.sort((a, b) => byCuisine(b).length - byCuisine(a).length).slice(0, 4);
  assert.ok(top.length >= 2, "live corpus has cuisines");

  let m = 0;
  const live = (o) => scoreTaste({ restaurants, plates: lp, prefs: EMPTY_PREFS, postedIds: [], friendVisits: [], ...o });
  const invariants = (label, res, o) => {
    const keys = res.picks.map((p) => chainKey(p.restaurant));
    assert.equal(new Set(keys).size, keys.length, `${label}: chain duplicate`);
    assert.ok(res.picks.length <= WEIGHTS.maxLimit, `${label}: over limit`);
    const hidden = new Set(o.prefs?.hidden ?? []);
    const seen = new Set([...(o.postedIds ?? []), ...(o.prefs?.been ?? [])]);
    for (const p of res.picks) {
      assert.ok(!hidden.has(p.restaurant.id) && !seen.has(p.restaurant.id), `${label}: excluded id leaked`);
      assert.ok(!(o.prefs?.skips ?? []).includes(p.restaurant.cuisine), `${label}: skipped cuisine`);
      assert.ok(p.reason.text && p.reason.short, `${label}: empty reason`);
    }
    m++;
  };

  // Picks-only on every top cuisine, and a pair for the cap.
  for (const c1 of top) {
    const o = { prefs: prefs({ loves: [c1] }) };
    const res = live(o);
    assert.equal(res.basis, "starting");
    assert.ok(res.picks.every((p) => p.restaurant.cuisine === c1));
    invariants(`loves ${c1}`, res, o);
  }
  {
    const o = { prefs: prefs({ loves: top.slice(0, 2), skips: [top[2]] }) };
    const res = live(o);
    const cap = Math.ceil(WEIGHTS.cuisineCapShare * WEIGHTS.defaultLimit);
    for (const c1 of top.slice(0, 2)) {
      assert.ok(res.picks.filter((p) => p.restaurant.cuisine === c1).length <= cap, `cap ${c1}`);
    }
    assert.ok(!res.picks.some((p) => p.restaurant.cuisine === top[2]));
    assert.ok(res.picks.every((p) => p.restaurant.cuisine), "NULL cuisine ranked by cuisine");
    invariants("pair", res, o);
  }
  // History: three places in the biggest cuisine, one in the next.
  {
    const mine = [...byCuisine(top[0]).slice(0, 3), ...byCuisine(top[1]).slice(0, 1)].map((r) => r.id);
    const o = { postedIds: mine };
    const res = live(o);
    assert.equal(res.basis, "history");
    assert.equal(res.counts.visited, 4);
    invariants("history", res, o);
  }
  // Rubio's-style chains in the live data: one branch each.
  {
    const o = { prefs: prefs({ loves: ["Mexican"] }) };
    const res = live(o);
    const rubio = res.picks.filter((p) => /^rubio/i.test(p.restaurant.name));
    assert.ok(rubio.length <= 1, "Rubio's branches not collapsed");
    invariants("mexican", res, o);
  }
  console.log(`taste:check  ${m} live-corpus cases ok (${restaurants.length} restaurants)`);
}

await live();
process.exit(0);
