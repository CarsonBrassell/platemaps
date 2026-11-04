// node reconcile.mjs  -> audit/overrides.json from the judges' verdict files, then prints the audit tally.
// Per menu: tiebreak verdict wins; else two judges who both say "fix" with the same main + status
// are applied (secondaries = what both judges listed); a lone "fix" with no tiebreak is not applied.
// Chain-conflict verdicts (audit/verdicts/conflicts.json) fill in where the judges changed nothing.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const V = `${DIR}audit/verdicts/`;
const profiles = JSON.parse(fs.readFileSync(`${DIR}profiles.json`, 'utf8'));
const original = {};
for (const p of Object.values(profiles)) original[p.menu] ??= p;
const index = JSON.parse(fs.readFileSync(`${DIR}audit/chunks/index.json`, 'utf8'));
const load = (f) => {
  try {
    const a = JSON.parse(fs.readFileSync(V + f, 'utf8'));
    return new Map((Array.isArray(a) ? a : a.verdicts ?? []).map((v) => [v.menu, v]));
  } catch {
    return new Map();
  }
};
const fixOf = (v, why) => {
  const o = {
    status: v.status,
    hold_reason: v.status === 'hold' ? v.hold_reason || 'junk_menu' : null,
    main_cuisine: v.main_cuisine,
    secondary_cuisines: (v.secondary_cuisines ?? []).filter((s) => s !== v.main_cuisine).slice(0, 3),
    _why: why,
  };
  if (Array.isArray(v.dish_types) && v.dish_types.length) o.dish_types = v.dish_types.map((d) => d.toLowerCase()).slice(0, 8);
  return o;
};
const same = (a, b) => a.main_cuisine === b.main_cuisine && a.status === b.status;
const differs = (fix, p) =>
  fix.main_cuisine !== p.main_cuisine || fix.status !== p.status ||
  JSON.stringify([...fix.secondary_cuisines].sort()) !== JSON.stringify([...p.secondary_cuisines].sort());

const overrides = {};
const tally = {};
for (const c of index) {
  const j1 = load(`${c.name}.j1.json`);
  const j2 = load(`${c.name}.j2.json`);
  const tb = load(`${c.name}.tb.json`);
  const t = (tally[c.kind] ??= { menus: 0, judged2: 0, bothAgree: 0, bothFixSame: 0, tiebreak: 0, unresolved: 0, applied: 0, mainChanged: 0, statusChanged: 0 });
  for (const m of c.menus) {
    t.menus++;
    const p = original[m];
    const a = j1.get(m);
    const b = j2.get(m);
    let fix = null;
    if (a && b) t.judged2++;
    if (tb.has(m)) {
      t.tiebreak++;
      const v = tb.get(m);
      if (v.verdict === 'fix') fix = fixOf(v, `tiebreak: ${v.why ?? ''}`);
    } else if (a && b && a.verdict === 'agree' && b.verdict === 'agree') {
      t.bothAgree++;
    } else if (a && !j2.size) {
      /* Lean mode: a single judge per chunk, so its fix stands. */
      if (a.verdict === 'agree') t.bothAgree++;
      else fix = fixOf(a, `judge: ${a.why ?? ''}`);
    } else if (a && b && a.verdict === 'fix' && b.verdict === 'fix' && same(a, b)) {
      t.bothFixSame++;
      const secs = (a.secondary_cuisines ?? []).filter((s) => (b.secondary_cuisines ?? []).includes(s));
      fix = fixOf({ ...a, secondary_cuisines: secs }, `2 judges: ${a.why ?? ''}`);
    } else {
      t.unresolved++;
    }
    if (fix && differs(fix, p)) {
      overrides[m] = fix;
      t.applied++;
      if (fix.main_cuisine !== p.main_cuisine) t.mainChanged++;
      if (fix.status !== p.status) t.statusChanged++;
    }
  }
}
let chain = 0;
for (const [m, v] of load('conflicts.json')) {
  if (overrides[m] || !original[m] || v.verdict !== 'fix') continue;
  const fix = fixOf({ ...original[m], ...v }, `chain: ${v.why ?? ''}`);
  if (differs(fix, original[m])) {
    overrides[m] = fix;
    chain++;
  }
}
fs.writeFileSync(`${DIR}audit/overrides.json`, JSON.stringify(overrides, null, 1));
for (const [k, t] of Object.entries(tally)) console.log(k.padEnd(8), JSON.stringify(t));
const r = tally.random;
if (r?.menus) console.log(`random-sample error rate: main ${((r.mainChanged / r.menus) * 100).toFixed(1)}%, any cuisine/status fix ${((r.applied / r.menus) * 100).toFixed(1)}% of ${r.menus}`);
console.log(`overrides ${Object.keys(overrides).length} (chain fixes ${chain})`);
