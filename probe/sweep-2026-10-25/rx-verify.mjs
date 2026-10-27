// node --env-file=.env.local probe/sweep-2026-10-25/rx-verify.mjs NN  -> DB menu dish count vs ready file
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const ready = JSON.parse(readFileSync(`menus/wip/ready-rx-${process.argv[2]}.json`, "utf8"));
const ids = ready.map((e) => e.restaurantId);
const rows = await sql`SELECT restaurant_id, count(*)::int n FROM dishes WHERE source='menu' AND restaurant_id = ANY(${ids}) GROUP BY 1`;
const m = new Map(rows.map((r) => [String(r.restaurant_id), r.n]));
let bad = 0;
for (const e of ready) { const n = m.get(String(e.restaurantId)) ?? 0; if (n !== e.dishes.length) { bad++; console.log(`MISMATCH ${e.restaurantId} db ${n} file ${e.dishes.length}`); } }
console.log(`${ready.length - bad}/${ready.length} match`);
