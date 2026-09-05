// Extract schema.org Menu JSON-LD from a DoorDash store page.
const fs = require('fs');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const scriptRe = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
let m;
let found = 0;
let addr = null;
while ((m = scriptRe.exec(html))) {
  let obj;
  try { obj = JSON.parse(m[1]); } catch (e) { continue; }
  const arr = Array.isArray(obj) ? obj : [obj];
  for (const o of arr) {
    if (o['@type'] === 'Restaurant' || o['@type'] === 'LocalBusiness') {
      addr = JSON.stringify(o.address || o.address1 || '');
    }
    if (o.hasMenu) {
      const menus = Array.isArray(o.hasMenu) ? o.hasMenu : [o.hasMenu];
      for (const menu of menus) {
        printMenu(menu);
      }
    }
    if (o['@type'] === 'Menu') {
      printMenu(o);
    }
  }
}
function printMenu(menu) {
  const sections = menu.hasMenuSection || [];
  const flatSections = flatten(sections);
  for (const sec of flatSections) {
    const secName = sec.name || '';
    const items = sec.hasMenuItem || [];
    for (const item of items) {
      const name = item.name || '';
      const offers = item.offers || {};
      const price = offers.price;
      if (price === undefined || price === null) continue;
      found++;
      console.log(JSON.stringify({ section: secName, name, price, desc: item.description || '' }));
    }
  }
}
function flatten(arr) {
  let out = [];
  for (const a of arr) {
    if (Array.isArray(a)) out = out.concat(flatten(a));
    else out.push(a);
  }
  return out;
}
console.error('ADDR:', addr);
console.error('COUNT:', found);
