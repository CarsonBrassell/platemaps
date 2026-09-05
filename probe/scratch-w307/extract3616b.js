const fs = require('fs');
const menuBlock = require('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/3616-menublock.json');

let sections = menuBlock.hasMenuSection;
// flatten nested arrays
function flatten(arr) {
  let out = [];
  for (const a of arr) {
    if (Array.isArray(a)) out = out.concat(flatten(a));
    else out.push(a);
  }
  return out;
}
sections = flatten(sections);
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
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/3616-dishes.json', JSON.stringify(dishes, null, 2));

// cents distribution
const cents = {};
for (const d of dishes) {
  if (!d.price) continue;
  const c = d.price.split('.')[1] || '00';
  cents[c] = (cents[c]||0)+1;
}
console.log('cents dist', cents);

// markup sweep
for (const div of [1.0,1.04,1.08,1.10,1.15,1.17,1.20,1.25,1.30,1.0775]) {
  let round = 0, total=0;
  for (const d of dishes) {
    if (!d.price) continue;
    total++;
    const val = parseFloat(d.price.replace('$','')) / div;
    const cents2 = Math.round((val - Math.floor(val))*100);
    if (cents2 === 0 || cents2 === 50 || cents2===95||cents2===99||cents2===25||cents2===75) round++;
  }
  console.log('div', div, round+'/'+total);
}
