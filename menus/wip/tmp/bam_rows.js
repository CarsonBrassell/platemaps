const fs = require('fs');
const j = require('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/bam_ld.json')[0];
console.log('address:', JSON.stringify(j.address));
const sections = j.hasMenu.hasMenuSection;
console.log('num top sections', sections.length);

function walk(sec, path, rows) {
  const name = sec.name || '';
  const items = sec.hasMenuItem || [];
  for (const it of items) {
    let price = null;
    if (it.offers) {
      if (Array.isArray(it.offers)) {
        price = it.offers[0] && it.offers[0].price;
      } else {
        price = it.offers.price;
      }
    }
    if (price) {
      rows.push({ name: it.name, description: it.description || '', price: (price.startsWith('$')?price:'$'+price), section: path.concat(name).filter(Boolean).join(' - ') });
    }
  }
  const subs = sec.hasMenuSection || [];
  for (const s of subs) {
    walk(s, path.concat(name), rows);
  }
}

const rows = [];
for (const s of sections) walk(s, [], rows);
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/tmp/bam_rows.json', JSON.stringify(rows, null, 2));
console.log('TOTAL ROWS', rows.length);
const secCounts = {};
rows.forEach(r=>{secCounts[r.section]=(secCounts[r.section]||0)+1;});
console.log(secCounts);

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
