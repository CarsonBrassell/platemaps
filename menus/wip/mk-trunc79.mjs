import { neon } from "@neondatabase/serverless";
import fs from "fs";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  select m.restaurant_id id, r.name, m.source_url, c.n dishes
  from menu_lookups m
  join (select restaurant_id, count(*) n from dishes group by 1) c on c.restaurant_id=m.restaurant_id
  join restaurants r on r.id=m.restaurant_id
  where m.status='found' and m.source_url ilike '%doordash%' and c.n=79 order by r.name`;
const out=[];
for(const r of rows){
  const d = await sql`select distinct section from dishes where restaurant_id=${r.id}`;
  out.push({restaurantId:r.id,name:r.name,dishes:r.dishes,sections:d.length,lastSection:(await sql`select section from dishes where restaurant_id=${r.id} order by sort_order desc limit 1`)[0]?.section,sourceUrl:r.source_url});
}
fs.writeFileSync("menus/wip/truncated-79.json",JSON.stringify(out,null,1));
console.log("wrote "+out.length+" truncated 79-dish DoorDash menus");
