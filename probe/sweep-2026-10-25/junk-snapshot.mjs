import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT d.* FROM dishes d JOIN restaurants r ON r.id=d.restaurant_id
 WHERE lower(trim(d.name)) IN ('close','out of stock','unavailable','card fee')`;
writeFileSync("probe/sweep-2026-10-25/snapshot-junk-dishes.json", JSON.stringify(rows, null, 1));
const by = {};
for (const r of rows) by[r.name + " | rest " + r.restaurant_id] = (by[r.name + " | rest " + r.restaurant_id] ?? 0) + 1;
console.log(rows.length, "rows;", Object.keys(rows[0]).join(","));
console.log("sample prices:", [...new Set(rows.map(r => r.price))].slice(0, 15).join(" "));
console.log("sample sections:", [...new Set(rows.map(r => r.category ?? r.section))].slice(0, 15).join(" | "));
