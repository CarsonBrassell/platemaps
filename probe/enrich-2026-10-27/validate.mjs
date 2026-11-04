// node validate.mjs batch-NNN             -> checks one result file against its batch, prints OK or errors
// node validate.mjs batch-NNN --changes   -> lists menus whose main cuisine differs from the current tag
// node validate.mjs                       -> checks all, applies audit/overrides.json, merges profiles.json
//                                            (one entry per restaurant id), prints a summary
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const CUISINES = ['African', 'American', 'Asian', 'BBQ', 'Bakery & Desserts', 'Bars', 'Breakfast & Brunch', 'Burgers', 'Chicken', 'Chinese', 'Coffee & Tea', 'Fast Food', 'French', 'Hawaiian', 'Indian', 'Italian', 'Japanese', 'Juice & Smoothies', 'Korean', 'Latin American', 'Mediterranean', 'Mexican', 'Pizza', 'Sandwiches', 'Seafood', 'Steakhouse', 'Thai', 'Vegetarian', 'Vietnamese'];
const V = {
  status: ['ok', 'hold'],
  hold_reason: [null, 'junk_menu', 'retail', 'drinks_only', 'wrong_restaurant', 'too_few_items'],
  confidence: ['high', 'medium', 'low'],
  spice: ['none', 'some', 'lots'],
  level: ['none', 'few', 'many'],
  service: ['full_service', 'fast_casual', 'counter', 'cafe', 'bakery', 'bar', 'brewery_winery', 'food_truck', 'market_deli', 'fine_dining', 'buffet', 'unknown'],
  meals: ['breakfast', 'brunch', 'lunch', 'dinner', 'late_night', 'dessert', 'drinks'],
  proteins: ['chicken', 'beef', 'pork', 'lamb', 'goat', 'fish', 'shellfish', 'tofu', 'eggs', 'plant_based'],
  drinks: ['coffee', 'tea', 'boba', 'smoothies', 'juice', 'soda', 'beer', 'wine', 'cocktails', 'sake_soju'],
  dietary_flags: ['halal', 'kosher', 'keto', 'dairy_free', 'nut_free'],
  vibes: ['comfort_food', 'healthy', 'indulgent', 'street_food', 'fusion', 'family_style', 'shareable', 'grab_and_go', 'upscale', 'casual', 'hearty', 'light', 'regional_authentic', 'plant_forward', 'seafood_focused', 'meat_heavy', 'sweet_tooth', 'craft_drinks'],
};
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function parseBatch(name) {
  const txt = fs.readFileSync(`${DIR}batches/${name}.txt`, 'utf8');
  const menus = [];
  let cur = null;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^=== MENU (m\d+) ===/);
    if (m) {
      cur = { key: m[1], rests: [], items: new Set() };
      menus.push(cur);
      continue;
    }
    if (!cur) continue;
    const r = line.match(/^restaurant (\S+) "(.*)" \| current: ([^|]*) \|/);
    if (r) {
      cur.rests.push({ id: r[1], name: r[2], current: r[3].trim() });
      continue;
    }
    if (line.startsWith('- ')) cur.items.add(norm(line.slice(2).split(' — ')[0]));
  }
  return menus;
}

