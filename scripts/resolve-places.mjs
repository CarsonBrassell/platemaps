/**
 * Resolves a county permit (or one of our own address-less rows) to a Google place.
 *
 *   node --env-file=.env.local scripts/resolve-places.mjs                      # dry run, 0 calls
 *   node --env-file=.env.local scripts/resolve-places.mjs --max-calls 5 --ids DEH2025-FFPP-020659,...
 *   node --env-file=.env.local scripts/resolve-places.mjs --max-calls 1000
 *   node --env-file=.env.local scripts/resolve-places.mjs --class other --max-calls 500
 *   node --env-file=.env.local scripts/resolve-places.mjs --existing --max-calls 500
 *
 * ## Why a Google lookup and not a geocoder
 *
 * The county publishes an address and no coordinates, so something has to turn
 * "1234 MAIN ST, EL CAJON" into a pin. A geocoder does that and stops there,
 * and a pin is not enough to put a restaurant on this site: `publish-check.mjs`
 * will not list a row without a name a human would recognise, and the permit
 * gives us "SDCE FOOD SERVICES INC" where the sign over the door says "Clems
 * Station". One Text Search call returns the display name, the coordinates, the
 * formatted address, whether the business is permanently closed and what kind
 * of business Google thinks it is - which decides import, naming, closure and
 * cuisine at once.
 *
 * ## Money, and the three things that stop it being spent
 *
 * The field mask below is exactly the **Text Search Pro** SKU: 5,000 free calls
 * per calendar month, $32 per 1,000 after that. Adding `rating`, `websiteUri`,
 * `regularOpeningHours`, `nationalPhoneNumber` or `photos` to it moves the
 * whole call to Enterprise and costs real money for fields this stage does not
 * need. **Do not add a field to FIELD_MASK.** If a later stage needs a rating,
 * it asks Place Details for it separately - see the note in enrich-google.mjs
 * about why splitting is cheaper.
 *
 *  1. `--max-calls` defaults to **0**. The script runs, reads the cache,
 *     classifies everything it already knows and reports - and makes no
 *     request at all - unless a cap is passed explicitly.
 *  2. Every call is appended to `data/google-calls.jsonl` before the next one
 *     is made. That ledger, not a counter in memory, is what the monthly check
 *     reads, so it survives a crash, a re-run and a second terminal.
 *  3. The month's Pro calls plus the requested cap must stay under
 *     MONTHLY_PRO_BUDGET (4,900 of the 5,000 free). Over that, the script
 *     refuses to start rather than trimming the cap silently.
 *
 * ## The cache is the point
 *
 * Every response is written to `data/places-cache/<sourceKey>.json` before it
 * is looked at, including the ones that match nothing. A permit that has a
 * cache file is never requested again, by this run or any future one, so the
 * 4,540-permit queue costs 4,540 calls in total no matter how many times the
 * matching rules are changed and re-run. Delete a cache file to re-ask.
 */

import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { nameTokens, QUEUE_PATH } from "./verify-coverage.mjs";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Text Search **Pro**. Every field here is on that SKU; none is on Enterprise.
 * Read the money note in the header before touching this.
 */
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.primaryType,places.types";

const SKU = "TextSearchPro";
const LEDGER = "data/google-calls.jsonl";
const CACHE_DIR = "data/places-cache";
const RESOLVED_PATH = "data/deh-resolved.json";
const EXISTING_RESOLVED_PATH = "data/existing-resolved.json";

/** Google's free monthly allowance is 5,000 Pro calls; this leaves 100 spare. */
const MONTHLY_PRO_BUDGET = 4900;
const COST_PER_1K_OVER = 32;

/**
 * Google `primaryType` values that mean "a person can eat or drink here".
 *
 * The permit list contains laundromats with a coffee pot, gas stations, golf
 * clubs and school district offices, all holding a food permit and none of them
 * a restaurant. Google's own classification is a better filter than any regex
 * over a legal name, so the type decides - and a type outside this set is
 * reported by name in the output rather than silently dropped, because the way
 * this set gets better is somebody reading the list of what it rejected.
 */
