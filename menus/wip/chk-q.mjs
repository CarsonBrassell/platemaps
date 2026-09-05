import fs from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const trunc = JSON.parse(fs.readFileSync("menus/wip/truncated-79.json", "utf8"));
const ids = trunc.map((t) => String(t.restaurantId));
const r = await sql`SELECT id, name, website FROM restaurants WHERE id = ANY(${ids})`;
const byId = new Map(r.map((x) => [String(x.id), x]));
let withSite = 0, without = [];
for (const t of trunc) {
  const x = byId.get(String(t.restaurantId));
  if (x?.website) withSite++;
  else without.push(`${t.restaurantId} ${t.name}`);
}
console.log(`${trunc.length} truncated; ${withSite} have a website, ${without.length} do not`);
for (const w of without.slice(0, 12)) console.log("  no website: " + w);
console.log("\nIDS=" + ids.join(","));
