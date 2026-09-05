const fs = require('fs');
const path = "C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-w2-03.json";
const raw = fs.readFileSync(path, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error("PARSE FAILED:", e.message);
  process.exit(1);
}
if (!Array.isArray(data)) {
  console.error("NOT AN ARRAY");
  process.exit(1);
}
const priceRe = /^\$\d+(\.\d{2})?$/;
let bad = 0;
for (const entry of data) {
  if (!entry.restaurantId || !entry.name) {
    console.error("MISSING id/name:", JSON.stringify(entry).slice(0, 100));
    bad++;
  }
  if (!Array.isArray(entry.dishes)) {
    console.error("MISSING dishes array:", entry.restaurantId);
    bad++;
    continue;
  }
  for (const d of entry.dishes) {
    if (!priceRe.test(d.price)) {
      console.error("BAD PRICE:", entry.restaurantId, d.name, JSON.stringify(d.price));
      bad++;
    }
  }
}
console.log(`entries: ${data.length}, bad: ${bad}`);
