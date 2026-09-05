const fs = require('fs');
const path = "C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-tp5-01.json";
const raw = fs.readFileSync(path, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error("PARSE FAILED:", e.message);
  process.exit(1);
}
console.log("Parsed OK. Entries:", data.length);
const priceRe = /^\$\d+(\.\d{2})?$/;
let bad = 0;
for (const r of data) {
  if (!('dishes' in r)) { console.error("Missing dishes key:", r.restaurantId); bad++; continue; }
  for (const d of r.dishes) {
    if (!priceRe.test(d.price)) {
      console.error("BAD PRICE", r.restaurantId, d.name, JSON.stringify(d.price));
      bad++;
    }
  }
}
console.log(bad === 0 ? "ALL PRICES VALID" : `${bad} BAD PRICES`);
