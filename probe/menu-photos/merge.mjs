// Merges extraction files for restaurants that have no dishes yet into a result file.
//   node --env-file=.env.local probe/menu-photos/merge.mjs menus/wip/result-photos-<date>.json [skipId,...]
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
const [outFile, skip = ""] = process.argv.slice(2);
const skipIds = new Set(skip.split(",").filter(Boolean));
const sql = neon(process.env.DATABASE_URL);
const ids = fs.readdirSync("menus/wip/photos").filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
const have = new Set((await sql`SELECT DISTINCT restaurant_id::text AS id FROM dishes WHERE restaurant_id::text = ANY(${ids})`).map(r => r.id));
const out = [];
for (const id of ids) {
  if (have.has(id) || skipIds.has(id)) continue;
  const e = JSON.parse(fs.readFileSync(`menus/wip/photos/${id}.json`, "utf8"));
  if (e.dishes?.length) out.push(e);
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`${out.length} entries, ${out.reduce((a, e) => a + e.dishes.length, 0)} dishes -> ${outFile}`);