/** Field-level errors for one result object `o` against its parsed menu block `m`. */
function objErrors(o, m, at) {
  const errs = [];
  const inV = (f, list) => {
    if (!list.includes(o[f])) errs.push(`${at}: ${f}=${JSON.stringify(o[f])} not in ${list.join('/')}`);
  };
  const sub = (f, list, max) => {
    if (!Array.isArray(o[f])) return errs.push(`${at}: ${f} must be an array`);
    for (const x of o[f]) if (!list.includes(x)) errs.push(`${at}: ${f} has "${x}" (allowed: ${list.join(', ')})`);
    if (max && o[f].length > max) errs.push(`${at}: ${f} max ${max}`);
  };
  inV('status', V.status);
  inV('hold_reason', V.hold_reason);
  inV('confidence', V.confidence);
  inV('spice', V.spice);
  inV('service', V.service);
  if (o.status === 'hold' && !o.hold_reason) errs.push(`${at}: hold needs hold_reason`);
  if (o.status === 'ok' && o.hold_reason) errs.push(`${at}: ok must have hold_reason null`);
  if (!CUISINES.includes(o.main_cuisine)) errs.push(`${at}: main_cuisine "${o.main_cuisine}" not in CUISINES`);
  sub('secondary_cuisines', CUISINES, 3);
  if (Array.isArray(o.secondary_cuisines) && o.secondary_cuisines.includes(o.main_cuisine)) errs.push(`${at}: secondary repeats main`);
  if (!(o.new_cuisine === null || typeof o.new_cuisine === 'string')) errs.push(`${at}: new_cuisine must be null or string`);
  if (!Array.isArray(o.styles) || o.styles.length > 3) errs.push(`${at}: styles must be an array of <=3`);
  sub('meals', V.meals);
  sub('proteins', V.proteins);
  sub('drinks', V.drinks);
  sub('dietary_flags', V.dietary_flags);
  sub('vibes', V.vibes, 5);
  if (!Array.isArray(o.dish_types) || o.dish_types.length > 8 || (o.status === 'ok' && !o.dish_types.length)) {
    errs.push(`${at}: dish_types must be 1-8 strings`);
  } else {
    for (const d of o.dish_types) if (typeof d !== 'string' || d !== d.toLowerCase()) errs.push(`${at}: dish_types "${d}" must be lowercase`);
  }
  if (!Array.isArray(o.signature_dishes) || o.signature_dishes.length > 5) {
    errs.push(`${at}: signature_dishes must be an array of <=5`);
  } else {
    for (const s of o.signature_dishes) if (!m.items.has(norm(String(s)))) errs.push(`${at}: signature "${s}" is not an exact menu item name; copy it or drop it`);
  }
  for (const k of ['vegetarian', 'vegan', 'gluten_free']) if (!V.level.includes(o.dietary?.[k])) errs.push(`${at}: dietary.${k} must be none/few/many`);
  for (const k of ['desserts', 'kids_menu']) if (typeof o[k] !== 'boolean') errs.push(`${at}: ${k} must be true/false`);
  if (typeof o.summary !== 'string' || !o.summary || o.summary.length > 200) errs.push(`${at}: summary must be 1-160 chars`);
  if (!(o.notes === null || typeof o.notes === 'string')) errs.push(`${at}: notes must be null or string`);
  return errs;
}

function check(name) {
  const errs = [];
  const menus = parseBatch(name);
  let res;
  try {
    res = JSON.parse(fs.readFileSync(`${DIR}results/${name}.json`, 'utf8'));
  } catch (e) {
    return { errs: [`cannot read/parse results/${name}.json: ${e.message}`], menus, res: [] };
  }
  if (!Array.isArray(res)) return { errs: ['top level must be an array'], menus, res: [] };
  const want = new Map(menus.map((m) => [m.key, m]));
  const seen = new Set();
  for (const [i, o] of res.entries()) {
    const at = `[${i}] ${o?.menu}`;
    const m = want.get(o?.menu);
    if (!m) {
      errs.push(`${at}: menu key not in this batch`);
      continue;
    }
    if (seen.has(o.menu)) errs.push(`${at}: duplicate menu`);
    seen.add(o.menu);
    errs.push(...objErrors(o, m, at));
  }
  for (const k of want.keys()) if (!seen.has(k)) errs.push(`missing result for ${k}`);
  return { errs, menus, res };
}

const arg = process.argv[2];
if (arg && process.argv[3] === '--changes') {
  // For the verifier: every menu whose main differs from the current tag.
  const { menus, res } = check(arg);
  const byKey = new Map(menus.map((m) => [m.key, m]));
  for (const [i, o] of res.entries()) {
    const m = byKey.get(o?.menu);
    if (!m || m.rests.some((r) => r.current === o.main_cuisine)) continue;
    console.log(`[${i}] ${o.menu} "${m.rests[0].name}"${m.rests.length > 1 ? ` (+${m.rests.length - 1} branches)` : ''}: ${m.rests[0].current} -> ${o.main_cuisine} | sec ${JSON.stringify(o.secondary_cuisines)} | ${o.confidence} | ${o.status}`);
  }
  process.exit(0);
}
if (arg) {
  const { errs } = check(arg);
  console.log(errs.length ? errs.slice(0, 60).join('\n') + (errs.length > 60 ? `\n...${errs.length - 60} more` : '') : 'OK');
  process.exit(errs.length ? 1 : 0);
}

