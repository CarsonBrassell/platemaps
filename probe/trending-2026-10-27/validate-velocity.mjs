/**
 * Validates the "velocity" SQL against the live DB (READ-ONLY: SELECT / EXPLAIN ANALYZE of a SELECT only).
 *   node --env-file=.env.local probe/trending-2026-10-27/validate-velocity.mjs
 *
 *   score = GREATEST(S + B, B * 0.1) / (GREATEST(ageH, 0) + 2)
 *   S     = SUM over non-author upvotes   0.5^(voteAgeH / HV)      (votes cast after $1 ignored)
 *         - SUM over downvotes            0.5^(voteAgeH / HV)
 *
 * 1. Executes the expression inside a query that mirrors getDiscoverFeed (same joins + filters,
 *    $1 = snapshot generatedAt, no blocked ids). Checks every score is finite.
 * 2. Re-scores each row in JS (sim-velocity makeScore on the snapshot's vote timestamps) and
 *    checks max relative error and that SQL order == JS order for rows present in the snapshot.
 * 3. Compares SQL top 10 with the harness currentTop10 (velocity JS and production baseline).
 * 4. Walks keyset pages (size 7) with the exact `(rank_score, id) < ($2, $3)` test.
 * 5. Edge cases: exponent underflow clamp, post created after $1 (negative age).
 * 6. EXPLAIN (ANALYZE, BUFFERS) of baseline vs velocity (with and without the unused comments join).
 */
import { neon } from "@neondatabase/serverless";
import { loadSnapshot, runSim, baselineScore, HOUR_MS } from "./harness.mjs";
import { makeScore } from "./sim-velocity.mjs";

const sql = neon(process.env.DATABASE_URL);
const snap = loadSnapshot();
const AT = new Date(snap.generatedAtMs).toISOString();

export const HV = 24; // vote half-life, hours
export const B = 0.3; // base mass every plate starts with
export const EPS = B * 0.1; // floor for downvoted plates, below any unvoted plate
const CHOSEN = { Hv: HV, F: { kind: "pow", g: 1 }, b: B, excludeSelf: true };

// ---- the drop-in pieces (aliases: uv.mass, dv.mass, p.created_at, $1) --------------------------
const VOTE_AGE_H = (col) => `GREATEST(EXTRACT(EPOCH FROM ($1::timestamptz - ${col}))::float8 / 3600, 0)`;
const DECAY = (col) => `POWER(0.5::float8, LEAST(${VOTE_AGE_H(col)} / ${HV}::float8, 800))`;

export const UV_JOIN = `LEFT JOIN (
         SELECT v.post_id, SUM(${DECAY("v.created_at")}) AS mass
         FROM post_upvotes v
         JOIN posts q ON q.id = v.post_id
         WHERE v.user_id <> q.user_id
           AND v.created_at <= $1::timestamptz
           AND q.created_at > $1::timestamptz - make_interval(days => 60)
         GROUP BY v.post_id
       ) uv ON uv.post_id = p.id`;
export const DV_JOIN = `LEFT JOIN (
         SELECT v.post_id, SUM(${DECAY("v.created_at")}) AS mass
         FROM post_downvotes v
         JOIN posts q ON q.id = v.post_id
         WHERE v.created_at <= $1::timestamptz
           AND q.created_at > $1::timestamptz - make_interval(days => 60)
         GROUP BY v.post_id
       ) dv ON dv.post_id = p.id`;
export const SCORE = `(GREATEST(COALESCE(uv.mass, 0) - COALESCE(dv.mass, 0) + ${B}, ${EPS})
        / (${VOTE_AGE_H("p.created_at")} + 2))::float8`;

const BASE_SCORE = `((GREATEST(COALESCE(uv.count, 0) - COALESCE(dv.count, 0), 0) + 1)
        / POWER(EXTRACT(EPOCH FROM ($1::timestamptz - p.created_at)) / 3600 + 2, 1.0))::float8`;
