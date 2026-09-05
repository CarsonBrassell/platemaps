import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const [cov] = await sql`SELECT COUNT(DISTINCT restaurant_id)::int AS n FROM dishes`;
const [tot] = await sql`SELECT COUNT(*)::int AS n FROM restaurants`;
const spikes = await sql`
  SELECT c AS dish_count, COUNT(*)::int AS restaurants FROM (
    SELECT restaurant_id, COUNT(*)::int AS c FROM dishes GROUP BY restaurant_id
  ) t WHERE c IN (78,79,80,90,91,92) GROUP BY c ORDER BY c`;
console.log(`coverage ${cov.n}/${tot.n} (${((cov.n / tot.n) * 100).toFixed(1)}%)`);
console.log("dish-count spikes now:");
for (const s of spikes) console.log(`  ${s.dish_count} dishes: ${s.restaurants} restaurants`);
