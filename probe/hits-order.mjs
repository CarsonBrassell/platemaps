// Read-only: which of a restaurant's rated plates match a menu row.
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const id = process.argv[2] ?? "123";
const menu = await sql`SELECT name FROM dishes WHERE restaurant_id = ${id}`;
const keys = new Set(menu.map((d) => d.name.trim().toLowerCase()));
const rated = await sql`
  SELECT lower(trim(dish_name)) AS k, round(avg(rating))::int AS pct, count(*)::int AS n
  FROM posts WHERE restaurant_id = ${id} AND rating_kind = 'dish' AND rating IS NOT NULL AND dish_name IS NOT NULL
  GROUP BY 1`;
console.log(`menu rows: ${menu.length}`);
for (const r of rated) console.log(`${keys.has(r.k) ? "MENU    " : "OFF-MENU"}  ${r.pct}%  x${r.n}  ${r.k}`);