const BASE_UV = `LEFT JOIN (SELECT post_id, count(*) AS count FROM post_upvotes GROUP BY post_id) uv ON uv.post_id = p.id`;
const BASE_DV = `LEFT JOIN (SELECT post_id, count(*) AS count FROM post_downvotes GROUP BY post_id) dv ON dv.post_id = p.id`;
const CM = `LEFT JOIN (SELECT post_id, count(*) AS count FROM comments GROUP BY post_id) cm ON cm.post_id = p.id`;

const query = ({ score, uv, dv, cm = true, extra = "", after = "", limit = 200 }) => `
SELECT * FROM (
  SELECT p.id, p.created_at, ${score} AS rank_score
  FROM posts p
  JOIN users u ON u.id = p.user_id
  ${uv}
  ${dv}
  ${cm ? CM : ""}
  WHERE p.meal_id IS NULL
    AND p.created_at > $1::timestamptz - make_interval(days => 60)
    ${extra}
) s
${after}
ORDER BY s.rank_score DESC, s.id DESC
LIMIT ${limit}`;

const VEL = (o = {}) => query({ score: SCORE, uv: UV_JOIN, dv: DV_JOIN, ...o });
const BASE = (o = {}) => query({ score: BASE_SCORE, uv: BASE_UV, dv: BASE_DV, ...o });

// ---- 1. execute ---------------------------------------------------------------------------------
const all = await sql.query(VEL(), [AT]);
console.log(`SQL ok. ${all.length} rows at $1=${AT}. rank_score typeof: ${typeof all[0].rank_score}`);
console.log(`all finite: ${all.every((r) => Number.isFinite(r.rank_score))}  min ${Math.min(...all.map((r) => r.rank_score)).toExponential(2)}  max ${Math.max(...all.map((r) => r.rank_score)).toExponential(2)}`);

// ---- 2. JS re-score -----------------------------------------------------------------------------
const f = makeScore(CHOSEN);
const byId = new Map(snap.posts.map((p) => [p.id, p]));
let maxRel = 0;
let scored = 0;
const missing = [];
const js = [];
for (const r of all) {
  const sp = byId.get(r.id);
  if (!sp) {
    missing.push(r.id);
    continue;
  }
  const atMs = Date.parse(AT);
  const s = f({
    id: sp.id,
    atMs,
    ageHours: Math.max((atMs - sp.createdAtMs) / HOUR_MS, 0),
    upTimes: sp.upMs.filter((t) => t <= atMs),
    downTimes: sp.downMs.filter((t) => t <= atMs),
  });
  maxRel = Math.max(maxRel, Math.abs(s - r.rank_score) / (Math.abs(s) || 1));
  scored++;
  js.push({ id: r.id, js: s, sql: r.rank_score });
}
console.log(`JS re-scored ${scored} rows (${missing.length} live rows not in snapshot); max relative error SQL vs JS: ${maxRel.toExponential(2)}`);
const jsOrder = [...js].sort((a, b) => b.js - a.js || (a.id < b.id ? 1 : -1)).map((r) => r.id);
const sqlOrder = all.filter((r) => byId.has(r.id)).map((r) => r.id);
console.log(`SQL order == JS order (${scored} shared rows): ${JSON.stringify(jsOrder) === JSON.stringify(sqlOrder)}`);

// ---- 3. top 10 vs harness -----------------------------------------------------------------------
const atMs = Date.parse(AT);
const sqlTop = all.filter((r) => new Date(r.created_at).getTime() <= atMs).slice(0, 10).map((r) => String(r.id).slice(0, 8));
const hv = runSim(f, { label: "velocity" }).currentTop10.map((r) => r.id);
const hb = runSim(baselineScore, { label: "baseline" }).currentTop10.map((r) => r.id);
const baseRows = await sql.query(BASE(), [AT]);
const baseTop = baseRows.filter((r) => new Date(r.created_at).getTime() <= atMs).slice(0, 10).map((r) => String(r.id).slice(0, 8));
console.log("\nharness velocity top10 :", hv.join(" "));
console.log("SQL velocity top10     :", sqlTop.join(" "));
console.log(`velocity SQL == velocity harness: ${JSON.stringify(hv) === JSON.stringify(sqlTop)}`);
console.log("harness baseline top10 :", hb.join(" "));
console.log("SQL baseline top10     :", baseTop.join(" "));
console.log(`baseline SQL == baseline harness: ${JSON.stringify(hb) === JSON.stringify(baseTop)}`);
const overlap = sqlTop.filter((x) => baseTop.includes(x)).length;
console.log(`velocity vs production top10 overlap: ${overlap}/10`);
const lateRows = all.filter((r) => new Date(r.created_at).getTime() > atMs).length;
console.log(`rows created after $1 (negative age, clamped to 0): ${lateRows}`);