const index = JSON.parse(fs.readFileSync(`${DIR}batches/index.json`, 'utf8'));
const stats = JSON.parse(fs.readFileSync(`${DIR}batches/stats.json`, 'utf8'));
/* Audit corrections, keyed by menu: { mXXXX: { field: value, ..., _why: "..." } }. Kept apart
   from results/ so the batch agents' raw output stays as written. */
const overridesPath = `${DIR}audit/overrides.json`;
const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};
const profiles = {};
const bad = [];
const missing = [];
const overrideErrs = [];
let overridden = 0;
const tally = { menus: 0, rests: 0, hold: 0, mainChanged: 0, withSecondary: 0, lowConf: 0, newCuisine: {}, secondaries: {}, changes: {} };
for (const b of index) {
  if (!fs.existsSync(`${DIR}results/${b.name}.json`)) {
    missing.push(b.name);
    continue;
  }
  const { errs, menus, res } = check(b.name);
  if (errs.length) {
    bad.push(`${b.name}(${errs.length})`);
    continue;
  }
  const byKey = new Map(menus.map((m) => [m.key, m]));
  for (const raw of res) {
    tally.menus++;
    const m = byKey.get(raw.menu);
    let o = raw;
    if (overrides[raw.menu]) {
      const { _why, ...fix } = overrides[raw.menu];
      o = { ...raw, ...fix, audited: _why ?? true };
      if (o.status === 'ok') o.hold_reason = null;
      const e = objErrors(o, m, `override ${raw.menu}`);
      if (e.length) {
        overrideErrs.push(...e);
        o = raw;
      } else overridden++;
    }
    const { menu, ...rest } = o;
    for (const r of m.rests) {
      tally.rests++;
      profiles[r.id] = { ...rest, menu, previous_cuisine: r.current, menu_stats: stats[r.id] ?? null };
      if (o.status === 'hold') tally.hold++;
      else {
        if (o.main_cuisine !== r.current) {
          tally.mainChanged++;
          const k = `${r.current}->${o.main_cuisine}`;
          tally.changes[k] = (tally.changes[k] ?? 0) + 1;
        }
        if (o.secondary_cuisines.length) tally.withSecondary++;
      }
      if (o.confidence === 'low') tally.lowConf++;
      for (const s of o.secondary_cuisines) tally.secondaries[s] = (tally.secondaries[s] ?? 0) + 1;
      if (o.new_cuisine) tally.newCuisine[o.new_cuisine] = (tally.newCuisine[o.new_cuisine] ?? 0) + 1;
    }
  }
}
fs.writeFileSync(`${DIR}profiles.json`, JSON.stringify(profiles));
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`batches ${index.length} | valid ${index.length - bad.length - missing.length} | invalid ${bad.length} | missing ${missing.length}`);
if (bad.length) console.log('invalid:', bad.join(' '));
if (missing.length) console.log('missing:', missing.slice(0, 30).join(' ') + (missing.length > 30 ? ` ...+${missing.length - 30}` : ''));
console.log(`menus ${tally.menus} | restaurants ${tally.rests} | hold ${tally.hold} | main changed ${tally.mainChanged} | with secondary ${tally.withSecondary} | low confidence ${tally.lowConf} | overrides applied ${overridden}`);
if (overrideErrs.length) console.log(`override errors (${overrideErrs.length}, those overrides skipped):\n` + overrideErrs.slice(0, 20).join('\n'));
console.log('top main changes:', top(tally.changes, 15));
console.log('secondaries:', top(tally.secondaries, 15));
console.log('new cuisine suggestions:', top(tally.newCuisine, 12));
