/**
 * Finds which menus have actually changed, without re-extracting any of them.
 *
 *   node --env-file=.env.local scripts/check-menu-freshness.mjs --limit 100
 *   node --env-file=.env.local scripts/check-menu-freshness.mjs            # all
 *   node --env-file=.env.local scripts/check-menu-freshness.mjs --queue     # list only
 *
 * ## The problem this solves
 *
 * Keeping 682 menus current by re-extracting them on a schedule does not
 * close. At the achievable rate that is roughly ten days of work per week, and
 * almost all of it would be spent re-reading pages that are byte-identical to
 * last time — menus change once or twice a year, not weekly.
 *
 * So this does the cheap half. It re-fetches each recorded source page, hashes
 * the part of it that looks like a menu, and compares against the hash taken
 * when the menu was extracted. No model, no agent, no session tokens: just
 * HTTP and a checksum. The expensive step then runs over the restaurants that
 * genuinely changed, which is a batch rather than a fortnight.
 *
 * ## What it deliberately does not do
 *
 * It does not re-extract, and it does not touch `dishes`. It writes a
 * fingerprint and a checked-at timestamp, and prints the queue. Deciding what
 * to re-extract stays a separate, deliberate step — an automatic pipeline that
 * both detects and rewrites would let one bad fetch quietly replace a good
 * menu with a parked-domain page.
 */

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const LIMIT = flag("limit", Infinity);
/** Print the current queue from stored state and exit — no fetching. */
const QUEUE_ONLY = process.argv.includes("--queue");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/*
 * Reduce a page to the part a menu lives in, then hash that.
 *
 * Hashing raw HTML would report a change every single run: these pages carry
 * session ids, CSRF tokens, cache-busting asset URLs, rotating hero images and
 * "12 people are viewing this" widgets. Third-party sources are the worst, and
 * they are more than half the corpus.
 *
 * So the text is stripped to prices and the words around them. A price is the
 * one thing on a menu page that is both stable and meaningful — when the set of
 * prices changes, the menu changed. Everything else is chrome.
 */
function fingerprint(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ");

  // Every price on the page, in order. Dollar amounts with optional cents.
  const prices = text.match(/\$\s?\d{1,3}(?:\.\d{2})?/g) ?? [];
  if (prices.length < 3) {
    // Too few prices to be a menu — probably a JS-rendered page this cheap
    // fetch cannot see. Hash nothing rather than record a false fingerprint
    // that would report "changed" forever after.
    return null;
  }
  return createHash("sha256").update(prices.join("|")).digest("hex").slice(0, 32);
}

async function fetchPage(url) {
  // A plain fetch, not a browser — that is the whole point. Pages this cannot
  // read return null and are simply skipped, not marked changed.
  const res = await fetch(url, {
    headers: {
      // Some sites serve a bot page to a bare fetch; a normal UA gets the real
      // one often enough to be worth sending, and this is a read-only check.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  return res.text();
}

if (QUEUE_ONLY) {
  const rows = await sql`
    SELECT r.name, m.checked_at, m.attempted_at, m.confidence
    FROM menu_lookups m JOIN restaurants r ON r.id = m.restaurant_id
    WHERE m.status = 'found'
    ORDER BY m.checked_at NULLS FIRST, m.attempted_at
    LIMIT 40
  `;
  console.log("Least recently checked menus:\n");
  for (const r of rows) {
    const when = r.checked_at ? new Date(r.checked_at).toISOString().slice(0, 10) : "never";
    console.log(`  ${when}  ${r.confidence ?? "-"}\t${r.name}`);
  }
  process.exit(0);
}

const targets = await sql`
  SELECT m.restaurant_id, r.name, m.source_url, m.source_fingerprint, m.confidence
  FROM menu_lookups m
  JOIN restaurants r ON r.id = m.restaurant_id
  WHERE m.status = 'found' AND m.source_url IS NOT NULL AND m.source_url <> ''
  ORDER BY m.checked_at NULLS FIRST, m.attempted_at
  LIMIT ${Number.isFinite(LIMIT) ? LIMIT : 10000}
`;

console.log(`Checking ${targets.length} menus for changes.\n`);

const changed = [];
const unreadable = [];
let unchanged = 0;

for (const t of targets) {
  try {
    const html = await fetchPage(t.source_url);
    const print = html ? fingerprint(html) : null;

    if (!print) {
      // Recorded as checked so it rotates out of the front of the queue, but
      // its fingerprint is left alone — a page this cannot read is a page this
      // cannot judge, and the honest answer is "unknown", not "unchanged".
      await sql`UPDATE menu_lookups SET checked_at = now() WHERE restaurant_id = ${t.restaurant_id}`;
      unreadable.push(t.name);
      continue;
    }

    if (t.source_fingerprint === null) {
      // First sighting: record the baseline. Nothing to compare against yet,
      // so this is not a change.
      await sql`
        UPDATE menu_lookups SET source_fingerprint = ${print}, checked_at = now()
        WHERE restaurant_id = ${t.restaurant_id}
      `;
      unchanged += 1;
    } else if (t.source_fingerprint !== print) {
      // The fingerprint is NOT updated here. It stays as the hash of what was
      // actually extracted, so this keeps reporting "changed" until a real
      // re-extraction happens — otherwise one check would silently clear the
      // flag and the stale menu would sit there looking fresh.
      await sql`UPDATE menu_lookups SET checked_at = now() WHERE restaurant_id = ${t.restaurant_id}`;
      changed.push(t);
    } else {
      await sql`UPDATE menu_lookups SET checked_at = now() WHERE restaurant_id = ${t.restaurant_id}`;
      unchanged += 1;
    }
  } catch {
    unreadable.push(t.name);
  }
  process.stdout.write(`\r  ${changed.length} changed, ${unchanged} unchanged, ${unreadable.length} unreadable`);
}

console.log("\n");

if (changed.length > 0) {
  console.log(`${changed.length} menus whose prices have changed since extraction:\n`);
  for (const c of changed) {
    console.log(`${c.restaurant_id}\t${c.name}\t(${c.confidence})\n\t${c.source_url}`);
  }
  console.log("\nThese are the ones worth re-extracting. The rest are unchanged.");
} else {
  console.log("Nothing changed.");
}

if (unreadable.length > 0) {
  console.log(
    `\n${unreadable.length} could not be read by a plain fetch (JS-rendered, blocked, or gone):\n  ` +
      unreadable.slice(0, 20).join(", ") +
      (unreadable.length > 20 ? `, and ${unreadable.length - 20} more` : ""),
  );
  console.log("Those need a browser, so they fall back to the slow rotation rather than this check.");
}
