import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
for (const n of [79, 91]) {
  const r = await sql`
    select m.requested_by, count(*) k from menu_lookups m
    join (select restaurant_id, count(*) c from dishes group by 1) d on d.restaurant_id=m.restaurant_id
    where m.status='found' and m.source_url ilike '%doordash%' and d.c=${n}
    group by 1 order by k desc`;
  console.log("n="+n+": "+r.map(x=>x.requested_by+"="+x.k).join(", "));
}
const all = await sql`
  select m.requested_by, count(*) k from menu_lookups m
  where m.status='found' and m.source_url ilike '%doordash%' group by 1 order by k desc`;
console.log("all doordash: "+all.map(x=>x.requested_by+"="+x.k).join(", "));
