import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT id::text,name,address,website,listed,hold_reason,(SELECT count(*) FROM dishes d WHERE d.restaurant_id=r.id) dishes FROM restaurants r WHERE name ILIKE '%emiliano%' OR address ILIKE '%6690 Mission Gorge%'`;
console.log(r);
