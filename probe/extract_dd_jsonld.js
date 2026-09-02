const fs = require('fs');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const marker = '<script type="application/ld+json">{"@type":"Menu"';
const start = html.indexOf(marker) + '<script type="application/ld+json">'.length;
const end = html.indexOf('</script>', start);
const raw = html.slice(start, end);
const schema = JSON.parse(raw);
let items = [];
const sections = schema.hasMenuSection.flat ? schema.hasMenuSection.flat(Infinity) : schema.hasMenuSection;
for (const section of sections) {
  for (const item of section.hasMenuItem || []) {
    items.push({
      section: section.name,
      name: item.name,
      description: item.description || '',
      price: item.offers ? (item.offers.price.startsWith('$') ? item.offers.price : `$${item.offers.price}`) : null
    });
  }
}
console.log('Total items:', items.length);
const secCounts = {};
for (const it of items) secCounts[it.section] = (secCounts[it.section]||0)+1;
console.log('Sections:', secCounts);
fs.writeFileSync(file.replace(/\.html$/, '.items.json'), JSON.stringify(items, null, 1));
