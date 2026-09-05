const fs = require('fs');
const j = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/ph_menu.json', 'utf8'));
const sections = j.hasMenuSection[0];
const marketingSections = new Set(['Most Ordered', 'Limited Time Offering']);
const byName = new Map();
for (const s of sections) {
  for (const it of (s.hasMenuItem || [])) {
    const price = it.offers && it.offers.price;
    if (!price) continue;
    const row = { name: it.name, description: it.description || '', price, section: s.name };
    if (!byName.has(row.name)) {
      byName.set(row.name, row);
    } else {
      const existing = byName.get(row.name);
      if (marketingSections.has(existing.section) && !marketingSections.has(row.section)) {
        byName.set(row.name, row);
      }
    }
  }
}
const rows = [...byName.values()];
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/ph_rows.json', JSON.stringify(rows, null, 2));
console.log('rows:', rows.length);
console.log('all valid:', rows.every(r => /^\$\d+(\.\d{2})?$/.test(r.price)));

const prices = rows.map(r => parseFloat(r.price.replace('$','')));
for (const div of [1.04,1.1,1.15,1.2,1.25]) {
  let round=0, ninetyfive=0;
  for (const p of prices) {
    const d = p/div;
    const cents = Math.round((d - Math.floor(d))*100);
    if (cents===0 || cents===50) round++;
    if (cents===95) ninetyfive++;
  }
  console.log('div',div,'round/half:',round,'/',prices.length,'  .95:',ninetyfive);
}
