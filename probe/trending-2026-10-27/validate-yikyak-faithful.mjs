/**
 * Validates the yikyak-faithful SQL expression against the JS formula used in the simulator.
 * READ-ONLY: SELECTs only. Run with:
 *   node --env-file=.env.local probe/trending-2026-10-27/validate-yikyak-faithful.mjs
 *
 * 1. Evaluates the SQL expression (and the CURRENT baseline expression) over every Discover-eligible
 *    post at $1 = the snapshot time, then compares scores to the JS functions row by row.
 * 2. Compares the SQL top 10 to the JS top 10 and to the harness's currentTop10.
 * 3. Pages the whole eligible set with the real keyset predicate (rank_score, id) < ($4, $5), page size 4,
 *    and checks the pages concatenate to the exact full ordering with no duplicate and no gap.
 * Secrets are never printed.
 */
import { neon } from "@neondatabase/serverless";
import { baselineScore } from "./harness.mjs";

const CHOSEN = { W: 24, P: 6, G: 2.25 }; // same as sim-yikyak-faithful.mjs (not imported: that file runs its report on import)
const mk = ({ W, P, G }) => ({ net, ageHours }) => (net >= 0 ? net + 1 : 1 / (1 - net) ** 2) * Math.pow(1 + Math.pow(ageHours / W, P), -G / P);
const sql = neon(process.env.DATABASE_URL);
const q = (text, params = []) => sql.query(text, params);

const AT = "2026-10-27T23:08:48.693Z"; // snapshot time (cursor clock)
const WINDOW_DAYS = 60;
// harness currentTop10 (baseline formula, from the shared snapshot), 8-char id prefixes
const HARNESS_CURRENT_TOP10 = ["435b701c", "f614c85b", "bafc4992", "58d1e679", "4dcb5b19", "a6f238a5", "476e5b29", "1f975975", "24d8989e", "3a7b3fdb"];

const NET = `(COALESCE(uv.count, 0) - COALESCE(dv.count, 0))::float8`;
const AGE = `(GREATEST(EXTRACT(EPOCH FROM ($1::timestamptz - p.created_at)), 0) / 3600.0)::float8`;
export const SQL_EXPRESSION = `((CASE WHEN ${NET} >= 0 THEN ${NET} + 1 ELSE 1.0 / POWER(1 - ${NET}, 2) END)
  * POWER(1 + POWER(${AGE} / 24.0, 6), -2.25 / 6.0))::float8`;
const BASELINE_EXPRESSION = `((GREATEST(COALESCE(uv.count, 0) - COALESCE(dv.count, 0), 0) + 1)
  / POWER(EXTRACT(EPOCH FROM ($1::timestamptz - p.created_at)) / 3600 + 2, 1.0))::float8`;

const FROM = `
  FROM posts p
  LEFT JOIN (SELECT post_id, count(*) AS count FROM post_upvotes GROUP BY post_id) uv ON uv.post_id = p.id
  LEFT JOIN (SELECT post_id, count(*) AS count FROM post_downvotes GROUP BY post_id) dv ON dv.post_id = p.id
  WHERE p.meal_id IS NULL
    AND p.created_at > $1::timestamptz - make_interval(days => ${WINDOW_DAYS})`;

const rows = await q(
  `SELECT p.id, p.created_at, COALESCE(uv.count, 0)::int AS up, COALESCE(dv.count, 0)::int AS down,
          ${SQL_EXPRESSION} AS cand_sql, ${BASELINE_EXPRESSION} AS base_sql
   ${FROM}`,
  [AT],
);
console.log(`eligible rows at ${AT}: ${rows.length}`);

const atMs = Date.parse(AT);
const jsCand = mk(CHOSEN);
let maxRelCand = 0, maxRelBase = 0;
for (const r of rows) {
  const net = r.up - r.down;
  const ageHours = Math.max(0, (atMs - new Date(r.created_at).getTime()) / 3_600_000);
  r.cand_js = jsCand({ net, ageHours });
  r.base_js = baselineScore({ net, up: r.up, down: r.down, comments: 0, ageHours });
  maxRelCand = Math.max(maxRelCand, Math.abs(r.cand_sql - r.cand_js) / Math.max(1e-300, Math.abs(r.cand_js)));
  maxRelBase = Math.max(maxRelBase, Math.abs(r.base_sql - r.base_js) / Math.max(1e-300, Math.abs(r.base_js)));
}
console.log("max relative diff, candidate SQL vs JS:", maxRelCand.toExponential(2));
console.log("max relative diff, baseline  SQL vs JS:", maxRelBase.toExponential(2), "(sanity: harness baseline matches the live SQL)");

