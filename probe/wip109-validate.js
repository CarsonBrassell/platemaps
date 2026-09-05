const fs = require('fs');
const path = process.argv[2];
const raw = fs.readFileSync(path, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('PARSE FAILED:', e.message);
  process.exit(1);
}
if (!Array.isArray(data)) {
  console.error('NOT AN ARRAY');
  process.exit(1);
}
let ok = true;
const priceRe = /^\$\d+(\.\d{2})?$/;
data.forEach((entry, i) => {
  if (!entry.restaurantId) { console.error(`entry ${i}: missing restaurantId`); ok = false; }
  if (!entry.name) { console.error(`entry ${i}: missing name`); ok = false; }
  if (!Array.isArray(entry.dishes)) { console.error(`entry ${i} (${entry.name}): dishes not array`); ok = false; }
  (entry.dishes || []).forEach((d, j) => {
    if (!priceRe.test(d.price)) {
      console.error(`entry ${i} (${entry.name}) dish ${j} (${d.name}): bad price "${d.price}"`);
      ok = false;
    }
  });
});
console.log(`entries: ${data.length}`);
console.log(ok ? 'ALL OK' : 'FAILURES ABOVE');
process.exit(ok ? 0 : 1);
