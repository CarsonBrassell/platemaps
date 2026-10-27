import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "node:fs";
const sql = neon(process.env.DATABASE_URL);
const q = JSON.parse(readFileSync("probe/sweep-2026-10-25/reextract-queue.json", "utf8"));
const ids = q.map(x => String(x.id));
const rows = await sql`SELECT r.id, r.name, r.address, r.city, r.website, m.source_url, m.confidence,
  (SELECT count(*)::int FROM dishes d WHERE d.restaurant_id=r.id AND d.source='menu') AS dishes
  FROM restaurants r JOIN menu_lookups m ON m.restaurant_id=r.id WHERE r.id = ANY(${ids}) AND r.hold_reason IS NULL`;
const by = new Map(rows.map(r => [String(r.id), r]));
const out = q.filter(x => by.has(String(x.id))).map(x => { const r = by.get(String(x.id)); return {
  restaurantId: String(r.id), name: r.name, address: [r.address, r.city].filter(Boolean).join(", "),
  website: r.website, currentSource: r.source_url, currentConfidence: r.confidence, currentDishes: r.dishes, why: x.why }; });
let n = 0;
for (let i = 0; i < out.length; i += 10) writeFileSync(`menus/wip/rx-${String(++n).padStart(2,"0")}.json`, JSON.stringify(out.slice(i, i + 10), null, 1));
console.log("listed in queue", out.length, "of", q.length, "batches", n);
