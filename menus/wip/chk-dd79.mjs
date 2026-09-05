import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`
  select case when m.source_url ilike '%doordash%' then 'doordash'
              when m.source_url ilike '%ubereats%' then 'ubereats' else 'other' end as src,
         count(*) filter (where c.n = 79) as exactly79,
         count(*) filter (where c.n > 79) as over79,
         count(*) as total, max(c.n) as maxn
  from menu_lookups m
  join (select restaurant_id, count(*) n from dishes group by 1) c on c.restaurant_id = m.restaurant_id
  where m.status='found' group by 1 order by total desc`;
console.table(r);
