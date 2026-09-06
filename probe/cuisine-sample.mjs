import { sql } from "../scripts/sql-client.mjs";
const rows = await sql`
  SELECT r.id, r.name, r.cuisine_raw, r.cuisine_tags,
         (SELECT string_agg(DISTINCT section, ' | ') FROM dishes d WHERE d.restaurant_id=r.id) sections,
         (SELECT string_agg(name, '; ') FROM (SELECT name FROM dishes d WHERE d.restaurant_id=r.id ORDER BY sort_order LIMIT 12) x) dishes
    FROM restaurants r
   WHERE hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL AND (cuisine IS NULL OR cuisine='')
     AND EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id=r.id)
   ORDER BY random() LIMIT 25`;
for (const r of rows) console.log(`\n# ${r.name} [${r.cuisine_raw}] tags=${r.cuisine_tags}\n  sections: ${(r.sections||'').slice(0,160)}\n  dishes: ${(r.dishes||'').slice(0,300)}`);
const names = await sql`SELECT name FROM restaurants WHERE hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL AND (cuisine IS NULL OR cuisine='') AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id=restaurants.id) ORDER BY random() LIMIT 60`;
console.log("\nNO-MENU NAMES:", names.map(n=>n.name).join(" | "));
