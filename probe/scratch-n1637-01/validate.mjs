import fs from 'fs';
const wip = JSON.parse(fs.readFileSync('menus/wip/n1637-01.json','utf8'));
const res = JSON.parse(fs.readFileSync('menus/wip/result-n1637-01.json','utf8'));
const wipIds = wip.map(r=>r.restaurantId);
const resIds = res.map(r=>r.restaurantId);
console.log('wip count:', wipIds.length, 'result count:', resIds.length);
const missing = wipIds.filter(id=>!resIds.includes(id));
const extra = resIds.filter(id=>!wipIds.includes(id));
console.log('missing:', missing);
console.log('extra:', extra);
const dupCheck = new Map();
for (const id of resIds) dupCheck.set(id,(dupCheck.get(id)||0)+1);
for (const [id,c] of dupCheck) if (c>1) console.log('DUPLICATE ID', id, c);
let priceErrors = [];
const priceRe = /^\$\d+(\.\d{2})?$/;
for (const r of res) {
  for (const d of (r.dishes||[])) {
    if (!priceRe.test(d.price)) priceErrors.push({id: r.restaurantId, name: d.name, price: d.price});
  }
}
console.log('price format errors:', priceErrors.length, priceErrors);
// check not_found entries have no blocked key
for (const r of res) {
  const isNotFound = (!r.blocked) && (!r.dishes || r.dishes.length===0);
  if (isNotFound) console.log('NOT_FOUND entry:', r.restaurantId, r.name);
}
