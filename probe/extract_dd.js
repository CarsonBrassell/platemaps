const fs = require('fs');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const re = /"name":"([^"]{2,60})","description":"[^"]*"[^}]*?"price":"(\$[0-9.]+)"/g;
let m; let items = [];
while ((m = re.exec(html))) { items.push({ name: m[1], price: m[2] }); }
console.log('found pairs', items.length);
fs.writeFileSync(file.replace(/\.html$/, '.pairs.json'), JSON.stringify(items, null, 1));
console.log(JSON.stringify(items.slice(0, 30), null, 1));
