const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');

// Find each catalogItems array preceded by its section title.
const sectionRe = /"title":\{"text":"([^"]+)"\},"spanCount":\d+,"catalogItems":\[/g;
let m;
const results = [];
while ((m = sectionRe.exec(s)) !== null) {
  const title = m[1];
  const start = sectionRe.lastIndex;
  // Find matching closing bracket for catalogItems array by scanning brace/bracket depth.
  let depth = 1;
  let i = start;
  for (; i < s.length && depth > 0; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']') depth--;
  }
  const arrText = s.slice(start, i - 1);
  // Extract each item's title/itemDescription/price within this array text
  const itemRe = /"title":"([^"]+)"(?:(?!"title":).)*?"itemDescription":"([^"]*)"(?:(?!"title":).)*?"price":(\d+)/g;
  let im;
  while ((im = itemRe.exec(arrText)) !== null) {
    results.push({ section: title, name: im[1], description: im[2], priceCents: parseInt(im[3], 10) });
  }
}
console.log('total item matches', results.length);
fs.writeFileSync(process.argv[3], JSON.stringify(results, null, 2));
results.forEach(r => console.log(r.section, '|', r.name, '|', (r.priceCents/100).toFixed(2), '|', r.description.slice(0,30)));
