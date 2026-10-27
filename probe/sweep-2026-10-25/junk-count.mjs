import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT d.name, count(*)::int n, count(DISTINCT d.restaurant_id)::int rest
 FROM dishes d JOIN restaurants r ON r.id=d.restaurant_id
 WHERE r.hold_reason IS NULL AND lower(trim(d.name)) IN ('close','closed','out of stock','unavailable','card fee','regular','sold out')
 GROUP BY d.name ORDER BY n DESC`;
console.log(r);
