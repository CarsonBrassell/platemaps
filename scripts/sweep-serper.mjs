/**
 * Phase 2b: a Google-via-Serper category sweep by neighbourhood/city, to catch
 * restaurants the county permit file hides under an owner or landlord name.
 *
 *   node --env-file=.env.local scripts/sweep-serper.mjs --dry
 *   node --env-file=.env.local scripts/sweep-serper.mjs --max-calls 20
 *   node --env-file=.env.local scripts/sweep-serper.mjs --max-calls 0        # cache-only rebuild
 *   node --env-file=.env.local scripts/sweep-serper.mjs --max-calls 4000 --pages 1
 *
 * See probe/PRESENCE-PLAN.md, "Phase 2b: second source, a Google category
 * sweep". Text-searches `<category> in <neighborhood>, <city>, CA` (and, for
 * every distinct city on its own, `<category> in <city>, CA`) through Serper's
 * `/maps` endpoint, for a fixed list of categories. Every place id turned up
 * that is not already a `restaurants` row is written to `data/sweep-resolved.json`
 * as an "import"-verdict entry, shaped like `scripts/resolve-places.mjs`'s
 * `--via serper` output, so `scripts/import-deh.mjs --from data/sweep-resolved.json`
 * runs it through the exact same insert path (that flag already exists there -
 * see `--from` near its top - nothing about this script required touching it).
 *
 * ## Areas and categories
 *
 * Areas come from the corpus itself, not a fixed list: every (neighborhood,
 * city) pair with at least one *listed* row, plus every distinct city in the
 * whole table (a city-only pass, for the neighbourhoods our own data has never
 * named). CATEGORIES below is deliberately a flat, easy-to-edit array.
 *
 * ## Money - the same discipline as resolve-places.mjs --via serper
 *
 * Same shared ledger (`data/serper-calls.jsonl`), same SKU (`SerperMaps`), same
 * per-call cost (3 credits) and the same budget expression
 * (`SERPER_BUDGET`) - `resolve-places.mjs` does not export these (it is being
 * edited by another agent right now), so they are copied here rather than
 * imported. If that budget number ever changes there, change it here too.
 *
 *  1. `--max-calls` defaults to **0**: reads whatever is already cached,
 *     classifies it, rebuilds `data/sweep-resolved.json` and makes no request.
 *     This is what makes the sweep resumable - run it again after buying more
 *     budget and it picks up exactly where it left off.
 *  2. Every live call is appended to the ledger *before* its response is used
 *     for anything.
 *  3. The ledger's running credit total plus `--max-calls * 3` must stay under
 *     `SERPER_BUDGET`, or the script refuses to start.
 *  4. `--dry` prints the query list and a cached/would-call breakdown and makes
 *     no request and writes nothing - not even the resolved file.
 *
 * ## The cache is the point
 *
 * Every response is written to `data/places-cache/sweep_<slug>_p<page>.json`
 * before it is read, so a (query, page) pair already on disk is never
 * requested again by this or any future run. `--pages N` (default 1) fetches
 * up to N pages per area/category, but stops early for a given area/category
 * the moment a page comes back empty - there is no reason to buy page 3 of a
 * neighbourhood that ran out of results on page 1.
 *
 * ## What gets filtered out before anything is written
 *
 * A place id is kept only if all of these hold:
 *   - not already `restaurants.google_place_id` (queried fresh each run)
 *   - not `businessStatus` CLOSED_PERMANENTLY (or Serper's `permanentlyClosed`)
 *   - its normalised type passes `isFoodType` (the same set resolve-places.mjs
 *     uses, copied here for the same reason as the money constants above)
 *   - its name does not match `data/excluded-chains.json` (via
 *     `isChainName`, exported by `scripts/verify-coverage.mjs` and already
 *     shared with `resolve-places.mjs` for the same purpose)
 *
 * ## The output shape is deliberately import-deh's, not Google's raw shape
 *
 * `place.displayName` here is a plain string and `place.lat`/`place.lng` are
 * flat numbers - *not* `displayName.text` / `location.latitude`+`longitude`.
 * That is what a real "import"-verdict entry in `data/deh-resolved.json` looks
 * like on disk (checked directly, 2026-09-04: e.g. sourceKey
 * `deh:DEH2017-FFPP-008909`) and it is what `import-deh.mjs` actually reads
 * (`p.lat`, `p.lng`, `p.displayName`, all read as scalars). A nested
 * Google-Place-resource shape would silently fail `import-deh.mjs`'s
 * `p.lat == null` coordinate check. This is the one place this script departs
 * from the brief's literal field list, in favour of what the importer verifiably
 * consumes - proven below with a fixture run of `import-deh.mjs --from`.
 */

import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isChainName } from "./verify-coverage.mjs";