const order = (key) => [...rows].sort((a, b) => b[key] - a[key] || (a.id < b.id ? 1 : -1)).map((r) => r.id.slice(0, 8));
const candSql = order("cand_sql"), candJs = order("cand_js"), baseSql = order("base_sql"), baseJs = order("base_js");
console.log("\ncandidate SQL top 10:", candSql.slice(0, 10).join(" "));
console.log("candidate JS  top 10:", candJs.slice(0, 10).join(" "));
console.log("baseline  SQL top 10:", baseSql.slice(0, 10).join(" "));
console.log("harness currentTop10:", HARNESS_CURRENT_TOP10.join(" "));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
console.log("\ncandidate SQL == candidate JS (full ordering):", same(candSql, candJs));
console.log("candidate SQL == candidate JS (top 10):       ", same(candSql.slice(0, 10), candJs.slice(0, 10)));
console.log("baseline  SQL == harness currentTop10:         ", same(baseSql.slice(0, 10), HARNESS_CURRENT_TOP10));
console.log("candidate top 10 == harness currentTop10:      ", same(candSql.slice(0, 10), HARNESS_CURRENT_TOP10));
console.log("rows live now vs snapshot: if the two lists above differ, a post or vote landed after the snapshot");

console.log("\nSQL top 12 with scores:");
[...rows].sort((a, b) => b.cand_sql - a.cand_sql || (a.id < b.id ? 1 : -1)).slice(0, 12)
  .forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${r.id.slice(0, 8)} +${r.up}/-${r.down} sql=${Number(r.cand_sql).toPrecision(9)} js=${Number(r.cand_js).toPrecision(9)}`));

// ---- keyset paging with the real predicate, page size 4 ----
const PAGE = 4;
const pageSql = (hasCursor) => `SELECT * FROM (
  SELECT p.id, ${SQL_EXPRESSION} AS rank_score ${FROM}
) s ${hasCursor ? "WHERE (s.rank_score, s.id) < ($2::float8, $3)" : ""}
ORDER BY s.rank_score DESC, s.id DESC LIMIT ${hasCursor ? "$4" : "$2"}`;
const seen = [];
let cursor = null;
for (let guard = 0; guard < 100; guard++) {
  const page = cursor
    ? await q(pageSql(true), [AT, cursor.rank_score, cursor.id, PAGE])
    : await q(pageSql(false), [AT, PAGE]);
  if (!page.length) break;
  seen.push(...page.map((r) => r.id));
  cursor = page[page.length - 1];
  if (page.length < PAGE) break;
}
const full = [...rows].sort((a, b) => b.cand_sql - a.cand_sql || (a.id < b.id ? 1 : -1)).map((r) => r.id);
console.log(`\nkeyset paging (page ${PAGE}): ${seen.length} ids over ${Math.ceil(seen.length / PAGE)} pages; duplicates: ${seen.length - new Set(seen).size}; equals full ordering: ${same(seen, full)}`);

// ---- cheapness: the plan is the same shape as the current query (no extra scans) ----
const plan = await q(`EXPLAIN SELECT p.id, ${SQL_EXPRESSION} AS rank_score ${FROM} ORDER BY rank_score DESC, p.id DESC LIMIT 30`, [AT]);
console.log("\nEXPLAIN (candidate):\n" + plan.map((r) => r["QUERY PLAN"]).join("\n"));
const planBase = await q(`EXPLAIN SELECT p.id, ${BASELINE_EXPRESSION} AS rank_score ${FROM} ORDER BY rank_score DESC, p.id DESC LIMIT 30`, [AT]);
console.log("\nEXPLAIN (baseline):\n" + planBase.map((r) => r["QUERY PLAN"]).join("\n"));
