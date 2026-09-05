const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const re = /class="lp-menu-item-price"[^>]*>\$[0-9.]+</g;
let m, i=0;
while ((m = re.exec(html)) && i < 8) {
  const start = Math.max(0, m.index - 400);
  const ctx = html.slice(start, m.index + 30).replace(/\s+/g,' ');
  console.log('=== PRICE CTX', i, '===');
  console.log(ctx);
  console.log();
  i++;
}
