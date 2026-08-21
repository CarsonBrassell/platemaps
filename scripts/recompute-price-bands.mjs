/**
 * Recomputes `restaurants.price_band` from the dishes in Postgres.
 *
 *   node --env-file=.env.local scripts/recompute-price-bands.mjs           # report only
 *   node --env-file=.env.local scripts/recompute-price-bands.mjs --apply   # write
 *
 * ## Why this exists
 *
 * `price_band` is a stored column, read straight out of the row by
 * `getRestaurants` — it used to be derived per request and that meant scanning
 * the dish table on every read (see the comment at src/lib/db.ts:1697). The
 * only thing that writes it is `scripts/import-restaurants.mjs`, which derives
 * it from the `src/data/*.ts` seed files.
 *
 * Menus no longer arrive that way. `load-menus.mjs` writes dishes straight to
 * Postgres and never touches the band, so after loading 24,809 dishes across
 * twenty batches, 663 of 682 restaurants still had a null band — 652 of them
 * with a full menu sitting right there. A null band is excluded by every price
 * filter, so Discover's price facet was quietly answering for 19 restaurants
 * out of 682.
 *
 * Re-running the import would not fix it: that reads the seed files, which
 * these menus were never written back to. Hence this, which reads what the app
 * actually serves.
 *
 * `bandFor` is imported rather than reimplemented — it is the same function
 * the import calls, and a second copy of the banding thresholds is exactly how
 * the column and the filter hints drift apart.
 */

import { neon } from "@neondatabase/serverless";
import { bandFor } from "../src/data/priceBands.ts";

const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Pass --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const restaurants = await sql`SELECT id, name, cuisine, price_band FROM restaurants ORDER BY (id)::int`;
/* One pass over the dish table rather than a query per restaurant: 24k rows is
 * nothing to hold, and 682 round trips to Neon is a minute of latency.
 *
 * `name` is selected because banding reads it: "Grande Party Pack" and "$89 for
 * two" are priced for a table, and a menu saying "per person" is already
 * quoting the answer. Neither is visible in `section`. */
const dishes = await sql`SELECT restaurant_id, name, price, section FROM dishes`;

const byRestaurant = new Map();
for (const d of dishes) {
  if (!byRestaurant.has(d.restaurant_id)) byRestaurant.set(d.restaurant_id, []);
  byRestaurant
    .get(d.restaurant_id)
    .push({ name: d.name ?? "", price: d.price ?? "", section: d.section ?? "" });
}

const changes = [];
const counts = { $: 0, $$: 0, $$$: 0, $$$$: 0, null: 0 };

for (const r of restaurants) {
  const band = bandFor(byRestaurant.get(r.id) ?? [], r.cuisine);
  counts[band ?? "null"] += 1;
  if (band !== r.price_band) changes.push({ id: r.id, name: r.name, from: r.price_band, to: band });
}

console.log(`${restaurants.length} restaurants, ${dishes.length} dishes.\n`);
console.log("Bands after recompute:");
for (const [band, n] of Object.entries(counts)) {
  console.log(`  ${band === "null" ? "(none — no priced menu)" : band.padEnd(4)}  ${n}`);
}

const gained = changes.filter((c) => c.from === null && c.to !== null);
const lost = changes.filter((c) => c.from !== null && c.to === null);
const moved = changes.filter((c) => c.from !== null && c.to !== null);

console.log(`\n${changes.length} would change: ${gained.length} gain a band, ${moved.length} move, ${lost.length} lose one.`);
/* Losing a band is the only surprising direction — it means a restaurant that
 * used to price now has no parseable prices, which is worth seeing by name. */
for (const c of lost) console.log(`  LOST  ${c.id.padStart(3)} ${c.name} — was ${c.from}`);
for (const c of moved) console.log(`  MOVED ${c.id.padStart(3)} ${c.name} — ${c.from} → ${c.to}`);

if (!APPLY) {
  console.log("\nReport only — nothing written. Re-run with --apply.");
  process.exit(0);
}

for (const c of changes) {
  await sql`UPDATE restaurants SET price_band = ${c.to} WHERE id = ${c.id}`;
}
console.log(`\nUpdated ${changes.length} rows.`);
