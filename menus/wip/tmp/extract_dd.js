const fs = require('fs');
const h = fs.readFileSync(process.argv[2], 'utf8');
// find all JSON-LD script blocks
const blocks = [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('found', blocks.length, 'ld+json blocks');
let menuBlock = null;
for (const b of blocks) {
  try {
    const j = JSON.parse(b);
    const arr = Array.isArray(j) ? j : [j];
    for (const item of arr) {
      if (item['@type'] === 'Menu' || (Array.isArray(item['@type']) && item['@type'].includes('Menu'))) {
        menuBlock = item;
      }
      if (item['@graph']) {
        for (const g of item['@graph']) {
          if (g['@type'] === 'Menu') menuBlock = g;
        }
      }
    }
  } catch (e) {}
}
if (!menuBlock) {
  console.log('NO MENU BLOCK FOUND');
  process.exit(0);
}
fs.writeFileSync(process.argv[3], JSON.stringify(menuBlock, null, 2));
console.log('wrote menu block to', process.argv[3]);
