import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT * FROM menu_lookups WHERE restaurant_id IN ('5702','10001')`;
console.log(JSON.stringify(r,null,1).slice(0,2000));
const w = await sql`SELECT id::text,name,website,address FROM restaurants WHERE id IN ('5702','10001')`;
console.log(w);
