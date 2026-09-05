import fs from 'fs';
const j = JSON.parse(fs.readFileSync('probe/scratch-n1637-01/1791-ld-0.json','utf8'));
const menu = j.hasMenu;
let sections = menu.hasMenuSection;
if (Array.isArray(sections) && Array.isArray(sections[0])) sections = sections.flat();
let out = [];
for (const sec of sections) {
  const secName = sec.name;
  let items = sec.hasMenuItem;
  if (!items) continue;
  if (!Array.isArray(items)) items = [items];
  for (const it of items) {
    let price = it.offers && it.offers.price;
    out.push({section: secName, name: it.name, price});
  }
}
fs.writeFileSync('probe/scratch-n1637-01/1791-items.json', JSON.stringify(out, null, 1));
console.log('total items:', out.length);
console.log('sections:', sections.map(s=>s.name));
