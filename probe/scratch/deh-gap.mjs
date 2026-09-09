import { readFileSync, statSync } from "node:fs";
import { sql } from "../../scripts/sql-client.mjs";
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
console.log("coverage-missing mtime", statSync("data/coverage-missing.json").mtime.toISOString(), "deh-facilities mtime", statSync("data/deh-facilities.json").mtime.toISOString());
const deh = J("data/deh-facilities.json"); const dehArr = Array.isArray(deh) ? deh : Object.values(deh).find(Array.isArray);
const excl = J("data/deh-excluded.json"); const exclArr = Array.isArray(excl) ? excl : Object.values(excl).find(Array.isArray);
const exclIds = new Map(exclArr.map(e => [e.recordId, e.why]));
const rows = await sql`select deh_record_id, source_key from restaurants`;
const have = new Set(); for (const r of rows) { if (r.deh_record_id) have.add(r.deh_record_id); if (r.source_key?.startsWith("deh:")) have.add(r.source_key.slice(4)); }
const TYPES = new Set(["Restaurant Food Facility","Low Risk Food Facility"]);
let active = 0, matched = 0, excluded = 0; const missing = []; const why = {};
for (const f of dehArr) {
  if (f["Active Permit"] !== "Y" || f["Permit Status"] === "Expired" || !TYPES.has(f["Business Type"])) continue;
  active++; const id = f["Record ID"];
  if (have.has(id)) { matched++; continue; }
  if (exclIds.has(id)) { excluded++; const w = exclIds.get(id).replace(/[0-9].*/, ""); why[w] = (why[w] ?? 0) + 1; continue; }
  missing.push(f);
}
console.log({ active, matched, excludedByRule: excluded, unmatched: missing.length });
console.log("exclusion reasons:", Object.entries(why).sort((a,b)=>b[1]-a[1]).slice(0,12));
const byType = {}; for (const m of missing) byType[m["Business Type"]] = (byType[m["Business Type"]] ?? 0) + 1; console.log("unmatched by type", byType);
const byYear = {}; for (const m of missing) { const y = m["Record ID"].slice(3,7); byYear[y] = (byYear[y] ?? 0) + 1; } console.log("unmatched by permit year", byYear);
console.log("sample unmatched:"); for (const m of missing.sort(() => Math.random() - 0.5).slice(0, 25)) console.log(" ", m["Record ID"], "|", m["Record Name"], "|", m["Address"], m["City"]);
const dessert = missing.filter(m => /ice cream|creamery|gelato|yogurt|boba|tea|dessert|donut|bakery|cookie|cake|juice|acai|crepe|churro/i.test(m["Record Name"]));
console.log("unmatched with dessert-ish names:", dessert.length); for (const m of dessert.slice(0,15)) console.log(" ", m["Record Name"], "|", m["Address"], m["City"]);
const cnt = await sql`select cuisine, count(*)::int n from restaurants where listed group by 1 order by 2 desc limit 12`; console.log("listed by cuisine", cnt.map(r=>`${r.cuisine}=${r.n}`).join(", "));
