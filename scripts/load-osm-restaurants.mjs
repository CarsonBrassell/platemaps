/**
 * Appends the shortlisted OpenStreetMap restaurants to src/data/restaurants.ts.
 *
 *   node scripts/load-osm-restaurants.mjs --dry
 *   node scripts/load-osm-restaurants.mjs
 *   node scripts/load-osm-restaurants.mjs --from osm/shortlist-rated.json
 *
 * Reads `osm/shortlist.json` by default — the 309 chosen by neighborhood need
 * in select-osm-candidates.mjs — and adds each as a new row with a stable
 * `sourceKey`. Then `npm run restaurants:import` puts them in Postgres.
 *
 * ## These arrive invisible, and that is the point
 *
 * A row written here has no rating and no menu, because OpenStreetMap supplies
 * neither. It is therefore `listed = false` in the database (the column
 * defaults to false and this import never writes it), so nothing reaches
 * Discover, the facets or the map until `scripts/publish-restaurants.mjs`
 * confirms a sourced rating AND a real menu.
 *
 * That gate is what makes this order possible at all. Menu extraction is keyed
 * by restaurant id, so a restaurant has to exist before its menu can be found —
 * enrichment cannot precede the row. Loading them early and invisibly lets the
 * Google rating pass and the menu extraction run in parallel instead of one
 * after the other, with no window where a blank card is on the site.
 *
 * ## Appends, never re-serialises
 *
 * The existing 682 rows are left byte-for-byte alone. Two other scripts rewrite
 * this array from scratch and each has to be taught every field or it silently
 * drops the ones it does not know — that is exactly how `sourceKey` would have
 * been lost. Splicing new rows in before the closing bracket cannot lose a
 * field it has never heard of.
 *
 * Refuses to add a restaurant whose `sourceKey` is already present, so a
 * re-run is a no-op rather than a second copy.
 */

import { readFile, writeFile } from "node:fs/promises";
import { restaurants as existing } from "../src/data/restaurants.ts";
import { sourceKeyFor } from "../src/lib/sourceKey.ts";

const DATA_PATH = new URL("../src/data/restaurants.ts", import.meta.url);
const DRY_RUN = process.argv.includes("--dry");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const FROM = arg("from", "osm/shortlist.json");

/** Downtown reference point for the decorative "distance from you" figure. */
const ORIGIN = { lat: 32.7157, lng: -117.1611 };

