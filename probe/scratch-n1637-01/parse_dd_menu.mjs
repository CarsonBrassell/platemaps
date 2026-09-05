import fs from 'fs';
const prefix = process.argv[2];
const j0 = JSON.parse(fs.readFileSync(`${prefix}-ld-0.json`,'utf8'));
const j2 = JSON.parse(fs.readFileSync(`${prefix}-ld-2.json`,'utf8'));
console.log('name:', j0.name, 'address:', JSON.stringify(j0.address));
let sections = j2.hasMenuSection;
if (Array.isArray(sections) && Array.isArray(sections[0])) sections = sections.flat();
let out = [];
for (const sec of sections) {
  let items = sec.hasMenuItem;
  if (!items) continue;
  if (!Array.isArray(items)) items = [items];
  for (const it of items) {
    let price = it.offers && (Array.isArray(it.offers)? it.offers[0].price : it.offers.price);
    out.push({section: sec.name, name: it.name, price});
  }
}
fs.writeFileSync(`${prefix}-items.json`, JSON.stringify(out,null,1));
console.log('sections:', sections.map(s=>s.name));
console.log('total items:', out.length);
const seen = new Map();
for (const it of out) { const k=it.name+'|'+it.price; seen.set(k,(seen.get(k)||0)+1); }
let dups=0;
for (const [k,v] of seen) if (v>1) dups++;
console.log('unique:', seen.size, 'dup groups:', dups);