const SERPER_URL = "https://google.serper.dev/maps";
const SERPER_SKU = "SerperMaps";
const SERPER_LEDGER = "data/serper-calls.jsonl";
/* A /maps call is billed 3 credits - matches SERPER_CREDITS_PER_CALL in
 * resolve-places.mjs (not exported there; keep this in sync by hand). */
const SERPER_CREDITS_PER_CALL = 3;
/* Matches SERPER_BUDGET in resolve-places.mjs exactly - same env var, same
 * fallback number, same shared one-time pool `find-websites.mjs` also spends
 * from. Not exported there either, so copied rather than duplicated-and-drifted. */
const SERPER_BUDGET = Number(process.env.SERPER_BUDGET) || 52500;

const CACHE_DIR = "data/places-cache";
const OUT_PATH = "data/sweep-resolved.json";

/**
 * Categories to sweep every area with. Flat and easy to edit - add or remove
 * a line and the next run picks it up (each is its own cache namespace, so
 * removing one just stops spending on it; it does not invalidate anything).
 */
const CATEGORIES = [
  "restaurants",
  "mexican food",
  "taco shop",
  "cafe",
  "bakery",
  "pizza",
  "sushi",
  "ramen",
  "bar and grill",
  "brunch",
  "seafood",
  "bbq",
  "vegan",
  "dessert",
];

/**
 * Google `primaryType`/Serper-category values that mean "a person can eat or
 * drink here". Copied verbatim from `scripts/resolve-places.mjs` (not
 * exported there, and that file is being edited by another agent right now -
 * see this file's header). Keep the two lists in sync by hand.
 */
const FOOD_TYPES = new Set([
  "restaurant", "cafe", "cafeteria", "coffee_shop", "bar", "bar_and_grill",
  "pub", "bakery", "meal_takeaway", "meal_delivery", "fast_food_restaurant",
  "sandwich_shop", "pizza_restaurant", "ice_cream_shop", "dessert_shop",
  "dessert_restaurant", "donut_shop", "bagel_shop", "juice_shop", "tea_house",
  "brewery", "wine_bar", "food_court", "diner", "deli", "buffet_restaurant",
  "breakfast_restaurant", "brunch_restaurant", "fine_dining_restaurant",
  "steak_house", "seafood_restaurant", "sushi_restaurant", "ramen_restaurant",
  "pizzeria", "barbecue_restaurant", "hamburger_restaurant",
  "chicken_restaurant", "acai_shop", "bubble_tea_store", "juice_bar",
  "frozen_yogurt_shop", "creperie", "poke_bar", "cookie_shop", "coffee_stand",
  "candy_store", "chocolate_shop", "pizza_delivery", "cake_shop",
  "pastry_shop", "salad_shop", "bistro", "sports_bar", "cocktail_bar",
  "hookah_bar", "irish_pub", "beer_garden", "brewpub", "winery", "food",
  "confectionery", "american_restaurant", "african_restaurant",
  "afghani_restaurant", "asian_restaurant", "brazilian_restaurant",
  "chinese_restaurant", "french_restaurant", "greek_restaurant",
  "hamburger_restaurant", "indian_restaurant", "indonesian_restaurant",
  "italian_restaurant", "japanese_restaurant", "korean_restaurant",
  "lebanese_restaurant", "mediterranean_restaurant", "mexican_restaurant",
  "middle_eastern_restaurant", "pizza_restaurant", "spanish_restaurant",
  "thai_restaurant", "turkish_restaurant", "vegan_restaurant",
  "vegetarian_restaurant", "vietnamese_restaurant",
]);

function isFoodType(type) {
  if (!type) return false;
  if (FOOD_TYPES.has(type)) return true;
  return /_restaurant$/.test(type);
}

/**
 * Serper labels types in English ("Mexican restaurant", "Bar & grill");
 * FOOD_TYPES speaks Google's snake_case ("mexican_restaurant",
 * "bar_and_grill"). Same normalisation `serperCandidate` uses in
 * resolve-places.mjs, copied for the reason given in this file's header.
 */
function normalizeType(label) {
  if (!label) return null;
  return String(label)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/* --- flags ------------------------------------------------------------- */

function numFlag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

const MAX_CALLS = numFlag("max-calls", 0);
const PAGES = numFlag("pages", 1);
const DRY = process.argv.includes("--dry");

/* --- cache --------------------------------------------------------------- */

function slug(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function cacheFile(query, page) {
  return `${CACHE_DIR}/sweep_${slug(query)}_p${page}.json`;
}
async function readCache(query, page) {
  const path = cacheFile(query, page);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/* --- serper ---------------------------------------------------------------- */

async function fetchSerperMaps(apiKey, query, page) {
  const started = new Date().toISOString();
  let http = 0;
  let json = null;
  let error = null;
  try {
    const res = await fetch(SERPER_URL, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "us", hl: "en", page }),
    });
    http = res.status;
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }
  return { json, error, fetchedAt: started };
}

