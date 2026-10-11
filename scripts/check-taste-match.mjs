/*
 * Asserts the Taste match arithmetic.
 *
 *   npm run tastematch:check
 *
 * No test framework here, so same shape as moderation:check: plain assertions
 * over the pure module, exits non-zero on the first regression.
 */
import assert from "node:assert/strict";
import { computeFlavorProfile, computeTasteMatch, tasteInputFor } from "../src/lib/tasteMatch.ts";

const input = (counts, topPlaces = {}) => ({ counts, topPlaces });
const place = (id, name, count = 1) => ({ id, name, count });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

// Identical mixes overlap completely, whatever the volumes.
let m = computeTasteMatch(input({ A: 2, B: 2, C: 2 }), input({ A: 20, B: 20, C: 20 }));
assert.equal(m.matchPct, 100);
assert.equal(m.tryPick, null);

// Nothing in common is 0, and bothLove is empty.
m = computeTasteMatch(input({ A: 3, B: 3, C: 3 }), input({ D: 3, E: 3, F: 3 }));
assert.equal(m.matchPct, 0);
assert.deepEqual(m.bothLove, []);

// The match counts every cuisine, not just the 8 drawn: 10 cuisines, shared evenly.
const ten = Object.fromEntries("ABCDEFGHIJ".split("").map((c) => [c, 3]));
m = computeTasteMatch(input(ten), input(ten));
assert.equal(m.spokes.length, 8);
assert.equal(m.matchPct, 100);

// Sample from the design review.
const you = input({ Mexican: 22, Japanese: 18, Italian: 9, Thai: 12, Korean: 14, Indian: 4, American: 15, Mediterranean: 6 });
const sam = input(
  { Mexican: 20, Japanese: 10, Italian: 6, Thai: 8, Korean: 6, Indian: 18, American: 12, Mediterranean: 20 },
  { Indian: place("i1", "Himalayan Kitchen", 7), Mediterranean: place("m1", "Olive & Thyme", 9) },
);
m = computeTasteMatch(you, sam);
assert.equal(m.spokes.length, 8);
assert.equal(m.matchPct, 72);
assert.deepEqual(m.bothLove, ["Mexican", "American"]);
assert.equal(m.tryPick.cuisine, "Mediterranean");
assert.equal(m.tryPick.restaurantId, "m1");
near(m.you.reduce((a, b) => a + b, 0), 100);
near(m.them.reduce((a, b) => a + b, 0), 100);

// Shares, not counts: a heavy poster doesn't change the shape.
const light = computeTasteMatch(input({ A: 1, B: 1, C: 2 }), sam);
const heavy = computeTasteMatch(input({ A: 10, B: 10, C: 20 }), sam);
assert.equal(light.matchPct, heavy.matchPct);

// Empty states.
assert.equal(computeTasteMatch(input({ A: 1, B: 1 }), sam), null, "under 3 posts");
assert.equal(computeTasteMatch(you, input({ A: 2 })), null, "friend under 3 posts");
assert.equal(computeTasteMatch(input({ A: 3 }), input({ A: 3, B: 3 })), null, "under 3 spokes");

// tryPick skips a cuisine with no listed restaurant and takes the next gap.
m = computeTasteMatch(input({ A: 6, B: 2, C: 2 }), input({ A: 1, B: 3, C: 1, D: 5 }, { B: place("b1", "Bee's") }));
assert.equal(m.tryPick.restaurantId, "b1");

// Row folding: top place per cuisine, unlisted ones count but are never the pick.
const rows = [
  { userId: "u", cuisine: "Thai", restaurantId: "t1", restaurantName: "T1", listed: true, count: 2 },
  { userId: "u", cuisine: "Thai", restaurantId: "t2", restaurantName: "T2", listed: false, count: 5 },
  { userId: "u", cuisine: "Thai", restaurantId: "t3", restaurantName: "T3", listed: true, count: 2 },
  { userId: "v", cuisine: "Thai", restaurantId: "t9", restaurantName: "T9", listed: true, count: 9 },
];
const folded = tasteInputFor(rows, "u");
assert.equal(folded.counts.Thai, 9);
assert.equal(folded.topPlaces.Thai.id, "t1");

// Flavor profile: your own mix, top cuisines by share, nothing about a friend.
let f = computeFlavorProfile(you);
assert.equal(f.spokes.length, 8);
assert.deepEqual(f.spokes.slice(0, 3), ["Mexican", "Japanese", "American"]);
assert.deepEqual(f.topCuisines, ["Mexican", "Japanese", "American"]);
assert.equal(f.cuisineCount, 8);
near(f.you.reduce((a, b) => a + b, 0), 100);
assert.ok(f.you.every((v, i, a) => i === 0 || a[i - 1] >= v), "spokes sorted by share");
assert.equal(f.axisMax, 25); // Mexican is 22% of posts; the ring rounds up to a 5

// Only the top 8 are drawn, but "cuisines tried" counts all of them; ties break A-Z.
f = computeFlavorProfile(input(ten));
assert.equal(f.spokes.length, 8);
assert.deepEqual(f.spokes, "ABCDEFGH".split(""));
assert.deepEqual(f.topCuisines, ["A", "B", "C"]);
assert.equal(f.cuisineCount, 10);
near(f.you[0], 10);
assert.equal(f.axisMax, 10);

// Shares, not counts: a heavy poster gets the same shape.
const fLight = computeFlavorProfile(input({ A: 1, B: 1, C: 2 }));
const fHeavy = computeFlavorProfile(input({ A: 10, B: 10, C: 20 }));
assert.deepEqual(fLight.you, fHeavy.you);
assert.deepEqual(fLight.topCuisines, ["C", "A", "B"]);

// A zero count is not a cuisine tried.
assert.equal(computeFlavorProfile(input({ A: 3, B: 3, C: 0 })), null, "zero counts don't make a spoke");

// Empty states.
assert.equal(computeFlavorProfile(input({ A: 1, B: 1 })), null, "under 3 posts");
assert.equal(computeFlavorProfile(input({})), null, "no posts");
assert.equal(computeFlavorProfile(input({ A: 5, B: 5 })), null, "under 3 cuisines");
assert.ok(computeFlavorProfile(input({ A: 1, B: 1, C: 1 })), "exactly 3 posts and 3 cuisines is enough");


console.log("taste match: all cases pass");
