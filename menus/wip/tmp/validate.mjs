import fs from 'fs';
const worklist = JSON.parse(fs.readFileSync('menus/wip/next-36.json', 'utf8'));
const result = JSON.parse(fs.readFileSync('menus/wip/result-60.json', 'utf8'));
console.log('worklist count', worklist.length, 'result count', result.length);

let totalDishes = 0;
let badPrices = 0;
for (const r of result) {
  totalDishes += r.dishes.length;
  for (const d of r.dishes) {
    if (!d.price || typeof d.price !== 'string' || !d.price.startsWith('$') || !/\d/.test(d.price)) {
      console.log('BAD PRICE', r.restaurantId, d.name, JSON.stringify(d.price));
      badPrices++;
    }
  }
}
console.log('total dishes:', totalDishes, 'bad prices:', badPrices);

for (const w of worklist) {
  const r = result.find(x => x.restaurantId === w.restaurantId);
  if (!r) { console.log('MISSING', w.restaurantId, w.name); continue; }
  if (r.name !== w.name) console.log('NAME MISMATCH', r.restaurantId, r.name, '!=', w.name);
  if (!('dishes' in r)) console.log('NO DISHES KEY', r.restaurantId);
}
console.log('validation done');
