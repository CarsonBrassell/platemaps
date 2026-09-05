const fs = require('fs');
const h = fs.readFileSync(process.argv[2], 'utf8');
const m = h.match(/window\.__OO_STATE__\s*=\s*(\{)/);
if (!m) { console.log('NO __OO_STATE__ FOUND'); process.exit(0); }
let start = m.index + m[0].length - 1;
let depth = 0, i = start, inStr = false, esc = false;
for (; i < h.length; i++) {
  const c = h[i];
  if (inStr) {
    if (esc) { esc = false; }
    else if (c === '\\') { esc = true; }
    else if (c === '"') { inStr = false; }
    continue;
  }
  if (c === '"') { inStr = true; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
}
const jsonStr = h.slice(start, i);
console.log('extracted length', jsonStr.length);
fs.writeFileSync(process.argv[3], jsonStr);
