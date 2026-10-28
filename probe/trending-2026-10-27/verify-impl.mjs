/**
 * SQL/JS parity check for the shipped Trending score. READ-ONLY (SELECTs only).
 *
 *   node --env-file=.env.local --import tsx probe/trending-2026-10-27/verify-impl.mjs
 *
 * Nothing is transcribed by hand:
 *   - the JS side is `trendingScore` and the four constants imported from
 *     src/lib/feedSort.ts;
 *   - the SQL side is the text of `TRENDING_NET` / `TRENDING_SCORE` read out of
 *     src/lib/db.ts and evaluated with those same constants substituted, so the
 *     expression run here is byte-for-byte what getDiscoverFeed runs.
 *
 * A. Live data: every Discover-eligible post (meal_id IS NULL, inside the 60-day
 *    window of the scroll clock), scored in SQL with the same joins the feed
 *    uses, compared per row against `trendingScore`, then compared as a full
 *    ordering. Run at several clocks so ages span negative (clamped) to ~60d.
 * B. Boundary grid: net x age cases the 48 real posts never reach (net -50..
 *    +1000, ages -1h..60d), through the same SQL aliases (p, uv, dv, cm).
 * C. End to end: the real getDiscoverFeed paged with the real keyset cursor
 *    against the one fixed `at`, ids compared to the JS ordering; the "new" sort
 *    compared to created_at DESC, id DESC.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import {
  trendingScore,
  TRENDING_COMMENT_WEIGHT,
  TRENDING_EDGE,
  TRENDING_GRAVITY,
  TRENDING_WINDOW_HOURS,
} from "../../src/lib/feedSort.ts";
import { FEED_WINDOW_DAYS } from "../../src/lib/feedWindow.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_TS = path.resolve(HERE, "../../src/lib/db.ts");
const TOL = 1e-6;
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  FAIL ${msg}`);
};

// ---- the SQL text, taken from db.ts ------------------------------------------------
const src = fs.readFileSync(DB_TS, "utf8").replace(/\r\n/g, "\n");
const start = src.indexOf("const TRENDING_NET = ");
const end = src.indexOf("export const FEED_PAGE_SIZE");
assert.ok(start > 0 && end > start, "could not locate TRENDING_NET..FEED_PAGE_SIZE in db.ts");
const block = src.slice(start, end);
assert.deepEqual(block.match(/^const [A-Z_]+ = /gm), ["const TRENDING_NET = ", "const TRENDING_SCORE = "]);
// The db.ts text with a chosen set of constants substituted (section D retunes them).
const buildScore = (commentWeight, edge, gravity, windowHours) =>
  new Function(
    "TRENDING_COMMENT_WEIGHT",
    "TRENDING_EDGE",
    "TRENDING_GRAVITY",
    "TRENDING_WINDOW_HOURS",
    `${block}\nreturn TRENDING_SCORE;`,
  )(commentWeight, edge, gravity, windowHours);
const TRENDING_SCORE = buildScore(TRENDING_COMMENT_WEIGHT, TRENDING_EDGE, TRENDING_GRAVITY, TRENDING_WINDOW_HOURS);
assert.deepEqual([...new Set(TRENDING_SCORE.match(/\$\d+/g))], ["$1"], "TRENDING_SCORE must bind only $1");
assert.ok(!/cm\.count/.test(TRENDING_SCORE) || TRENDING_COMMENT_WEIGHT > 0, "comment term present while weight is 0");
console.log("constants: window", TRENDING_WINDOW_HOURS, "edge", TRENDING_EDGE, "gravity", TRENDING_GRAVITY, "commentWeight", TRENDING_COMMENT_WEIGHT, "feedWindowDays", FEED_WINDOW_DAYS);
console.log("SQL under test (from db.ts, constants substituted):\n" + TRENDING_SCORE.replace(/^/gm, "    ") + "\n");

// ---- read-only database access -----------------------------------------------------
const rawSql = neon(process.env.DATABASE_URL);
const q = (text, params = []) => {
  assert.ok(/^\s*(SELECT|WITH)\b/i.test(text), "read-only script: statement must start with SELECT/WITH");
  assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i.test(text), "read-only script: write keyword in statement");
  return rawSql.query(text, params);
};

// Postgres "2026-10-20 12:34:56.123456+00" -> epoch microseconds (BigInt), no precision loss.
function micros(text) {
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?(?:([+-])(\d\d)(?::?(\d\d))?)?$/.exec(text);
  assert.ok(m, `unparseable timestamp ${text}`);
  const secs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
  const frac = BigInt((m[7] ?? "").padEnd(6, "0") || "0");
  const off = m[8] ? (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 3600 + Number(m[10] ?? 0) * 60) : 0;
  return BigInt(secs - off) * 1_000_000n + frac;
}

// The feed query's shape (db.ts getDiscoverFeed), blocked list empty, no cursor.
const FEED_SQL = `SELECT * FROM (
   SELECT p.id, p.created_at::text AS created_at_text,
          COALESCE(uv.count, 0)::int AS up, COALESCE(dv.count, 0)::int AS down, COALESCE(cm.count, 0)::int AS comments,
          ${TRENDING_SCORE} AS rank_score
   FROM posts p
   JOIN users u ON u.id = p.user_id
   LEFT JOIN (SELECT post_id, count(*) AS count FROM post_upvotes GROUP BY post_id) uv ON uv.post_id = p.id
   LEFT JOIN (SELECT post_id, count(*) AS count FROM post_downvotes GROUP BY post_id) dv ON dv.post_id = p.id
   LEFT JOIN (SELECT post_id, count(*) AS count FROM comments GROUP BY post_id) cm ON cm.post_id = p.id
   WHERE p.user_id != ALL($2)
     AND p.meal_id IS NULL
     AND p.created_at > $1::timestamptz - make_interval(days => ${FEED_WINDOW_DAYS})
 ) s
 ORDER BY s.rank_score DESC, s.id DESC`;

async function scoreAt(atIso) {
  const rows = await q(FEED_SQL, [atIso, []]);
  const atUs = BigInt(Date.parse(atIso)) * 1000n;
  return rows.map((r) => {
    const ageHours = Number(atUs - micros(r.created_at_text)) / 3.6e9;
    const js = trendingScore({ up: r.up, down: r.down, comments: r.comments, ageHours });
    return { id: r.id, up: r.up, down: r.down, comments: r.comments, ageHours, sql: Number(r.rank_score), js };
  });
}

const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), Number.MIN_VALUE));
// JS ordering with the feed's tie-break (id DESC, plain code-unit compare).
const jsOrder = (rows) => [...rows].sort((a, b) => (b.js - a.js) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

function compareRows(label, rows) {
  let max = 0;
  let worst = null;
  let sum = 0;
  for (const r of rows) {
    const d = rel(r.sql, r.js);
    sum += d;
    if (d > max) (max = d), (worst = r);
  }
  const finite = rows.every((r) => Number.isFinite(r.sql) && r.sql > 0 && Number.isFinite(r.js) && r.js > 0);
  const ok = max < TOL && finite;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}: n=${rows.length}  max rel diff=${max.toExponential(2)}  mean=${(sum / Math.max(rows.length, 1)).toExponential(2)}  (tol ${TOL})`,
  );
  if (!ok) {
    failures++;
    if (!finite) console.log("       non-finite or non-positive score present");
    if (worst) console.log("       worst:", JSON.stringify(worst));
  }
  return max;
}

function compareOrdering(label, rows) {
  const sqlIds = rows.map((r) => r.id); // already ORDER BY rank_score DESC, id DESC in SQL
  const js = jsOrder(rows);
  const jsIds = js.map((r) => r.id);
  const exact = sqlIds.length === jsIds.length && sqlIds.every((id, i) => id === jsIds[i]);
  let note = "";
  if (!exact) {
    // Allowed only if every disagreement is a tie / ulp-level near-tie.
    const jsPos = new Map(jsIds.map((id, i) => [id, i]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    let bad = 0;
    for (let i = 0; i + 1 < sqlIds.length; i++) {
      const a = byId.get(sqlIds[i]);
      const b = byId.get(sqlIds[i + 1]);
      if (jsPos.get(a.id) > jsPos.get(b.id) && rel(a.js, b.js) > 1e-12) bad++;
    }
    note = bad === 0 ? " (differs only among exact/ulp ties)" : ` (${bad} adjacent pairs genuinely out of order)`;
    if (bad) failures++;
  }
  console.log(`  ${exact || !note.includes("genuinely") ? "ok  " : "FAIL"} ${label}: ordering of ${rows.length} posts, SQL vs JS ${exact ? "IDENTICAL" : "differs"}${note}`);
  return { exact, jsIds, sqlIds };
}

// ---- A. live data ------------------------------------------------------------------
console.log("A. live eligible posts (SQL TRENDING_SCORE vs trendingScore)");
const base = Date.now();
const D = 86_400_000;
const clocks = [
  ["now", base],
  ["now-10d (posts newer than the clock => negative age, clamped to 0)", base - 10 * D],
  ["now-30d", base - 30 * D],
  ["now+3d", base + 3 * D],
  ["now+20d (oldest posts age out of the window)", base + 20 * D],
  ["now+45d", base + 45 * D],
];
let totalRows = 0;
let globalMax = 0;
let sawNegative = false;
for (const [label, ms] of clocks) {
  const at = new Date(ms).toISOString();
  const rows = await scoreAt(at);
  totalRows += rows.length;
  if (rows.some((r) => r.ageHours < 0)) sawNegative = true;
  const ages = rows.map((r) => r.ageHours);
  const nets = rows.map((r) => r.up - r.down);
  console.log(
    ` clock ${label}: ${rows.length} posts, age ${Math.min(...ages).toFixed(2)}h..${Math.max(...ages).toFixed(1)}h, net ${Math.min(...nets)}..${Math.max(...nets)}`,
  );
  if (rows.length === 0) {
    console.log("  (no eligible posts at this clock)");
    continue;
  }
  globalMax = Math.max(globalMax, compareRows("per-row", rows));
  compareOrdering("order", rows);
}
console.log(`  summary: ${totalRows} row-scores across ${clocks.length} clocks, worst rel diff ${globalMax.toExponential(2)}, negative-age rows exercised: ${sawNegative}`);

// independent cross-check of the join counts the score consumed
{
  const at = new Date(base).toISOString();
  const rows = await scoreAt(at);
  const [{ up, down, comments }] = await q(
    `SELECT (SELECT count(*) FROM post_upvotes WHERE post_id = ANY($1))::int AS up,
            (SELECT count(*) FROM post_downvotes WHERE post_id = ANY($1))::int AS down,
            (SELECT count(*) FROM comments WHERE post_id = ANY($1))::int AS comments`,
    [rows.map((r) => r.id)],
  );
  const sums = rows.reduce((s, r) => ({ up: s.up + r.up, down: s.down + r.down, comments: s.comments + r.comments }), { up: 0, down: 0, comments: 0 });
  const same = sums.up === up && sums.down === down && sums.comments === comments;
  console.log(`  ${same ? "ok  " : "FAIL"} join counts vs independent count(*): up ${sums.up}/${up}, down ${sums.down}/${down}, comments ${sums.comments}/${comments}`);
  if (!same) failures++;
  const dist = new Map();
  for (const r of rows) dist.set(r.up - r.down, (dist.get(r.up - r.down) ?? 0) + 1);
  console.log("  net-vote distribution at now:", [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n >= 0 ? "+" : ""}${n}x${c}`).join(" "));
}

// ---- B. boundary grid --------------------------------------------------------------
console.log("\nB. boundary grid through the same aliases (p, uv, dv, cm)");
{
  const secs = [-7200, -3600, -1, 0, 1, 60, 3600, 6 * 3600, 12 * 3600, 20 * 3600, 23 * 3600, 24 * 3600, 25 * 3600, 36 * 3600, 48 * 3600, 72 * 3600, 5 * 86400, 7 * 86400, 14 * 86400, 30 * 86400, 60 * 86400];
  const nets = [-1000, -50, -10, -5, -3, -2, -1, 0, 1, 2, 3, 4, 10, 30, 100, 160, 1000];
  const ks = [], ageH = [], ups = [], downs = [];
  for (const net of nets) {
    for (const s of secs) {
      const up = Math.max(net, 0) + 3; // extra matched up/down so only the NET may matter
      ks.push(ks.length);
      ageH.push(s / 3600);
      ups.push(up);
      downs.push(up - net);
    }
  }
  const at = new Date(base).toISOString();
  const rows = await q(
    `SELECT t.k, ${TRENDING_SCORE} AS rank_score
       FROM unnest($2::int[], $3::float8[], $4::int[], $5::int[]) AS t(k, age_h, up, down)
       CROSS JOIN LATERAL (SELECT $1::timestamptz - make_interval(secs => t.age_h * 3600) AS created_at) p
       CROSS JOIN LATERAL (SELECT t.up::bigint AS count) uv
       CROSS JOIN LATERAL (SELECT t.down::bigint AS count) dv
       CROSS JOIN LATERAL (SELECT 0::bigint AS count) cm`,
    [at, ks, ageH, ups, downs],
  );
  assert.equal(rows.length, ks.length);
  const grid = rows.map((r) => {
    const k = Number(r.k);
    return {
      k,
      up: ups[k],
      down: downs[k],
      ageHours: ageH[k],
      sql: Number(r.rank_score),
      js: trendingScore({ up: ups[k], down: downs[k], ageHours: ageH[k] }),
    };
  });
  compareRows(`grid ${nets.length} nets x ${secs.length} ages`, grid);
  const min = Math.min(...grid.map((g) => g.sql));
  const max = Math.max(...grid.map((g) => g.sql));
  console.log(`  score range in SQL: ${min.toExponential(3)} .. ${max.toExponential(3)} (all finite and > 0)`);
  // underflow guard: nothing may be 0, NaN or Infinity
  if (!grid.every((g) => Number.isFinite(g.sql) && g.sql > 0)) fail("non-positive or non-finite SQL score in grid");
}

// ---- D. retune sweep ----------------------------------------------------------------
// The shipped constants (2.25, 6) happen to be safe under any exponent spelling. This
// runs the same db.ts text with other constants substituted, integer pairs included
// (-3 / 6 would be integer division, 0, in Postgres if the exponent were ever written
// as a division in the SQL text), against a JS twin parametrised the same way.
console.log("\nD. retune sweep: db.ts text with other constants vs a parametrised JS twin");
{
  const twin = (up, down, ageHours, edge, gravity, windowHours) => {
    const net = up - down;
    const v = net >= 0 ? net + 1 : 1 / (1 - net) ** 2;
    return v * (1 + (Math.max(ageHours, 0) / windowHours) ** edge) ** (-gravity / edge);
  };
  const secs = [-3600, 0, 3600, 12 * 3600, 24 * 3600, 36 * 3600, 48 * 3600, 100 * 3600, 5 * 86400, 7 * 86400, 30 * 86400];
  const nets = [-10, -3, -1, 0, 1, 2, 4, 10, 100];
  const at = new Date(base).toISOString();
  for (const [edge, gravity, windowHours] of [[6, 2.25, 24], [6, 3, 24], [6, 2, 24], [3, 3, 24], [4, 1, 24], [5, 2.5, 24], [6, 3, 12], [8, 2, 48]]) {
    const score = buildScore(TRENDING_COMMENT_WEIGHT, edge, gravity, windowHours);
    const ks = [], ageH = [], ups = [], downs = [];
    for (const net of nets) {
      for (const s of secs) {
        const up = Math.max(net, 0) + 3;
        ks.push(ks.length);
        ageH.push(s / 3600);
        ups.push(up);
        downs.push(up - net);
      }
    }
    const rows = await q(
      `SELECT t.k, ${score} AS rank_score
         FROM unnest($2::int[], $3::float8[], $4::int[], $5::int[]) AS t(k, age_h, up, down)
         CROSS JOIN LATERAL (SELECT $1::timestamptz - make_interval(secs => t.age_h * 3600) AS created_at) p
         CROSS JOIN LATERAL (SELECT t.up::bigint AS count) uv
         CROSS JOIN LATERAL (SELECT t.down::bigint AS count) dv
         CROSS JOIN LATERAL (SELECT 0::bigint AS count) cm`,
      [at, ks, ageH, ups, downs],
    );
    assert.equal(rows.length, ks.length);
    const grid = rows.map((r) => {
      const k = Number(r.k);
      return { k, up: ups[k], down: downs[k], ageHours: ageH[k], sql: Number(r.rank_score), js: twin(ups[k], downs[k], ageH[k], edge, gravity, windowHours) };
    });
    compareRows(`edge ${edge} gravity ${gravity} window ${windowHours}h (SQL exponent ${/,\s*(-[\d.e-]+)\)\)::float8\s*$/.exec(score)?.[1] ?? "?"})`, grid);
  }
  // Control: the retired spelling `-3 / 6` (integer division, so exponent 0) must be caught.
  const old = buildScore(TRENDING_COMMENT_WEIGHT, 6, 3, 24).replace(/,\s*-[\d.e-]+\)\)::float8\s*$/, ", -3 / 6))::float8");
  assert.ok(old.endsWith(", -3 / 6))::float8"), "control rewrite did not apply");
  const [{ rank_score: oldScore }] = await q(
    `SELECT ${old.replaceAll("p.created_at", "(SELECT $1::timestamptz - interval '48 hours')").replaceAll("uv.count", "2::bigint").replaceAll("dv.count", "1::bigint").replaceAll("cm.count", "0::bigint")} AS rank_score`,
    [at],
  );
  const wantScore = twin(2, 1, 48, 6, 3, 24);
  const caught = rel(Number(oldScore), wantScore) > TOL;
  console.log(`  ${caught ? "ok  " : "FAIL"} control: retired '-3 / 6' spelling gives ${Number(oldScore).toPrecision(6)} vs JS ${wantScore.toPrecision(6)} (mismatch is detected)`);
  if (!caught) failures++;
}

// ---- negative control: the comparison must be able to fail -------------------------
console.log("\nControl: same live rows vs a deliberately wrong JS twin (gravity 2.0 instead of " + TRENDING_GRAVITY + ")");
{
  const rows = await scoreAt(new Date(base).toISOString());
  const wrong = (r) => {
    const net = r.up - r.down;
    const v = net >= 0 ? net + 1 : 1 / (1 - net) ** 2;
    return v * (1 + (Math.max(r.ageHours, 0) / TRENDING_WINDOW_HOURS) ** TRENDING_EDGE) ** (-2.0 / TRENDING_EDGE);
  };
  const worst = Math.max(...rows.map((r) => rel(r.sql, wrong(r))));
  const detected = worst > TOL;
  console.log(`  ${detected ? "ok  " : "FAIL"} wrong twin is detected: max rel diff ${worst.toExponential(2)} (> tol ${TOL})`);
  if (!detected) failures++;
  const sample = rows.slice(0, 4).concat(rows.slice(-2));
  console.log("  sample rows (sql | js, 17 sig digits):");
  for (const r of sample) console.log(`    net ${String(r.up - r.down).padStart(2)} age ${r.ageHours.toFixed(2).padStart(8)}h  ${r.sql.toPrecision(17)} | ${r.js.toPrecision(17)}`);
}

// ---- C. end to end through the real getDiscoverFeed --------------------------------
console.log("\nC. end to end: real getDiscoverFeed, real keyset cursor");
try {
  const db = await import("../../src/lib/db.ts");
  const PAGE = 5;
  // `at` is only visible on a cursor, so read it off page 1 and keep paging from that clock.
  const first = await db.getDiscoverFeed(null, PAGE, "trending", null);
  const at = first.nextCursor?.at;
  assert.ok(at, "first page had no cursor; need more than one page of eligible posts");
  const flat = [];
  let c = first.nextCursor;
  flat.push(...first.posts.map((p) => p.id));
  let n = 1;
  while (c) {
    const page = await db.getDiscoverFeed(null, PAGE, "trending", c);
    flat.push(...page.posts.map((p) => p.id));
    c = page.nextCursor;
    n++;
  }
  const rows = await scoreAt(at);
  const expected = jsOrder(rows).map((r) => r.id);
  const dup = flat.length - new Set(flat).size;
  const same = flat.length === expected.length && flat.every((id, i) => id === expected[i]);
  console.log(`  trending: ${n} pages of ${PAGE} at fixed clock ${at}: ${flat.length} posts, duplicates ${dup}, JS expects ${expected.length}`);
  console.log(`  ${same ? "ok  " : "FAIL"} paged ids == JS trendingScore ordering${same ? "" : " (first mismatch at " + flat.findIndex((id, i) => id !== expected[i]) + ")"}`);
  if (!same || dup) failures++;

  const newFlat = [];
  let nc = null;
  do {
    const page = await db.getDiscoverFeed(null, PAGE, "new", nc);
    newFlat.push(...page.posts.map((p) => p.id));
    nc = page.nextCursor;
  } while (nc);
  const newRows = await q(
    `SELECT id FROM posts WHERE meal_id IS NULL AND created_at > now() - make_interval(days => ${FEED_WINDOW_DAYS}) ORDER BY created_at DESC, id DESC`,
  );
  const newOk = newFlat.length === newRows.length && newFlat.every((id, i) => id === newRows[i].id);
  console.log(`  ${newOk ? "ok  " : "FAIL"} sort=new unchanged: ${newFlat.length} posts == created_at DESC, id DESC (${newRows.length} expected)`);
  if (!newOk) failures++;
} catch (e) {
  failures++;
  console.log("  FAIL could not run end-to-end:", e instanceof Error ? e.message : e);
}

console.log(failures === 0 ? "\nverify-impl: ALL CHECKS PASS" : `\nverify-impl: ${failures} FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
