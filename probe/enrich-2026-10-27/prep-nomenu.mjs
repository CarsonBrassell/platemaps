// Listed restaurants with no menu on the site, but a captured dish list on disk that the
// screener kept off it (mostly unpriced, stale or thin). Builds extra batches in the same
// format as prep.mjs, numbered after the existing ones (menu keys m9001+). Read-only on Neon.
// The capture is good enough to classify from, not to publish: holds from these batches
// are NOT applied to the site (load-nomenu.mjs reports them instead).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MIN = 8, BATCH_MAX = 30, ITEM_CAP = 160, DESC_CAP = 90;

const rests = await sql`SELECT id, name, cuisine, cuisine_raw, cuisine_tags, neighborhood, price_band, website FROM restaurants r
  WHERE hold_reason IS NULL AND lat IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id)`;
const byId = new Map(rests.map((r) => [r.id, r]));
const best = new Map();
const take = (id, dishes, src) => {
  id = String(id); if (!byId.has(id) || !Array.isArray(dishes)) return;
  const ds = dishes.filter((d) => d && typeof d.name === 'string' && d.name.trim());
  if (ds.length > (best.get(id)?.dishes.length ?? 0)) best.set(id, { dishes: ds, src });
};
for (const dir of ['menus/wip', 'menus/wip/photos', 'menus/retired']) {
  if (!fs.existsSync(ROOT + dir)) continue;
  for (const f of fs.readdirSync(ROOT + dir)) {
    if (!f.endsWith('.json')) continue;
    let j; try { j = JSON.parse(fs.readFileSync(`${ROOT}${dir}/${f}`, 'utf8')); } catch { continue; }
    for (const e of Array.isArray(j) ? j : (j.restaurants ?? [j])) if (e && typeof e === 'object') take(e.restaurantId ?? e.id, e.dishes, `${dir}/${f}`);
  }
}
const num = (p) => { const m = String(p ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/); const v = m ? parseFloat(m[0]) : NaN; return v > 0 && v < 500 ? v : null; };
const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * f, lo = Math.floor(i); return +(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)).toFixed(2); };

const index = JSON.parse(fs.readFileSync(`${DIR}batches/index.json`, 'utf8'));
const stats = JSON.parse(fs.readFileSync(`${DIR}batches/stats.json`, 'utf8'));
let bn = Math.max(...index.map((b) => +b.name.slice(6)));
const firstNew = bn + 1;
const blocks = [];
let n = 9000;
for (const [id, { dishes: items, src }] of best) {
  if (items.length < MIN) continue;
  const r = byId.get(id), key = 'm' + ++n;
  const prices = items.map((d) => num(d.price)).filter((v) => v != null);
  const st = { items: items.length, priced: prices.length, p25: q(prices, 0.25), median: q(prices, 0.5), p75: q(prices, 0.75), capture: src };
  stats[id] = { menu: key, ...st };
  const secs = new Map();
  for (const d of items) { const s = String(d.section ?? '').trim() || '(no section)'; (secs.get(s) ?? secs.set(s, []).get(s)).push(d); }
  const lines = [`=== MENU ${key} ===`,
    `restaurant ${id} "${r.name}" | current: ${r.cuisine ?? '-'} | raw: ${r.cuisine_raw ?? '-'} | tags: ${(r.cuisine_tags ?? '-').slice(0, 120)} | area: ${r.neighborhood ?? '-'} | price_band: ${r.price_band ?? '-'}${r.website ? ' | web: ' + r.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50) : ''}`,
    `items ${st.items} | priced ${st.priced} | median $${st.median ?? '-'} (p25 ${st.p25 ?? '-'}, p75 ${st.p75 ?? '-'}) | sections ${secs.size}`,
    `NOTE: unpublished capture (menu photos or a page the screener rejected, often for missing prices). Missing prices are NOT a hold reason here; hold only for the content reasons in rule 6.`];
  const scale = items.length > ITEM_CAP ? ITEM_CAP / items.length : 1;
  for (const [s, arr] of secs) {
    const keep = scale < 1 ? Math.max(2, Math.ceil(arr.length * scale)) : arr.length;
    lines.push(`## ${s} (${arr.length})`);
    for (const d of arr.slice(0, keep)) {
      const desc = String(d.description ?? '').replace(/\s+/g, ' ').trim();
      lines.push(`- ${d.name.replace(/\s+/g, ' ').trim()}${d.price ? ' — ' + String(d.price).trim().slice(0, 14) : ''}${desc ? ' — ' + (desc.length > DESC_CAP ? desc.slice(0, DESC_CAP) + '…' : desc) : ''}`);
    }
    if (keep < arr.length) lines.push(`  (+${arr.length - keep} more not shown)`);
  }
  blocks.push({ key, text: lines.join('\n') });
}
const made = [];
for (let i = 0; i < blocks.length; i += BATCH_MAX) {
  const b = blocks.slice(i, i + BATCH_MAX), name = 'batch-' + String(++bn).padStart(3, '0');
  const text = b.map((x) => x.text).join('\n\n') + '\n';
  fs.writeFileSync(`${DIR}batches/${name}.txt`, text);
  index.push({ name, menus: b.map((x) => x.key), ids: b.length, chars: text.length, nomenu: true });
  made.push(name);
}
fs.writeFileSync(`${DIR}batches/index.json`, JSON.stringify(index));
fs.writeFileSync(`${DIR}batches/stats.json`, JSON.stringify(stats));
console.log({ noMenuListed: rests.length, captures: blocks.length, batches: made.length, first: made[0], last: made.at(-1), firstNew });
