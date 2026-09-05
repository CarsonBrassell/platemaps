const fs = require('fs');
const file = process.argv[2];
const marker = process.argv[3];
const len = parseInt(process.argv[4] || '3000', 10);
const html = fs.readFileSync(file, 'utf8');
const idx = html.indexOf(marker);
if (idx < 0) { console.log('marker not found'); process.exit(0); }
console.log(html.slice(idx, idx + len).replace(/\s+/g, ' '));
