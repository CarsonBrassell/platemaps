/**
 * Validates the gravity-retune SQL expression against the live DB (READ-ONLY, SELECT only).
 *   node --env-file=.env.local probe/trending-2026-10-27/validate-gravity-retune.mjs
 *
 * 1. Parses/executes the expression inside a query that mirrors getDiscoverFeed
 *    (same joins + filters, $1 = snapshot generatedAt, no blocked ids).
 * 2. Re-scores every returned row in JS from the SAME up/down/created_at and
 *    checks max relative error vs SQL, and that SQL order == JS order.
 * 3. Compares SQL top 10 to the harness currentTop10 (snapshot replay at the same clock).
 * 4. Walks keyset pages (size 7) with the exact `(rank_score, id) < ($4, $5)` test
 *    and checks the concatenation equals the unpaged order (no skips, no dupes).
 */
import { neon } from "@neondatabase/serverless";
import { loadSnapshot, runSim } from "./harness.mjs";
import { mk, CHOSEN } from "./sim-gravity-retune.mjs";

const sql = neon(process.env.DATABASE_URL);
const snap = loadSnapshot();
const AT = new Date(snap.generatedAtMs).toISOString();
const { T0, G, TS, TAU } = CHOSEN;

// ---- the drop-in expression (aliases: uv.count, dv.count, p.created_at, $1) ----
const AGE = `GREATEST(EXTRACT(EPOCH FROM ($1::timestamptz - p.created_at))::float8 / 3600, 0)`;
const NET = `(COALESCE(uv.count, 0) - COALESCE(dv.count, 0))`;
export const SCORE = `((CASE WHEN ${NET} >= 0 THEN (${NET} + 1)::float8 ELSE 1.0::float8 / (1 - ${NET})::float8 END
        / POWER(${AGE} + ${T0}, ${G}::float8))
        * EXP(-GREATEST(${AGE} - ${TS}, 0) / ${TAU}::float8))::float8`;

const BODY = (extra = "", after = "") => `
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
    ${extra}
) s
${after}
ORDER BY s.rank_score DESC, s.id DESC
LIMIT 200`;

const all = await sql.query(BODY(), [AT]);
console.log(`SQL ok. ${all.length} rows at $1=${AT}. rank_score typeof: ${typeof all[0].rank_score}`);

// 2. JS re-score from the SAME counts
const f = mk(CHOSEN);
let maxRel = 0;
const js = all.map((r) => {
  const ageHours = (Date.parse(AT) - new Date(r.created_at).getTime()) / 3_600_000;
  const s = f({ up: r.up, down: r.down, ageHours });
  maxRel = Math.max(maxRel, Math.abs(s - r.rank_score) / (Math.abs(s) || 1));
  return { ...r, js: s };
});
console.log(`max relative error SQL vs JS score: ${maxRel.toExponential(2)}`);
const jsOrder = [...js].sort((a, b) => b.js - a.js || (a.id < b.id ? 1 : -1)).map((r) => r.id);
const sqlOrder = all.map((r) => r.id);
console.log(`SQL order == JS order (all ${all.length}): ${JSON.stringify(jsOrder) === JSON.stringify(sqlOrder)}`);
console.log(`min score ${Math.min(...all.map((r) => r.rank_score)).toExponential(2)}  any NaN/Inf: ${all.some((r) => !Number.isFinite(r.rank_score))}`);

// 3. harness currentTop10 (snapshot replay). Rows created after AT are excluded by the harness.
const harness = runSim(f, { label: "validate" }).currentTop10.map((r) => r.id);
const sqlTop = all.filter((r) => new Date(r.created_at).getTime() <= Date.parse(AT)).slice(0, 10);
const sqlTopShort = sqlTop.map((r) => String(r.id).slice(0, 8));
console.log("harness top10:", harness.join(" "));
console.log("sql     top10:", sqlTopShort.join(" "));
console.log(`top10 identical: ${JSON.stringify(harness) === JSON.stringify(sqlTopShort)}`);
const late = all.filter((r) => new Date(r.created_at).getTime() > Date.parse(AT)).length;
console.log(`rows created after $1 (negative age, clamped to 0): ${late}`);

// 4. keyset paging, page size 7, exact feed test
const seen = [];
let cur = null;
for (let i = 0; i < 20; i++) {
  const rows = cur
    ? await sql.query(
        BODY("", "WHERE (s.rank_score, s.id) < ($2::float8, $3)").replace("LIMIT 200", "LIMIT 7"),
        [AT, cur.score, cur.id],
      )
    : await sql.query(BODY().replace("LIMIT 200", "LIMIT 7"), [AT]);
  if (!rows.length) break;
  seen.push(...rows.map((r) => r.id));
  const last = rows[rows.length - 1];
  cur = { score: last.rank_score, id: last.id };
}
console.log(`keyset paging: ${seen.length} rows over pages of 7, equals unpaged order: ${JSON.stringify(seen) === JSON.stringify(sqlOrder)}, dupes: ${new Set(seen).size !== seen.length}`);
console.log("\nSQL expression:\n" + SCORE);
