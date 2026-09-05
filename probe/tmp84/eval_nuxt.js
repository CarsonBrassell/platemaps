const fs = require('fs');
const vm = require('vm');
const h = fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/tn1_spot.html', 'utf8');
const m = h.match(/window\.__NUXT__=(\(function[\s\S]*?\})\)\(([\s\S]*?)\);\s*<\/script>/);
if (!m) { console.log('NO MATCH'); process.exit(1); }
console.log('matched, len', m[0].length);
const code = 'var __RESULT__ = ' + m[1] + '(' + m[2] + ');';
const sandbox = {};
vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { timeout: 5000 });
  const result = sandbox.__RESULT__;
  fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/tn1_nuxt.json', JSON.stringify(result));
  console.log('SUCCESS, top keys:', Object.keys(result));
} catch (e) {
  console.log('EVAL ERROR', e.message);
}
