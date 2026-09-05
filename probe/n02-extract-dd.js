// Extract DoorDash JSON-LD from a page-service.doordash.com dump.
// Usage: node n02-extract-dd.js <path-to-html>
const fs = require('fs');
const path = process.argv[2];
const html = fs.readFileSync(path, 'utf8');

const blocks = [];
const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  try {
    blocks.push(JSON.parse(m[1]));
  } catch (e) {
    // try to fix common issues
  }
}
console.log('found blocks:', blocks.length);
for (const b of blocks) {
  console.log('---type:', b['@type'], 'name:', b.name);
}

// Look for Menu type or hasMenuSection
function flatten(x) {
  if (Array.isArray(x)) return x.flatMap(flatten);
  return [x];
}

let items = [];
for (const b of blocks) {
  let sections = b.hasMenuSection || (b.hasMenu && b.hasMenu.hasMenuSection);
  if (!sections) continue;
  sections = flatten(sections);
  for (const s of sections) {
    const sname = s.name || '';
    let menuItems = s.hasMenuItem || [];
    menuItems = flatten(menuItems);
    for (const it of menuItems) {
      const name = it.name;
      let price = null;
      if (it.offers) {
        const off = Array.isArray(it.offers) ? it.offers[0] : it.offers;
        price = off && off.price;
      }
      if (name && price != null) {
        items.push({ name, price: String(price).replace('$',''), section: sname, desc: it.description || '' });
      }
    }
  }
}

console.log('total items (pre-dedupe):', items.length);
const seen = new Set();
const deduped = [];
for (const it of items) {
  const key = it.name + '|' + it.price;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(it);
}
console.log('deduped items:', deduped.length);
for (const it of deduped) {
  console.log(`${it.section} :: ${it.name} :: $${it.price}`);
}
