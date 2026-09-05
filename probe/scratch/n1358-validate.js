import { readFileSync } from "node:fs";

const OUT = "C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-n1358-01.json";
const WORKLIST = "C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/n1358-01.json";

let results;
try {
  results = JSON.parse(readFileSync(OUT, "utf8"));
} catch (e) {
  console.error("FAIL: result file does not parse:", e.message);
  process.exit(1);
}

const worklist = JSON.parse(readFileSync(WORKLIST, "utf8"));
const workIds = new Set(worklist.map((r) => String(r.restaurantId || r.id)));
const resultIds = new Set(results.map((r) => String(r.restaurantId)));

let ok = true;

if (workIds.size !== resultIds.size) {
  ok = false;
  console.error(`FAIL: id count mismatch - worklist ${workIds.size}, results ${resultIds.size}`);
}
for (const id of workIds) {
  if (!resultIds.has(id)) { ok = false; console.error("FAIL: missing restaurantId from results:", id); }
}
for (const id of resultIds) {
  if (!workIds.has(id)) { ok = false; console.error("FAIL: extra restaurantId not in worklist:", id); }
}

const priceRe = /^\$\d+(\.\d{2})?$/;
for (const r of results) {
  if (!Array.isArray(r.dishes)) { ok = false; console.error(`FAIL: ${r.restaurantId} dishes not an array`); continue; }
  for (const d of r.dishes) {
    if (!priceRe.test(d.price)) {
      ok = false;
      console.error(`FAIL: ${r.restaurantId} ${r.name} - bad price "${d.price}" on dish "${d.name}"`);
    }
  }
  if (r.blocked && r.dishes.length > 0) {
    ok = false;
    console.error(`FAIL: ${r.restaurantId} ${r.name} - marked blocked but has ${r.dishes.length} dishes`);
  }
}

console.log(`entries: ${results.length}, worklist ids: ${workIds.size}`);
console.log(`filed (dishes>0): ${results.filter(r=>r.dishes.length>0).length}, blocked: ${results.filter(r=>r.blocked).length}`);
console.log(ok ? "VALIDATION PASSED" : "VALIDATION FAILED");
process.exit(ok ? 0 : 1);
