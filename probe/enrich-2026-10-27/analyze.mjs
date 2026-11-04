// node analyze.mjs  (after `node validate.mjs` has merged profiles.json)
// Cross-batch checks no single batch agent can see. Writes audit/*.json, prints a summary.
//   conflicts.json  same restaurant name (branch suffixes stripped), different menus, different main cuisine
//   styles.json     every free-text style with its count and example ids (for synonym folding)
//   dish_types.json every dish type with its count (plural/singular and synonym folding)
//   changes.json    every main-cuisine change, grouped by "old -> new", with ids
//   new_cuisine.json suggestions for cuisines the 29 lack
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const profiles = JSON.parse(fs.readFileSync(`${DIR}profiles.json`, 'utf8'));
const names = {};
for (const f of fs.readdirSync(`${DIR}batches`).filter((f) => f.endsWith('.txt'))) {
  for (const line of fs.readFileSync(`${DIR}batches/${f}`, 'utf8').split(/\r?\n/)) {
    const r = line.match(/^restaurant (\S+) "(.*)" \| current: /);
    if (r) names[r[1]] = r[2];
  }
}
const baseName = (n) =>
  n.toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/ [-–—@|] | at |#\d+/)[0]
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();

fs.mkdirSync(`${DIR}audit`, { recursive: true });
const add = (o, k, v) => ((o[k] ??= []).push(v), o);

// 1. Same name, different menus, different main.
const byName = {};
for (const [id, p] of Object.entries(profiles)) if (p.status === 'ok') add(byName, baseName(names[id] ?? ''), { id, name: names[id], menu: p.menu, main: p.main_cuisine, sec: p.secondary_cuisines });
const conflicts = Object.entries(byName)
  .filter(([k, rows]) => k && new Set(rows.map((r) => r.menu)).size > 1 && new Set(rows.map((r) => r.main)).size > 1)
  .map(([k, rows]) => {
    const mains = {};
    for (const r of rows) mains[r.main] = (mains[r.main] ?? 0) + 1;
    return { name: k, count: rows.length, mains, rows };
  })
  .sort((a, b) => b.count - a.count);

// 2-5. Vocabulary tallies.
const tally = (field, map = (x) => x) => {
  const out = {};
  for (const [id, p] of Object.entries(profiles)) {
    const vals = Array.isArray(p[field]) ? p[field] : p[field] ? [p[field]] : [];
    for (const v of vals) {
      const k = map(v);
      out[k] ??= { count: 0, ids: [] };
      out[k].count++;
      if (out[k].ids.length < 5) out[k].ids.push(id);
    }
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1].count - a[1].count));
};
const styles = tally('styles');
const dishTypes = tally('dish_types', (d) => d.trim().toLowerCase());
const newCuisine = tally('new_cuisine');
const changes = {};
for (const [id, p] of Object.entries(profiles)) {
  if (p.status !== 'ok' || p.main_cuisine === p.previous_cuisine) continue;
  add(changes, `${p.previous_cuisine} -> ${p.main_cuisine}`, { id, name: names[id], menu: p.menu, confidence: p.confidence });
}
const changesSorted = Object.fromEntries(Object.entries(changes).sort((a, b) => b[1].length - a[1].length));

fs.writeFileSync(`${DIR}audit/conflicts.json`, JSON.stringify(conflicts, null, 1));
fs.writeFileSync(`${DIR}audit/styles.json`, JSON.stringify(styles, null, 1));
fs.writeFileSync(`${DIR}audit/dish_types.json`, JSON.stringify(dishTypes, null, 1));
fs.writeFileSync(`${DIR}audit/new_cuisine.json`, JSON.stringify(newCuisine, null, 1));
fs.writeFileSync(`${DIR}audit/changes.json`, JSON.stringify(changesSorted, null, 1));

const n = Object.keys(profiles).length;
const changed = Object.values(changes).reduce((s, r) => s + r.length, 0);
console.log(`profiles ${n} | name conflicts ${conflicts.length} (${conflicts.reduce((s, c) => s + c.count, 0)} restaurants) | distinct styles ${Object.keys(styles).length} | distinct dish types ${Object.keys(dishTypes).length} | main changes ${changed} in ${Object.keys(changes).length} kinds`);
console.log('top conflicts:', conflicts.slice(0, 8).map((c) => `${c.name} ${JSON.stringify(c.mains)}`).join('; '));
console.log('top changes:', Object.entries(changesSorted).slice(0, 12).map(([k, v]) => `${k} ${v.length}`).join(', '));
console.log('top styles:', Object.entries(styles).slice(0, 15).map(([k, v]) => `${k} ${v.count}`).join(', '));
console.log('new cuisines:', Object.entries(newCuisine).slice(0, 10).map(([k, v]) => `${k} ${v.count}`).join(', '));