const FOOD_TYPES = new Set([
  "restaurant",
  "cafe",
  "cafeteria",
  "coffee_shop",
  "bar",
  "bar_and_grill",
  "pub",
  "bakery",
  "meal_takeaway",
  "meal_delivery",
  "fast_food_restaurant",
  "sandwich_shop",
  "pizza_restaurant",
  "ice_cream_shop",
  "dessert_shop",
  "dessert_restaurant",
  "donut_shop",
  "bagel_shop",
  "juice_shop",
  "tea_house",
  "brewery",
  "wine_bar",
  "food_court",
  "diner",
  "deli",
  "buffet_restaurant",
  "breakfast_restaurant",
  "brunch_restaurant",
  "fine_dining_restaurant",
  "steak_house",
  "seafood_restaurant",
  "sushi_restaurant",
  "ramen_restaurant",
  "pizzeria",
  "barbecue_restaurant",
  "hamburger_restaurant",
  "chicken_restaurant",
  "acai_shop",
  "candy_store",
  "chocolate_shop",
  /* Added after the 2026-09-02 run, from the not-food breakdown. Each of
   * these held a county *restaurant* permit, which is the tiebreak: a
   * "winery" or "sports_bar" with a food permit serves food. Markets,
   * grocers, caterers, hotels and venues stay out — a pin on a hotel is not
   * a restaurant, and those need a second pass that asks for the restaurant
   * inside them. */
  "pizza_delivery",
  "cake_shop",
  "pastry_shop",
  "salad_shop",
  "bistro",
  "sports_bar",
  "cocktail_bar",
  "hookah_bar",
  "irish_pub",
  "beer_garden",
  "brewpub",
  "winery",
  "food",
  "confectionery",
  // The cuisine-specific *_restaurant types Google publishes.
  "american_restaurant",
  "african_restaurant",
  "afghani_restaurant",
  "asian_restaurant",
  "brazilian_restaurant",
  "chinese_restaurant",
  "french_restaurant",
  "greek_restaurant",
  "hamburger_restaurant",
  "indian_restaurant",
  "indonesian_restaurant",
  "italian_restaurant",
  "japanese_restaurant",
  "korean_restaurant",
  "lebanese_restaurant",
  "mediterranean_restaurant",
  "mexican_restaurant",
  "middle_eastern_restaurant",
  "pizza_restaurant",
  "spanish_restaurant",
  "thai_restaurant",
  "turkish_restaurant",
  "vegan_restaurant",
  "vegetarian_restaurant",
  "vietnamese_restaurant",
]);

/* --- flags ---------------------------------------------------------------- */

function numFlag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}
function strFlag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const MAX_CALLS = numFlag("max-calls", 0);
const DRY_RUN = process.argv.includes("--dry");
const EXISTING_MODE = process.argv.includes("--existing");
const CLASS = strFlag("class", "restaurant");
const ONLY_IDS = strFlag("ids", null);

if (!["restaurant", "other"].includes(CLASS)) {
  console.error(`--class must be "restaurant" or "other" (got "${CLASS}")`);
  process.exit(1);
}

/* --- ledger --------------------------------------------------------------- */

/**
 * Every Pro call ever made, one JSON object per line. Written before the next
 * request goes out, so a killed process still leaves an accurate count.
 */
