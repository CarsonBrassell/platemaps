import fs from 'fs';
const items = JSON.parse(fs.readFileSync('probe/scratch-n1637-01/1791-items.json','utf8'));
const seen = new Map();
let dups=0;
for (const it of items) {
  const key = it.name+'|'+it.price;
  seen.set(key, (seen.get(key)||0)+1);
}
for (const [k,v] of seen) if (v>1) { console.log('DUP', k, v); dups++; }
console.log('unique keys:', seen.size, 'total:', items.length);
const bad = items.filter(it => !/^\d+(\.\d{2})?$/.test(String(it.price)));
console.log('bad price format count:', bad.length);
console.log(items.slice(0,10));
