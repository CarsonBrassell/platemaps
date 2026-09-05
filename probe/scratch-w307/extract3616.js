const fs = require('fs');
const h = fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/3616-dd2.json', 'utf8');

// find all JSON-LD script blocks
const scriptBlocks = [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
console.log('script blocks found:', scriptBlocks.length);

let menuBlock = null;
for (const m of scriptBlocks) {
  try {
    const obj = JSON.parse(m[1]);
    const arr = Array.isArray(obj) ? obj : [obj];
    for (const o of arr) {
      if (o['@type'] === 'Menu' || (o.hasMenu)) {
        console.log('found type', o['@type']);
      }
      if (o['@type'] === 'Restaurant' && o.hasMenu) {
        menuBlock = o.hasMenu;
      }
      if (o['@type'] === 'Menu') {
        menuBlock = o;
      }
    }
  } catch(e) {
    console.log('parse error on block', m[1].length, e.message.substring(0,100));
  }
}
if (menuBlock) {
  fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/3616-menublock.json', JSON.stringify(menuBlock, null, 2));
  console.log('wrote menu block');
} else {
  console.log('no menu block found via hasMenu; will search flat');
}
