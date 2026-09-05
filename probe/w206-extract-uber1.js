const fs = require('fs');
const obj = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let sections = obj.hasMenu.hasMenuSection;
if (!Array.isArray(sections)) sections = [sections];
sections = sections.flat(Infinity);
const rows = [];
for (const sec of sections || []) {
  const secName = sec.name || '';
  let items = sec.hasMenuItem || [];
  if (!Array.isArray(items)) items = [items];
  for (const it of items) {
    let price = null;
    if (it.offers) {
      const off = Array.isArray(it.offers) ? it.offers[0] : it.offers;
      price = off && off.price;
    }
    rows.push({ section: secName, name: it.name, description: it.description || '', price });
  }
}
console.log('total rows', rows.length);
for (const r of rows) console.log(r.section, '|', r.name, '|', r.price, '|', (r.description||'').slice(0,40));
