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
 *
 * **Second pass: brand union (Calvin, 2026-09-13).** One brand's branches
 * often disagree on cuisine — nine Rigoberto's Taco Shops split between
 * "Mexican" and "Fast Food", Swami's spread across American, Breakfast &
 * Brunch and Coffee & Tea. `cuisine` stays single-valued (it drives the
 * filter rail, and a brand doesn't get to occupy two facet buckets), but
 * `cuisine_tags` is free text, so a branch searchable only by its own
 * cuisine was losing the other branches' — "if it's ambiguous, label them as
 * both." After the per-row tags above are computed, listed un-held rows are
 * grouped by brand key (`brandKey`, the same branch-grouping logic
 * `getSiblingLocations` uses in `lib/db.ts`); a brand with two or more
 * distinct cuisines among its branches gets the union of those cuisine names
 * appended to every branch's tags, including a branch with no cuisine of its
 * own. This runs after the per-row pass and writes into the same `tags`
 * field, so it survives a re-run rather than being wiped by the
 * regenerate-from-`cuisine_raw` step above.
 */

import { sql } from "./sql-client.mjs";
import { CUISINES, canonicalCuisine, isUnsetCuisine, tagsFor } from "../src/data/cuisines.ts";
import { brandKey } from "../src/lib/brandName.ts";

const DRY_RUN = process.argv.includes("--dry");

/* Claim the original label before anything overwrites it. Only ever fills a
   null, so a second run reads the same values the first one did rather than
   re-capturing an already-collapsed cuisine as if it were the source. */
if (!DRY_RUN) {
  await sql`UPDATE restaurants SET cuisine_raw = cuisine WHERE cuisine_raw IS NULL`;
}

const rows = await sql`
  SELECT id, name, neighborhood, city, cuisine, cuisine_raw, listed, hold_reason FROM restaurants
`;

const updates = [];
const unmapped = new Map();
const buckets = new Map();
let cleared = 0;

for (const row of rows) {
  // Mid-dry-run the claim above has not happened, so fall back to the live
  // column — otherwise --dry would report the whole table as unmapped.
  const raw = row.cuisine_raw ?? row.cuisine;
  // Keep a cuisine that infer-cuisine.mjs derived from the menu when the raw
  // label itself maps to nothing ("Restaurant", null). Re-deriving from raw
  // would null it back out.
  const mapped = canonicalCuisine(raw);
  const cuisine = mapped ?? (row.cuisine && CUISINES.includes(row.cuisine) ? row.cuisine : null);
  const tagList = tagsFor(raw);

  if (row.listed) {
    if (cuisine) buckets.set(cuisine, (buckets.get(cuisine) ?? 0) + 1);
    else if (raw && !isUnsetCuisine(raw)) {
      unmapped.set(raw, (unmapped.get(raw) ?? 0) + 1);
    } else cleared += 1;
  }

  updates.push({ id: row.id, raw, cuisine, tagList });
}

/* Second pass: brand union. See the header comment for why. `updates[i]`
   corresponds to `rows[i]` — one push per row, in order, above — so the
   index grouped here is the index mutated below. */
const brandGroups = new Map();
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (!row.listed || row.hold_reason) continue;
  const key = brandKey(row.name, [row.neighborhood, row.city]);
  // Same floor `getSiblingLocations` uses: a key this short is a generic
  // word, not a brand, and grouping on it would merge unrelated shops.
  if (key.length < 6) continue;
  if (!brandGroups.has(key)) brandGroups.set(key, []);
  brandGroups.get(key).push(i);
}

let brandsUnioned = 0;
let rowsGainedTags = 0;
const brandSamples = [];

for (const idxs of brandGroups.values()) {
  if (idxs.length < 2) continue;
  const cuisines = new Set();
  for (const i of idxs) {
    const c = updates[i].cuisine;
    if (c) cuisines.add(c);
  }
  if (cuisines.size < 2) continue;
  brandsUnioned += 1;

  for (const i of idxs) {
    const u = updates[i];
    // De-dup against whole tags, not the space-joined string: "Fast Food" is
    // one tag, and splitting it would let a second "Fast Food" slip in.
    const seenLower = new Set(u.tagList.map((t) => t.toLowerCase()));
    const additions = [...cuisines].filter((c) => !seenLower.has(c.toLowerCase()));
    if (additions.length === 0) continue;

    const oldTags = u.tagList.join(" ") || null;
    u.tagList = [...u.tagList, ...additions];
    rowsGainedTags += 1;
    if (DRY_RUN && brandSamples.length < 10) {
      brandSamples.push({
        name: rows[i].name,
        neighborhood: rows[i].neighborhood,
        cuisine: u.cuisine,
        oldTags,
        newTags: u.tagList.join(" "),
      });
    }
  }
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

console.log(`\n  brand union: ${brandsUnioned} brands, ${rowsGainedTags} rows gained tags`);

if (DRY_RUN && brandSamples.length > 0) {
  console.log(`\n  sample rows:`);
  for (const s of brandSamples) {
    console.log(
      `    ${s.name} (${s.neighborhood ?? "?"}) [${s.cuisine ?? "null"}]\n` +
        `      ${JSON.stringify(s.oldTags)} -> ${JSON.stringify(s.newTags)}`,
    );
  }
}

if (DRY_RUN) {
  console.log("\nDry run - nothing written.");
  process.exit(0);
}

/* One UPDATE per chunk via unnest rather than one per row: 14k single-row
   round-trips over Neon's HTTP driver took the better part of an hour and
   dropped the connection twice (2026-09-13). Only rows whose values would
   actually change are sent, so a re-run after a small vocabulary change is
   a handful of statements. */
for (const u of updates) u.tags = u.tagList.join(" ") || null;
const before = new Map(rows.map((r) => [r.id, r]));
const changed = updates.filter((u) => {
  const r = before.get(u.id);
  return r.cuisine !== u.cuisine || r.cuisine_raw !== u.raw || r.cuisine_tags !== u.tags;
});
const CHUNK = 500;
let written = 0;
for (let i = 0; i < changed.length; i += CHUNK) {
  const chunk = changed.slice(i, i + CHUNK);
  await sql`
    UPDATE restaurants AS r
       SET cuisine = v.cuisine,
           cuisine_raw = v.raw,
           cuisine_tags = v.tags
      FROM unnest(${chunk.map((u) => u.id)}::text[],
                  ${chunk.map((u) => u.cuisine)}::text[],
                  ${chunk.map((u) => u.raw)}::text[],
                  ${chunk.map((u) => u.tags)}::text[]) AS v(id, cuisine, raw, tags)
     WHERE r.id = v.id`;
  written += chunk.length;
  process.stdout.write(`  writing ${written}/${changed.length}`);
}

process.stdout.write(`  wrote ${written} rows (${updates.length - changed.length} unchanged).            
`);

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
