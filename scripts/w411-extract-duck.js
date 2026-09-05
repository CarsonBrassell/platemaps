const fs = require('fs');
const h = fs.readFileSync(process.argv[2], 'utf8');
// The RSC payload literally contains the 6-char sequence backslash+u0022 in place of a quote.
const s = h.split('\\u0022').join('"');
fs.writeFileSync(process.argv[3], s, 'utf8');
const idx = s.indexOf('catalogSectionsMap');
console.log(s.slice(idx, idx + 300));
const titles = [...s.matchAll(/"title":\{"text":"([^"]+)"\}/g)].map(m => m[1]);
console.log('SECTION TITLES:', JSON.stringify([...new Set(titles)]));
