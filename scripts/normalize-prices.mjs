/**
 * Puts the dollar sign back on prices that lost it, and nothing else.
 *
 *   node --env-file=.env.local scripts/normalize-prices.mjs --dry
 *   node --env-file=.env.local scripts/normalize-prices.mjs
 *
 * ## What this touches, and what it deliberately does not
 *
 * 11,885 of 245,000 dish prices do not match `^\$\d+(\.\d{2})?$`, and they are
 * three different problems that were being counted as one:
 *
 *   ~7,257  `3.49`, `12`, `12.5`      a dropped `$`, and nothing else
 *    1,913  `—`                       no price at all
 *   ~2,700  `$7.69 - $17.79`, `$16.70+`, `$17.95 (Lunch) / $23.95 (Dinner)`
 *                                     genuinely multi-valued
 *
 * Only the first group is touched here. `3.49` becomes `$3.49` and `12.5`
 * becomes `$12.50` - the same number, written the way every other row writes it,
 * so that sorting and comparison work. No value changes, no row is created or
 * deleted, and a run is idempotent.
 *
 * The em-dash rows are left alone because they are a menu-quality question
 * (a dish list without prices is not a menu) with a per-restaurant answer, not a
 * formatting one. The multi-valued rows are left alone because collapsing
 * `$17.95 (Lunch) / $23.95 (Dinner)` to one number would throw away something
 * the restaurant published, and picking which half to keep is a display
 * decision nobody has made yet. See probe/STATE.md.
 *
 * Every changed row is written to `menus/retired/<stamp>-price-format.json`
 * with its before and after, so the pass can be undone.
 */

import { neon } from "@neondatabase/serverless";
import { mkdir, writeFile } from "node:fs/promises";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");

/* A bare number, optionally with one or two decimal places. Anything carrying a
 * range, a suffix, a second price or a word is not this. */
const BARE = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/;

const rows = await sql`
  SELECT id, restaurant_id, name, price
  FROM dishes
  WHERE price !~ '^\\$[0-9]+(\\.[0-9]{2})?$'
    AND price ~ '^[0-9]+(\\.[0-9]{1,2})?$'
  ORDER BY restaurant_id, id
`;

const changes = [];
for (const row of rows) {
  const m = BARE.exec(String(row.price));
  if (!m) continue;
  const dollars = m[1];
  const cents = (m[2] ?? "").padEnd(2, "0");
  const next = `$${dollars}.${cents}`;
  if (next === row.price) continue;
  changes.push({ id: row.id, restaurant_id: row.restaurant_id, name: row.name, from: row.price, to: next });
}

console.log(`${rows.length} bare-number prices found, ${changes.length} to rewrite\n`);
for (const c of changes.slice(0, 10)) console.log(`  ${String(c.from).padStart(8)} -> ${c.to.padEnd(9)} ${c.name}`);
if (changes.length > 10) console.log(`  … and ${changes.length - 10} more`);

if (DRY_RUN) {
  console.log("\nDry run - nothing written.");
} else if (changes.length) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `menus/retired/${stamp}-price-format.json`;
  await mkdir("menus/retired", { recursive: true });
  await writeFile(path, JSON.stringify(changes, null, 2), "utf8");

  /* One statement per batch of ids rather than per row: 7,000 round trips over
   * this machine's connection is how a load times out halfway. */
  const SIZE = 500;
  for (let i = 0; i < changes.length; i += SIZE) {
    const slice = changes.slice(i, i + SIZE);
    await sql`
      UPDATE dishes AS d SET price = v.price
      FROM (SELECT unnest(${slice.map((c) => String(c.id))}::text[]) AS id,
                   unnest(${slice.map((c) => c.to)}::text[]) AS price) AS v
      WHERE d.id = v.id`;
    console.log(`  ${Math.min(i + SIZE, changes.length)}/${changes.length}`);
  }

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM dishes WHERE price !~ '^\\$[0-9]+(\\.[0-9]{2})?$'`;
  console.log(`\nRewrote ${changes.length}. ${n} non-conforming prices remain (em-dashes and multi-valued rows).`);
  console.log(`Undo from ${path}.`);
}
