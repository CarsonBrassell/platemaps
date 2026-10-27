// Pre-load filter for a re-extract result file.
//   node probe/sweep-2026-10-25/rx-filter.mjs NN
// Drops any entry with empty dishes (would retire the restaurant as not_found),
// any entry under 60% of currentDishes without a notes explanation, and any id
// not in the batch. Writes menus/wip/rx-filtered-NN.json for screen-menus.mjs.
import { readFileSync, writeFileSync } from "node:fs";

const nn = process.argv[2];
const batch = JSON.parse(readFileSync(`menus/wip/rx-${nn}.json`, "utf8"));
const result = JSON.parse(readFileSync(`menus/wip/rx-result-${nn}.json`, "utf8"));
const byId = new Map(batch.map((b) => [String(b.restaurantId), b]));

const keep = [];
for (const e of result) {
  const b = byId.get(String(e.restaurantId));
  const n = Array.isArray(e.dishes) ? e.dishes.length : 0;
  if (!b) { console.log(`DROP ${e.restaurantId} not in batch`); continue; }
  if (n === 0) { console.log(`DROP ${e.restaurantId} empty`); continue; }
  if (n < 8) { console.log(`DROP ${e.restaurantId} only ${n} dishes`); continue; }
  if (n < 0.6 * b.currentDishes && !e.notes) {
    console.log(`DROP ${e.restaurantId} ${n} vs ${b.currentDishes} current, no note`); continue;
  }
  console.log(`KEEP ${e.restaurantId} ${n} (was ${b.currentDishes})`);
  keep.push({ ...e, name: b.name });
}
writeFileSync(`menus/wip/rx-filtered-${nn}.json`, JSON.stringify(keep, null, 1));
writeFileSync(`menus/wip/rx-ids-${nn}.json`, JSON.stringify(keep.map((e) => e.restaurantId)));
console.log(`kept ${keep.length} of ${result.length}`);
