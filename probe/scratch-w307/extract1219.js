const fs = require('fs');
const h = fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/scratch-w307/1219.html', 'utf8');
const stripped = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const idx = stripped.toLowerCase().indexOf('menu');
console.log('first menu mention around:', stripped.substring(Math.max(0,idx-100), idx+300));
// find dollar signs
const dollarMatches = [...stripped.matchAll(/\$\d+(\.\d{2})?/g)];
console.log('dollar count:', dollarMatches.length);
console.log(dollarMatches.slice(0,20).map(m=>m[0]));
