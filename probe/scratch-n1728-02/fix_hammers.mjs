import fs from 'fs';
const items = JSON.parse(fs.readFileSync('hammers_dd.html.items.json','utf8'));
const carouselNames = /most ordered|most popular|featured items/i;
const core = items.filter(it => !carouselNames.test(it.section||''));
const seen = new Set();
const deduped = [];
for (const it of core) {
  const key = it.name+'|'+it.price;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(it);
}
console.log('core:', core.length, 'deduped:', deduped.length);
const priced = deduped.filter(it => it.price != null && it.price !== '');
console.log('priced:', priced.length);
const cents = {};
for (const it of priced) {
  const n = parseFloat(it.price);
  const c = Math.round((n-Math.floor(n))*100);
  cents[c]=(cents[c]||0)+1;
}
console.log('cents:', cents);
fs.writeFileSync('hammers_dd.deduped.json', JSON.stringify(deduped,null,2));
for (const it of deduped) console.log(it.section,'|',it.name,'|',it.price);
