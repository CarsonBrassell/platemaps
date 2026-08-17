/**
 * Loads the generated restaurant and menu files into Postgres.
 *
 *   node --env-file=.env.local scripts/import-restaurants.mjs --dry
 *   node --env-file=.env.local scripts/import-restaurants.mjs
 *
 * src/data/restaurants.ts and src/data/dishes.ts used to be imported straight
 * into React components. They are seed input now: `scripts/fetch-restaurants.mjs`
 * and `scripts/fetch-menus.mjs` still write them, this script loads them, and
 * the app reads Postgres. Nothing under src/ imports either array any more.
 *
 * Idempotent, and safe to re-run after either fetch script:
 *
 *   - Restaurants upsert by id. A place already in the table keeps its row and
 *     gets the new column values.
 *   - A restaurant's dishes are replaced as a set, not upserted one by one, so
 *     a dish dropped from a re-extracted menu actually leaves the table.
 *     Restaurants absent from dishes.ts are left alone rather than emptied —
 *     "no menu in this file" and "no menu anywhere" are different claims.
 *
 * Nothing here deletes a restaurant. A place that disappears from the seed
 * file stays in the table, because posts, aspect votes and saves reference it
 * by id and orphaning those is not something a data refresh should do quietly.
 */

import { neon } from "@neondatabase/serverless";
import { restaurants } from "../src/data/restaurants.ts";
import { dishesByRestaurant } from "../src/data/dishes.ts";
import { regionForCoordinate, regionNames } from "../src/data/regions.ts";
import { bandFor } from "../src/data/priceBands.ts";

const DRY_RUN = process.argv.includes("--dry");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Pass --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/* --- Validation --------------------------------------------------------- */

/**
 * Every restaurant has to land in one of the twelve map zones.
 *
 * This ran at the bottom of src/data/regions.ts until restaurants moved into
 * the database. The nearest-neighbour rule in `regionForCoordinate` cannot
 * return nothing for a real coordinate, so a failure here means a bad
 * coordinate — a transposed lat/lng, a zero, a restaurant in another county —
 * which is worth stopping an import over.
 */
function validateZones(rows) {
  const counts = new Map(regionNames.map((name) => [name, 0]));
  const unassigned = [];

  for (const r of rows) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) {
      unassigned.push(`${r.name} (no coordinates)`);
      continue;
    }
    const zone = regionForCoordinate(r.lat, r.lng);
    if (!zone || !counts.has(zone)) {
      unassigned.push(r.name);
      continue;
    }
    counts.set(zone, counts.get(zone) + 1);
  }

  if (unassigned.length > 0) {
    throw new Error(
      `Zone assignment failed for ${unassigned.length} restaurant(s): ${unassigned.join(", ")}`,
    );
  }

  console.log(
    `Zones — ${regionNames.map((n) => `${n}: ${counts.get(n)}`).join(", ")}\n`,
  );
}

/* --- Writing ------------------------------------------------------------ */

const RESTAURANT_COLUMNS = [
  "id", "name", "cuisine", "neighborhood", "distance", "walk_time",
  "closing_time", "lat", "lng", "status", "status_label", "rating",
  "review_count", "yelp_rating", "yelp_review_count", "google_rating",
  "google_review_count", "trending", "photo", "photo_alt", "yelp_url",
  "sort_order", "price_band",
];

/**
 * `order` is the restaurant's index in the seed array, carried across as a
 * column so the grid keeps showing the city the way the fetch script laid it
 * out — region by region rather than clustered downtown. Ordering by `id`
 * instead would sort "10" ahead of "2".
 */
function restaurantValues(r, order) {
  return [
    r.id, r.name, r.cuisine, r.neighborhood, r.distance, r.walkTime,
    r.closingTime, r.lat, r.lng, r.status, r.statusLabel, r.rating,
    r.reviewCount, r.yelpRating ?? null, r.yelpReviewCount ?? null,
    r.googleRating ?? null, r.googleReviewCount ?? null, r.trending ?? false,
    r.photo ?? null, r.photoAlt ?? null, r.yelpUrl ?? null,
    order,
    // Banded here, from the same menu being written below, using the same
    // function `recompute-price-bands.mjs` calls. Cuisine is passed because the
    // band estimates spend per person, and how many dishes that takes depends
    // on the format — three tacos, one entrée. Null when there is no menu, too
    // little of one, or a menu whose format is genuinely ambiguous.
    bandFor(dishesByRestaurant[r.id] ?? [], r.cuisine),
  ];
}

