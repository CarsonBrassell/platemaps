import fs from 'fs';
const prefix = process.argv[2];
const items = JSON.parse(fs.readFileSync(`${prefix}-items.json`,'utf8'));
const filtered = items.filter(it => it.section !== 'Most Ordered');
const seen = new Map();
const out = [];
for (const it of filtered) {
  const k = it.name+'|'+it.price;
  if (seen.has(k)) continue;
  seen.set(k,1);
  out.push(it);
}
fs.writeFileSync(`${prefix}-items-deduped.json`, JSON.stringify(out,null,1));
console.log(prefix, 'deduped count:', out.length);
const bad = out.filter(it => !/^\d+(\.\d{2})?$/.test(String(it.price)));
console.log('bad price fmt:', bad.length, bad.slice(0,5));
