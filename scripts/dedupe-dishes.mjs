/**
 * Removes duplicate dish rows: same restaurant, same folded name, same section.
 *
 *   node --env-file=.env.local scripts/dedupe-dishes.mjs          # report
 *   node --env-file=.env.local scripts/dedupe-dishes.mjs --apply
 *
 * Delivery-app menus list the same item under pickup and delivery pricing, and
 * some extractors re-emit an item once per option; both leave a menu page with
 * "Carnitas Taco" twice in a row. The 2026-09-13 spot check found 278 listed
 * restaurants with the pattern.
 *
 * Only groups whose descriptions agree are collapsed (null counts as agreeing
 * with anything). Two rows with the same name and different descriptions are
 * different items — "A Gift from San Diego" at $48.99 and $80.99 are two gift
 * boxes — and stay. The same name in two *sections* is never touched either:
 * a happy-hour listing is legitimately a separate row.
 *
 * Keeper: a priced row over an unpriced one, then the lowest price (the
 * pickup price is the in-store price; the higher is the delivery markup),
 * then the lowest sort_order. Deleted rows are snapshotted to probe/snapshots/.
 */
import { neon } from "@neondatabase/serverless";
import { writeFileSync, mkdirSync } from "node:fs";

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");

const rows = await sql`
  SELECT d.id, d.restaurant_id, d.name, d.name_folded, d.section, d.price, d.description, d.sort_order
  FROM dishes d
  JOIN (
    SELECT restaurant_id, name_folded, COALESCE(section, '') AS sec
    FROM dishes WHERE source = 'menu'
    GROUP BY 1, 2, 3 HAVING count(*) > 1
  ) g ON g.restaurant_id = d.restaurant_id AND g.name_folded = d.name_folded
     AND COALESCE(d.section, '') = g.sec
  WHERE d.source = 'menu'
  ORDER BY d.restaurant_id, d.name_folded, d.section, d.sort_order`;

const groups = new Map();
for (const r of rows) {
  const k = `${r.restaurant_id} ${r.name_folded} ${r.section ?? ""}`;
  (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
}

const priceNum = (p) => {
  const m = String(p ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const toDelete = [];
const fills = [];
let skippedDesc = 0;
const restaurants = new Set();
for (const g of groups.values()) {
  const descs = new Set(g.map((r) => norm(r.description)).filter(Boolean));
  if (descs.size > 1) { skippedDesc += 1; continue; }
  const keeper = g.reduce((k, r) => {
    const kp = priceNum(k.price), rp = priceNum(r.price);
    if ((kp != null) !== (rp != null)) return rp != null ? r : k;
    if (kp != null && rp != null && kp !== rp) return rp < kp ? r : k;
    return r.sort_order < k.sort_order ? r : k;
  });
  // If the keeper has no description but a sibling does, carry it over.
  if (!keeper.description) {
    const donor = g.find((r) => r.description);
    if (donor) fills.push({ id: keeper.id, description: donor.description });
  }
  for (const r of g) if (r.id !== keeper.id) toDelete.push(r);
  restaurants.add(g[0].restaurant_id);
}

console.log(`${groups.size} duplicate groups in ${new Set(rows.map((r) => r.restaurant_id)).size} restaurants.`);
console.log(`${groups.size - skippedDesc} collapsible (${toDelete.length} rows to delete across ${restaurants.size} restaurants); ${skippedDesc} left alone because descriptions differ; ${fills.length} keepers gain a description.`);
for (const r of toDelete.slice(0, 12)) console.log(`  del ${r.restaurant_id} ${JSON.stringify(r.name)} [${r.section ?? "-"}] ${r.price ?? "-"}`);
if (!APPLY) { console.log("\nDry run. Re-run with --apply to write."); process.exit(0); }

mkdirSync("probe/snapshots", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
writeFileSync(`probe/snapshots/dedupe-dishes-${stamp}.json`, JSON.stringify(toDelete, null, 1));

const ids = toDelete.map((r) => r.id);
let deleted = 0;
for (let i = 0; i < ids.length; i += 500) {
  const chunk = ids.slice(i, i + 500);
  const res = await sql`DELETE FROM dishes WHERE id = ANY(${chunk}) AND source = 'menu' RETURNING id`;
  deleted += res.length;
}
for (const f of fills) await sql`UPDATE dishes SET description = ${f.description} WHERE id = ${f.id}`;
console.log(`\nDeleted ${deleted} rows; filled ${fills.length} descriptions. Snapshot: probe/snapshots/dedupe-dishes-${stamp}.json`);
