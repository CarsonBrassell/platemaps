const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const re = /class="lp-menu-item-wrap"[\s\S]*?(?=class="lp-menu-item-wrap"|class="lp-menu-cat-name"|$)/g;
let m, i=0;
while ((m = re.exec(html)) && i < 6) {
  console.log('=== ITEM WRAP', i, '===');
  console.log(m[0].replace(/\s+/g,' ').slice(0, 600));
  console.log();
  i++;
}