/**
 * One multi-row INSERT per chunk rather than a query per restaurant.
 *
 * Over Neon's HTTP driver each statement is a round trip, so the per-row
 * version takes about as many seconds as there are restaurants. That is merely
 * slow at 36 and unusable at the scale this migration exists to allow.
 */
function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function upsertRestaurants(rows) {
  const updates = RESTAURANT_COLUMNS.filter((c) => c !== "id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  // Indexed before chunking, so `sort_order` is the position in the whole file
  // rather than the position within a batch.
  const ordered = rows.map((r, order) => ({ r, order }));

  for (const batch of chunk(ordered, 100)) {
    const values = [];
    const tuples = batch.map(({ r, order }, i) => {
      const base = i * RESTAURANT_COLUMNS.length;
      values.push(...restaurantValues(r, order));
      return `(${RESTAURANT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(", ")})`;
    });

    await sql.query(
      `INSERT INTO restaurants (${RESTAURANT_COLUMNS.join(", ")})
       VALUES ${tuples.join(", ")}
       ON CONFLICT (id) DO UPDATE SET ${updates}`,
      values,
    );
  }
}

async function replaceDishes(byRestaurant) {
  const ids = Object.keys(byRestaurant);
  if (ids.length === 0) return 0;

  // Scoped to the restaurants this file actually carries a menu for — see the
  // header on why the others are left alone.
  await sql.query(`DELETE FROM dishes WHERE restaurant_id = ANY($1)`, [ids]);

  const rows = [];
  for (const [restaurantId, dishes] of Object.entries(byRestaurant)) {
    dishes.forEach((d, order) => {
      rows.push([
        d.id, restaurantId, d.name, d.description ?? null, d.price,
        d.section, d.yesVotes ?? 0, d.noVotes ?? 0, order,
      ]);
    });
  }

  for (const batch of chunk(rows, 200)) {
    const values = [];
    const tuples = batch.map((row, i) => {
      const base = i * 9;
      values.push(...row);
      return `(${row.map((_, j) => `$${base + j + 1}`).join(", ")})`;
    });

    await sql.query(
      `INSERT INTO dishes
         (id, restaurant_id, name, description, price, section, yes_votes, no_votes, sort_order)
       VALUES ${tuples.join(", ")}`,
      values,
    );
  }

  return rows.length;
}

/* --- Run ---------------------------------------------------------------- */

validateZones(restaurants);

// Menus for restaurants that aren't in the file would violate the dishes FK,
// and silently mean the two generated files have drifted apart.
const known = new Set(restaurants.map((r) => r.id));
const orphaned = Object.keys(dishesByRestaurant).filter((id) => !known.has(id));
if (orphaned.length > 0) {
  console.error(
    `dishes.ts has menus for ${orphaned.length} restaurant(s) absent from ` +
      `restaurants.ts: ${orphaned.join(", ")}\n` +
      `Re-run scripts/fetch-menus.mjs so the two files agree.`,
  );
  process.exit(1);
}

const menuCount = Object.keys(dishesByRestaurant).length;
const dishCount = Object.values(dishesByRestaurant).reduce((n, d) => n + d.length, 0);

if (DRY_RUN) {
  console.log(
    `Dry run — nothing written.\n` +
      `Would upsert ${restaurants.length} restaurants and replace ` +
      `${dishCount} dishes across ${menuCount} menus.`,
  );
  process.exit(0);
}

await upsertRestaurants(restaurants);
console.log(`Upserted ${restaurants.length} restaurants.`);

const written = await replaceDishes(dishesByRestaurant);
console.log(`Wrote ${written} dishes across ${menuCount} menus.`);

const [{ count: totalRestaurants }] = await sql`SELECT count(*)::int FROM restaurants`;
const [{ count: totalDishes }] = await sql`SELECT count(*)::int FROM dishes`;
console.log(`\nTable now holds ${totalRestaurants} restaurants and ${totalDishes} dishes.`);
