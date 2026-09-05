const fs = require('fs');

const resultPath = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/result-n1358-06.json';
const worklistPath = 'C:/Users/Calvin  Lensink/Documents/platemaps/menus/wip/n1358-06.json';

const priceRe = /^\$\d+(\.\d{2})?$/;

let result;
try {
  result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
} catch (e) {
  console.error('FAIL: result file does not parse as JSON:', e.message);
  process.exit(1);
}

const worklist = JSON.parse(fs.readFileSync(worklistPath, 'utf8'));
const worklistIds = new Set(worklist.map(r => r.restaurantId));
const resultIds = new Set(result.map(r => r.restaurantId));

let errors = 0;

// restaurantId set comparison (only meaningful once all 20 are present, but report progress either way)
const missing = [...worklistIds].filter(id => !resultIds.has(id));
const extra = [...resultIds].filter(id => !worklistIds.has(id));
console.log(`worklist has ${worklistIds.size} ids, result has ${resultIds.size} ids`);
if (missing.length) console.log('NOT YET FILED/BLOCKED (missing from result):', missing.join(', '));
if (extra.length) { console.log('FAIL: result has ids not in worklist:', extra.join(', ')); errors++; }

// duplicate id check within result
const seen = new Set();
for (const r of result) {
  if (seen.has(r.restaurantId)) { console.log('FAIL: duplicate restaurantId in result:', r.restaurantId); errors++; }
  seen.add(r.restaurantId);
}

for (const r of result) {
  const tag = `[${r.restaurantId} ${r.name}]`;
  if (!['filed', 'blocked', 'not_found'].includes(r.outcome)) {
    console.log(`FAIL ${tag}: invalid outcome "${r.outcome}"`); errors++;
  }
  if (r.outcome === 'not_found' && r.confidence !== 'high') {
    console.log(`FAIL ${tag}: not_found must be confidence high, got "${r.confidence}"`); errors++;
  }
  if ((r.confidence === 'medium' || r.confidence === 'low') && r.outcome !== 'blocked') {
    console.log(`FAIL ${tag}: medium/low confidence must be outcome blocked, got "${r.outcome}"`); errors++;
  }
  if (r.outcome === 'blocked' && !r.blocked) {
    console.log(`FAIL ${tag}: blocked outcome missing "blocked" reason field`); errors++;
  }
  if (r.outcome === 'not_found' && r.blocked) {
    console.log(`FAIL ${tag}: not_found must not have a "blocked" key`); errors++;
  }
  if (r.outcome === 'filed') {
    if (!Array.isArray(r.dishes) || r.dishes.length < 5) {
      console.log(`FAIL ${tag}: filed must have >=5 dishes, has ${r.dishes ? r.dishes.length : 0}`); errors++;
    }
    for (const d of (r.dishes || [])) {
      if (!priceRe.test(d.price)) {
        console.log(`FAIL ${tag}: dish "${d.name}" has bad price "${d.price}"`); errors++;
      }
      if (!d.name || !d.section) {
        console.log(`FAIL ${tag}: dish missing name or section: ${JSON.stringify(d)}`); errors++;
      }
    }
  } else {
    if (r.dishes && r.dishes.length > 0) {
      console.log(`FAIL ${tag}: non-filed outcome "${r.outcome}" must have empty dishes[]`); errors++;
    }
  }
}

if (errors === 0) {
  console.log('OK: all checks passed for entries currently in result file.');
} else {
  console.log(`FAILED: ${errors} error(s) found.`);
  process.exit(1);
}
