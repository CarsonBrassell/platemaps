// node prep-audit.mjs  (after `node validate.mjs` has merged profiles.json)
// Picks the menus worth a second opinion and writes them, with the batch agent's answer, into
// audit/chunks/chunk-NNN.txt for independent judges. Kinds:
//   hold     every held menu (is it really unusable?)
//   changed  main cuisine differs from every branch's current tag
//   low      confidence "low" (and not already picked)
//   random   a fixed ~3% sample of everything else, to measure the base error rate
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const CHUNK_MENUS = 50;
const CHUNK_CHARS = 160_000;
const RANDOM_PER_256 = 8; // ~3%

const profiles = JSON.parse(fs.readFileSync(`${DIR}profiles.json`, 'utf8'));
const blocks = {};
for (const f of fs.readdirSync(`${DIR}batches`).filter((f) => f.endsWith('.txt')).sort()) {
  let key = null;
  for (const line of fs.readFileSync(`${DIR}batches/${f}`, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^=== MENU (m\d+) ===/);
    if (m) {
      key = m[1];
      blocks[key] = [];
    }
    if (key) blocks[key].push(line);
  }
}

const byMenu = {};
for (const [id, p] of Object.entries(profiles)) {
  const e = (byMenu[p.menu] ??= { p, ids: [], prev: new Set() });
  e.ids.push(id);
  e.prev.add(p.previous_cuisine);
}
const kindOf = ({ p, prev }) => {
  if (p.status === 'hold') return 'hold';
  if (!prev.has(p.main_cuisine)) return 'changed';
  if (p.confidence === 'low') return 'low';
  const h = crypto.createHash('sha1').update(p.menu).digest()[0];
  return h < RANDOM_PER_256 ? 'random' : null;
};
const picked = { hold: [], changed: [], low: [], random: [] };
for (const [menu, e] of Object.entries(byMenu).sort()) {
  const k = kindOf(e);
  if (k) picked[k].push(menu);
}

const proposed = (p) => JSON.stringify({
  status: p.status, hold_reason: p.hold_reason, main_cuisine: p.main_cuisine, secondary_cuisines: p.secondary_cuisines,
  styles: p.styles, confidence: p.confidence, service: p.service, dish_types: p.dish_types, summary: p.summary, notes: p.notes,
});
fs.rmSync(`${DIR}audit/chunks`, { recursive: true, force: true });
fs.mkdirSync(`${DIR}audit/chunks`, { recursive: true });
const index = [];
let n = 0;
/* Lean by default (Calvin, 2026-10-27): one judge on changed cuisines only. Pass kinds to widen,
   e.g. `node prep-audit.mjs changed hold low random`. */
const KINDS = process.argv.length > 2 ? process.argv.slice(2) : ['changed'];
for (const [kind, menus] of Object.entries(picked)) {
  if (!KINDS.includes(kind)) continue;
  let cur = [];
  let chars = 0;
  const flush = () => {
    if (!cur.length) return;
    const name = `chunk-${String(++n).padStart(3, '0')}`;
    const body = cur.map((m) => `${blocks[m].join('\n')}\nPROPOSED ${m}: ${proposed(byMenu[m].p)}\n`).join('\n');
    fs.writeFileSync(`${DIR}audit/chunks/${name}.txt`, `# kind: ${kind} | ${cur.length} menus\n\n${body}`);
    index.push({ name, kind, menus: cur });
    cur = [];
    chars = 0;
  };
  for (const m of menus) {
    const len = blocks[m].join('\n').length;
    if (cur.length >= CHUNK_MENUS || (cur.length && chars + len > CHUNK_CHARS)) flush();
    cur.push(m);
    chars += len;
  }
  flush();
}
fs.writeFileSync(`${DIR}audit/chunks/index.json`, JSON.stringify(index, null, 1));
const count = (k) => picked[k].length;
console.log(`menus ${Object.keys(byMenu).length} | hold ${count('hold')} | changed ${count('changed')} | low ${count('low')} | random ${count('random')} | chunks ${index.length}`);
