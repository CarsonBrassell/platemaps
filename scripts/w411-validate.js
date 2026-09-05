const fs = require('fs');
const path = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-w4-11.json';
const raw = fs.readFileSync(path, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('JSON PARSE FAILED:', e.message);
  process.exit(1);
}
if (!Array.isArray(data)) {
  console.error('FAIL: top-level is not an array');
  process.exit(1);
}
const priceRe = /^\$\d+(\.\d{2})?$/;
let errors = 0;
let totalDishes = 0;
for (const r of data) {
  if (!r.restaurantId || !r.name) {
    console.error('FAIL: missing restaurantId/name', JSON.stringify(r).slice(0,80));
    errors++;
  }
  const isBlocked = typeof r.blocked === 'string' && r.blocked.length > 0;
  const isFiled = Array.isArray(r.dishes) && r.dishes.length > 0;
  const isNotFound = Array.isArray(r.dishes) && r.dishes.length === 0 && !isBlocked;
  if (isBlocked && isFiled) {
    console.error('FAIL: entry has both blocked and dishes', r.restaurantId);
    errors++;
  }
  for (const d of (r.dishes || [])) {
    totalDishes++;
    if (!priceRe.test(d.price)) {
      console.error('FAIL: bad price format', r.restaurantId, d.name, JSON.stringify(d.price));
      errors++;
    }
    if (!d.name || !d.section) {
      console.error('FAIL: dish missing name/section', r.restaurantId, JSON.stringify(d));
      errors++;
    }
  }
  console.log(r.restaurantId, '|', r.name, '|', isFiled ? 'FILED('+r.dishes.length+')' : (isBlocked ? 'BLOCKED' : 'NOT_FOUND'));
}
console.log('---');
console.log('total restaurants:', data.length, 'total dishes:', totalDishes, 'errors:', errors);
if (errors > 0) process.exit(1);
console.log('VALIDATION PASSED');