async function ledgerEntries() {
  if (!existsSync(LEDGER)) return [];
  const text = await readFile(LEDGER, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function recordCall(entry) {
  await mkdir("data", { recursive: true });
  await appendFile(LEDGER, `${JSON.stringify(entry)}\n`, "utf8");
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

/* --- cache ---------------------------------------------------------------- */

/**
 * `deh:DEH2025-FFPP-020659` -> `deh_DEH2025-FFPP-020659.json`.
 *
 * A colon is not a legal character in a Windows filename, and this repo lives
 * on Windows. The mapping is injective over the characters source keys
 * actually use, so nothing collides.
 */
function cacheFile(sourceKey) {
  return `${CACHE_DIR}/${String(sourceKey).replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
}

async function readCache(sourceKey) {
  const path = cacheFile(sourceKey);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/* --- matching ------------------------------------------------------------- */

/** The first run of digits in an address: "1234 MAIN ST STE 5" -> "1234". */
function streetNumber(addr) {
  const m = String(addr || "").match(/\b(\d{1,6})\b/);
  return m ? m[1] : null;
}

/**
 * Name words for matching a county name against a Google name.
 *
 * The county drops apostrophes and Google keeps them: "ROBERTOS TACO SHOP"
 * against "Roberto's Taco Shop", "ANTHONYS" against "Anthony's Fish Grotto",
 * "CHILIS #454" against "Chili's". `nameTokens` splits on the apostrophe, so
 * the county's ROBERTOS never met Google's ROBERTO and 800 real restaurants
 * came back "no candidate agreed on both number and name" on the first full
 * run (2026-09-02). Strip the apostrophe before tokenising, and compare
 * possessive-insensitively so ROBERTOS still meets ROBERTO. The county also
 * spaces initials ("P B PUB") that Google joins ("PB Pub"): join single
 * letters before tokenising.
 */
/**
 * Chains whose county name and Google name share no word at all. Both sides
 * are rewritten to the short form before tokenising, so the rest of the
 * matcher never has to know.
 */
const CHAIN_ALIASES = [
  [/\bINTERNATIONAL HOUSE OF PANCAKES\b/g, "IHOP"],
  [/\bKENTUCKY FRIED CHICKEN\b/g, "KFC"],
  [/\bJACK IN THE BOX\b/g, "JACKINTHEBOX"],
  [/\bIN N OUT\b/g, "INNOUT"],
  [/\bCARLS JR\b/g, "CARLSJR"],
];

function matchTokens(raw) {
  let s = String(raw || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") /* Ciné -> Cine, Phở -> Pho */
    .toUpperCase()
    .replace(/['’`]/g, "")
    .replace(/\b([A-Z]) (?=[A-Z]\b)/g, "$1");
  for (const [re, alias] of CHAIN_ALIASES) s = s.replace(re, alias);
  /* "D AMATOS" -> "DAMATOS", so it meets Google's "D'Amatos" once the
   * apostrophe is gone. Symmetric: both names go through here. */
  s = s.replace(/\b([A-Z]) (?=[A-Z]{2,}\b)/g, "$1");
  const ident = nameTokens(s);
  /* "HOUSE OF PIZZA", "TAVERN", "THE DELI": every word is a stop word, so
   * nothing identifying survives. Keep the plain words too - against a
   * candidate at the same street number, "TAVERN" meeting "Tavern at the
   * Beach" is evidence, not noise. tokensOverlap decides which set to use. */
  ident.raw = new Set(s.replace(/[^A-Z0-9 ]+/g, " ").split(" ").filter((w) => w.length > 1));
  return ident;
}

function tokensOverlap(a, b) {
  const strip = (w) => (w.length > 3 && w.endsWith("S") ? w.slice(0, -1) : w);
  const overlap = (x, y) => {
    const ys = new Set([...y].map(strip));
    for (const w of x) if (ys.has(strip(w))) return true;
    return false;
  };
  if (a.size && b.size) return overlap(a, b);
  /* One side is all stop words: fall back to plain words on both sides. */
  return overlap(a.raw ?? a, b.raw ?? b);
}

/**
 * Picks the candidate that is the permit's business, or null.
 *
 * Two ways in, and the second is the one that matters for this dataset. The
 * county files a permit under whatever entity signed it, so thousands of rows
 * read "MARIA G HERNANDEZ" or "SDCE FOOD SERVICES INC" and share not one token
 * with the name on the awning. When the record name IS the owner name, there is
 * no business name to compare and the street number has to carry the match
 * alone - which is safe, because the number came off the same permit as the
 * query and Google returned this candidate for that exact string.
 *
 * Everything else demands both: the number must appear in Google's formatted
 * address AND at least one identifying word must be shared.
 */
function pickMatch(entry, candidates) {
  const num = streetNumber(entry.address);
  if (!num) return { place: null, why: "permit has no street number" };
  const wanted = matchTokens(entry.legalName);
  const legalNameOnly =
    Boolean(entry.ownerName) &&
    String(entry.legalName).trim().toUpperCase() === String(entry.ownerName).trim().toUpperCase();

  for (const c of candidates) {
    const formatted = String(c.formattedAddress || "");
    if (streetNumber(formatted) !== num && !new RegExp(`\\b${num}\\b`).test(formatted)) continue;
    const title = c.displayName?.text ?? "";
    if (tokensOverlap(wanted, matchTokens(title))) {
      return { place: c, why: "street number and a shared name word" };
    }
    if (legalNameOnly) {
      return { place: c, why: "street number; permit is filed under the owner's name" };
    }
  }
  return {
    place: null,
    why: candidates.length ? "no candidate agreed on both number and name" : "Google returned nothing",
  };
}

/* --- classification ------------------------------------------------------- */

/**
 * Google's primaryType vocabulary is open-ended on the cuisine side:
 * `hawaiian_restaurant`, `filipino_restaurant`, `chicken_wings_restaurant`,
 * `korean_barbecue_restaurant` and a hundred more. The first full run
 * (2026-09-02) filed 180-odd permits as not-food purely because the set
 * above did not list their cuisine. Anything Google calls a `*_restaurant`
 * is a restaurant; the explicit set is for the types that do not say so.
 */
function isFoodType(type) {
  if (!type) return false;
  if (FOOD_TYPES.has(type)) return true;
  return /_restaurant$/.test(type);
}

function classify(place, knownPlaceIds) {
  if (knownPlaceIds.has(place.id)) return { verdict: "duplicate", detail: "google_place_id already in restaurants" };
  if (place.businessStatus === "CLOSED_PERMANENTLY") return { verdict: "closed", detail: "CLOSED_PERMANENTLY" };
  const type = place.primaryType ?? null;
  /* No primaryType at all ("point_of_interest, establishment" and nothing
   * else) is Google declining to say, not Google saying "not food". The
   * permit says restaurant; KNB Bistro was filed not-food this way on
   * 2026-09-02. The permit wins when Google abstains. */
  if (type === null) {
    /* ...but only when the name itself says food. The same abstention covers
     * Pacers and Expose (strip clubs with a kitchen permit), Illumina and
     * Avidity (corporate cafeterias) and a water-refill shop. */
    const named = String(place.displayName?.text ?? place.displayName ?? "");
    if (/\b(BISTRO|CAFE|CAFÉ|GRILL|RESTAURANT|KITCHEN|PIZZA|PIZZERIA|TACO|TACOS|SUSHI|BBQ|BARBECUE|DELI|BAKERY|DINER|EATERY|NOODLE|RAMEN|PHO|BURGER|BURRITO|SANDWICH|BREWING|BREWERY|TAVERN|PUB|CANTINA|TAQUERIA|COCINA|MARISCOS|WINGS|CHICKEN|SEAFOOD|STEAK|CREPE|WAFFLE|PANCAKE|DONUT|BAGEL|COFFEE|TEA|BOBA|JUICE|GELATO|ICE CREAM)\b/i.test(named)) {
      return { verdict: "import", detail: "(no primaryType; permit and name say restaurant)" };
    }
    return { verdict: "not-food", detail: "(no primaryType)" };
  }
  if (!isFoodType(type)) {
    return { verdict: "not-food", detail: type };
  }
  return { verdict: "import", detail: type };
}

/* --- the call ------------------------------------------------------------- */

function queryFor(entry) {
  return [entry.legalName, entry.address, entry.city, "CA"].filter(Boolean).join(" ");
}

async function searchText(apiKey, entry) {
  const textQuery = queryFor(entry);
  const started = new Date().toISOString();
  let http = 0;
  let json = null;
  let error = null;
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, maxResultCount: 5, regionCode: "US" }),
    });
    http = res.status;
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }

  /* Ledger first, always. A call that happened and was not recorded is a call
   * the monthly budget check cannot see. */
  await recordCall({
    ts: started,
    sku: SKU,
    query: textQuery,
    sourceKey: entry.sourceKey,
    http,
    results: json?.places?.length ?? 0,
    ...(error ? { error } : {}),
  });

  return { json, error, textQuery, fetchedAt: started };
}

