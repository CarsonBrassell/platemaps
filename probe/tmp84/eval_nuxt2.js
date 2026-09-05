const fs = require('fs');
const vm = require('vm');
const h = fs.readFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/tn1_spot.html', 'utf8');
const idx = h.indexOf('window.__NUXT__=');
const endIdx = h.indexOf('</script>', idx);
let snippet = h.slice(idx, endIdx);
// strip trailing semicolon if present
snippet = snippet.replace(/^window\.__NUXT__=/, '');
const code = 'var __RESULT__ = ' + snippet + ';';
const sandbox = { window: {} };
vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { timeout: 5000 });
  const result = sandbox.__RESULT__;
  fs.writeFileSync('C:/Users/Calvin  Lensink/Documents/platemaps/probe/tmp84/tn1_nuxt.json', JSON.stringify(result));
  console.log('SUCCESS, top keys:', Object.keys(result));
} catch (e) {
  console.log('EVAL ERROR', e.message);
}