function milesBetween(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const source = JSON.parse(await readFile(new URL(`../${FROM}`, import.meta.url), "utf8"));
const incoming = source.restaurants ?? [];

/* --- Identity ------------------------------------------------------------- */

const known = new Set();
for (const r of existing) {
  const key = sourceKeyFor(r);
  if (key) known.add(key);
}

const fresh = [];
const skipped = [];
const seenInBatch = new Set();

for (const p of incoming) {
  if (!p.sourceKey) {
    skipped.push({ name: p.name, why: "no sourceKey" });
    continue;
  }
  if (known.has(p.sourceKey)) {
    skipped.push({ name: p.name, why: "already in the corpus" });
    continue;
  }
  if (seenInBatch.has(p.sourceKey)) {
    skipped.push({ name: p.name, why: "duplicated within the input file" });
    continue;
  }
  seenInBatch.add(p.sourceKey);
  fresh.push(p);
}

/* --- Rows ----------------------------------------------------------------- */

const highest = existing.reduce((max, r) => {
  const n = Number(r.id);
  return Number.isFinite(n) && n > max ? n : max;
}, 0);
let nextId = highest;

const rows = fresh.map((p) => {
  const miles = milesBetween(ORIGIN, p);
  return {
    id: String(++nextId),
    sourceKey: p.sourceKey,
    name: p.name,
    cuisine: p.cuisine,
    neighborhood: p.neighborhood,
    distance: `${miles.toFixed(1)} mi`,
    walkTime: `${Math.max(1, Math.round(miles * 20))} min walk`,
    // OSM's `opening_hours` is richer than this field can hold — it carries
    // opening times, which is the fix "Open now" has needed all along. Parsing
    // it belongs in its own pass; until then the honest value is that we do not
    // know, and `openStateFor` already treats that as unknown.
    closingTime: "Hours vary",
    lat: p.lat,
    lng: p.lng,
    // Vestigial. The busyness copy these two carry was invented and was removed
    // from every surface (see PRODUCT.md); the columns survive only because the
    // type and the table still declare them. Writing a cheerful "No wait" here
    // would be reintroducing the exact fabrication that was deleted, so they
    // get the neutral value and say nothing.
    status: "calm",
    statusLabel: "",
    // rating and reviewCount are deliberately absent — see the note on
    // `Restaurant.rating`. Google supplies them later; a zero here would be a
    // number nobody measured.
    photo: undefined,
    osmWebsite: p.website ?? null,
  };
});

/* --- Report --------------------------------------------------------------- */

const byNeighborhood = {};
for (const r of rows) byNeighborhood[r.neighborhood] = (byNeighborhood[r.neighborhood] ?? 0) + 1;

console.log(`Input:            ${incoming.length} from ${FROM}`);
console.log(`New rows:         ${rows.length}`);
console.log(`Skipped:          ${skipped.length}`);
for (const s of skipped.slice(0, 10)) console.log(`  ${s.name} — ${s.why}`);
if (skipped.length > 10) console.log(`  ...and ${skipped.length - 10} more`);
console.log(`\nCorpus after:     ${existing.length} -> ${existing.length + rows.length}`);
console.log(`Ids assigned:     ${highest + 1}..${nextId}`);
console.log(
  `\nAll of these load as listed = false. Nothing appears on the site until\n` +
    `publish-restaurants.mjs sees a rating and a menu for it.`,
);

if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}
if (rows.length === 0) {
  console.log("\nNothing to add.");
  process.exit(0);
}

/* --- Write ---------------------------------------------------------------- */

const current = await readFile(DATA_PATH, "utf8");
const arrayStart = current.indexOf("export const restaurants");
if (arrayStart === -1) {
  console.error("Could not find `export const restaurants` — aborting rather than guessing.");
  process.exit(1);
}
const arrayEnd = current.indexOf("\n];", arrayStart);
if (arrayEnd === -1) {
  console.error("Could not find the end of the restaurants array — aborting.");
  process.exit(1);
}

const body = rows
  .map((r) => {
    const lines = [
      `    id: ${JSON.stringify(r.id)},`,
      `    sourceKey: ${JSON.stringify(r.sourceKey)},`,
      `    name: ${JSON.stringify(r.name)},`,
      `    cuisine: ${JSON.stringify(r.cuisine)},`,
      `    neighborhood: ${JSON.stringify(r.neighborhood)},`,
      `    distance: ${JSON.stringify(r.distance)},`,
      `    walkTime: ${JSON.stringify(r.walkTime)},`,
      `    closingTime: ${JSON.stringify(r.closingTime)},`,
      `    lat: ${r.lat},`,
      `    lng: ${r.lng},`,
      `    status: ${JSON.stringify(r.status)},`,
      `    statusLabel: ${JSON.stringify(r.statusLabel)},`,
    ];
    return `  {\n${lines.join("\n")}\n  },`;
  })
  .join("\n");

const next =
  current.slice(0, arrayEnd) +
  `\n\n  // --- Sourced from OpenStreetMap (ODbL) ---------------------------------\n` +
  `  //\n` +
  `  // No rating, no photo, no menu yet. These load as listed = false and are\n` +
  `  // invisible until scripts/publish-restaurants.mjs confirms a sourced\n` +
  `  // rating and a real menu. Chosen by neighborhood need, not citywide rank —\n` +
  `  // see scripts/select-osm-candidates.mjs.\n` +
  body +
  current.slice(arrayEnd);

await writeFile(DATA_PATH, next, "utf8");
console.log(`\nWrote ${rows.length} restaurants to src/data/restaurants.ts`);
console.log(`Run \`npm run restaurants:import\` to load them into Postgres.`);
