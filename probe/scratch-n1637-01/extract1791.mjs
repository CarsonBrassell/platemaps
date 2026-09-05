import fs from 'fs';
const html = fs.readFileSync('probe/scratch-n1637-01/1791-uber.html', 'utf8');
const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
let m, blocks=[];
while ((m = re.exec(html))) blocks.push(m[1]);
console.log('blocks found:', blocks.length);
for (const b of blocks) {
  try {
    const j = JSON.parse(b);
    fs.writeFileSync('probe/scratch-n1637-01/1791-ld-' + blocks.indexOf(b) + '.json', JSON.stringify(j, null, 1));
  } catch(e) { console.log('parse fail', e.message); }
}
