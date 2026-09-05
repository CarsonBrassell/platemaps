const fs = require('fs');
const file = process.argv[2];
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
const prices = items.map(i => parseFloat(i.price.replace(/\$/g,''))).filter(p => !isNaN(p) && Math.round(p*100)%100 !== 0);
console.log('non-round prices:', prices.length, 'of', items.length);
const distinct = [...new Set(prices)];
console.log('distinct non-round prices:', distinct.length);
for (const div of [1.1, 1.15, 1.2, 1.25]) {
  let hits = 0;
  for (const p of prices) {
    const base = p / div;
    if (Math.abs(base - Math.round(base * 100) / 100) < 0.011 && Math.abs(base*100 - Math.round(base*100/5)*5) < 1.1) hits++;
  }
  console.log(`div ${div}: `, hits, '/', prices.length);
}
// cent ending distribution
const cents = {};
for (const p of prices) {
  const c = Math.round((p % 1) * 100);
  cents[c] = (cents[c]||0) + 1;
}
console.log('cent endings:', cents);
