const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/tk2_ld_2.json', 'utf8'));
const sections = d.hasMenuSection[0];
const dishes = [];
for (const s of sections) {
  for (const item of s.hasMenuItem || []) {
    if (!item.offers || !item.offers.price) continue;
    dishes.push({
      name: item.name,
      description: item.description || '',
      price: item.offers.price,
      section: s.name
    });
  }
}
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/tk_dishes.json', JSON.stringify(dishes));
console.log('count', dishes.length);
