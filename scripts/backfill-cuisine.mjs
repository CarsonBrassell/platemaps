/**
 * Fills `cuisine` from `cuisine_raw` for rows the initial normalization pass
 * left blank.
 *
 *   node --env-file=.env.local scripts/backfill-cuisine.mjs            # dry, the default
 *   node --env-file=.env.local scripts/backfill-cuisine.mjs --apply
 *
 * `normalize-cuisines.mjs` already did the one-time collapse of `cuisine` onto
 * the vocabulary in src/data/cuisines.ts, claiming `cuisine_raw` from
 * `cuisine` on the way. This is not a second mapping — it reuses the same
 * `canonicalCuisine`/`tagsFor` from that file — it is a narrower re-run
 * scoped to rows that came up empty: `cuisine IS NULL OR cuisine = ''` with a
 * `cuisine_raw` that maps to something. Most of the corpus's null-cuisine
 * rows are null because their raw label really is a non-answer ("Restaurant",
 * "restaurant", "food") — those stay null here, same as they would under
 * normalize-cuisines. This script only ever fills, never overwrites: the
 * WHERE clause on every UPDATE re-checks that cuisine is still blank.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "./sql-client.mjs";
import { canonicalCuisine, tagsFor } from "../src/data/cuisines.ts";

const APPLY = process.argv.includes("--apply");
const SNAP_DIR = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/deh";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const rows = await sql`
  SELECT id::text, cuisine, cuisine_raw, cuisine_tags, listed, hold_reason
    FROM restaurants
   WHERE cuisine IS NULL OR cuisine = ''`;

const mapped = [];
const unmapped = [];
const perRaw = new Map(); // raw -> { canonical, count }

for (const r of rows) {
  const raw = r.cuisine_raw;
  const canonical = canonicalCuisine(raw);
  if (canonical) {
    const tags = (r.cuisine_tags && r.cuisine_tags.trim() !== "") ? r.cuisine_tags : (tagsFor(raw).join(" ") || null);
    mapped.push({ id: r.id, raw, cuisine: r.cuisine, canonical, tags });
  } else {
    unmapped.push(r);
  }
  const key = raw ?? "(null)";
  if (!perRaw.has(key)) perRaw.set(key, { canonical, count: 0 });
  perRaw.get(key).count += 1;
}

console.log(`${APPLY ? "APPLY" : "Dry run"} - ${rows.length} rows with cuisine IS NULL OR ''\n`);

const table = [...perRaw.entries()]
  .map(([raw, { canonical, count }]) => ({ cuisine_raw: raw, canonical: canonical ?? "(unmapped)", rows: count }))
  .sort((a, b) => b.rows - a.rows);
console.table(table);

const backlog = rows.filter((r) => !r.listed && r.hold_reason === null);
const backlogMapped = mapped.filter((m) => {
  const r = rows.find((row) => row.id === m.id);
  return !r.listed && r.hold_reason === null;
});
console.log(
  `\n${mapped.length} of ${rows.length} rows map cleanly; ${unmapped.length} do not (raw label is a ` +
    `known non-answer like "Restaurant"/"food", or carries no cuisine_raw at all).`,
);
console.log(
  `Unpublished backlog (not listed, no hold): ${backlog.length} rows, ${backlogMapped.length} of which would map.`,
);

if (!APPLY) {
  console.log("\nDry run - nothing written. Add --apply to write.");
  process.exit(0);
}

mkdirSync(SNAP_DIR, { recursive: true });
const snapPath = `${SNAP_DIR}/backfill-cuisine-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(
  snapPath,
  JSON.stringify(mapped.map(({ id, cuisine, raw }) => ({ id, cuisine, cuisine_raw: raw }))),
);
console.log(`\nsnapshot: ${snapPath}`);

let written = 0;
for (const m of mapped) {
  const res = await sql`
    UPDATE restaurants
       SET cuisine = ${m.canonical}, cuisine_tags = ${m.tags}
     WHERE id = ${m.id} AND (cuisine IS NULL OR cuisine = '')
     RETURNING id`;
  written += res.length;
}
console.log(`\nwrote cuisine for ${written} rows.`);
