import fs from 'fs';

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
let m;
let blocks = [];
while ((m = re.exec(html))) {
  blocks.push(m[1]);
}
console.log(`found ${blocks.length} ld+json blocks in ${file}`);

function walk(obj, cb) {
  if (Array.isArray(obj)) { obj.forEach(o => walk(o, cb)); return; }
  if (obj && typeof obj === 'object') {
    cb(obj);
    for (const k of Object.keys(obj)) walk(obj[k], cb);
  }
}

let menuBlocks = [];
for (const b of blocks) {
  let data;
  try { data = JSON.parse(b); } catch (e) { console.log('parse error', e.message); continue; }
  walk(data, (o) => {
    if (o['@type'] === 'Menu' || (Array.isArray(o['@type']) && o['@type'].includes('Menu'))) {
      menuBlocks.push(o);
    }
  });
}
console.log(`found ${menuBlocks.length} Menu-type blocks`);

let items = [];
for (const menu of menuBlocks) {
  let sections = menu.hasMenuSection;
  if (!sections) continue;
  // flatten possible nesting
  function flattenSections(s, out) {
    if (Array.isArray(s)) { s.forEach(x => flattenSections(x, out)); return; }
    if (s && typeof s === 'object') out.push(s);
  }
  let flat = [];
  flattenSections(sections, flat);
  for (const sec of flat) {
    const secName = sec.name || '';
    let menuItems = sec.hasMenuItem;
    if (!menuItems) continue;
    let flatItems = [];
    flattenSections(menuItems, flatItems);
    for (const it of flatItems) {
      let price = null;
      if (it.offers) {
        let offers = Array.isArray(it.offers) ? it.offers : [it.offers];
        for (const off of offers) {
          if (off && off.price != null) { price = off.price; break; }
        }
      }
      items.push({ name: it.name, description: it.description || '', price, section: secName });
    }
  }
}
console.log(`extracted ${items.length} raw items from Menu blocks`);
fs.writeFileSync(file + '.items.json', JSON.stringify(items, null, 2));
