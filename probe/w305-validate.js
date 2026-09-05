const fs = require('fs');
const file = process.argv[2] || "C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-w3-05.json";
const raw = fs.readFileSync(file, 'utf8');
let arr;
try { arr = JSON.parse(raw); } catch (e) { console.error('PARSE FAIL:', e.message); process.exit(1); }
const priceRe = /^\$\d+(\.\d{2})?$/;
let bad = 0;
const ids = new Set();
for (const e of arr) {
  if (!e.restaurantId || !e.name) { console.error('missing id/name', e); bad++; }
  if (ids.has(e.restaurantId)) { console.error('DUP id', e.restaurantId); bad++; }
  ids.add(e.restaurantId);
  if (!Array.isArray(e.dishes)) { console.error('dishes not array', e.restaurantId); bad++; continue; }
  for (const d of e.dishes) {
    if (!priceRe.test(d.price)) { console.error('BAD PRICE', e.restaurantId, e.name, JSON.stringify(d.price), d.name); bad++; }
  }
}
console.log('entries:', arr.length, 'bad:', bad);
if (bad > 0) process.exit(1);
console.log('OK');
