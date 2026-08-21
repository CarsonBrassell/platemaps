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
 * Idempotent, and safe to re-run after either fetch script. Restaurants upsert
 * by id: a place already in the table keeps its row and gets the new column
 * values.
 *
 * ## This does NOT write dishes any more, and must not be made to by default
 *
 * It used to, and doing so destroyed real menus.
 *
 * `src/data/dishes.ts` says so in its own header: its contents are "placeholder
 * dishes, descriptions and prices, NOT extracted from any restaurant's real
 * menu". It carries 125 invented dishes across 19 restaurants. The database
 * meanwhile holds ~24,800 dishes read off actual menu pages, written by
 * `scripts/load-menus.mjs` from the reviewed JSON in `menus/`, which is the
 * real menu pipeline and does not pass through this file at all.
 *
 * Because `replaceDishes` deleted a restaurant's dishes as a set before
 * reinserting, running this script replaced real extracted menus with the
 * placeholders — measured at 665 dishes lost across those 19 restaurants, e.g.
 * restaurant 1 going from 42 real dishes to 6 invented ones. A fabricated menu
 * on a live restaurant page is the precise failure PRODUCT.md is written
 * against, and it arrived by running the documented refresh command.
 *
 * So dishes are opt-in now via `--with-dishes`, which still refuses to shrink a
 * menu without `--force`. There is no good reason to pass either: to load menus,
 * use `npm run menus:load`.
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
import { sourceKeyFor } from "../src/lib/sourceKey.ts";

const DRY_RUN = process.argv.includes("--dry");
/** Opt in to writing `src/data/dishes.ts` into the table — see the header. */
const WITH_DISHES = process.argv.includes("--with-dishes");
/** Allow `--with-dishes` to reduce a restaurant's dish count. */
const FORCE = process.argv.includes("--force");

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
  "id", "source_key", "name", "cuisine", "neighborhood", "distance", "walk_time",
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
    // Derived rather than read straight off the row, so a seed row that lost
    // its `sourceKey` still lands in the table with the key its `yelpUrl`
    // implies instead of a NULL that the next merge can't match on.
    r.id, sourceKeyFor(r), r.name, r.cuisine, r.neighborhood, r.distance, r.walkTime,
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

/**
 * What `--with-dishes` would cost, per restaurant, before anything is deleted.
 *
 * Counts what is in the table against what the seed file would put there. A
 * restaurant losing dishes is the signal that the table holds a real extracted
 * menu and the file holds placeholders — the exact direction this must not
 * silently go.
 */
async function dishDelta(byRestaurant) {
  const ids = Object.keys(byRestaurant);
  if (ids.length === 0) return { shrinking: [], lost: 0 };

  const rows = await sql.query(
    `SELECT restaurant_id, count(*)::int AS n FROM dishes
      WHERE restaurant_id = ANY($1) GROUP BY restaurant_id`,
    [ids],
  );
  const inTable = new Map(rows.map((r) => [r.restaurant_id, r.n]));

  const shrinking = [];
  let lost = 0;
  for (const id of ids) {
    const before = inTable.get(id) ?? 0;
    const after = byRestaurant[id].length;
    if (before > after) {
      shrinking.push({ id, before, after });
      lost += before - after;
    }
  }
  return { shrinking, lost };
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

// Reported whether or not dishes are being written, so the number is visible
// before someone reaches for --with-dishes rather than after.
const { shrinking, lost } = WITH_DISHES
  ? await dishDelta(dishesByRestaurant)
  : { shrinking: [], lost: 0 };

if (WITH_DISHES && lost > 0) {
  console.error(
    `\n--with-dishes would DELETE ${lost} dishes that src/data/dishes.ts does ` +
      `not replace, across ${shrinking.length} restaurant(s):`,
  );
  for (const s of shrinking.slice(0, 10)) {
    console.error(`  ${s.id}: ${s.before} in the table -> ${s.after} in the file`);
  }
  if (shrinking.length > 10) console.error(`  ...and ${shrinking.length - 10} more`);
  console.error(
    `\ndishes.ts holds placeholder menus by its own admission; the table holds ` +
      `menus extracted from real pages. Losing the second to the first is not a ` +
      `refresh. Use \`npm run menus:load\` instead, or --force if you are certain.`,
  );
  if (!FORCE) process.exit(1);
  console.error("--force given; continuing anyway.\n");
}

if (DRY_RUN) {
  console.log(
    `Dry run — nothing written.\n` +
      `Would upsert ${restaurants.length} restaurants.\n` +
      (WITH_DISHES
        ? `Would replace ${dishCount} dishes across ${menuCount} menus` +
          (lost > 0 ? ` (net loss ${lost}).` : ".")
        : `Dishes untouched (pass --with-dishes to write the ${dishCount} ` +
          `placeholder dishes in dishes.ts — see the header first).`),
  );
  process.exit(0);
}

await upsertRestaurants(restaurants);
console.log(`Upserted ${restaurants.length} restaurants.`);

if (WITH_DISHES) {
  const written = await replaceDishes(dishesByRestaurant);
  console.log(`Wrote ${written} dishes across ${menuCount} menus.`);
} else {
  console.log(`Dishes untouched — menus come from \`npm run menus:load\`.`);
}

const [{ count: totalRestaurants }] = await sql`SELECT count(*)::int FROM restaurants`;
const [{ count: totalDishes }] = await sql`SELECT count(*)::int FROM dishes`;
console.log(`\nTable now holds ${totalRestaurants} restaurants and ${totalDishes} dishes.`);
