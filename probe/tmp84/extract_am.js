const fs = require('fs');
const h = fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/nc_allmenus.html', 'utf8');
const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
let m; let count=0;
while ((m = re.exec(h))) {
  count++;
  let data;
  try { data = JSON.parse(m[1]); } catch(e) { console.log('err', count, e.message); continue; }
  fs.writeFileSync(`C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/am_ld_${count}.json`, JSON.stringify(data, null, 2));
  console.log(count, data['@type'], data.name);
}
