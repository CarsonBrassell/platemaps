/**
 * Picks which OpenStreetMap candidates to actually add, by neighborhood need.
 *
 *   node scripts/select-osm-candidates.mjs
 *   node scripts/select-osm-candidates.mjs --floor 15
 *
 * Reads `osm/san-diego.json` (written by fetch-osm-restaurants.mjs) and writes
 * `osm/shortlist.json`.
 *
 * ## Why a shortlist rather than all 3,928
 *
 * Because a restaurant is not shippable here until it has a sourced rating and
 * a menu, and a menu costs roughly 10.5 agent tool calls to find and read —
 * there is no menu API anywhere. That per-restaurant cost, not the size of the
 * OSM pool, is what caps the corpus. Adding 3,928 rows we cannot enrich would
 * fill Discover with blank cards, which is worse than the gap it was meant to
 * close.
 *
 * And the gap is not a count, it is a distribution. `menus/EXTRACTION-STATUS.md`
 * worked this out already: Gaslamp has 28 restaurants while 43 of 70
 * neighborhoods have fewer than 12 and seven have none at all. A visitor in Oak
 * Park sees an empty map. That is what reads as unfinished — not the absence of
 * the county's four thousandth taco shop.
 *
 * So: bring every thin neighborhood up to a floor, take the best candidates
 * available in each, and enrich all of them fully before anything goes live.
 *
 * ## Ranking within a neighborhood
 *
 * Ordered by how likely a candidate is to survive enrichment, because a pick
 * whose menu cannot be found is a wasted extraction slot:
 *
 *   - a website is the strongest signal — it is where the menu will be read from
 *   - `amenity=restaurant` over `fast_food`, per the app's own premise: a place
 *     you decide to walk to for dinner
 *   - an address and opening hours indicate a well-mapped, real business
 *   - a heavily repeated name is a chain; not excluded, since people do rate
 *     them, but not what a thin neighborhood needs twelve of
 */

import { readFile, writeFile } from "node:fs/promises";
import { restaurants as existing } from "../src/data/restaurants.ts";

const IN_PATH = new URL("../osm/san-diego.json", import.meta.url);
const OUT_PATH = new URL("../osm/shortlist.json", import.meta.url);

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

/** Restaurants per neighborhood below which the map looks empty. */
const FLOOR = flag("floor", 12);

const pool = JSON.parse(await readFile(IN_PATH, "utf8"));

/* --- Junk ---------------------------------------------------------------- */

/**
 * OSM is crowdsourced and a few nodes are not restaurants at all. "Parking for
 * Chicken Pie Shop" is a real entry in this pull — a parking lot named after
 * the restaurant it serves, tagged as the restaurant.
 */
const JUNK = /\b(parking|atm|vending|restroom|toilet|drive.?thru only)\b/i;

function isJunk(place) {
  return JUNK.test(place.name) || place.name.trim().length < 2;
}

/* --- Chains -------------------------------------------------------------- */

const nameCount = new Map();
for (const p of pool.new) {
  const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
}

