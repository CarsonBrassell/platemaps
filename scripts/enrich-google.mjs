/**
 * Gives each shortlisted OpenStreetMap restaurant a sourced rating from Google.
 *
 *   node --env-file=.env.local scripts/enrich-google.mjs --dry
 *   node --env-file=.env.local scripts/enrich-google.mjs --limit 5
 *   node --env-file=.env.local scripts/enrich-google.mjs
 *
 * Reads `osm/shortlist.json`, writes `osm/shortlist-rated.json`.
 *
 * ## Why this step is mandatory, not optional
 *
 * A restaurant does not ship here without a rating and a menu. OSM supplies
 * neither — it has no rating field at all — and Yelp is no longer available
 * (free tier ended; the cheapest plan is $229/month). Google is the remaining
 * source, and it is dramatically cheaper for this: see the cost note below.
 *
 * A restaurant that comes back with no confident Google match is **dropped from
 * the list**, not added with a blank or a zero. That is the whole point of doing
 * this before the import rather than after: the corpus never contains a card
 * that cannot say anything about the restaurant.
 *
 * Because drops leave a neighborhood short of its floor, this reports the
 * shortfall per neighborhood so `select-osm-candidates.mjs` can be re-run to
 * top up from the next-best candidates.
 *
 * ## Two calls per restaurant, and why not one
 *
 * `blend-ratings.mjs` asks Text Search for `rating` directly, which is one call
 * — but requesting a rating inside a Text Search bills the whole call at Text
 * Search Enterprise, $35 per 1,000. Splitting it costs two calls and less
 * money: Text Search asking only for `places.id` is a free SKU, and Place
 * Details carrying the rating is Enterprise at $20 per 1,000. About 43% cheaper.
 *
 * With 1,000 Place Details calls free each month, a few hundred restaurants
 * costs nothing at all.
 *
 * ## Terms
 *
 * Google permits storing `place_id` indefinitely and nothing else. Ratings held
 * in Postgres are outside that, exactly as the existing Yelp-sourced ratings
 * already are — an unresolved pre-launch question, not one this script creates.
 * Photos are deliberately not fetched here: they cannot be stored at all, so
 * they are a per-view cost forever and belong nowhere near a batch script.
 */

import { readFile, writeFile } from "node:fs/promises";

const IN_PATH = new URL("../osm/shortlist.json", import.meta.url);
const OUT_PATH = new URL("../osm/shortlist-rated.json", import.meta.url);
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAIL_URL = "https://places.googleapis.com/v1/places";

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

const DRY_RUN = process.argv.includes("--dry");
const LIMIT = flag("limit", Infinity);

/** How far a Google result may sit from the OSM coordinate and still count. */
const MAX_MATCH_METRES = 300;
/**
 * Below this a Google rating is too thin to present as a sourced number. Matches
 * `MIN_GOOGLE_REVIEWS` in blend-ratings.mjs deliberately — two scripts
 * disagreeing about what counts as a real rating would put two different
 * standards on the same grid.
 */
const MIN_REVIEWS = flag("min-reviews", 20);

/** Published rates, for the projection this prints. */
const DETAIL_CPM = 20 / 1000;
const FREE_DETAILS_PER_MONTH = 1000;

const shortlist = JSON.parse(await readFile(IN_PATH, "utf8"));
const targets = shortlist.restaurants.slice(0, LIMIT === Infinity ? undefined : LIMIT);

if (DRY_RUN) {
  const billable = Math.max(0, targets.length - FREE_DETAILS_PER_MONTH);
  console.log(`Dry run — no calls made, nothing written.\n`);
  console.log(`Would look up ${targets.length} restaurants.`);
  console.log(`  Text Search (ids only):  ${targets.length} calls — free SKU`);
  console.log(`  Place Details (rating):  ${targets.length} calls`);
  console.log(
    `  ${FREE_DETAILS_PER_MONTH} free per month, so ${billable} billable ` +
      `= $${(billable * DETAIL_CPM).toFixed(2)}`,
  );
  console.log(`\nDropped restaurants (no match, or under ${MIN_REVIEWS} reviews) are reported per`);
  console.log(`neighborhood so select-osm-candidates.mjs can top the gap back up.`);
  process.exit(0);
}

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_PLACES_API_KEY is not set. Add it to .env.local and pass --env-file=.env.local");
  process.exit(1);
}
/*
 * Check the key's shape before spending it. A Google API key is ~39 characters
 * beginning `AIza`. This guard exists because the Yelp key slot in this repo's
 * .env.local once held a Postgres connection string, and seventy requests sent
 * a database password to a third party before anyone looked at the value.
 */
