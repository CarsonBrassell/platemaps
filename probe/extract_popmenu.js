const fs = require('fs');
const obj = JSON.parse(fs.readFileSync('grabgo_cache.json', 'utf8'));
const key = Object.keys(obj)[2];
const schemaStr = obj[key].menu.menuSchemaMarkup;
const schema = JSON.parse(schemaStr);
let items = [];
for (const section of schema.hasMenuSection || []) {
  for (const item of section.hasMenuItem || []) {
    items.push({
      section: section.name,
      name: item.name,
      description: item.description || '',
      price: item.offers ? `$${item.offers.price}` : null
    });
  }
}
console.log('Total items:', items.length);
const sections = {};
for (const it of items) sections[it.section] = (sections[it.section]||0)+1;
console.log('Sections:', sections);
fs.writeFileSync('grabgo_items.json', JSON.stringify(items, null, 1));
