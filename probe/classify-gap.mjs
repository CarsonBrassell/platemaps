/* Splits the "website but no menu" gap into the buckets that decide whether a
 * vision pipeline is worth buying. `needs-browser` conflates two failures:
 * prices that exist as PIXELS (a PDF or an image menu - vision reads those)
 * and prices that DO NOT EXIST because the restaurant never published them
 * (vision reads nothing). Only the first is addressable, and nobody has
 * measured the split. Read-only, no DB writes, no paid API. */
import { neon } from '@neondatabase/serverless';
import { writeFile } from 'node:fs/promises';

const sql = neon(process.env.DATABASE_URL);
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 200;
const CONC = 8;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const PRICE = /(?:^|[\s>(\[])\$\s?\d{1,3}(?:\.\d{2})?(?:[\s<).\],]|$)/g;
const MENU_LINK = /<a[^>]+href=["']([^"']+)["'][^>]*>(?:(?!<\/a>).){0,120}?menu(?:(?!<\/a>).){0,60}?<\/a>/gi;

async function get(url, ms = 12000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: { 'user-agent': UA } });
    const ct = r.headers.get('content-type') || '';
    if (/pdf/i.test(ct)) return { ok: true, pdf: true, html: '', url: r.url };
    if (!/html|text/i.test(ct)) return { ok: true, html: '', url: r.url, ct };
    return { ok: r.ok, html: (await r.text()).slice(0, 400000), url: r.url, ct };
  } catch (e) { return { ok: false, err: String(e.name || e).slice(0, 40) }; }
  finally { clearTimeout(t); }
}

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
                      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const priceCount = (t) => (t.match(PRICE) || []).length;

async function classify(r) {
  const home = await get(r.website);
  if (!home.ok) return { ...r, bucket: 'fetch-failed', detail: home.err };
  if (home.pdf) return { ...r, bucket: 'pdf-menu', detail: 'website itself is a PDF' };
  const homeText = strip(home.html);
  const homePrices = priceCount(homeText);

  // collect candidate menu links
  const links = new Set();
  let m;
  MENU_LINK.lastIndex = 0;
  while ((m = MENU_LINK.exec(home.html)) && links.size < 6) {
    try { links.add(new URL(m[1], home.url).href); } catch {}
  }
  const pdfLinks = [...links].filter((u) => /\.pdf(\?|$)/i.test(u));
  if (pdfLinks.length) return { ...r, bucket: 'pdf-menu', detail: pdfLinks[0].slice(0, 120) };

  let best = { prices: homePrices, url: home.url, imgs: 0 };
  for (const u of [...links].slice(0, 3)) {
    const p = await get(u);
    if (!p.ok) continue;
    if (p.pdf) return { ...r, bucket: 'pdf-menu', detail: u.slice(0, 120) };
    const t = strip(p.html);
    const n = priceCount(t);
    const imgs = (p.html.match(/<img[^>]+>/gi) || []).length;
    if (n > best.prices) best = { prices: n, url: p.url, imgs, text: t };
    else if (!best.text) best = { ...best, imgs, text: t };
  }
  if (best.prices >= 8) return { ...r, bucket: 'prices-present', detail: `${best.prices} prices at ${best.url.slice(0, 90)}` };
  if (best.prices >= 1) return { ...r, bucket: 'few-prices', detail: `${best.prices} prices at ${best.url.slice(0, 90)}` };
  if (best.imgs >= 8) return { ...r, bucket: 'image-menu-likely', detail: `${best.imgs} images, 0 prices at ${best.url.slice(0, 90)}` };
  return { ...r, bucket: 'no-prices-anywhere', detail: `0 prices, ${best.imgs} images at ${best.url.slice(0, 90)}` };
}

const rows = await sql`
  SELECT r.id, r.name, r.website, r.review_count FROM restaurants r
  WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND r.website IS NOT NULL AND r.website <> ''
    AND r.website !~* 'facebook|instagram|yelp\.com'
    AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id::text)
  ORDER BY random() LIMIT ${LIMIT}`;

console.log(`classifying ${rows.length} random gap rows, ${CONC} at a time`);
const out = [];
let i = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < rows.length) {
    const r = rows[i++];
    const res = await classify({ id: String(r.id), name: r.name, website: r.website, reviewCount: r.review_count });
    out.push(res);
    if (++done % 25 === 0) console.log(`  ${done}/${rows.length}`);
  }
}));
const tally = {};
for (const r of out) tally[r.bucket] = (tally[r.bucket] ?? 0) + 1;
console.log('\n=== buckets ===');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(v).padStart(4)}  ${(100 * v / out.length).toFixed(1).padStart(5)}%  ${k}`);
await writeFile('probe/gap-classification.json', JSON.stringify(out, null, 2));
console.log('\nwrote probe/gap-classification.json');
