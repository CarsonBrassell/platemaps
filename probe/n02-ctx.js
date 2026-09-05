const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const re = /\$\d+\.\d{2}/g;
let m, i=0;
while ((m = re.exec(html)) && i < 15) {
  const start = Math.max(0, m.index - 100);
  const ctx = html.slice(start, m.index + 20).replace(/\s+/g, ' ');
  console.log(ctx);
  console.log('---');
  i++;
}
