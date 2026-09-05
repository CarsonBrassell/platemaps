const fs = require('fs');
const OUT = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-w3-07.json';
const raw = fs.readFileSync(OUT, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.log('FAIL: not valid JSON:', e.message);
  process.exit(1);
}
const priceRe = /^\$\d+(\.\d{2})?$/;
let bad = 0;
let totalDishes = 0;
for (const r of data) {
  if (!r.restaurantId || !r.name) {
    console.log('FAIL: entry missing restaurantId/name', JSON.stringify(r).slice(0,100));
    bad++;
  }
  const dishes = r.dishes || [];
  totalDishes += dishes.length;
  for (const d of dishes) {
    if (!priceRe.test(d.price)) {
      console.log('BAD PRICE', r.restaurantId, r.name, JSON.stringify(d.price), d.name);
      bad++;
    }
  }
}
console.log('entries:', data.length, 'totalDishes:', totalDishes, 'badCount:', bad);
if (bad === 0) console.log('OK: all prices valid, JSON parses');
else process.exit(1);
