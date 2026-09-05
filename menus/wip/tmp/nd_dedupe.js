const fs = require('fs');
const rows = require('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/nd_rows.json');
const marketingSections = new Set(['New & Featured', 'Limited-Time Only']);
const byName = new Map();
for (const r of rows) {
  const key = r.name;
  if (!byName.has(key)) {
    byName.set(key, r);
  } else {
    const existing = byName.get(key);
    // prefer a non-marketing section if the existing one is marketing and this one isn't
    if (marketingSections.has(existing.section) && !marketingSections.has(r.section)) {
      byName.set(key, r);
    }
  }
}
const deduped = [...byName.values()];
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/nd_rows_dedup.json', JSON.stringify(deduped, null, 2));
console.log('deduped rows:', deduped.length, '(from', rows.length, ')');
console.log('valid prices:', deduped.every(r => /^\$\d+(\.\d{2})?\+?$/.test(r.price)));
