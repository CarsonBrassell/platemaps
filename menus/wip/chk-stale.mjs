import fs from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  select r.id, r.name, r.website, m.attempted_at, m.source_url, m.confidence,
         (select count(*)::int from dishes d where d.restaurant_id=r.id) dish_count
  from restaurants r
  join menu_lookups m on m.restaurant_id = r.id
  where m.status='not_found'
    and exists (select 1 from dishes d where d.restaurant_id=r.id)
  order by m.attempted_at`;
console.log("count="+rows.length);
for(const x of rows) console.log("  "+x.id+" | "+x.name+" | dishes="+x.dish_count+" | retired "+x.attempted_at.toISOString().slice(0,16)+" | "+(x.confidence||"")+" | src="+(x.source_url||"none"));
fs.writeFileSync("menus/wip/dishes-but-retired.json", JSON.stringify(rows,null,1));
