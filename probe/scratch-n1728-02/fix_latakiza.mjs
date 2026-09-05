import fs from 'fs';
const items = JSON.parse(fs.readFileSync('latakiza_dd.html.items.json','utf8'));
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
const priced = deduped.filter(it => it.price && it.price !== '');
console.log('priced:', priced.length);
fs.writeFileSync('latakiza_dd.deduped.fixed.json', JSON.stringify(deduped, null, 2));
const bySection = {};
for (const it of deduped) bySection[it.section]=(bySection[it.section]||0)+1;
console.log(bySection);
