const fs = require('fs');
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
const rows = lines.map(l => JSON.parse(l));
const prices = rows.map(r => parseFloat(r.price.replace('$', '')));
const cents = {};
for (const p of prices) {
  const c = Math.round((p % 1) * 100);
  cents[c] = (cents[c] || 0) + 1;
}
console.log('N=', prices.length);
console.log('cents dist:', JSON.stringify(cents));
// divisor sweep
for (let d = 1.00; d <= 1.35; d += 0.01) {
  let round = 0;
  for (const p of prices) {
    const v = p / d;
    const rc = Math.round((v % 1) * 100);
    if (rc === 0 || rc === 50 || rc === 95 || rc === 99 || rc === 25 || rc === 75) round++;
  }
  const pct = (round / prices.length * 100).toFixed(0);
  if (pct > 60) console.log('divisor', d.toFixed(2), pct + '%');
}
// sections
const secs = {};
for (const r of rows) secs[r.section] = (secs[r.section] || 0) + 1;
console.log('sections:', JSON.stringify(secs));
