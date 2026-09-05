const fs = require('fs');
const all = JSON.parse(fs.readFileSync('result-44.json', 'utf8'));
let bad = 0;
for (const r of all) {
  for (const d of r.dishes) {
    if (!d.price || !/^\$\d/.test(d.price)) { console.log('BAD PRICE', r.restaurantId, d.name, JSON.stringify(d.price)); bad++; }
    if (!d.name) { console.log('MISSING NAME', r.restaurantId, JSON.stringify(d)); bad++; }
  }
}
console.log('bad count:', bad);
console.log('check complete');
