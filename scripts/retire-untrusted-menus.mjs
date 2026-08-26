/**
 * Removes menus we can no longer stand behind, after exporting them.
 *
 *   node --env-file=.env.local scripts/retire-untrusted-menus.mjs --dry
 *   node --env-file=.env.local scripts/retire-untrusted-menus.mjs
 *
 * ## Two kinds of menu get retired here
 *
 * **Yelp-era captures whose re-extraction failed.** Forty-eight restaurants
 * whose menus came off Yelp's menu tab were re-extracted from better sources.
 * Thirty succeeded. The rest came back not-found - no current pricing exists
 * anywhere reachable - and their original Yelp dishes stayed live underneath
 * the failed lookup. Those prices are undated and unverifiable: A-Chau's list
 * $3.25 sandwiches where independent write-ups put the real price near $7, and
 * The Huddle's trace to the same ancient SinglePlatform feed. Seven of them
 * hold exactly 45 dishes, which is the Yelp menu-tab cap rather than the length
 * of the menu.
 *
 * **Dish lists with no prices.** McDonald's El Cajon and Starbucks La Mesa each
 * carry 100 rows where every price is an em-dash. They render as a menu and
 * count as a menu and answer nothing. See "A dish list without prices is not a
 * menu" in probe/FINDINGS.md.
 *
 * ## Why delete rather than leave them
 *
 * This site's whole promise is the price. A menu that is confidently wrong
 * costs a visitor a wasted trip, which is worse than a page that says nothing -
 * and unlike a missing menu, a wrong one gives nobody a reason to go looking
 * for the right one. The `not_found` row stays either way, so these restaurants
 * do not re-enter the extraction queue and burn agent time again.
 *
 * ## Nothing here is unrecoverable
 *
 * Every dish is written to `menus/retired/<timestamp>.json` before the delete,
 * with its restaurant id, name, and full row. Restoring is a matter of loading
 * that file back through the ordinary dish insert path.
 */

import { neon } from "@neondatabase/serverless";
import { mkdir, writeFile } from "node:fs/promises";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");

/* Restaurants whose entire menu is unpriced. Named rather than detected: a
 * price of "-" is also how a single side dish with no listed price gets
 * recorded, and one such dish should not retire a real menu. */
const UNPRICED_MENUS = ["1653", "1654"];

const yelpEra = await sql`
  SELECT d.restaurant_id, r.name AS restaurant_name, d.name, d.description,
         d.price, d.section, d.sort_order
  FROM dishes d
  JOIN restaurants r ON r.id = d.restaurant_id
  JOIN menu_lookups m ON m.restaurant_id = d.restaurant_id
  WHERE m.status = 'not_found'
  ORDER BY d.restaurant_id, d.sort_order
`;

const unpriced = await sql`
  SELECT d.restaurant_id, r.name AS restaurant_name, d.name, d.description,
         d.price, d.section, d.sort_order
  FROM dishes d
  JOIN restaurants r ON r.id = d.restaurant_id
  WHERE d.restaurant_id = ANY(${UNPRICED_MENUS})
  ORDER BY d.restaurant_id, d.sort_order
`;

const all = [...yelpEra, ...unpriced];
const ids = [...new Set(all.map((d) => d.restaurant_id))];

const byRestaurant = new Map();
for (const d of all) {
  if (!byRestaurant.has(d.restaurant_id)) byRestaurant.set(d.restaurant_id, []);
  byRestaurant.get(d.restaurant_id).push(d);
}

console.log(`${ids.length} restaurants, ${all.length} dishes:\n`);
for (const [id, rows] of byRestaurant) {
  console.log(`  ${id}\t${rows[0].restaurant_name}\t${rows.length} dishes`);
}

/* Deliberately not `process.exit(0)`: calling it here while the neon HTTP
 * driver still holds a handle trips a libuv assertion on Windows and exits 127,
 * which looks exactly like a real failure. Falling off the end of the module
 * lets the driver close cleanly. */
if (!DRY_RUN) {
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const path = `menus/retired/${stamp}.json`;
await mkdir("menus/retired", { recursive: true });
await writeFile(path, JSON.stringify(all, null, 2), "utf8");
console.log(`\nExported ${all.length} dishes to ${path}`);

await sql`DELETE FROM dishes WHERE restaurant_id = ANY(${ids})`;

/* The two unpriced chains need a ledger row of their own - the Yelp-era
 * restaurants already have one, which is how they were found. Without this they
 * would re-enter the queue the moment their dishes disappeared. */
for (const id of UNPRICED_MENUS) {
  await sql`
    INSERT INTO menu_lookups (restaurant_id, status, source_url, confidence, dish_count, attempted_at)
    VALUES (${id}, 'not_found', null, 'unpriced-chain', 0, now())
    ON CONFLICT (restaurant_id) DO UPDATE SET
      status = 'not_found', confidence = 'unpriced-chain', dish_count = 0
  `;
}

const [{ n: withMenus }] = await sql`SELECT count(DISTINCT restaurant_id)::int AS n FROM dishes`;
console.log(`Deleted. ${withMenus} restaurants now carry a menu.`);
console.log(`Restore from ${path} if this turns out to be the wrong call.`);
} else {
  console.log(`\nDry run - nothing exported, nothing deleted.`);
}
