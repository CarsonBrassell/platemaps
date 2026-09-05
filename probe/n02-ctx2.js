const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const re = /\$\d+/g;
let m, i=0;
while ((m = re.exec(stripped)) && i < 20) {
  const start = Math.max(0, m.index - 100);
  console.log(stripped.slice(start, m.index + 30));
  console.log('---');
  i++;
}
