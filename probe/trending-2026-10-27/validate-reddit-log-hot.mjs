/**
 * Validates the reddit-log-hot SQL expression against the live DB (READ-ONLY, SELECT only).
 *   node --env-file=.env.local probe/trending-2026-10-27/validate-reddit-log-hot.mjs
 *
 * 1. Scalar checks: LOG() is base 10, SIGN/ABS/casts parse, net=1 -> vote term 0, net=-5 sinks.
 * 2. Runs the expression inside a query that mirrors getDiscoverFeed (same joins, 60-day
 *    window from $1, meal_id IS NULL, no blocked ids), re-scores every row in JS from the
 *    SAME up/down/created_at, and checks max error and SQL order == JS order.
 * 3. Compares SQL top 10 to the harness currentTop10 for the same formula.
 * 4. Walks keyset pages (size 7) with the exact `(rank_score, id) < ($4, $5)` test.
 */
import { neon } from "@neondatabase/serverless";
import { loadSnapshot, runSim } from "./harness.mjs";
import { makeScore } from "./sim-reddit-log-hot.mjs";

const TAU_H = 54;
const TAU_S = TAU_H * 3600; // 194400
const sql = neon(process.env.DATABASE_URL);
const snap = loadSnapshot();
const AT = new Date(snap.generatedAtMs).toISOString();

// ---- the drop-in expression (aliases: uv.count, dv.count, p.created_at) ----
const O = `(COALESCE(uv.count, 0) - COALESCE(dv.count, 0) - 1)::float8`;
export const SCORE = `(SIGN(${O}) * LOG(1 + ABS(${O}))
        + (EXTRACT(EPOCH FROM p.created_at)::float8 - 1134028003) / ${TAU_S})::float8`;

// 1. scalar checks (no tables touched)
const sc = await sql.query(`SELECT LOG(100::float8) AS log100, SIGN(0::float8) AS sign0,
  (SIGN((1-1)::float8) * LOG(1 + ABS((1-1)::float8))) AS vote_net1,
  (SIGN((-5-1)::float8) * LOG(1 + ABS((-5-1)::float8))) AS vote_netm5,
  (SIGN((1000-1)::float8) * LOG(1 + ABS((1000-1)::float8))) AS vote_net1000`);
console.log("scalar checks:", JSON.stringify(sc[0]), "(expect log100=2, vote_net1=0, vote_netm5=-0.845, vote_net1000=3)");

const BODY = (after = "") => `
SELECT * FROM (
  SELECT p.id, p.created_at, COALESCE(uv.count, 0)::int AS up, COALESCE(dv.count, 0)::int AS down,
         ${SCORE} AS rank_score
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN (SELECT post_id, count(*) AS count FROM post_upvotes GROUP BY post_id) uv ON uv.post_id = p.id
  LEFT JOIN (SELECT post_id, count(*) AS count FROM post_downvotes GROUP BY post_id) dv ON dv.post_id = p.id
  LEFT JOIN (SELECT post_id, count(*) AS count FROM comments GROUP BY post_id) cm ON cm.post_id = p.id
  WHERE p.meal_id IS NULL
    AND p.created_at > $1::timestamptz - make_interval(days => 60)
) s
${after}
ORDER BY s.rank_score DESC, s.id DESC
LIMIT 200`;

const all = await sql.query(BODY(), [AT]);
console.log(`SQL ok. ${all.length} rows at $1=${AT}. rank_score typeof: ${typeof all[0].rank_score}`);

// 2. JS re-score from the SAME counts
const f = makeScore(TAU_H, "organic");
let maxAbs = 0;
const js = all.map((r) => {
  const s = f({ net: r.up - r.down, createdAtMs: new Date(r.created_at).getTime() });
  maxAbs = Math.max(maxAbs, Math.abs(s - r.rank_score));
  return { ...r, js: s };
});
console.log(`max abs error SQL vs JS score: ${maxAbs.toExponential(2)} (score magnitude ~${all[0].rank_score.toFixed(1)})`);
const jsOrder = [...js].sort((a, b) => b.js - a.js || (a.id < b.id ? 1 : -1)).map((r) => r.id);
const sqlOrder = all.map((r) => r.id);
console.log(`SQL order == JS order (all ${all.length}): ${JSON.stringify(jsOrder) === JSON.stringify(sqlOrder)}`);
console.log(`any NaN/Inf: ${all.some((r) => !Number.isFinite(r.rank_score))}  distinct scores ${new Set(all.map((r) => r.rank_score)).size}/${all.length}`);

// 3. harness currentTop10 for the same formula (snapshot replay at the same clock)
const harness = runSim(f, { label: "validate" }).currentTop10.map((r) => String(r.id).slice(0, 8));
const sqlTop = all.filter((r) => new Date(r.created_at).getTime() <= Date.parse(AT)).slice(0, 10);
const sqlTopShort = sqlTop.map((r) => String(r.id).slice(0, 8));
console.log("harness top10:", harness.join(" "));
console.log("sql     top10:", sqlTopShort.join(" "));
console.log(`top10 identical: ${JSON.stringify(harness) === JSON.stringify(sqlTopShort)}`);
console.log("sql top10 (age h, up/down):", sqlTop.map((r) => `${((Date.parse(AT) - new Date(r.created_at).getTime()) / 3.6e6).toFixed(1)}h +${r.up}/-${r.down}`).join(" | "));
console.log(`rows created after $1: ${all.filter((r) => new Date(r.created_at).getTime() > Date.parse(AT)).length}`);

// 4. keyset paging, page size 7, exact feed test
const seen = [];
let cur = null;
for (let i = 0; i < 20; i++) {
  const rows = cur
    ? await sql.query(BODY("WHERE (s.rank_score, s.id) < ($2::float8, $3)").replace("LIMIT 200", "LIMIT 7"), [AT, cur.score, cur.id])
    : await sql.query(BODY().replace("LIMIT 200", "LIMIT 7"), [AT]);
  if (!rows.length) break;
  seen.push(...rows.map((r) => r.id));
  const last = rows[rows.length - 1];
  cur = { score: last.rank_score, id: last.id };
}
console.log(`keyset paging: ${seen.length} rows over pages of 7, equals unpaged order: ${JSON.stringify(seen) === JSON.stringify(sqlOrder)}, dupes: ${new Set(seen).size !== seen.length}`);
console.log("\nSQL expression:\n" + SCORE);