if (!/^AIza[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
  console.error(
    `GOOGLE_PLACES_API_KEY does not look like a Google key (got ${apiKey.length} characters; ` +
      `expected ~39 beginning "AIza").`,
  );
  console.error("Refusing to send it — a key sent to the wrong place is a leaked credential.");
  if (apiKey.startsWith("postgres")) {
    console.error("It looks like a Postgres connection string. Check for a paste slip in .env.local.");
  }
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function metresBetween(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function normalise(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function namesAgree(a, b) {
  const x = normalise(a);
  const y = normalise(b);
  return x === y || x.includes(y) || y.includes(x);
}

let searchCalls = 0;
let detailCalls = 0;

/** Free SKU: asking only for ids keeps this out of the billed tiers. */
async function findPlaceId(place) {
  searchCalls += 1;
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({
      textQuery: [place.name, place.address, place.neighborhood, "San Diego"]
        .filter(Boolean)
        .join(" "),
      // Biasing on the OSM coordinate is what stops a chain matching the wrong
      // branch across town.
      locationBias: {
        circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 500 },
      },
      maxResultCount: 3,
    }),
  });
  if (!res.ok) throw new Error(`Text Search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()).places ?? []).map((p) => p.id);
}

/**
 * Enterprise SKU — `rating`, `userRatingCount` and `regularOpeningHours` all
 * live there. `displayName` and `location` come along free of extra charge
 * because billing is at the highest tier requested, and both are needed to
 * confirm the match is the right restaurant.
 */
async function detailsFor(placeId) {
  detailCalls += 1;
  const res = await fetch(`${DETAIL_URL}/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,displayName,location,rating,userRatingCount,regularOpeningHours",
    },
  });
  if (!res.ok) throw new Error(`Place Details ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* --- Run ------------------------------------------------------------------ */

console.log(`Looking up ${targets.length} restaurants on Google...\n`);

const rated = [];
const dropped = [];

for (const [i, place] of targets.entries()) {
  let outcome = null;
  try {
    const ids = await findPlaceId(place);
    for (const id of ids) {
      const d = await detailsFor(id);
      if (d.rating == null || d.userRatingCount == null) continue;
      const coords = { lat: d.location.latitude, lng: d.location.longitude };
      const metres = metresBetween(place, coords);
      if (metres > MAX_MATCH_METRES) continue;
      const title = d.displayName?.text ?? "";
      if (!namesAgree(place.name, title) && metres > 100) continue;
      outcome = { id: d.id, title, metres, rating: d.rating, count: d.userRatingCount, hours: d.regularOpeningHours ?? null };
      break;
    }
  } catch (err) {
    console.error(`  ! ${place.name}: ${err.message}`);
  }
  await sleep(120);

  if (!outcome) {
    dropped.push({ ...place, reason: "no confident Google match" });
  } else if (outcome.count < MIN_REVIEWS) {
    dropped.push({ ...place, reason: `only ${outcome.count} Google reviews (floor ${MIN_REVIEWS})` });
  } else {
    rated.push({
      ...place,
      placeId: outcome.id,
      googleName: outcome.title,
      matchMetres: Math.round(outcome.metres),
      rating: outcome.rating,
      reviewCount: outcome.count,
      googleRating: outcome.rating,
      googleReviewCount: outcome.count,
      googleHours: outcome.hours,
    });
  }

  if (i % 10 === 0) process.stdout.write(`\r  ${i + 1}/${targets.length}`);
}
console.log("");

/* --- Report --------------------------------------------------------------- */

const shortfall = {};
for (const d of dropped) {
  shortfall[d.neighborhoodNeed] = (shortfall[d.neighborhoodNeed] ?? 0) + 1;
}

const billable = Math.max(0, detailCalls - FREE_DETAILS_PER_MONTH);

console.log(`\nRated:   ${rated.length}`);
console.log(`Dropped: ${dropped.length}`);
console.log(`Calls:   ${searchCalls} text search (free), ${detailCalls} place details`);
console.log(`Cost:    $${(billable * DETAIL_CPM).toFixed(2)} (${FREE_DETAILS_PER_MONTH} details free per month)`);

if (rated.length) {
  const avg = rated.reduce((s, r) => s + r.rating, 0) / rated.length;
  const median = [...rated].sort((a, b) => a.reviewCount - b.reviewCount)[Math.floor(rated.length / 2)];
  console.log(`\nAverage rating ${avg.toFixed(2)}, median review count ${median.reviewCount}.`);
}

if (dropped.length) {
  console.log(`\nNeighborhoods now short of their floor:`);
  for (const [n, count] of Object.entries(shortfall).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}: ${count} short`);
  }
  console.log(`\nRe-run select-osm-candidates.mjs to pull replacements from the pool,`);
  console.log(`then run this again over just the additions.`);
  console.log(`\nFirst 10 drops:`);
  for (const d of dropped.slice(0, 10)) console.log(`  ${d.name} — ${d.reason}`);
}

await writeFile(
  OUT_PATH,
  JSON.stringify(
    {
      note:
        "Shortlisted OSM restaurants with a sourced Google rating. Only these are " +
        "eligible for import — a restaurant with no rating is dropped, never blank.",
      sources: ["OpenStreetMap via Overpass (ODbL)", "Google Places API"],
      counts: { rated: rated.length, dropped: dropped.length },
      shortfall,
      restaurants: rated,
      dropped,
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`\nWrote osm/shortlist-rated.json`);
