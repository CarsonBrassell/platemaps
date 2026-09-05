const fs = require('fs');
const file = process.argv[2];
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
const prices = items.map(i => parseFloat(i.price.replace(/\$/g,''))).filter(p => !isNaN(p));
const nonRound = prices.filter(p => Math.round(p*100)%100 !== 0);
console.log('total prices:', prices.length, 'non-round:', nonRound.length, 'distinct non-round:', new Set(nonRound).size);
for (const div of [1.1, 1.15, 1.2, 1.25]) {
  let hits = 0;
  for (const p of nonRound) {
    const base = p / div;
    const cents = Math.round(base*100) % 100;
    // round dollar (within 1 cent) or .99 ending
    if (cents <= 1 || cents >= 99 || cents === 98) hits++;
  }
  console.log(`div ${div}: ${hits} / ${nonRound.length} = ${(hits/nonRound.length*100).toFixed(0)}%`);
}
