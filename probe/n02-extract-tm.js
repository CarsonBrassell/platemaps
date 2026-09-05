const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
let m, i=0;
while ((m = re.exec(html))) {
  i++;
  let obj;
  try { obj = JSON.parse(m[1]); } catch(e) { console.log('block', i, 'PARSE ERROR', e.message); continue; }
  console.log('block', i, '@type=', obj['@type'], 'keys=', Object.keys(obj).join(','));
}
