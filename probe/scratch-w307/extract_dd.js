const fs = require('fs');
const path = process.argv[2];
const outPrefix = process.argv[3];
const h = fs.readFileSync(path, 'utf8');
const scriptBlocks = [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
console.log('script blocks found:', scriptBlocks.length);
let menuBlock = null;
let restaurantInfo = null;
for (const m of scriptBlocks) {
  try {
    const obj = JSON.parse(m[1]);
    const arr = Array.isArray(obj) ? obj : [obj];
    for (const o of arr) {
      if (o['@type'] === 'Restaurant') {
        restaurantInfo = { name: o.name, address: o.address, hasMenu: !!o.hasMenu };
        if (o.hasMenu) menuBlock = o.hasMenu;
      }
      if (o['@type'] === 'Menu') menuBlock = o;
    }
  } catch (e) {
    console.log('parse error on block', m[1].length, e.message.substring(0, 100));
  }
}
console.log('restaurantInfo', JSON.stringify(restaurantInfo));
if (!menuBlock) {
  console.log('NO MENU BLOCK FOUND');
  process.exit(0);
}
function flatten(arr) {
  let out = [];
  for (const a of arr) {
    if (Array.isArray(a)) out = out.concat(flatten(a));
    else out.push(a);
  }
  return out;
}
let sections = flatten(menuBlock.hasMenuSection || []);
console.log('sections:', sections.length);
const dishes = [];
for (const sec of sections) {
  const secName = sec.name;
  const items = sec.hasMenuItem || [];
  for (const it of items) {
    const price = it.offers && it.offers.price;
    dishes.push({ name: it.name, price, section: secName });
  }
}
console.log('total dishes', dishes.length);
fs.writeFileSync(`C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/${outPrefix}-dishes.json`, JSON.stringify(dishes, null, 2));
const cents = {};
for (const d of dishes) {
  if (!d.price) continue;
  const c = d.price.split('.')[1] || '00';
  cents[c] = (cents[c] || 0) + 1;
}
console.log('cents dist', cents);
for (const div of [1.0, 1.04, 1.08, 1.10, 1.15, 1.17, 1.20, 1.25, 1.30]) {
  let round = 0, total = 0;
  for (const d of dishes) {
    if (!d.price) continue;
    total++;
    const val = parseFloat(d.price.replace('$', '')) / div;
    const cents2 = Math.round((val - Math.floor(val)) * 100);
    if (cents2 === 0 || cents2 === 50 || cents2 === 95 || cents2 === 99 || cents2 === 25 || cents2 === 75) round++;
  }
  console.log('div', div, round + '/' + total);
}
