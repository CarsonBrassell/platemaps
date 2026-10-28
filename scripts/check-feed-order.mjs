/*
 * Asserts the shape of the Trending order.
 *
 *   npm run feed:check
 *
 * No test framework here, so same shape as tastematch:check: plain assertions
 * over the pure module, exits non-zero on the first regression. `trendingScore`
 * in lib/feedSort.ts is the JS twin of the TRENDING_SCORE SQL in lib/db.ts, so
 * these cases are the spec for both — if you retune the three constants, this
 * is the file that says whether the tab still does what it claims.
 *
 * Every case names a plate as (age, net votes). A brand-new plate is net +1,
 * because publishing seeds the author's own upvote.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  trendingScore,
  TRENDING_COMMENT_WEIGHT,
  TRENDING_EDGE,
  TRENDING_GRAVITY,
  TRENDING_WINDOW_HOURS,
} from "../src/lib/feedSort.ts";

const H = 1;
const D = 24;

// A plate by age in hours and net votes (up, down) -> score.
const plate = (ageHours, net, down = 0) => trendingScore({ up: net + down, down, ageHours });
const beats = (a, b, why) => assert.ok(a > b, `${why}: ${a} !> ${b}`);
const near = (a, b, tol, why) => assert.ok(Math.abs(a / b - 1) <= tol, `${why}: ${a} !~ ${b}`);

const NEW_PLUS_1 = plate(0, 1);
const NEW_ZERO = plate(0, 0);

// Inside the first day the order is net votes, whichever plate is newer.
beats(plate(20 * H, 3), plate(0.5 * H, 1), "20h +3 beats 0.5h +1");
beats(plate(12 * H, 5), plate(1 * H, 2), "12h +5 beats 1h +2");
beats(plate(18 * H, 2), plate(0.1 * H, 1), "18h +2 beats a minutes-old +1");
// ...and at equal net, newest first.
beats(plate(1 * H, 2), plate(10 * H, 2), "equal net: 1h beats 10h");
beats(plate(0, 1), plate(6 * H, 1), "equal net: brand new beats 6h");

// Past the window a plate has to be genuinely popular to hold on.
beats(NEW_PLUS_1, plate(3 * D, 2), "brand-new +1 beats 3d +2");
beats(NEW_PLUS_1, plate(5 * D, 30), "brand-new +1 beats 5d +30");
beats(NEW_PLUS_1, plate(7 * D, 10), "brand-new +1 beats 7d +10");
beats(plate(2 * D, 40), NEW_PLUS_1, "2d +40 beats brand-new +1");
beats(plate(7 * D, 100), NEW_ZERO, "7d +100 beats brand-new 0");
// A week of hold needs roughly +160: that is where it meets a fresh +1.
near(plate(7 * D, 160), NEW_PLUS_1, 0.05, "7d +160 roughly ties brand-new +1");

// The hold-time table in feedSort.ts: net N stays above a new +1 until ~Xh.
const holdsUntil = (net) => {
  let lo = 0;
  let hi = 5000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (plate(mid, net) >= NEW_PLUS_1) lo = mid;
    else hi = mid;
  }
  return lo;
};
for (const [net, hours] of [[2, 27], [4, 36], [10, 51], [30, 81], [100, 137], [160, 169]]) {
  assert.ok(Math.abs(holdsUntil(net) - hours) < 1, `+${net} holds ~${hours}h, got ${holdsUntil(net).toFixed(1)}`);
}

// Downvoted plates sink below a brand-new zero-vote plate, at any age...
for (const age of [0, 1, 24, 72, 24 * 30]) {
  beats(NEW_ZERO, plate(age, -1), `brand-new 0 beats ${age}h -1`);
  beats(NEW_ZERO, plate(age, -5), `brand-new 0 beats ${age}h -5`);
}
// ...and worse is always lower than less bad at the same age.
for (const age of [0, 1, 24, 72, 24 * 30]) {
  beats(plate(age, -1), plate(age, -3), `${age}h: -1 above -3`);
  beats(plate(age, -3), plate(age, -5), `${age}h: -3 above -5`);
}
// The documented values of the vote term at age 0.
near(plate(0, -1), 0.25, 1e-9, "-1 -> 0.25");
near(plate(0, -3), 0.0625, 1e-9, "-3 -> 0.0625");
near(plate(0, -5), 1 / 36, 1e-9, "-5 -> 1/36");
// Upvotes and downvotes net out; the split between them is irrelevant.
assert.equal(plate(10, 2, 0), trendingScore({ up: 7, down: 5, ageHours: 10 }));

// Always finite and positive over the whole range the feed can reach.
for (let age = 0; age <= 1440; age += 6) {
  for (const net of [-50, -10, -5, -3, -1, 0, 1, 2, 4, 10, 100, 1000]) {
    const s = plate(age, net);
    assert.ok(Number.isFinite(s) && s > 0, `finite and > 0 at ${age}h net ${net}, got ${s}`);
  }
}

// A post stamped slightly after the scroll clock scores as brand new.
assert.equal(plate(-0.001, 1), plate(0, 1));
assert.equal(plate(-5, 3), plate(0, 3));

// Comments carry no weight today (TRENDING_COMMENT_WEIGHT = 0).
assert.equal(trendingScore({ up: 2, down: 0, comments: 50, ageHours: 5 }), plate(5, 2));

// The SQL twin in lib/db.ts. Everything above runs the JS function only, so a
// retune that broke the SQL text would still print "feed order ok" without
// this. Take the TRENDING_SCORE text out of db.ts with the real constants
// substituted (the same extraction probe/trending-2026-10-27/verify-impl.mjs
// runs against the database) and check the one thing the constants can break
// silently: the decay exponent. Written as `-GRAVITY / EDGE` inside the SQL it
// is integer division when both are integers (`-3 / 6` is 0, so POWER(x, 0) is 1
// and the decay is off); it must reach Postgres as a single literal equal to
// the JS exponent.
{
  const dbSrc = fs
    .readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/db.ts"), "utf8")
    .replace(/\r\n/g, "\n");
  const start = dbSrc.indexOf("const TRENDING_NET = ");
  const end = dbSrc.indexOf("export const FEED_PAGE_SIZE");
  assert.ok(start > 0 && end > start, "could not locate TRENDING_NET..FEED_PAGE_SIZE in db.ts");
  const sql = new Function(
    "TRENDING_COMMENT_WEIGHT",
    "TRENDING_EDGE",
    "TRENDING_GRAVITY",
    "TRENDING_WINDOW_HOURS",
    `${dbSrc.slice(start, end)}\nreturn TRENDING_SCORE;`,
  )(TRENDING_COMMENT_WEIGHT, TRENDING_EDGE, TRENDING_GRAVITY, TRENDING_WINDOW_HOURS);
  const tail = /,\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\)\)::float8\s*$/i.exec(sql);
  assert.ok(tail, `TRENDING_SCORE must end in POWER(<base>, <one numeric literal>)::float8; ends ...${sql.slice(-90)}`);
  const want = -TRENDING_GRAVITY / TRENDING_EDGE;
  assert.ok(
    Math.abs(Number(tail[1]) / want - 1) < 1e-12,
    `SQL decay exponent ${tail[1]} !~ JS -GRAVITY/EDGE ${want}`,
  );
  assert.ok(
    !/(^|[^\w.])-?\d+\s*\/\s*\d+(?![\w.])/.test(sql),
    "TRENDING_SCORE divides two integer literals; Postgres would truncate the result",
  );
}

console.log("feed order ok");
