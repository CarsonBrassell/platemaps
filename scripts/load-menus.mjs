/**
 * Loads extracted menus from a JSON file into Postgres.
 *
 *   node --env-file=.env.local scripts/load-menus.mjs menus/batch-01.json --dry
 *   node --env-file=.env.local scripts/load-menus.mjs menus/batch-01.json
 *
 * The extraction step and the writing step are deliberately separate. Reading a
 * menu off a restaurant's own site is slow, fallible, and sometimes done by
 * hand; writing it into the database is fast and must be exactly right. Keeping
 * a reviewable JSON file between the two means a bad extraction is caught by
 * reading a file rather than by finding a wrong menu on the live site — and
 * that the same file can be re-loaded after a schema change without paying to
 * extract anything twice.
 *
 * Input is an array of:
 *
 *   {
 *     "restaurantId": "164",
 *     "name": "Phil's BBQ",          // checked against the database, not used
 *     "sourceUrl": "https://...",     // the page the menu was read from
 *     "confidence": "high",
 *     "dishes": [
 *       { "name": "...", "description": "...", "price": "$12.00", "section": "..." }
 *     ]
 *   }
 *
 * An entry with no dishes records a `not_found` attempt, which is worth writing
 * down: it is how a restaurant with no findable menu stops being retried.
 */

import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");
const path = args.find((a) => !a.startsWith("--"));

if (!path) {
  console.error("Usage: node --env-file=.env.local scripts/load-menus.mjs <file.json> [--dry]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const entries = JSON.parse(await readFile(path, "utf8"));

if (!Array.isArray(entries)) {
  console.error("Expected the file to hold an array of menus.");
  process.exit(1);
}

/*
 * Validate everything before writing anything.
 *
 * A half-applied batch is the worst outcome here: some restaurants updated,
 * some not, and no record of where it stopped. Checking the whole file first
 * means a typo in the last entry costs a re-run, not a reconciliation.
 */
const ids = entries.map((e) => e.restaurantId);
const known = new Map(
  (await sql`SELECT id, name FROM restaurants WHERE id = ANY(${ids})`).map((r) => [r.id, r.name]),
);

const problems = [];
for (const entry of entries) {
  const dbName = known.get(entry.restaurantId);
  if (!dbName) {
    problems.push(`${entry.restaurantId} (${entry.name}): no such restaurant`);
    continue;
  }
  // A name mismatch is the signature of the one error that matters — the right
  // menu attached to the wrong restaurant — so it stops the run rather than
  // warning. Compared loosely because punctuation drifts between sources.
  const loose = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (entry.name && loose(entry.name) !== loose(dbName)) {
    problems.push(`${entry.restaurantId}: file says "${entry.name}", database says "${dbName}"`);
  }
  for (const dish of entry.dishes ?? []) {
    if (!dish.name) problems.push(`${entry.restaurantId}: a dish has no name`);
  }
  /*
   * A photo URL reaches next/image, which fetches and optimises it server-side
   * (next.config.ts now allows any https host, because restaurant photos come
   * from thousands of them). That makes this field a server-side fetch, so it
   * is checked here rather than trusted: absolute, https, and nothing else.
   */
  if (entry.photo) {
    let ok = false;
    try {
      ok = new URL(entry.photo).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) problems.push(`${entry.restaurantId}: photo is not an absolute https URL — ${entry.photo}`);
  }
}

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) — nothing written:\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

let dishesWritten = 0;
let notFound = 0;

for (const entry of entries) {
  const dishes = entry.dishes ?? [];
  console.log(
    `  ${known.get(entry.restaurantId)} — ${dishes.length} dishes` +
      (dishes.length === 0 ? " (recording as not_found)" : ""),
  );

  if (DRY_RUN) {
    dishesWritten += dishes.length;
    if (dishes.length === 0) notFound += 1;
    continue;
  }

  if (dishes.length > 0) {
    // Replace rather than append: a menu is a snapshot of one page, and merging
    // two extractions of the same restaurant produces a menu that never existed.
    await sql`DELETE FROM dishes WHERE restaurant_id = ${entry.restaurantId}`;
    for (const [i, dish] of dishes.entries()) {
      await sql`
        INSERT INTO dishes (id, restaurant_id, name, description, price, section, yes_votes, no_votes, sort_order)
        VALUES (
          ${`${entry.restaurantId}-${i + 1}`},
          ${entry.restaurantId},
          ${dish.name},
          ${dish.description || null},
          ${dish.price || "—"},
          ${dish.section || ""},
          0, 0, ${i}
        )
      `;
    }
    dishesWritten += dishes.length;
  } else {
    notFound += 1;
  }

  /*
   * A photo the extractor found on the restaurant's own site, if we had none.
   *
   * Photos are the slowest thing in the pipeline: they come from Yelp, one call
   * each, against a free quota of 300 a day, and that queue is what decides when
   * the corpus finishes. But the menu extractor is already standing on the
   * restaurant's own website reading its menu, and the hero image is right
   * there — free, no quota, and the picture the restaurant chose of itself
   * rather than a stranger's photograph of a burrito.
   *
   * COALESCE, so this can only ever fill an empty slot. A Yelp photo already in
   * place is left alone rather than churned, and re-running a batch does not
   * flip a restaurant's image back and forth between two sources.
   *
   * `photoCreditFor` in src/lib/photoCredit.ts reads the host to decide whether
   * to print "Photo: Yelp", so nothing has to be stored to keep the credit
   * honest — a non-Yelp host simply gets no credit line.
   */
  if (entry.photo) {
    await sql`
      UPDATE restaurants
      SET photo = COALESCE(photo, ${entry.photo}),
          photo_alt = COALESCE(photo_alt, ${entry.photoAlt || null})
      WHERE id = ${entry.restaurantId}`;
  }

  // The ledger is upserted, unlike the on-demand path which refused to
  // overwrite: there, a second row meant someone had paid twice. Here a second
  // load is a deliberate re-extraction, and the newest attempt is the true one.
  await sql`
    INSERT INTO menu_lookups (restaurant_id, status, source_url, confidence, dish_count, attempted_at)
    VALUES (
      ${entry.restaurantId},
      ${dishes.length > 0 ? "found" : "not_found"},
      ${entry.sourceUrl || null},
      ${entry.confidence || null},
      ${dishes.length},
      now()
    )
    ON CONFLICT (restaurant_id) DO UPDATE SET
      status = EXCLUDED.status,
      source_url = EXCLUDED.source_url,
      confidence = EXCLUDED.confidence,
      dish_count = EXCLUDED.dish_count,
      attempted_at = EXCLUDED.attempted_at
  `;
}

const [{ n: withMenus }] = await sql`SELECT count(DISTINCT restaurant_id)::int AS n FROM dishes`;
const [{ n: total }] = await sql`SELECT count(*)::int AS n FROM restaurants`;

console.log(
  `\n${DRY_RUN ? "Dry run — nothing written. Would have loaded" : "Loaded"} ` +
    `${entries.length - notFound} menus (${dishesWritten} dishes)` +
    (notFound > 0 ? `, ${notFound} recorded as not found` : "") +
    `.\nCoverage: ${withMenus}/${total} restaurants have a menu.`,
);
