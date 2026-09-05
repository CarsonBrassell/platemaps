import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const ids = await sql`
  select m.restaurant_id id, r.name, c.n
  from menu_lookups m
  join (select restaurant_id, count(*) n from dishes group by 1) c on c.restaurant_id=m.restaurant_id
  join restaurants r on r.id=m.restaurant_id
  where m.status='found' and m.source_url ilike '%doordash%' and c.n=79 order by 1`;
console.log("exactly-79 doordash menus: "+ids.length);
for (const row of ids.slice(0,12)) {
  const d = await sql`select section from dishes where restaurant_id=${row.id} order by sort_order`;
  const secs=[]; for(const x of d){const s=(x.section||"(none)").trim(); if(!secs.length||secs[secs.length-1][0]!==s) secs.push([s,1]); else secs[secs.length-1][1]++;}
  console.log(String(row.id).padEnd(6)+row.name.slice(0,28).padEnd(30)+secs.length+" sect | last: "+secs.slice(-2).map(s=>s[0]+":"+s[1]).join(" , "));
}
