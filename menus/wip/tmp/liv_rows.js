const fs = require('fs');
const j = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/liv_menu.json', 'utf8'));
const sections = j.hasMenuSection[0];
const rows = [];
for (const s of sections) {
  if (s.name === 'Most Ordered') continue; // duplicate of other sections
  for (const it of (s.hasMenuItem || [])) {
    const price = it.offers && it.offers.price;
    if (!price) continue;
    rows.push({ name: it.name.replace(/^\d+\.\s*/, ''), description: it.description || '', price, section: s.name });
  }
}
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/liv_rows.json', JSON.stringify(rows, null, 2));
console.log('rows:', rows.length);
rows.forEach(r => console.log(r.section, '|', r.name, '|', r.price));

// markup test
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
