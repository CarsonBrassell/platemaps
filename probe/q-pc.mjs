import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT id::text,name,address,neighborhood,lat,lng,listed,hold_reason,source_key,
  (SELECT count(*)::int FROM dishes d WHERE d.restaurant_id=restaurants.id) AS dishes
  FROM restaurants WHERE name ILIKE '%chop%' AND (name ILIKE '%pok%')`;
console.log(JSON.stringify(r,null,1));
const g = await sql`SELECT id::text,name,address,listed,source_key FROM restaurants WHERE address ILIKE '%Mission Gorge%' ORDER BY name`;
console.log("\nMission Gorge rows:", g.length);
for (const x of g) console.log(` ${x.id} ${x.listed?'L':'-'} ${x.name} | ${x.address}`);
