const fs = require('fs');
const h = fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/4100-toast.html', 'utf8');
const scripts = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
let s = scripts[4][1];
let start = s.indexOf('{');
let jsonStr = s.slice(start);
let depth = 0, end = -1, inStr = false, esc = false;
for (let i = 0; i < jsonStr.length; i++) {
  const c = jsonStr[i];
  if (inStr) {
    if (esc) { esc = false; }
    else if (c === '\\') { esc = true; }
    else if (c === '"') { inStr = false; }
    continue;
  }
  if (c === '"') { inStr = true; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
console.log('end idx', end, 'total len', jsonStr.length);
const obj = JSON.parse(jsonStr.slice(0, end + 1));
fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/4100-apollo.json', JSON.stringify(obj));
console.log('keys count', Object.keys(obj).length);
const types = {};
for (const k of Object.keys(obj)) { const t = k.split(':')[0]; types[t] = (types[t] || 0) + 1; }
console.log(types);
