import fs from 'fs';

const worklist = JSON.parse(fs.readFileSync('../../menus/wip/n1728-02.json','utf8'));
const result = JSON.parse(fs.readFileSync('../../menus/wip/result-n1728-02.json','utf8'));

let ok = true;
const worklistIds = new Set(worklist.map(w => w.restaurantId));
const resultIds = result.map(r => r.restaurantId);
const resultIdSet = new Set(resultIds);

if (result.length !== worklist.length) {
  console.log(`FAIL: entry count ${result.length} !== worklist length ${worklist.length}`);
  ok = false;
} else {
  console.log(`OK: entry count matches (${result.length})`);
}

if (resultIds.length !== resultIdSet.size) {
  console.log('FAIL: duplicate restaurantId(s) in result');
  ok = false;
}

for (const id of worklistIds) {
  if (!resultIdSet.has(id)) { console.log(`FAIL: missing restaurantId ${id}`); ok = false; }
}
for (const id of resultIdSet) {
  if (!worklistIds.has(id)) { console.log(`FAIL: extra restaurantId ${id} not in worklist`); ok = false; }
}
if (ok) console.log('OK: restaurantId sets match exactly, no extras');

const priceRe = /^\$\d+(\.\d{2})?$/;
let totalDishes = 0;
let priceFail = 0;
for (const r of result) {
  const dishes = r.dishes || [];
  totalDishes += dishes.length;
  for (const d of dishes) {
    if (!priceRe.test(d.price)) {
      console.log(`FAIL: bad price "${d.price}" for "${d.name}" in ${r.restaurantId} ${r.name}`);
      priceFail++;
      ok = false;
    }
  }
  // filed/blocked/not_found shape sanity
  if (dishes.length > 0 && r.blocked) {
    console.log(`FAIL: ${r.restaurantId} has both dishes and blocked`);
    ok = false;
  }
  if (dishes.length === 0 && !r.blocked && r.confidence !== 'high') {
    console.log(`WARN: ${r.restaurantId} empty dishes, no blocked key, confidence ${r.confidence} (should be not_found only if certain+high)`);
  }
}
console.log(`total dishes across all filed entries: ${totalDishes}`);
console.log(priceFail === 0 ? 'OK: all prices match /^\\$\\d+(\\.\\d{2})?$/' : `FAIL: ${priceFail} bad prices`);

console.log(ok ? '\nVALIDATION PASSED' : '\nVALIDATION FAILED');
process.exit(ok ? 0 : 1);
