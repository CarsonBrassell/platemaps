/**
 * Recomputes `restaurants.neighborhood` from stored coordinates, and reports
 * the rows the nearest-neighbour rule cannot honestly label.
 *
 *   node --env-file=.env.local scripts/fix-neighborhoods.mjs           # report only
 *   node --env-file=.env.local scripts/fix-neighborhoods.mjs --apply   # write changes
 *
 * ## Why this exists
 *
 * `nearestNeighborhood()` in fetch-restaurants.mjs labels a restaurant with the
 * nearest sub-area point in src/data/regions.ts. It always returns something,
 * and has no notion of being wrong. Two failure modes came out of extracting
 * 682 menus:
 *
 *   1. The real neighbourhood was missing from regions.ts, so its restaurants
 *      fell to a neighbour. Eight on Village Way were labelled Rancho
 *      Penasquitos; the street is in Pacific Highlands Ranch.
 *   2. One point cannot represent a long city. Oceanside's point is downtown,
 *      so South Oceanside businesses measured nearer to Carlsbad's.
 *
 * Adding the missing points fixes both classes. This script applies that fix
 * to rows already in the database, which the fetch script would only correct
 * the next time it happened to return that business.
 *
 * ## Why it does not null anything out
 *
 * A restaurant 21 miles from the nearest point is not really in that
 * neighbourhood. The honest value is "unknown" — but `neighborhood` is NOT
 * NULL in practice: `src/app/api/restaurants/route.ts` calls
 * `r.neighborhood.toLowerCase()`, so a null throws on search. Changing that is
 * a product decision, not a data fix. So far-from-anything rows are REPORTED
 * here and left alone.
 *
 * Same for the coordinate problems: restaurants whose stored coordinates put
 * them in Mexico are listed, not touched. Deleting a restaurant is a
 * deliberate act — see the note at the top of fetch-restaurants.mjs.
 */

import { neon } from "@neondatabase/serverless";
import { regions } from "../src/data/regions.ts";

const APPLY = process.argv.includes("--apply");

/* Anything further than this from every known sub-area point is a label the
 * rule is guessing at rather than measuring. Five miles is generous for San
 * Diego neighbourhoods and still catches the 21-mile cases. */
const SUSPICIOUS_MILES = 5;

/* San Diego County. The southern edge matters most: San Ysidro is the border
 * crossing, so a Yelp search centred there returns Tijuana businesses. */
const COUNTY = { minLat: 32.534, maxLat: 33.505, minLng: -117.61, maxLng: -116.08 };

const allSubAreas = regions.flatMap((r) => r.subAreas.map((a) => ({ ...a, region: r.name })));

function milesBetween(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearest(coords) {
  let best = null;
  for (const area of allSubAreas) {
    const d = milesBetween(coords, area);
    if (!best || d < best.d) best = { d, name: area.name, region: area.region };
  }
  return best;
}

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, name, neighborhood, lat, lng FROM restaurants ORDER BY (id)::int`;

const changes = [];
const suspicious = [];
const offMap = [];
const noCoords = [];

for (const r of rows) {
  if (r.lat == null || r.lng == null) {
    noCoords.push(r);
    continue;
  }
  const outside =
    r.lat < COUNTY.minLat || r.lat > COUNTY.maxLat || r.lng < COUNTY.minLng || r.lng > COUNTY.maxLng;
  if (outside) offMap.push(r);

  const best = nearest(r);
  if (best.d > SUSPICIOUS_MILES) suspicious.push({ ...r, ...best });
  if (best.name !== r.neighborhood) changes.push({ ...r, from: r.neighborhood, to: best.name, d: best.d });
}

console.log(`${rows.length} restaurants. ${changes.length} would change neighborhood.\n`);

/* Grouped by the move, not by restaurant — a systematic mislabel shows up as
 * one heading with eight rows under it, which is the thing worth seeing. */
const byMove = new Map();
for (const c of changes) {
  const key = `${c.from} → ${c.to}`;
  if (!byMove.has(key)) byMove.set(key, []);
  byMove.get(key).push(c);
}
for (const [move, list] of [...byMove].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${move}  (${list.length})`);
  for (const c of list) console.log(`    ${c.id.padStart(3)} ${c.name}  — ${c.d.toFixed(1)} mi from the new point`);
}

if (suspicious.length > 0) {
  console.log(`\n${suspicious.length} further than ${SUSPICIOUS_MILES} miles from ANY known sub-area.`);
  console.log("Their labels are guesses. Left unchanged — they need a real neighbourhood added:");
  for (const s of suspicious.sort((a, b) => b.d - a.d)) {
    console.log(`    ${s.id.padStart(3)} ${s.name} — stored "${s.neighborhood}", nearest is ${s.name === s.nameOfArea ? "" : ""}${s.nameOfArea ?? ""}${s.d.toFixed(1)} mi away`);
  }
}

if (offMap.length > 0) {
  console.log(`\n${offMap.length} with coordinates OUTSIDE San Diego County. Not touched:`);
  for (const o of offMap) console.log(`    ${o.id.padStart(3)} ${o.name} (${o.lat}, ${o.lng}) — stored "${o.neighborhood}"`);
}

if (noCoords.length > 0) {
  console.log(`\n${noCoords.length} with no coordinates at all: ${noCoords.map((r) => r.name).join(", ")}`);
}

if (!APPLY) {
  console.log("\nReport only — nothing written. Re-run with --apply to write these changes.");
  process.exit(0);
}

for (const c of changes) {
  await sql`UPDATE restaurants SET neighborhood = ${c.to} WHERE id = ${c.id}`;
}
console.log(`\nUpdated ${changes.length} rows.`);
