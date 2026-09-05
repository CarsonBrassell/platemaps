import fs from 'fs';

const file = process.argv[2];
const items = JSON.parse(fs.readFileSync(file, 'utf8'));

// dedupe on name+price
const seen = new Set();
const deduped = [];
for (const it of items) {
  const key = it.name + '|' + it.price;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(it);
}
console.log(`raw: ${items.length}  deduped: ${deduped.length}`);

// filter out carousel-ish sections
const carouselNames = /most ordered|most popular|featured items/i;
const coreItems = deduped.filter(it => !carouselNames.test(it.section || ''));
console.log(`after dropping carousel sections: ${coreItems.length}`);

// price parse
function parsePrice(p) {
  if (p == null) return null;
  let s = String(p).replace('$', '').trim();
  let n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const priced = coreItems.filter(it => parsePrice(it.price) != null && parsePrice(it.price) > 0);
console.log(`priced (>0): ${priced.length}`);

// cent distribution
const centCounts = {};
for (const it of priced) {
  const n = parsePrice(it.price);
  const cents = Math.round((n - Math.floor(n)) * 100);
  const key = String(cents).padStart(2, '0');
  centCounts[key] = (centCounts[key] || 0) + 1;
}
console.log('cent distribution:', centCounts);

// divisor sweep 1.00 to 1.35 step 0.01, count how many divide to round .00 or .50
let bestDivisor = null, bestCount = 0;
for (let d = 100; d <= 135; d++) {
  const divisor = d / 100;
  let count = 0;
  for (const it of priced) {
    const n = parsePrice(it.price);
    const divided = n / divisor;
    const rounded = Math.round(divided * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 0.005 || Math.abs(rounded*2 - Math.round(rounded*2)) < 0.005 && Math.abs((rounded*2)%1) < 0.01) {
      // round dollar or round half-dollar
    }
    if (Math.abs(rounded - Math.round(rounded)) < 0.01) count++;
  }
  if (count > bestCount) { bestCount = count; bestDivisor = divisor; }
}
console.log(`best divisor: ${bestDivisor} -> ${bestCount}/${priced.length} land on round dollars`);

fs.writeFileSync(file.replace('.items.json','.deduped.json'), JSON.stringify(coreItems, null, 2));