/* --- inputs --------------------------------------------------------------- */

async function loadQueue() {
  if (!existsSync(QUEUE_PATH)) {
    console.error(`${QUEUE_PATH} is missing. Run:`);
    console.error(`  node --env-file=.env.local scripts/verify-coverage.mjs --profile`);
    process.exit(1);
  }
  const all = JSON.parse(await readFile(QUEUE_PATH, "utf8"));
  let rows = all.filter((q) => q.permitClass === CLASS);
  if (ONLY_IDS) {
    const wanted = new Set(ONLY_IDS.split(",").map((s) => s.trim()).filter(Boolean));
    rows = all.filter((q) => wanted.has(q.recordId) || wanted.has(q.sourceKey));
  }
  return rows;
}

/**
 * `--existing`: our own rows that never got a place id.
 *
 * Same resolver, different input. These 834 have a name and usually an address
 * but no `google_place_id`, so they cannot be deduped against an incoming
 * permit by id and they cannot have their address repaired. Resolving them
 * first is what stops the import creating a second copy of a restaurant we
 * already hold - the token matcher catches most of it, `place_id` catches the
 * rest.
 */
async function loadExisting(sql) {
  /* With a call budget smaller than the scope (350 of ~834, 2026-09), the
   * order picked here decides who gets resolved this month. A listed row or
   * one that already carries a real menu is worth more to dedupe-and-repair
   * than an unlisted stub with nothing on it, so those go first; `id` breaks
   * ties for a stable, re-runnable order. */
  const rows = await sql`
    SELECT r.id::text, r.source_key, r.name, r.address, r.city,
           r.listed, COUNT(d.id)::int AS dish_count
    FROM restaurants r
    LEFT JOIN dishes d ON d.restaurant_id = r.id
    WHERE r.google_place_id IS NULL AND r.hold_reason IS NULL
    GROUP BY r.id
    ORDER BY r.listed DESC, COUNT(d.id) DESC, r.id`;
  return rows.map((r) => ({
    sourceKey: r.source_key || `row:${r.id}`,
    restaurantId: r.id,
    recordId: null,
    legalName: r.name,
    address: r.address,
    city: r.city,
    ownerName: null,
    permitClass: "existing",
    institutional: false,
    aliases: [],
  }));
}

