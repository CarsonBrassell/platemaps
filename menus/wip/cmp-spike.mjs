import fs from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const d = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/router";
const out = JSON.parse(fs.readFileSync(d + "/router-20260904-211043.json", "utf8"));
const rows = Array.isArray(out) ? out : out.entries || out.results || [];
const notes = JSON.parse(fs.readFileSync(d + "/router-20260904-211043.notes.json", "utf8"));

const ids = rows.map((e) => String(e.restaurantId ?? e.id));
const cur = ids.length
  ? await sql`SELECT restaurant_id AS id, COUNT(*)::int AS c FROM dishes
              WHERE restaurant_id = ANY(${ids}) GROUP BY restaurant_id`
  : [];
const было = new Map(cur.map((x) => [String(x.id), x.c]));

console.log("=== filed: new vs stored ===");
const keep = [];
for (const e of rows) {
  const id = String(e.restaurantId ?? e.id);
  const n = (e.dishes || e.rows || []).length;
  const was = было.get(id) ?? 0;
  const verdict = n > was ? "GAIN +" + (n - was) : n === was ? "same - skip" : "REGRESSION - SKIP";
  if (n > was) keep.push(id);
  console.log(`  ${id.padEnd(5)} ${String(e.name).slice(0, 32).padEnd(33)} ${String(was).padStart(4)} -> ${String(n).padStart(4)}  ${verdict}`);
}
console.log("\nloadable (strictly larger): " + (keep.join(",") || "none"));

console.log("\n=== confirmed truncated but unreachable by fetch ===");
for (const n of notes.filter((x) => x.outcome === "too-few"))
  console.log(`  ${n.restaurantId} ${String(n.name).slice(0, 30).padEnd(31)} ${String(n.detail).slice(0, 90)}`);
