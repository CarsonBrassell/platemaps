/*
 * Asserts the food personality wheel arithmetic (src/lib/personality.ts).
 *
 *   npm run personality:check
 *
 * Plain assertions over the pure module, same shape as tastematch:check.
 */
import assert from "node:assert/strict";
import {
  AVERAGE_RING,
  BASELINE,
  PERSONALITY_SPOKES,
  computePersonality,
  dishKey,
  dishNameKey,
  personalityStats,
} from "../src/lib/personality.ts";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const at = (p, s) => p.you[PERSONALITY_SPOKES.indexOf(s)];

/* Empty state below three posts. */
const none = { posts: 2, dishPosts: 2, tags: { s: 0, w: 0, d: 0, c: 0 }, visits: 2, places: 2, quickVisits: 0, foodieVisits: 0, cuisines: 1 };
assert.equal(computePersonality(none), null);

/* No dishes and no visits counted: every spoke is exactly average, on the ring. */
const blank = computePersonality({ ...none, posts: 3, dishPosts: 0, visits: 0, places: 0, cuisines: 0 });
for (const r of blank.you) near(r, AVERAGE_RING);

/* An eater at exactly the baseline rates sits on the ring too (shrinkage pulls toward the same point). */
const n = 1000;
const avg = computePersonality({
  posts: n, dishPosts: n,
  tags: { s: BASELINE["Spice Chaser"] * n, w: BASELINE.Wellness * n, d: BASELINE["Sweet Tooth"] * n, c: BASELINE["Classic American"] * n },
  visits: n, places: n - BASELINE.Regular * n, quickVisits: BASELINE["Quick Bite"] * n, foodieVisits: BASELINE.Foodie * n, cuisines: BASELINE.Adventurer * n,
});
for (const r of avg.you) near(r, AVERAGE_RING, 1e-6);

/* Calvin's real log (2026-11-18): Spice Chaser and Classic American lead, Regular is the floor. */
const me = computePersonality({ posts: 20, dishPosts: 20, tags: { s: 3, w: 1, d: 2, c: 9 }, visits: 20, places: 20, quickVisits: 9, foodieVisits: 2, cuisines: 12 });
assert.equal(me.top[0], "Spice Chaser");
assert.equal(me.least, "Regular");
near(at(me, "Regular"), 0.06);
assert.ok(at(me, "Classic American") > at(me, "Adventurer"));
assert.ok(at(me, "Adventurer") > AVERAGE_RING && at(me, "Quick Bite") < AVERAGE_RING);
for (const r of me.you) assert.ok(r >= 0.06 && r <= 1);

/* Stats: same place same day is one visit; foodie counts upscale too. */
const post = (o) => ({ tag: null, hasDish: true, placeKey: "a", day: "2026-11-01", cuisine: "Thai", kind: null, foodie: false, ...o });
const st = personalityStats([
  post({ tag: "s" }),
  post({ tag: "cd" }),
  post({ day: "2026-11-02", kind: "u" }),
  post({ placeKey: "b", hasDish: false, kind: "q", cuisine: "Mexican" }),
]);
assert.deepEqual(st.tags, { s: 1, w: 0, d: 1, c: 1 });
assert.equal(st.dishPosts, 3);
assert.equal(st.visits, 3);
assert.equal(st.places, 2);
assert.equal(st.quickVisits, 1);
assert.equal(st.foodieVisits, 1);
assert.equal(st.cuisines, 2);

/* Keys match the tagging run's fold. */
assert.equal(dishKey("Crème Brûlée!", "Vanilla  bean"), "creme brulee|vanilla bean");
assert.equal(dishKey("Taco", null), "taco|");
assert.equal(dishNameKey("Pad Thai"), "pad thai|*");

console.log("personality ok");
