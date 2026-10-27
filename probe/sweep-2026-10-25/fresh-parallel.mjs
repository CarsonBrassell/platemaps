// Parallel copy of scripts/check-menu-freshness.mjs for the 2026-10-25 sweep.
// Same fingerprint and same writes; adds concurrency and a hard per-page cap,
// because the serial original hung for minutes on one page.
//   node --env-file=.env.local probe/sweep-2026-10-25/fresh-parallel.mjs
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { publicFetch } from "../../scripts/public-url.mjs";

const sql = neon(process.env.DATABASE_URL);
const WORKERS = 12;
const HARD_MS = 30_000;

function fingerprint(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ");
  const prices = text.match(/\$\s?\d{1,3}(?:\.\d{2})?/g) ?? [];
  if (prices.length < 3) return null;
  return createHash("sha256").update(prices.join("|")).digest("hex").slice(0, 32);
}

async function fetchPage(url) {
  const work = (async () => {
    const res = await publicFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return res.text();
  })();
  const cap = new Promise((_, reject) => setTimeout(() => reject(new Error("hard timeout")), HARD_MS));
  return Promise.race([work, cap]);
}

const targets = await sql`
  SELECT m.restaurant_id, r.name, m.source_url, m.source_fingerprint, m.confidence
  FROM menu_lookups m JOIN restaurants r ON r.id = m.restaurant_id
  WHERE m.status = 'found' AND m.source_url LIKE 'http%'
  ORDER BY m.checked_at NULLS FIRST, m.attempted_at
`;
console.log(`Checking ${targets.length} menus.`);

const changed = [];
let unchanged = 0, unreadable = 0, baselined = 0, done = 0, next = 0;

async function check(t) {
  let print = null;
  try {
    const html = await fetchPage(t.source_url);
    print = html ? fingerprint(html) : null;
  } catch {}
  if (!print) {
    unreadable++;
    await sql`UPDATE menu_lookups SET checked_at = now() WHERE restaurant_id = ${t.restaurant_id}`;
  } else if (t.source_fingerprint === null) {
    baselined++;
    await sql`UPDATE menu_lookups SET source_fingerprint = ${print}, checked_at = now() WHERE restaurant_id = ${t.restaurant_id}`;
  } else if (t.source_fingerprint !== print) {
    changed.push({ id: t.restaurant_id, name: t.name, confidence: t.confidence, url: t.source_url });
    await sql`UPDATE menu_lookups SET checked_at = now() WHERE restaurant_id = ${t.restaurant_id}`;
  } else {
    unchanged++;
    await sql`UPDATE menu_lookups SET checked_at = now() WHERE restaurant_id = ${t.restaurant_id}`;
  }
}

async function worker() {
  while (next < targets.length) {
    const t = targets[next++];
    try { await check(t); } catch { unreadable++; }
    if (++done % 100 === 0) {
      console.log(`${done}/${targets.length}  changed ${changed.length}  unchanged ${unchanged}  baselined ${baselined}  unreadable ${unreadable}`);
      writeFileSync(new URL("./changed.json", import.meta.url), JSON.stringify(changed, null, 1));
    }
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));

writeFileSync(new URL("./changed.json", import.meta.url), JSON.stringify(changed, null, 1));
console.log(`DONE ${done}  changed ${changed.length}  unchanged ${unchanged}  baselined ${baselined}  unreadable ${unreadable}`);
process.exit(0);
