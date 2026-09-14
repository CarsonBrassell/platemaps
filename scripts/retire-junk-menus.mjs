/**
 * Removes menus that are not menus, after exporting them.
 *
 *   node --env-file=.env.local scripts/retire-junk-menus.mjs --dry
 *   node --env-file=.env.local scripts/retire-junk-menus.mjs
 *
 * Finds every restaurant whose loaded dishes fail `junkReason` in
 * scripts/junk-menu.mjs - a Wix theme palette (color_11 $52329.00), a DoorDash
 * feature-flag table (enable_dish_leaderboard $3.00) - or whose ledger row cites
 * an infrastructure host. On 2026-09-13 that was 142 restaurants, all live,
 * all `high` confidence, all wrong on every line.
 *
 * Unlike retire-untrusted-menus.mjs this does NOT leave a `not_found` row: the
 * restaurant has a menu somewhere, the browser tier just read the wrong
 * response. Deleting the ledger row too puts it back in the queue (db-stats:
 * queue = live, no dishes, no menu_lookups row), where the fixed browser tier
 * will skip the palette and read the next payload down.
 *
 * Export first, delete second, `source = 'menu'` on both, same as the sibling
 * script and for the same reason: the export is the restore path.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { hostOf, junkReason } from "./junk-menu.mjs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");

/* Pre-filter in SQL so the full dish table never crosses the wire: a menu that
 * fails junkReason has at least one identifier name, big price or letterless
 * name, so a restaurant with none of those cannot fail it. */
const suspects = await sql`
  SELECT DISTINCT d.restaurant_id
    FROM dishes d
    LEFT JOIN menu_lookups m ON m.restaurant_id = d.restaurant_id
   WHERE d.source = 'menu'
     AND (d.name ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)+$'
          OR d.name !~ '[[:alpha:]]'
          OR d.price ~ '^[$][0-9]{4,}'
          OR m.source_url ~* '(parastorage\.com|dynamic-values-edge-service\.doordash\.com|gstatic\.com|fonts\.googleapis\.com)')
`;
const suspectIds = suspects.map((r) => r.restaurant_id);

const rows = await sql`
  SELECT d.restaurant_id, r.name AS restaurant_name, d.id, d.name, d.description,
         d.price, d.section, d.sort_order, d.source, m.source_url
    FROM dishes d
    JOIN restaurants r ON r.id = d.restaurant_id
    LEFT JOIN menu_lookups m ON m.restaurant_id = d.restaurant_id
   WHERE d.restaurant_id = ANY(${suspectIds}) AND d.source = 'menu'
   ORDER BY d.restaurant_id, d.sort_order
`;

const byRestaurant = new Map();
for (const d of rows) {
  if (!byRestaurant.has(d.restaurant_id)) byRestaurant.set(d.restaurant_id, []);
  byRestaurant.get(d.restaurant_id).push(d);
}

const retire = [];
for (const [id, dishes] of byRestaurant) {
  const reason = junkReason(dishes, hostOf(dishes[0].source_url ?? ""));
  if (reason) retire.push({ id, dishes, reason });
}

console.log(`${suspectIds.length} suspects, ${retire.length} retiring:\n`);
for (const { id, dishes, reason } of retire) {
  console.log(`  ${id}\t${dishes[0].restaurant_name}\t${dishes.length} dishes\t${reason}`);
}

const ids = retire.map((r) => r.id);
const all = retire.flatMap((r) => r.dishes);

/* Not `process.exit(0)` - see retire-untrusted-menus.mjs. */
if (DRY_RUN || !ids.length) {
  console.log(`\n${DRY_RUN ? "Dry run - " : ""}nothing exported, nothing deleted.`);
} else {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `menus/retired/${stamp}-junk.json`;
  await mkdir("menus/retired", { recursive: true });
  await writeFile(path, JSON.stringify(all, null, 2), "utf8");
  console.log(`\nExported ${all.length} dishes to ${path}`);

  await sql`DELETE FROM dishes WHERE restaurant_id = ANY(${ids}) AND source = 'menu'`;
  await sql`DELETE FROM menu_lookups WHERE restaurant_id = ANY(${ids})`;

  const [{ n }] = await sql`SELECT count(DISTINCT restaurant_id)::int AS n FROM dishes`;
  console.log(`Deleted dishes and ledger rows for ${ids.length} restaurants; they are back in the queue.`);
  console.log(`${n} restaurants now carry a menu. Restore from ${path} if this was the wrong call.`);
}
