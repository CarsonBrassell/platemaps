const fs = require('fs');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const titleMatch = html.match(/<title>([^<]*)<\/title>/);
console.log('TITLE:', titleMatch ? titleMatch[1] : 'none');
const priceCount = (html.match(/data-testid="price-/g) || []).length;
console.log('price span count:', priceCount);
// try to find name near each price - look for a broader window
const re = /data-testid="price-[^"]+">(\$[0-9.]+)<\/span>/g;
let m;
let i = 0;
while ((m = re.exec(html)) && i < 5) {
  const start = Math.max(0, m.index - 500);
  const context = html.slice(start, m.index);
  console.log('---CONTEXT---');
  console.log(context.slice(-400));
  console.log('PRICE:', m[1]);
  i++;
}
