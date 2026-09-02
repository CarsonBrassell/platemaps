const fs = require('fs');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');

function decodeEntities(s) {
  return s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&#x2019;/g, "'").replace(/&quot;/g, '"');
}

// Find section headings: id="menuGroup-...-heading">Name</h3>
const catRe = /id="menuGroup-[^"]*-heading">([^<]*)<\/h3>/g;
let cats = [];
let m;
while ((m = catRe.exec(html))) {
  cats.push({ name: decodeEntities(m[1]), index: m.index });
}

const itemRe = /<span class="headerText">([^<]*)<\/span><\/h3>(?:<div data-testid="item-content-description" class="itemDescription">([^<]*)<\/div>)?<\/div><div class="priceAvailability"><div class="priceLine"><span class="price"[^>]*>(\$[0-9.]+)<\/span>/g;

let items = [];
while ((m = itemRe.exec(html))) {
  const idx = m.index;
  let cat = 'Unknown';
  for (const c of cats) {
    if (c.index <= idx) cat = c.name; else break;
  }
  items.push({ section: cat, name: decodeEntities(m[1].trim()), description: decodeEntities((m[2]||'').trim()), price: m[3] });
}

console.log('Categories:', cats.map(c=>c.name));
console.log('Total items found:', items.length);
fs.writeFileSync(file.replace(/\.html$/, '.items.json'), JSON.stringify(items, null, 1));
const sections = {};
for (const it of items) sections[it.section] = (sections[it.section]||0)+1;
console.log('Per-section counts:', sections);
