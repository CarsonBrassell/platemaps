/**
 * Read-only: how many of our stored prices still appear on the menu page they
 * came from? Writes nothing to the database.
 *
 *   node --env-file=.env.local scripts/menu-price-drift.mjs [--limit N] [--concurrency 6]
 *
 * check-menu-freshness.mjs can only say "changed since last seen", and its
 * first pass merely records a baseline — so today nothing can say which
 * menus are *already* stale. This does: fetch the source page, pull every
 * dollar amount out of it, and count what fraction of the restaurant's stored
 * prices are among them. A menu whose prices are all still on the page is
 * current; one where most are gone has been reprinted since we read it.
 * The 2026-09-13 spot check found 5 stale menus in 50 by hand; this is the
 * same check for the corpus.
 *
 * Skips: chain-shared and low-confidence lookups (no page of their own),
 * delivery apps (DoorDash, Uber Eats, Grubhub, Postmates: bot page to a bare
 * fetch), archive.org (frozen by definition), and rows with fewer than 5
 * priced dishes (too few to judge). Pages this cannot read are reported as
 * `unreadable`, never as stale.
 *
 * Output: probe/spot-check/price-drift.json, one entry per restaurant.
 */
import { neon } from "@neondatabase/serverless";
import { writeFileSync, mkdirSync } from "node:fs";
import { hostOf } from "./junk-menu.mjs";

const sql = neon(process.env.DATABASE_URL);
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d; };
const LIMIT = opt("--limit", Infinity);
const CONCURRENCY = opt("--concurrency", 6);
const OUT = "probe/spot-check/price-drift.json";

const SKIP_HOSTS = /doordash|ubereats|grubhub|postmates|seamless|archive\.org|toasttab|squareup|square\.site|clover\.com|chownow|slicelife|menufy|cash\.app/i;

const rows = await sql`
  SELECT m.restaurant_id AS id, r.name, m.source_url, m.confidence,
         (SELECT array_agg(price) FROM dishes d WHERE d.restaurant_id = r.id AND d.source = 'menu' AND d.price IS NOT NULL AND d.price <> '') AS prices
  FROM menu_lookups m JOIN restaurants r ON r.id = m.restaurant_id
  WHERE m.status = 'found' AND m.source_url LIKE 'http%'
    AND m.confidence IN ('high', 'medium', 'medium-high')
    AND r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
  ORDER BY r.id`;

const toNum = (p) => { const m = String(p).replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/); return m ? Number(m[0]).toFixed(2) : null; };
const targets = rows
  .map((r) => ({ ...r, host: hostOf(r.source_url), nums: [...new Set((r.prices ?? []).map(toNum).filter(Boolean))] }))
  .filter((r) => r.nums.length >= 5 && !SKIP_HOSTS.test(r.host))
  .slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);

console.log(`${rows.length} own-source menus on listed restaurants; ${targets.length} checkable (>=5 priced dishes, fetchable host).`);

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", Accept: "text/html,application/xhtml+xml,application/pdf" },
      redirect: "follow", signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { status: `http ${res.status}` };
    const ct = res.headers.get("content-type") ?? "";
    if (/pdf|octet-stream/i.test(ct)) return { status: "pdf" };
    return { status: "ok", text: await res.text() };
  } catch (e) {
    return { status: /timeout|abort/i.test(String(e)) ? "timeout" : "fetch-error" };
  }
}

/* Every dollar-ish amount on the page, normalised to 2 decimals. "12" and "12.00" both count. */
function pagePrices(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ");
  const found = new Set();
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)|(?<![\d.])(\d{1,3}\.\d{2})(?![\d])/g)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (n > 0 && n < 1000) found.add(n.toFixed(2));
  }
  return found;
}

const results = [];
let i = 0;
async function worker() {
  while (i < targets.length) {
    const t = targets[i++];
    const page = await fetchText(t.source_url);
    let entry = { id: t.id, name: t.name, host: t.host, source_url: t.source_url, priced: t.nums.length, status: page.status };
    if (page.status === "ok") {
      const onPage = pagePrices(page.text);
      if (onPage.size === 0) entry.status = "no-prices-on-page"; // JS-rendered menu; can't judge
      else {
        const hit = t.nums.filter((n) => onPage.has(n)).length;
        entry = { ...entry, found: hit, fraction: +(hit / t.nums.length).toFixed(2), page_prices: onPage.size };
      }
    }
    results.push(entry);
    if (results.length % 100 === 0) {
      process.stdout.write(`  ${results.length}/${targets.length}\n`);
      save();
    }
  }
}
function save() {
  mkdirSync("probe/spot-check", { recursive: true });
  // A page with < 15 prices is a landing page or a photo, not the menu; a low
  // hit rate there says nothing about staleness ("thin-page").
  const judged = results.filter((r) => r.fraction != null && (r.page_prices >= 15 || r.fraction >= 0.8));
  const bucket = (f) => (f >= 0.8 ? "current" : f >= 0.5 ? "drifting" : "stale");
  const summary = { ran: new Date().toISOString(), targets: targets.length, done: results.length, judged: judged.length,
    current: judged.filter((r) => bucket(r.fraction) === "current").length,
    drifting: judged.filter((r) => bucket(r.fraction) === "drifting").length,
    stale: judged.filter((r) => bucket(r.fraction) === "stale").length,
    thin_page: results.filter((r) => r.fraction != null).length - judged.length,
    unreadable: results.filter((r) => r.fraction == null).length };
  writeFileSync(OUT, JSON.stringify({ summary, results: results.map((r) => ({ ...r, verdict: r.fraction == null ? "unreadable" : judged.includes(r) ? bucket(r.fraction) : "thin-page" })) }, null, 1));
  return summary;
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const s = save();
console.log(`\nDone. judged ${s.judged}: current ${s.current}, drifting ${s.drifting}, stale ${s.stale}; unreadable ${s.unreadable}. -> ${OUT}`);
