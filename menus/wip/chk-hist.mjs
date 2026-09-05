import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`
  select c.n, count(*) k from menu_lookups m
  join (select restaurant_id, count(*) n from dishes group by 1) c on c.restaurant_id=m.restaurant_id
  where m.status='found' and m.source_url ilike '%doordash%' and c.n between 68 and 92
  group by 1 order by 1`;
console.log("doordash dish-count histogram 68..92");
for (const x of r) console.log(String(x.n).padStart(3)+" "+"#".repeat(Number(x.k))+" "+x.k);
