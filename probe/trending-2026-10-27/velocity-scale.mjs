// Read-only scaling estimate: per-vote cost of the decayed SUM vs count(*), on generate_series (touches no table).
//   node --env-file=.env.local probe/trending-2026-10-27/velocity-scale.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const AT = "2026-10-27T23:08:48.693Z";
const ms = async (text) => {
  const t = [];
  for (let i = 0; i < 3; i++) {
    const rows = await sql.query(`EXPLAIN (ANALYZE) ${text}`, text.includes("$1") ? [AT] : []);
    t.push(parseFloat(rows.map((r) => r["QUERY PLAN"]).find((l) => l.startsWith("Execution Time")).match(/([\d.]+) ms/)[1]));
  }
  return Math.min(...t);
};
for (const [votes, posts] of [[10_000, 1_000], [100_000, 10_000], [500_000, 50_000]]) {
  const vt = `($1::timestamptz - make_interval(mins => (g % 86400)::int))`;
  const cnt = await ms(`SELECT g % ${posts} AS pid, count(*) FROM generate_series(1, ${votes}) g GROUP BY 1`);
  const dec = await ms(`SELECT g % ${posts} AS pid, SUM(POWER(0.5::float8, LEAST(GREATEST(EXTRACT(EPOCH FROM ($1::timestamptz - ${vt}))::float8 / 3600, 0) / 24::float8, 800))) FROM generate_series(1, ${votes}) g GROUP BY 1`);
  console.log(`${String(votes).padStart(7)} votes / ${String(posts).padStart(6)} posts: count(*) ${cnt} ms | decayed SUM ${dec} ms | extra ${(dec - cnt).toFixed(1)} ms (${(((dec - cnt) / votes) * 1000).toFixed(2)} us/vote)`);
}
