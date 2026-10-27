import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT j.name, count(*)::int n,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id=j.restaurant_id AND d.id<>j.id AND lower(d.name)=lower(j.section)))::int has_real,
  sum(j.yes_votes+j.no_votes)::int votes
 FROM dishes j WHERE lower(trim(j.name)) IN ('close','out of stock','unavailable','card fee') GROUP BY j.name`;
console.log(r);
const s = await sql`SELECT name, section, price FROM dishes WHERE lower(trim(name)) IN ('close','card fee','unavailable') ORDER BY random() LIMIT 8`;
console.log(s);