async function recordCall({ query, page, results, error }) {
  await mkdir("data", { recursive: true });
  await appendFile(
    SERPER_LEDGER,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      sku: SERPER_SKU,
      query,
      sourceKey: `sweep:${slug(query)}:p${page}`,
      credits: SERPER_CREDITS_PER_CALL,
      results,
      ...(error ? { error } : {}),
    })}\n`,
    "utf8",
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- run ------------------------------------------------------------------ */

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const pairRows = await sql`SELECT DISTINCT neighborhood, city FROM restaurants WHERE listed`;
const cityRows = await sql`SELECT DISTINCT city FROM restaurants`;

const neighborhoodAreas = pairRows
  .filter((r) => r.neighborhood && r.city)
  .map((r) => ({ kind: "neighborhood", neighborhood: r.neighborhood, city: r.city }));
const cityAreas = [...new Set(cityRows.map((r) => r.city).filter(Boolean))]
  .map((city) => ({ kind: "city", city }));
const areas = [...neighborhoodAreas, ...cityAreas];

console.log(`sweep-serper  pages=${PAGES}  max-calls=${MAX_CALLS}${DRY ? "  (dry)" : ""}`);
console.log(`  neighborhood/city pairs (listed, non-null): ${neighborhoodAreas.length}`);
console.log(`  distinct cities (non-null):                 ${cityAreas.length}`);
console.log(`  areas total:                                ${areas.length}`);
console.log(`  categories:                                 ${CATEGORIES.length}`);

const baseQueries = [];
for (const area of areas) {
  for (const category of CATEGORIES) {
    const query =
      area.kind === "neighborhood"
        ? `${category} in ${area.neighborhood}, ${area.city}, CA`
        : `${category} in ${area.city}, CA`;
    baseQueries.push({ query, city: area.city });
  }
}
console.log(`  base queries (area x category):             ${baseQueries.length}`);
console.log(`  estimated credits for page 1:                ${baseQueries.length * SERPER_CREDITS_PER_CALL}`);

if (DRY) {
  let cached = 0;
  let wouldCall = 0;
  for (const bq of baseQueries) {
    if (existsSync(cacheFile(bq.query, 1))) cached += 1;
    else wouldCall += 1;
  }
  console.log(`\n--dry: page-1 cache status`);
  console.log(`  cached already:    ${cached}`);
  console.log(`  would call:        ${wouldCall}  (${wouldCall * SERPER_CREDITS_PER_CALL} credits)`);
  console.log(`\nfirst 20 queries:`);
  for (const bq of baseQueries.slice(0, 20)) console.log(`  ${bq.query}`);
  console.log(`\nNo network made. Nothing written.`);
  process.exit(0);
}

/* Shared ledger, shared budget - same refusal resolve-places.mjs --via serper
 * makes, same env var and fallback number (see header for why it's copied). */
const ledgerLines = existsSync(SERPER_LEDGER)
  ? (await readFile(SERPER_LEDGER, "utf8")).split("\n").filter((l) => l.trim())
  : [];
const ledgerSpent = ledgerLines.reduce((acc, line) => {
  try {
    const e = JSON.parse(line);
    return acc + (Number.isFinite(e.credits) ? e.credits : 1);
  } catch {
    return acc + 1;
  }
}, 0);
console.log(`\n  Serper credits used (shared with resolve-places.mjs / find-websites.mjs): ${ledgerSpent} of ${SERPER_BUDGET}`);

if (ledgerSpent + MAX_CALLS * SERPER_CREDITS_PER_CALL > SERPER_BUDGET) {
  console.error(
    `\nRefusing to run: ${ledgerSpent} + ${MAX_CALLS} x ${SERPER_CREDITS_PER_CALL} credits = ` +
      `${ledgerSpent + MAX_CALLS * SERPER_CREDITS_PER_CALL} would pass the ${SERPER_BUDGET}-credit shared cap.`,
  );
  process.exit(1);
}

let apiKey = "";
if (MAX_CALLS > 0) {
  apiKey = process.env.SERPER_API_KEY || "";
  if (!apiKey) {
    console.error("\nSERPER_API_KEY is not set. Re-run with --env-file=.env.local");
    process.exit(1);
  }
}

await mkdir(CACHE_DIR, { recursive: true });

let calls = 0;
let servedFromCache = 0;
let notAttempted = 0;
/** `{ query, city, page, places }` for every (query, page) this run could read
 * (cached already, or fetched just now) - this is what the output is built
 * from, so a max-calls-0 run rebuilds from exactly what earlier runs bought. */
const responses = [];

for (const bq of baseQueries) {
  let prevEmpty = false;
  for (let page = 1; page <= PAGES; page += 1) {
    if (prevEmpty) break;
    let cached = await readCache(bq.query, page);
    if (!cached) {
      if (calls >= MAX_CALLS) {
        notAttempted += 1;
        break;
      }
      const { json, error, fetchedAt } = await fetchSerperMaps(apiKey, bq.query, page);
      calls += 1;
      const places = json?.places ?? [];
      cached = {
        query: bq.query,
        page,
        fetchedAt,
        sku: SERPER_SKU,
        ...(error ? { error } : {}),
        places,
        ...(json?.error ? { serperError: json.error } : {}),
      };
      await writeFile(cacheFile(bq.query, page), JSON.stringify(cached, null, 1), "utf8");
      await recordCall({ query: bq.query, page, results: places.length, error });
      await sleep(120);
    } else {
      servedFromCache += 1;
    }
    const places = cached.places ?? [];
    responses.push({ query: bq.query, city: bq.city, page, places });
    if (places.length === 0) prevEmpty = true;
  }
}

console.log(`\ncalls made this run: ${calls}    served from cache: ${servedFromCache}`);
if (notAttempted) console.log(`not attempted (no cache, no call budget left): ${notAttempted}`);

/* --- dedupe + classify ------------------------------------------------------ */

const knownRows = await sql`SELECT google_place_id FROM restaurants WHERE google_place_id IS NOT NULL`;
const knownPlaceIds = new Set(knownRows.map((r) => r.google_place_id));

const byPlaceId = new Map();
for (const r of responses) {
  for (const item of r.places) {
    const placeId = item.placeId ?? item.place_id ?? null;
    if (!placeId) continue;
    if (byPlaceId.has(placeId)) continue; // first sighting wins
    byPlaceId.set(placeId, { item, query: r.query, city: r.city });
  }
}

let dropKnown = 0;
let dropClosed = 0;
let dropNotFood = 0;
let dropChain = 0;
const survivors = [];

for (const [placeId, { item, query, city }] of byPlaceId) {
  if (knownPlaceIds.has(placeId)) {
    dropKnown += 1;
    continue;
  }
  const businessStatus = item.businessStatus ?? (item.permanentlyClosed ? "CLOSED_PERMANENTLY" : null);
  if (businessStatus === "CLOSED_PERMANENTLY") {
    dropClosed += 1;
    continue;
  }
  const type = normalizeType(item.type ?? item.category ?? null);
  if (!isFoodType(type)) {
    dropNotFood += 1;
    continue;
  }
  const name = item.title ?? null;
  if (isChainName(name)) {
    dropChain += 1;
    continue;
  }

  survivors.push({
    sourceKey: `sweep:${placeId}`,
    recordId: null,
    legalName: name,
    address: item.address ?? null,
    city,
    status: "import",
    detail: type,
    why: `category sweep: ${query}`,
    place: {
      id: placeId,
      displayName: name,
      formattedAddress: item.address ?? null,
      lat: item.latitude ?? item.position?.lat ?? null,
      lng: item.longitude ?? item.position?.lng ?? null,
      businessStatus,
      primaryType: type,
      types: type ? [type] : [],
    },
    serper: {
      cid: item.cid ?? null,
      rating: item.rating ?? null,
      reviewCount: item.ratingCount ?? null,
      website: item.website ?? null,
      phone: item.phoneNumber ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
    },
  });
}

console.log(`\nunique place ids seen across all cached responses: ${byPlaceId.size}`);
console.log(`  dropped, already in restaurants.google_place_id: ${dropKnown}`);
console.log(`  dropped, CLOSED_PERMANENTLY:                     ${dropClosed}`);
console.log(`  dropped, not a food type:                        ${dropNotFood}`);
console.log(`  dropped, matches data/excluded-chains.json:      ${dropChain}`);
console.log(`  survivors written to ${OUT_PATH}:                ${survivors.length}`);

await writeFile(OUT_PATH, JSON.stringify(survivors, null, 1), "utf8");

const afterLines = existsSync(SERPER_LEDGER)
  ? (await readFile(SERPER_LEDGER, "utf8")).split("\n").filter((l) => l.trim())
  : [];
const afterSpent = afterLines.reduce((acc, line) => {
  try {
    const e = JSON.parse(line);
    return acc + (Number.isFinite(e.credits) ? e.credits : 1);
  } catch {
    return acc + 1;
  }
}, 0);
console.log(`\nledger: ${SERPER_LEDGER} now holds ${afterLines.length} calls, ${afterSpent} credits of the shared ${SERPER_BUDGET}`);
console.log(`\nNext: node --env-file=.env.local scripts/import-deh.mjs --from ${OUT_PATH}          (dry)`);
console.log(`      node --env-file=.env.local scripts/import-deh.mjs --from ${OUT_PATH} --apply`);