/* --- run ------------------------------------------------------------------ */

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const entries = EXISTING_MODE ? await loadExisting(sql) : await loadQueue();
const outPath = EXISTING_MODE ? EXISTING_RESOLVED_PATH : RESOLVED_PATH;

const placeIdRows = await sql`
  SELECT id::text, name, google_place_id FROM restaurants WHERE google_place_id IS NOT NULL`;
const knownPlaceIds = new Set(placeIdRows.map((r) => r.google_place_id));
const rowByPlaceId = new Map(placeIdRows.map((r) => [r.google_place_id, r]));

const ledger = await ledgerEntries();
const month = thisMonth();
const proThisMonth = ledger.filter((e) => e.sku === SKU && String(e.ts).startsWith(month)).length;

console.log(`resolve-places  mode=${EXISTING_MODE ? "existing" : `permits (--class ${CLASS})`}`);
console.log(`  entries in scope:        ${entries.length}`);
console.log(`  ${SKU} calls in ${month}: ${proThisMonth} of ${MONTHLY_PRO_BUDGET} budgeted (5,000 free)`);
console.log(`  --max-calls:             ${MAX_CALLS}${MAX_CALLS === 0 ? "  (default - no request will be made)" : ""}`);

if (proThisMonth + MAX_CALLS > MONTHLY_PRO_BUDGET) {
  console.error(
    `\nRefusing to run: ${proThisMonth} + ${MAX_CALLS} = ${proThisMonth + MAX_CALLS} would pass the ` +
      `${MONTHLY_PRO_BUDGET}-call budget for ${month}.`,
  );
  console.error(
    `Past 5,000 free calls this SKU costs $${COST_PER_1K_OVER} per 1,000. Wait for the next ` +
      `calendar month or lower --max-calls.`,
  );
  process.exit(1);
}

