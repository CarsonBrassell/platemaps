// Which dish ratings actually line up with a menu row? A rated post whose
// dish_name matches no `dishes` row at that restaurant never reaches THE HITS.
import { neon } from "@neondatabase/serverless";
import fs from "fs";
const env = fs.readFileSync(".env.local", "utf8");
const url = (env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m) || [])[1];
const sql = neon(url);
const rows = await sql`
  SELECT p.restaurant_id, r.name AS restaurant, p.dish_name, p.rating, p.created_at,
         EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = p.restaurant_id
                 AND lower(trim(d.name)) = lower(trim(coalesce(p.dish_name,'')))) AS on_menu,
         (SELECT count(*) FROM dishes d WHERE d.restaurant_id = p.restaurant_id)::int AS menu_size
  FROM posts p LEFT JOIN restaurants r ON r.id = p.restaurant_id
  WHERE p.rating_kind='dish' AND p.rating IS NOT NULL
  ORDER BY p.created_at DESC LIMIT 25`;
console.table(rows.map((r) => ({ ...r, created_at: String(r.created_at).slice(0, 10) })));
