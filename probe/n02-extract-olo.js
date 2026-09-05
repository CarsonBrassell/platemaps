const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

// Walk the doc linearly, tracking category as we see cat-name markers,
// and item name + price pairs inside lp-menu-item-wrap blocks.
const catRe = /class="lp-menu-cat-name"[^>]*>([\s\S]*?)<\/h\d>|class="lp-menu-cat-name"[^>]*>([\s\S]*?)<\/div>/g;

// Simpler: tokenize by finding all cat-name and item-wrap start positions with their index, then sort by index.
function findAll(regex, tagName) {
  const out = [];
  let m;
  const re = new RegExp(regex, 'g');
  while ((m = re.exec(html))) {
    out.push({ idx: m.index, tag: tagName, text: m[1] });
  }
  return out;
}

const cats = findAll('class="lp-menu-cat-name"[^>]*>([^<]*)<', 'cat');
const names = findAll('class="lp-menu-item-product-name"[^>]*>([^<]*)<', 'name');
const prices = findAll('class="lp-menu-item-price"[^>]*>\\$([0-9.]+)<', 'price');

console.log('cats found:', cats.length, 'names:', names.length, 'prices:', prices.length);

// Merge names+prices by nearest pairing: assume names and prices arrays are parallel (same count, same order)
const items = [];
const n = Math.min(names.length, prices.length);
for (let i = 0; i < n; i++) {
  items.push({ name: names[i].text.trim(), price: prices[i].text.trim(), idx: names[i].idx });
}

// assign category: find last cat whose idx < item idx
function catFor(idx) {
  let best = null;
  for (const c of cats) {
    if (c.idx < idx) best = c.text.trim();
    else break;
  }
  return best;
}

for (const it of items) {
  console.log(`${catFor(it.idx)} :: ${it.name} :: $${it.price}`);
}