await mkdir(CACHE_DIR, { recursive: true });

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (MAX_CALLS > 0 && !DRY_RUN) {
  if (!apiKey) {
    console.error("\nGOOGLE_PLACES_API_KEY is not set. Re-run with --env-file=.env.local");
    process.exit(1);
  }
  /* Same shape guard as enrich-google.mjs: this repo has already sent a
   * Postgres password to a third party once because a key slot held the wrong
   * value. Check before spending. */
  if (!/^AIza[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    console.error(
      `\nGOOGLE_PLACES_API_KEY does not look like a Google key (got ${apiKey.length} characters; ` +
        `expected ~39 beginning "AIza"). Refusing to send it.`,
    );
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const resolved = [];
let calls = 0;
let fromCache = 0;
let skippedNoBudget = 0;

for (const entry of entries) {
  let cached = await readCache(entry.sourceKey);

  if (!cached) {
    if (DRY_RUN || calls >= MAX_CALLS) {
      skippedNoBudget += 1;
      continue;
    }
    const { json, error, textQuery, fetchedAt } = await searchText(apiKey, entry);
    calls += 1;
    cached = {
      sourceKey: entry.sourceKey,
      query: textQuery,
      fetchedAt,
      sku: SKU,
      fieldMask: FIELD_MASK,
      ...(error ? { error } : {}),
      places: json?.places ?? [],
      ...(json?.error ? { googleError: json.error } : {}),
    };
    /* Cache before anything is decided about it, so a crash inside the matcher
     * never costs the call again. */
    await writeFile(cacheFile(entry.sourceKey), JSON.stringify(cached, null, 1), "utf8");
    await sleep(120);
  } else {
    fromCache += 1;
  }

  const candidates = cached.places ?? [];
  const { place, why } = pickMatch(entry, candidates);

  if (!place) {
    resolved.push({
      ...entry,
      status: "unmatched",
      why,
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.displayName?.text ?? null,
        address: c.formattedAddress ?? null,
        primaryType: c.primaryType ?? null,
      })),
    });
    continue;
  }

  const { verdict, detail } = classify(place, knownPlaceIds);
  resolved.push({
    ...entry,
    status: verdict,
    detail,
    why,
    place: {
      id: place.id,
      displayName: place.displayName?.text ?? null,
      formattedAddress: place.formattedAddress ?? null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      businessStatus: place.businessStatus ?? null,
      primaryType: place.primaryType ?? null,
      types: place.types ?? [],
    },
    ...(verdict === "duplicate"
      ? { existingRestaurantId: rowByPlaceId.get(place.id)?.id ?? null,
          existingName: rowByPlaceId.get(place.id)?.name ?? null }
      : {}),
  });
}

/* --- report --------------------------------------------------------------- */

const tally = resolved.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});

console.log(`\ncalls made this run: ${calls}    served from cache: ${fromCache}`);
if (skippedNoBudget) {
  console.log(`not attempted (no cache, no call budget left): ${skippedNoBudget}`);
}

console.log(`\nverdicts over the ${resolved.length} entries that had a response:`);
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)}  ${k}`);
}

const notFood = resolved.filter((r) => r.status === "not-food");
if (notFood.length) {
  const byType = notFood.reduce((acc, r) => {
    acc[r.detail] = (acc[r.detail] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nnot-food, by Google primaryType (read this before trusting FOOD_TYPES):`);
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${String(n).padStart(6)}  ${t}`);
  }
}

await writeFile(outPath, JSON.stringify(resolved, null, 1), "utf8");
console.log(`\nwrote ${outPath} (${resolved.length} entries)`);

const afterLedger = await ledgerEntries();
const afterMonth = afterLedger.filter((e) => e.sku === SKU && String(e.ts).startsWith(month)).length;
console.log(`ledger: ${LEDGER} now holds ${afterLedger.length} calls, ${afterMonth} of them in ${month}`);
