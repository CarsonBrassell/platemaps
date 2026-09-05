import fs from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`
  SELECT m.restaurant_id AS id, COUNT(d.id)::int AS c
    FROM menu_lookups m
    JOIN dishes d ON d.restaurant_id = m.restaurant_id
   WHERE m.source_url ~* '(doordash|order\.online|ubereats)'
   GROUP BY m.restaurant_id
  HAVING COUNT(d.id) IN (79, 91)`;
const ids = r.map((x) => String(x.id));
fs.writeFileSync("menus/wip/spike-ids.txt", ids.join(","));
console.log(`${ids.length} marketplace-sourced menus sitting on 79 or 91`);
