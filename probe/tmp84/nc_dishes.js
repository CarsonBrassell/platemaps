const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/am_ld_1.json', 'utf8'));
const menu = d.hasMenu[0];
const dishes = [];
for (const s of menu.hasMenuSection) {
  for (const item of s.hasMenuItem || []) {
    const off = (item.offers && item.offers[0]) ? item.offers[0] : null;
    if (!off || !off.Price) continue;
    const name = item.name.replace(/&amp;amp;/g, '&').replace(/&#39;/g, "'").replace(/&amp;/g,'&');
    dishes.push({
      name,
      description: item.description || '',
      price: '$' + off.Price,
      section: s.name.replace(/&amp;amp;/g, '&').replace(/&#39;/g, "'")
    });
  }
}
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/nc_final_dishes.json', JSON.stringify(dishes));
console.log('count', dishes.length);
