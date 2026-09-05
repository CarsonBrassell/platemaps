import fs from 'fs';
const file = process.argv[2];
const outPrefix = process.argv[3];
const html = fs.readFileSync(file, 'utf8');
const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
let m, blocks=[];
while ((m = re.exec(html))) blocks.push(m[1]);
console.log(file, 'blocks:', blocks.length);
blocks.forEach((b,i) => {
  try {
    const j = JSON.parse(b);
    fs.writeFileSync(`${outPrefix}-ld-${i}.json`, JSON.stringify(j));
    console.log(' block', i, 'type:', j['@type']);
  } catch(e) { console.log(' block', i, 'parse fail'); }
});