// ---- 4. keyset paging ---------------------------------------------------------------------------
const seen = [];
let cur = null;
for (let i = 0; i < 30; i++) {
  const rows = cur
    ? await sql.query(VEL({ after: "WHERE (s.rank_score, s.id) < ($2::float8, $3)", limit: 7 }), [AT, cur.score, cur.id])
    : await sql.query(VEL({ limit: 7 }), [AT]);
  if (!rows.length) break;
  seen.push(...rows.map((r) => r.id));
  const last = rows[rows.length - 1];
  cur = { score: last.rank_score, id: last.id };
}
const unpaged = all.map((r) => r.id);
console.log(`\nkeyset paging: ${seen.length} rows over pages of 7, equals unpaged order: ${JSON.stringify(seen) === JSON.stringify(unpaged)}, dupes: ${new Set(seen).size !== seen.length}`);

// ---- 5. edge cases ------------------------------------------------------------------------------
const edge = await sql.query(
  `SELECT POWER(0.5::float8, LEAST(5000::float8 / ${HV}::float8, 800)) AS clamped_underflow,
          (GREATEST(0 - 0 + ${B}, ${EPS}) / (GREATEST(-300::float8 / 3600, 0) + 2))::float8 AS future_post`,
);
console.log("\nedge cases:", JSON.stringify(edge[0]));
try {
  await sql.query(`SELECT POWER(0.5::float8, 5000::float8) AS raw`);
  console.log("raw POWER(0.5, 5000) did NOT raise (clamp is belt and braces)");
} catch (e) {
  console.log("raw POWER(0.5, 5000) raises:", String(e.message).slice(0, 80), "-> the LEAST(..., 800) clamp is required");
}

// ---- 6. EXPLAIN ANALYZE -------------------------------------------------------------------------
const explain = async (label, text, n = 5) => {
  const times = [];
  let plan = "";
  for (let i = 0; i < n; i++) {
    const rows = await sql.query(`EXPLAIN (ANALYZE, BUFFERS) ${text}`, [AT]);
    const lines = rows.map((r) => r["QUERY PLAN"]);
    const ex = lines.find((l) => l.startsWith("Execution Time"));
    times.push(parseFloat(ex.match(/([\d.]+) ms/)[1]));
    if (i === n - 1) plan = lines.join("\n");
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(44)} exec ms: min ${times[0]}  median ${times[Math.floor(n / 2)]}  max ${times[n - 1]}`);
  return plan;
};
console.log("\nEXPLAIN (ANALYZE, BUFFERS), LIMIT 31, 5 runs each:");
const planBase = await explain("baseline (uv, dv, cm joins)", BASE({ limit: 31 }));
await explain("velocity (uv, dv mass joins + cm)", VEL({ limit: 31 }));
const planVelNoCm = await explain("velocity, comments join dropped (weight 0)", VEL({ cm: false, limit: 31 }));
await explain("baseline, comments join dropped", BASE({ cm: false, limit: 31 }));
console.log("\n--- velocity plan (no cm join) ---\n" + planVelNoCm);
console.log("\n--- baseline plan ---\n" + planBase);
const tbl = await sql.query(
  `SELECT (SELECT count(*) FROM posts) AS posts, (SELECT count(*) FROM post_upvotes) AS ups, (SELECT count(*) FROM post_downvotes) AS downs, (SELECT count(*) FROM comments) AS comments`,
);
console.log("\ntable sizes:", JSON.stringify(tbl[0]));
console.log("\nSQL expression:\n" + SCORE + "\n" + UV_JOIN + "\n" + DV_JOIN);
