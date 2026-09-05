import { readFileSync } from "node:fs";

const worklist = JSON.parse(readFileSync("C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/n1637-03.json", "utf8"));
const result = JSON.parse(readFileSync("C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-n1637-03.json", "utf8"));

const priceRe = /^\$\d+(\.\d{2})?$/;
let errors = [];

if (result.length !== worklist.length) {
  errors.push(`entry count mismatch: worklist=${worklist.length} result=${result.length}`);
}

const wIds = new Set(worklist.map(w => w.restaurantId));
const rIds = result.map(r => r.restaurantId);
const rIdSet = new Set(rIds);

for (const id of wIds) {
  if (!rIdSet.has(id)) errors.push(`missing restaurantId from worklist: ${id}`);
}
for (const id of rIds) {
  if (!wIds.has(id)) errors.push(`extra restaurantId not in worklist: ${id}`);
}
const dupCheck = {};
for (const id of rIds) dupCheck[id] = (dupCheck[id]||0)+1;
for (const [id,count] of Object.entries(dupCheck)) if (count > 1) errors.push(`duplicate restaurantId in result: ${id} (${count}x)`);

for (const entry of result) {
  if (!entry.restaurantId) errors.push(`entry missing restaurantId: ${JSON.stringify(entry).slice(0,80)}`);
  if (!Array.isArray(entry.dishes)) errors.push(`${entry.restaurantId}: dishes is not an array`);
  if (entry.blocked && entry.dishes.length) errors.push(`${entry.restaurantId}: blocked entry has non-empty dishes`);
  for (const d of entry.dishes || []) {
    if (!priceRe.test(d.price)) errors.push(`${entry.restaurantId}: bad price "${d.price}" on dish "${d.name}"`);
  }
}

const filed = result.filter(r => !r.blocked && r.dishes.length > 0).length;
const blocked = result.filter(r => r.blocked).length;
const notFound = result.filter(r => !r.blocked && r.dishes.length === 0).length;

console.log(`worklist entries: ${worklist.length}`);
console.log(`result entries:   ${result.length}`);
console.log(`filed: ${filed}  blocked: ${blocked}  not_found: ${notFound}`);
console.log(errors.length ? `FAIL (${errors.length} errors):\n` + errors.join("\n") : "PASS - all checks clean");
