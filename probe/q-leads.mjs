import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const targets = ["del cerro pizza","other side","clem","duke","chamorro","knb","brothers"];
const rows = await sql`
  SELECT r.id::text, r.name, r.neighborhood, r.city, r.listed, r.hold_reason,
         (r.lat IS NOT NULL AND r.lng IS NOT NULL) AS has_coords,
         (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id) AS dish_count,
         (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id AND d.price IS NOT NULL) AS priced
  FROM restaurants r`;
for (const t of targets) {
  const hits = rows.filter(r => r.name.toLowerCase().includes(t));
  console.log(`\n## ${t}  (${hits.length} match)`);
  for (const h of hits) console.log(`  ${h.id} | ${h.name} | ${h.neighborhood||h.city||"-"} | listed=${h.listed} coords=${h.has_coords} hold=${h.hold_reason??"none"} | dishes=${h.dish_count} priced=${h.priced}`);
}
