const fs = require('fs');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');

// Find category anchor positions
const catRe = /data-testid="menu-item-target-([^"]+)"/g;
let cats = [];
let m;
while ((m = catRe.exec(html))) {
  cats.push({ name: m[1], index: m.index });
}

// Find item blocks: name + optional description + price
const itemRe = /<span class="headerText">([^<]*)<\/span><\/h3>(?:<div data-testid="item-content-description" class="itemDescription">([^<]*)<\/div>)?<\/div><div class="priceAvailability"><div class="priceLine"><span class="price"[^>]*>(\$[0-9.]+)<\/span>/g;

let items = [];
while ((m = itemRe.exec(html))) {
  const idx = m.index;
  // find nearest preceding category
  let cat = 'Unknown';
  for (const c of cats) {
    if (c.index <= idx) cat = c.name; else break;
  }
  items.push({ section: cat, name: m[1].trim(), description: (m[2]||'').trim(), price: m[3] });
}

console.log('Total items found:', items.length);
console.log(JSON.stringify(items, null, 1));
