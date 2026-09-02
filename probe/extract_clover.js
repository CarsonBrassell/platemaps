const fs = require('fs');
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const cats = data.categories;
let items = [];
let zeroCount = 0;
for (const it of Object.values(data.items)) {
  if (it.available === false) continue;
  const catId = (it.categoryIds && it.categoryIds[0]) || null;
  const catName = catId && cats[catId] ? cats[catId].name : 'Unknown';
  const price = it.price / 100;
  if (price === 0) zeroCount++;
  items.push({ section: catName, name: it.name, description: it.description || '', price: `$${price.toFixed(2)}`, sortOrder: catId && cats[catId] ? cats[catId].sortOrder : 999 });
}
items.sort((a,b)=>a.sortOrder-b.sortOrder);
items.forEach(i=>delete i.sortOrder);
console.log('Total items:', items.length, 'zero-price items:', zeroCount);
const secCounts = {};
for (const it of items) secCounts[it.section] = (secCounts[it.section]||0)+1;
console.log('Sections:', secCounts);
fs.writeFileSync(file.replace(/\.json$/, '.parsed.json'), JSON.stringify(items, null, 1));
