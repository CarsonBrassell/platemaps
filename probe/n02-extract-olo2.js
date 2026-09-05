const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

// This pattern captures wrap blocks that have BOTH name and price adjacent (the photo-card listing).
const re = /class="lp-menu-item-wrap">\s*<h4 class="lp-menu-item-product-name">([^<]*)<\/h4>\s*<h4 class="lp-menu-item-price">\$([0-9.]+)</g;
let m;
const items = [];
while ((m = re.exec(html))) {
  items.push({ name: m[1].trim(), price: m[2].trim() });
}
console.log('paired items:', items.length);

// also figure out category for each via lp-menu-cat-name occurring before it
const catRe = /class="lp-menu-cat-name"[^>]*>([^<]*)</g;
const cats = [];
let cm;
while ((cm = catRe.exec(html))) cats.push({ idx: cm.index, text: cm[1].trim() });

// re-run main regex tracking index
const re2 = /class="lp-menu-item-wrap">\s*<h4 class="lp-menu-item-product-name">([^<]*)<\/h4>\s*<h4 class="lp-menu-item-price">\$([0-9.]+)</g;
let m2;
const withCat = [];
while ((m2 = re2.exec(html))) {
  let cat = null;
  for (const c of cats) { if (c.idx < m2.index) cat = c.text; else break; }
  withCat.push({ cat, name: m2[1].trim(), price: m2[2].trim() });
}
for (const it of withCat) console.log(`${it.cat} :: ${it.name} :: $${it.price}`);
