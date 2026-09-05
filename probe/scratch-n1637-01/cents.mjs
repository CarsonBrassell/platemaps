import fs from 'fs';
const prefix = process.argv[2];
const items = JSON.parse(fs.readFileSync(`${prefix}-items-deduped.json`,'utf8'));
const cents = {};
for (const it of items) {
  const n = parseFloat(String(it.price).replace('$',''));
  const c = Math.round((n - Math.floor(n))*100);
  const key = String(c).padStart(2,'0');
  cents[key] = (cents[key]||0)+1;
}
console.log(prefix, JSON.stringify(cents));
// divisor sweep
let best=[];
for (let d=100; d<=135; d++) {
  const div = d/100;
  let round=0;
  for (const it of items) {
    const n = parseFloat(String(it.price).replace('$',''));
    const raw = n/div;
    const cents2 = Math.round((raw - Math.floor(raw))*100);
    if (cents2===0 || cents2===50 || cents2===95 || cents2===99) round++;
  }
  best.push([div, round]);
}
best.sort((a,b)=>b[1]-a[1]);
console.log('top divisors:', best.slice(0,5));
console.log('n items:', items.length);
