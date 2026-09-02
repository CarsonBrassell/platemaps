/**
 * Collapses the `cuisine` column onto the vocabulary in src/data/cuisines.ts.
 *
 *   node --env-file=.env.local scripts/normalize-cuisines.mjs --dry
 *   node --env-file=.env.local scripts/normalize-cuisines.mjs
 *
 * The column held 162 distinct values across 4,792 listed restaurants — three
 * source vocabularies stacked on top of each other, 79 of them describing two
 * restaurants or fewer. `import-osm.mjs` now maps tags on the way in, so new
 * rows arrive canonical; this is the one-time pass over everything already
 * there.
 *
 * **Re-runnable, and that is the point.** It reads `cuisine_raw` — claiming it
 * from `cuisine` the first time through — so the mapping is always applied to
 * the original label rather than to the result of the last run. Revising the
 * vocabulary is therefore an edit and a re-run, not a re-import of the city.
 * Running it twice with no edits in between changes nothing.
 *
 * Nothing is deleted. A label that maps to no cuisine becomes a null cuisine
 * and keeps its raw value and its search tags, so the restaurant stays
 * findable by everything it was findable by before — it just stops being its
 * own one-row filter option.
 */

import { sql } from "./sql-client.mjs";
import { canonicalCuisine, isUnsetCuisine, tagsFor } from "../src/data/cuisines.ts";

const DRY_RUN = process.argv.includes("--dry");

/* Claim the original label before anything overwrites it. Only ever fills a
   null, so a second run reads the same values the first one did rather than
   re-capturing an already-collapsed cuisine as if it were the source. */
if (!DRY_RUN) {
  await sql`UPDATE restaurants SET cuisine_raw = cuisine WHERE cuisine_raw IS NULL`;
}

const rows = await sql`
  SELECT id, cuisine, cuisine_raw, listed FROM restaurants
`;

const updates = [];
const unmapped = new Map();
const buckets = new Map();
let cleared = 0;

for (const row of rows) {
  // Mid-dry-run the claim above has not happened, so fall back to the live
  // column — otherwise --dry would report the whole table as unmapped.
  const raw = row.cuisine_raw ?? row.cuisine;
  const cuisine = canonicalCuisine(raw);
  const tags = tagsFor(raw).join(" ") || null;

  if (row.listed) {
    if (cuisine) buckets.set(cuisine, (buckets.get(cuisine) ?? 0) + 1);
    else if (raw && !isUnsetCuisine(raw)) {
      unmapped.set(raw, (unmapped.get(raw) ?? 0) + 1);
    } else cleared += 1;
  }

  updates.push({ id: row.id, raw, cuisine, tags });
}

const total = rows.length;
const listed = rows.filter((r) => r.listed).length;
const distinctBefore = new Set(
  rows.filter((r) => r.listed).map((r) => r.cuisine_raw ?? r.cuisine),
).size;

console.log(`${total} restaurants (${listed} listed).`);
console.log(`  ${distinctBefore} distinct labels -> ${buckets.size} cuisines`);
console.log(`  ${cleared} listed rows with no cuisine (were "Restaurant" and friends)`);

if (unmapped.size > 0) {
  // Loud rather than a footnote: an unmapped label is a restaurant quietly
  // losing its filter, and the fix is one line in src/data/cuisines.ts.
  console.log(`\n  ${unmapped.size} UNMAPPED labels — these become null:`);
  for (const [label, n] of [...unmapped].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${label}`);
  }
}

console.log(`\n  cuisines, by size:`);
for (const [c, n] of [...buckets].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${c}`);
}

if (DRY_RUN) {
  console.log("\nDry run - nothing written.");
  process.exit(0);
}

let written = 0;
for (const u of updates) {
  await sql`
    UPDATE restaurants
       SET cuisine = ${u.cuisine},
           cuisine_raw = ${u.raw},
           cuisine_tags = ${u.tags}
     WHERE id = ${u.id}`;
  written += 1;
  if (written % 200 === 0) process.stdout.write(`\r  writing ${written}/${updates.length}`);
}

process.stdout.write(`\r  wrote ${written} rows.            \n`);

const [after] = await sql`
  SELECT count(DISTINCT cuisine)::int AS cuisines,
         count(*) FILTER (WHERE cuisine IS NULL)::int AS no_cuisine,
         count(*) FILTER (WHERE cuisine_tags IS NOT NULL)::int AS tagged
    FROM restaurants WHERE listed
`;
console.log(
  `Done. ${after.cuisines} cuisines across the listed corpus, ` +
    `${after.no_cuisine} without one, ${after.tagged} carrying search tags.`,
);