function brandKey(place) {
  return (place.brand ?? place.name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Two independent signals, because neither alone is enough: OSM's `brand` tag
 * catches a lone Applebee's, and a repeated name catches a local chain nobody
 * bothered to tag.
 */
function isChain(place) {
  if (place.brand) return true;
  return (nameCount.get(place.name.toLowerCase().replace(/[^a-z0-9]/g, "")) ?? 1) >= 3;
}

/* --- Ranking ------------------------------------------------------------- */

/**
 * Independents rank above chains, always, rather than by a penalty that a
 * chain's other advantages can outweigh.
 *
 * The first version scored additively with a -2 for chains, and every thin
 * neighborhood came back a food court — Oak Park got two McDonald's, a Domino's,
 * a Carl's Jr. and a Chuck E. Cheese; Barrio Logan came back seven chains out of
 * eleven. The cause is that chains always have a website and a clean address, so
 * they collected the exact bonuses meant to identify a well-mapped business.
 *
 * A visitor in Oak Park who sees twelve restaurants and recognises eleven of
 * them has learned nothing about Oak Park. Chains are still eligible — people do
 * eat and rate at them — but only after the independents are exhausted, and
 * never twice from the same brand in one neighborhood.
 */
const INDEPENDENT_TIER = 1000;

function score(place) {
  let s = isChain(place) ? 0 : INDEPENDENT_TIER;
  if (place.website) s += 4;
  if (place.amenity === "restaurant") s += 3;
  if (place.address) s += 2;
  if (place.openingHours) s += 1;
  if (place.cuisine !== "Restaurant") s += 1;
  return s;
}

/* --- Select -------------------------------------------------------------- */

const have = new Map();
for (const r of existing) {
  have.set(r.neighborhood, (have.get(r.neighborhood) ?? 0) + 1);
}

const byNeighborhood = new Map();
for (const p of pool.new) {
  if (isJunk(p)) continue;
  if (!byNeighborhood.has(p.neighborhood)) byNeighborhood.set(p.neighborhood, []);
  byNeighborhood.get(p.neighborhood).push(p);
}

const allNeighborhoods = new Set([...have.keys(), ...byNeighborhood.keys()]);

const selected = [];
const report = [];
const short = [];

for (const name of allNeighborhoods) {
  const current = have.get(name) ?? 0;
  const wanted = Math.max(0, FLOOR - current);
  if (wanted === 0) continue;

  const candidates = (byNeighborhood.get(name) ?? [])
    .slice()
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

  // One branch per brand per neighborhood. Two McDonald's a mile apart are two
  // real restaurants, but they are the same answer to "what can I eat here".
  const usedBrands = new Set();
  const take = [];
  for (const p of candidates) {
    if (take.length >= wanted) break;
    const key = brandKey(p);
    if (usedBrands.has(key)) continue;
    usedBrands.add(key);
    take.push(p);
  }
  selected.push(...take.map((p) => ({ ...p, neighborhoodNeed: name, rank: score(p) })));

  report.push({
    neighborhood: name,
    have: current,
    wanted,
    taken: take.length,
    available: candidates.length,
    withWebsite: take.filter((p) => p.website).length,
  });

  if (take.length < wanted) {
    short.push({ neighborhood: name, have: current, wanted, available: candidates.length });
  }
}

report.sort((a, b) => a.have - b.have || a.neighborhood.localeCompare(b.neighborhood));

/* --- Report -------------------------------------------------------------- */

const withWebsite = selected.filter((p) => p.website).length;
const withHours = selected.filter((p) => p.openingHours).length;
const sitDown = selected.filter((p) => p.amenity === "restaurant").length;

console.log(`Floor: ${FLOOR} restaurants per neighborhood\n`);
console.log(`${"neighborhood".padEnd(26)} have  add  avail  w/site`);
for (const r of report) {
  console.log(
    `${r.neighborhood.padEnd(26)}${String(r.have).padStart(4)}${String(r.taken).padStart(5)}` +
      `${String(r.available).padStart(7)}${String(r.withWebsite).padStart(8)}`,
  );
}

console.log(`\nSelected:            ${selected.length}`);
console.log(`Corpus after import: ${existing.length + selected.length}`);
console.log(`  sit-down:          ${sitDown} (${Math.round((sitDown / selected.length) * 100)}%)`);
console.log(`  with a website:    ${withWebsite} (${Math.round((withWebsite / selected.length) * 100)}%)  <- menu source`);
console.log(`  with hours:        ${withHours} (${Math.round((withHours / selected.length) * 100)}%)`);

if (short.length) {
  console.log(`\nCannot reach the floor — not enough exists in OSM:`);
  for (const s of short) {
    console.log(`  ${s.neighborhood}: have ${s.have}, wanted ${s.wanted}, only ${s.available} candidates`);
  }
  console.log(`  (re-run fetch-osm-restaurants.mjs --with-cafes to widen the pool)`);
}

const noWebsite = selected.length - withWebsite;
console.log(
  `\n${noWebsite} of the ${selected.length} have no website in OSM. Their menus have to be ` +
    `found by search rather than read off a known page, which is the expensive half — ` +
    `expect a lower hit rate there.`,
);

await writeFile(
  OUT_PATH,
  JSON.stringify(
    {
      source: "OpenStreetMap via Overpass API",
      license: "ODbL — attribution required wherever this is displayed",
      floor: FLOOR,
      counts: {
        selected: selected.length,
        corpusAfter: existing.length + selected.length,
        withWebsite,
        sitDown,
      },
      neighborhoods: report,
      unreachable: short,
      restaurants: selected,
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`\nWrote osm/shortlist.json`);
console.log(`Nothing has been added to the corpus — this is a proposal to review.`);
