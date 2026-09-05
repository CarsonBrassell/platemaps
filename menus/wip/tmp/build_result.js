// Builds/updates result-93.json incrementally.
const fs = require('fs');
const OUT = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-93.json';

function load() {
  if (fs.existsSync(OUT)) return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  return [];
}

function save(arr) {
  fs.writeFileSync(OUT, JSON.stringify(arr, null, 2));
  // verify
  const check = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  for (const entry of check) {
    for (const d of (entry.dishes || [])) {
      if (!/^\$\d+(\.\d{2})?$/.test(d.price)) {
        throw new Error('BAD PRICE in ' + entry.restaurantId + ': ' + JSON.stringify(d));
      }
    }
  }
  console.log('Saved and verified', check.length, 'restaurants. Total dishes:', check.reduce((s,e)=>s+(e.dishes||[]).length,0));
}

function upsert(entry) {
  const arr = load();
  const idx = arr.findIndex(e => e.restaurantId === entry.restaurantId);
  if (idx >= 0) arr[idx] = entry; else arr.push(entry);
  save(arr);
}

module.exports = { load, save, upsert };
