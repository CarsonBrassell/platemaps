import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT count(*)::int n, min(price) lo, max(price) hi FROM dishes WHERE restaurant_id='5702'`;
console.log('dishes', r[0]);
const s = await sql`SELECT section, count(*)::int n FROM dishes WHERE restaurant_id='5702' GROUP BY section ORDER BY 2 DESC`;
console.log(s.map(x=>`${x.section}:${x.n}`).join(' | '));
const l = await sql`SELECT status, source_url FROM menu_lookups WHERE restaurant_id='5702'`;
console.log('lookup', l);
