// Prints every entry that load-menus.mjs would record as permanent not_found
// (empty dishes and no `blocked` key). Exit 1 if any such entry lacks the
// canonical not_found marker so the coordinator can compare against the report.
// Also flags entries whose dishes carry malformed prices ("$NaN", numbers,
// missing): the screener drops those as unpriced and, with no blocked key
// left behind, the loader then records a permanent not_found (4027, 2026-09-07).
import fs from "fs";
const f = process.argv[2];
const rows = JSON.parse(fs.readFileSync(f, "utf8"));
// Loader accepts "$12", "$12.50", bare numbers and "$16 / $20"; only reject prices with no parseable positive number ("$NaN", "", null).
const priceOk = (p) => { const n = typeof p === "number" ? p : parseFloat(String(p ?? "").replace(/[^0-9.]/g, " ").trim()); return Number.isFinite(n) && n > 0; };
let nf = 0, bad = 0, badPrice = 0;
for (const e of rows) {
  const dishes = e.dishes || [];
  const d = dishes.length;
  if (d === 0 && !e.blocked) {
    nf++;
    const v = e.verdict || e.status || "";
    const flag = v && v !== "not_found" ? "  <-- verdict field says " + v : "";
    if (flag) bad++;
    console.log("not_found:", e.restaurantId, e.name, flag);
  }
  const broken = dishes.filter(x => !priceOk(x.price)).length;
  if (broken) {
    badPrice++;
    console.log("bad prices:", e.restaurantId, e.name, `${broken}/${d} dishes with no parseable price (e.g. ${JSON.stringify(dishes.find(x => !priceOk(x.price)).price)})`);
  }
}
console.log(`${rows.length} entries, ${nf} will load as not_found, ${bad} mismatched, ${badPrice} with bad prices`);
process.exit(bad || badPrice ? 1 : 0);
