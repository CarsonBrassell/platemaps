// Dumps every LISTED restaurant's menu into compact text batches for the enrichment agents.
// Identical menus (chain branches) are classified once: one MENU block lists every restaurant sharing it.
// Read-only: SELECTs only.
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import crypto from 'node:crypto';
const sql = neon(process.env.DATABASE_URL);
import { fileURLToPath } from 'node:url';
const DIR = fileURLToPath(new URL('.', import.meta.url));
const BATCH_CHARS = 140_000, BATCH_MAX = 45, ITEM_CAP = 160, DESC_CAP = 90;

const rests = await sql`SELECT id, name, cuisine, cuisine_raw, cuisine_tags, neighborhood, price_band, website FROM restaurants WHERE listed`;
const byId = new Map(rests.map((r) => [r.id, r]));
const dishes = await sql`
  SELECT d.restaurant_id, d.name, d.description, d.price, d.section, d.sort_order
  FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id AND r.listed
  ORDER BY d.restaurant_id, d.sort_order NULLS LAST, d.name`;
const menus = new Map();
for (const d of dishes) {
  if (!d.name || !d.name.trim()) continue;
  (menus.get(d.restaurant_id) ?? menus.set(d.restaurant_id, []).get(d.restaurant_id)).push(d);
}
const num = (p) => { const m = String(p ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/); const v = m ? parseFloat(m[0]) : NaN; return v > 0 && v < 500 ? v : null; };
const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * f, lo = Math.floor(i); return +(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)).toFixed(2); };

// group identical menus
const groups = new Map();
for (const [rid, items] of menus) {
  const key = crypto.createHash('sha1').update(items.map((d) => d.name.trim().toLowerCase()).sort().join('|')).digest('hex');
  (groups.get(key) ?? groups.set(key, { ids: [], items }).get(key)).ids.push(rid);
}
const stats = {};
const blocks = [];
let n = 0;
for (const { ids, items } of groups.values()) {
  const key = 'm' + String(++n).padStart(4, '0');
  const prices = items.map((d) => num(d.price)).filter((v) => v != null);
  const st = { items: items.length, priced: prices.length, p25: q(prices, 0.25), median: q(prices, 0.5), p75: q(prices, 0.75) };
  for (const id of ids) stats[id] = { menu: key, ...st };
  const secs = new Map();
  for (const d of items) { const s = (d.section ?? '').trim() || '(no section)'; (secs.get(s) ?? secs.set(s, []).get(s)).push(d); }
  const lines = [`=== MENU ${key} ===`];
  for (const id of ids) {
    const r = byId.get(id);
    lines.push(`restaurant ${id} "${r.name}" | current: ${r.cuisine ?? '-'} | raw: ${r.cuisine_raw ?? '-'} | tags: ${(r.cuisine_tags ?? '-').slice(0, 120)} | area: ${r.neighborhood ?? '-'} | price_band: ${r.price_band ?? '-'}${r.website ? ' | web: ' + r.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50) : ''}`);
  }
  lines.push(`items ${st.items} | priced ${st.priced} | median $${st.median ?? '-'} (p25 ${st.p25 ?? '-'}, p75 ${st.p75 ?? '-'}) | sections ${secs.size}`);
  const scale = items.length > ITEM_CAP ? ITEM_CAP / items.length : 1;
  for (const [s, arr] of secs) {
    const keep = scale < 1 ? Math.max(2, Math.ceil(arr.length * scale)) : arr.length;
    lines.push(`## ${s} (${arr.length})`);
    for (const d of arr.slice(0, keep)) {
      const desc = (d.description ?? '').replace(/\s+/g, ' ').trim();
      lines.push(`- ${d.name.replace(/\s+/g, ' ').trim()}${d.price ? ' — ' + String(d.price).trim().slice(0, 14) : ''}${desc ? ' — ' + (desc.length > DESC_CAP ? desc.slice(0, DESC_CAP) + '…' : desc) : ''}`);
    }
    if (keep < arr.length) lines.push(`  (+${arr.length - keep} more not shown)`);
  }
  blocks.push({ key, ids, text: lines.join('\n') });
}
let b = [], size = 0, bn = 0;
const batches = [];
const flush = () => { if (!b.length) return; const name = 'batch-' + String(++bn).padStart(3, '0'); fs.writeFileSync(`${DIR}batches/${name}.txt`, b.map((x) => x.text).join('\n\n') + '\n'); batches.push({ name, menus: b.map((x) => x.key), ids: b.flatMap((x) => x.ids).length, chars: size }); b = []; size = 0; };
for (const blk of blocks) { if (b.length && (size + blk.text.length > BATCH_CHARS || b.length >= BATCH_MAX)) flush(); b.push(blk); size += blk.text.length; }
flush();
fs.writeFileSync(`${DIR}batches/index.json`, JSON.stringify(batches));
fs.writeFileSync(`${DIR}batches/stats.json`, JSON.stringify(stats));
const noMenu = rests.filter((r) => !menus.has(r.id)).length;
console.log({ listed: rests.length, withMenu: menus.size, distinctMenus: groups.size, noMenu, batches: batches.length, totalChars: batches.reduce((s, x) => s + x.chars, 0), maxChars: Math.max(...batches.map((x) => x.chars)) });
