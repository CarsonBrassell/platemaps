/**
 * Resolves a county permit (or one of our own address-less rows) to a Google place.
 *
 *   node --env-file=.env.local scripts/resolve-places.mjs                      # dry run, 0 calls
 *   node --env-file=.env.local scripts/resolve-places.mjs --max-calls 5 --ids DEH2025-FFPP-020659,...
 *   node --env-file=.env.local scripts/resolve-places.mjs --max-calls 1000
 *   node --env-file=.env.local scripts/resolve-places.mjs --class other --max-calls 500
 *   node --env-file=.env.local scripts/resolve-places.mjs --existing --max-calls 500
 *
 *   node --env-file=.env.local scripts/resolve-places.mjs --via serper --probe
 *   node --env-file=.env.local scripts/resolve-places.mjs --via serper --max-calls 50
 *
 * `--via serper` swaps the source from Google Text Search Pro to Serper's
 * `/maps` endpoint - see the "serper" section below the money notes. Every
 * other flag, the matcher, the classifier and the output shape are shared
 * between the two paths; only how a candidate is fetched and mapped differs.
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
 * `--via serper`: Serper's `/maps` endpoint instead of Google Text Search Pro.
 *
 * Same ledger file `find-websites.mjs` already writes to, because both scripts
 * spend out of the same one-time 2,500-credit Serper signup allowance - it is
 * one pool, not two, and the budget check below sums every line in it
 * regardless of which script wrote it. `SERPER_BUDGET` mirrors the 2,400
 * (of 2,500) margin find-websites.mjs already uses.
 */
const SERPER_SKU = "SerperMaps";
/* A /maps call is billed 3 credits (measured 2026-09-04: response "credits": 3). */
const SERPER_CREDITS_PER_CALL = 3;
const SERPER_URL = "https://google.serper.dev/maps";
const SERPER_LEDGER = "data/serper-calls.jsonl";
const SERPER_BUDGET = Number(process.env.SERPER_BUDGET) || 52500; // 2,500 free + the 50,000 pack bought 2026-09-04; Serper itself stops at zero

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
  "bubble_tea_store",
  "juice_bar",
  "frozen_yogurt_shop",
  "creperie",
  "poke_bar",
  "cookie_shop",
  "coffee_stand",
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
const VIA = strFlag("via", "google");
const PROBE = process.argv.includes("--probe");

if (!["restaurant", "other"].includes(CLASS)) {
  console.error(`--class must be "restaurant" or "other" (got "${CLASS}")`);
  process.exit(1);
}
if (!["google", "serper"].includes(VIA)) {
  console.error(`--via must be "google" or "serper" (got "${VIA}")`);
  process.exit(1);
}
if (PROBE && VIA !== "serper") {
  console.error("--probe only makes sense with --via serper");
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
 *
 * `via` prefixes the filename ("serper_") so a permit resolved through both
 * paths (e.g. Google this month, Serper next) gets two cache files instead of
 * one path's response overwriting the other's - the response shapes are not
 * interchangeable, and reading a Serper payload back through the Google
 * matcher's assumptions (or vice versa) would silently misclassify it.
 */
function cacheFile(sourceKey, via = "google") {
  const prefix = via === "serper" ? "serper_" : "";
  return `${CACHE_DIR}/${prefix}${String(sourceKey).replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
}

async function readCache(sourceKey, via = "google") {
  const path = cacheFile(sourceKey, via);
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
 * Two conservative fallbacks tried only after pickMatch's strict rule has
 * failed every candidate - see the two loops at the end of pickMatch. Both
 * are restricted there to candidates that already pass isFoodType, so
 * neither can land on a hospital, church or storage unit that happens to
 * share a street number or a name fragment.
 */
const GENERIC_NAME_WORDS = new Set([
  "RESTAURANT", "CAFE", "CAFFE", "GRILL", "PIZZA", "DELI", "SHOP", "TACO",
  "BAR", "KITCHEN", "BAKERY", "MARKET", "INC", "LLC",
]);

/** Same normalisation matchTokens applies before tokenising, kept as an
 * ordered word list (not a Set) so the squash helpers below can look at
 * word order and word length rather than just membership. */
function squashWords(raw) {
  let s = String(raw || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") /* Ciné -> Cine, Phở -> Pho */
    .toUpperCase()
    .replace(/['’`]/g, "")
    .replace(/\b([A-Z]) (?=[A-Z]\b)/g, "$1");
  for (const [re, alias] of CHAIN_ALIASES) s = s.replace(re, alias);
  s = s.replace(/\b([A-Z]) (?=[A-Z]{2,}\b)/g, "$1");
  return s.split(/[^A-Z0-9]+/).filter(Boolean);
}

/** "ALIBABA RESTAURANT" -> "ALIBABA": drops words that are too generic to be
 * evidence on their own, so what is left is the part worth matching against. */
const squashCore = (raw) => squashWords(raw).filter((w) => !GENERIC_NAME_WORDS.has(w)).join("");
/** The first word long enough to not be noise ("TAN" and "L" are not; "TANDOOR"
 * and "RAKIRAKI" are). */
const firstLongWord = (words) => words.find((w) => w.length >= 5) ?? null;

/**
 * "GRAND AVE" and "Grand Ave" already meet in the strict rule; this is for
 * the near-number fallback, where the house number itself is allowed to be
 * off and the street name is what still has to agree.
 */
const STREET_SUFFIX_ALIASES = {
  HWY: "HIGHWAY", HY: "HIGHWAY", HIGHWAY: "HIGHWAY",
  BLVD: "BOULEVARD", BOULEVARD: "BOULEVARD",
  AVE: "AVENUE", AVENUE: "AVENUE",
  ST: "STREET", STREET: "STREET",
  RD: "ROAD", ROAD: "ROAD",
  DR: "DRIVE", DRIVE: "DRIVE",
};

/** The two words after the leading house number, suffix-normalised: "1641
 * Grand Ave, San Marcos, CA" -> "GRAND AVENUE". Empty when there is nothing
 * after the number to compare. */
function streetNameKey(addr) {
  const words = String(addr || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let i = 0;
  while (i < words.length && /^\d+$/.test(words[i])) i++;
  return words.slice(i, i + 2).map((w) => STREET_SUFFIX_ALIASES[w] ?? w).join(" ");
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

  /* Fallback 1: squashed-name match at the exact street number. "TAN DOOR"
   * at 5608 Mission Center Rd never shares a token with "Tandoor" because
   * matchTokens splits on spaces; squashing both down to bare A-Z0-9 and
   * comparing there catches it, "OPERA CAFFE"/"Operacaffe", "BARLEY
   * MASH"/"barleymash" and the rest of the run-together-vs-spaced-out names
   * in the brief. Still gated on the exact house number, so it never has to
   * fall back this hard AND across the street too. */
  const entryWords = squashWords(entry.legalName);
  const entryFull = entryWords.join("");
  const entryCore = squashCore(entry.legalName);
  const entryFirstLong = firstLongWord(entryWords);
  if (entryFull) {
    for (const c of candidates) {
      if (!isFoodType(c.primaryType)) continue;
      const formatted = String(c.formattedAddress || "");
      if (streetNumber(formatted) !== num && !new RegExp(`\\b${num}\\b`).test(formatted)) continue;
      const title = c.displayName?.text ?? "";
      const candWords = squashWords(title);
      const candFull = candWords.join("");
      if (!candFull) continue;
      const candFirstLong = firstLongWord(candWords);
      const wordHit =
        (entryFirstLong && candFull.includes(entryFirstLong)) ||
        (candFirstLong && entryFull.includes(candFirstLong));
      const coreHit =
        entryCore.length >= 5 && (candFull.includes(entryCore) || entryCore.includes(candFull));
      if (wordHit || coreHit) {
        return { place: c, why: "squashed name at the same street number" };
      }
    }
  }

  /* Fallback 2: near-number match. tokensOverlap already agreed on the name
   * above; what failed was the house number - "1639 Grand Ave" filed next
   * door to Google's "1641 Grand Ave", or a permit a few doors off its
   * neighbor. Allow up to 10 house numbers of drift, but only when the
   * street name itself still matches, so this never reaches across an
   * intersection onto a different block. */
  const wantedNum = Number(num);
  const entryStreetKey = streetNameKey(entry.address);
  if (entryStreetKey) {
    for (const c of candidates) {
      if (!isFoodType(c.primaryType)) continue;
      const formatted = String(c.formattedAddress || "");
      const candNum = streetNumber(formatted);
      if (!candNum) continue;
      const diff = Math.abs(Number(candNum) - wantedNum);
      if (!Number.isFinite(diff) || diff > 10) continue;
      if (streetNameKey(formatted) !== entryStreetKey) continue;
      const title = c.displayName?.text ?? "";
      if (!tokensOverlap(wanted, matchTokens(title))) continue;
      return { place: c, why: "shared name word within 10 house numbers on the same street" };
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

/* --- serper --------------------------------------------------------------- */

/**
 * Permit name + street address + city, San Diego by default when the permit
 * carries no city of its own.
 */
function serperQueryFor(entry) {
  const city = entry.city || "San Diego";
  return `${entry.legalName} ${entry.address}, ${city}, CA`.replace(/\s+/g, " ").trim();
}

/**
 * Maps a raw Serper `/maps` result into the same candidate shape Google's
 * Text Search returns, so `pickMatch` and `classify` run unforked over either
 * source. Every field is read defensively (Serper's field names are not
 * documented as a stable contract the way Google's are) and nothing is
 * invented: a candidate with no place id at all comes back with `id: null`,
 * which the caller turns into `unmatched-no-id` rather than a guess built off
 * `cid`.
 */
function serperCandidate(item) {
  const id = item.placeId ?? item.place_id ?? null;
  /* Serper labels types in English ("Mexican restaurant", "Bar & grill",
   * "Açaí shop"); classify() and FOOD_TYPES speak Google's snake_case
   * ("mexican_restaurant", "bar_and_grill", "acai_shop"). Normalise here or
   * every cuisine is filed not-food - which is what happened to ~500 permits
   * on the first Serper run (2026-09-04). */
  const label = item.type ?? item.category ?? null;
  const type = label
    ? String(label).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    : null;
  return {
    id,
    displayName: { text: item.title ?? null },
    formattedAddress: item.address ?? null,
    location: {
      latitude: item.latitude ?? item.position?.lat ?? null,
      longitude: item.longitude ?? item.position?.lng ?? null,
    },
    /* Serper's /maps payload has no documented businessStatus field; map the
     * ones third parties have reported seeing and fall back to null (never
     * "not closed") rather than assume a bare absence means open. */
    businessStatus: item.businessStatus ?? (item.permanentlyClosed ? "CLOSED_PERMANENTLY" : null),
    primaryType: type,
    types: type ? [type] : [],
    /* Carried through to the resolved entry's `serper{}` - see resolveOne. */
    serper: {
      cid: item.cid ?? null,
      rating: item.rating ?? null,
      reviewCount: item.ratingCount ?? null,
      website: item.website ?? null,
      phone: item.phoneNumber ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
    },
  };
}

async function searchSerperMaps(apiKey, entry) {
  const q = serperQueryFor(entry);
  const started = new Date().toISOString();
  let http = 0;
  let json = null;
  let error = null;
  try {
    const res = await fetch(SERPER_URL, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, gl: "us", hl: "en" }),
    });
    http = res.status;
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }

  const results = json?.places ?? [];
  /* Ledger first, always - same discipline as searchText above. Line shape
   * matches the brief: query, credits, result count, timestamp. `credits`
   * comes off Serper's own response when present; a call that errored before
   * any credits field arrived is recorded as 1, the worst case, so the shared
   * budget never under-counts. */
  await appendFile(
    SERPER_LEDGER,
    `${JSON.stringify({
      ts: started,
      sku: SERPER_SKU,
      query: q,
      sourceKey: entry.sourceKey,
      credits: Number.isFinite(json?.credits) ? json.credits : 1,
      results: results.length,
      ...(error ? { error } : {}),
    })}\n`,
    "utf8",
  );

  return { json, error, query: q, fetchedAt: started };
}

/** Masks anything that looks like a key name, truncates everything else to 40
 * chars. Used only by `--probe`'s printout - see the brief for why. */
function probeValue(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}
function probeKey(k) {
  return /key/i.test(k) ? "***" : k;
}
function printProbe(json) {
  console.log("\ntop-level keys:");
  for (const [k, v] of Object.entries(json ?? {})) {
    console.log(`  ${probeKey(k)}: ${probeValue(v)}`);
  }
  const first = json?.places?.[0];
  console.log("\nfirst result keys:");
  if (!first) {
    console.log("  (no results)");
    return;
  }
  for (const [k, v] of Object.entries(first)) {
    console.log(`  ${probeKey(k)}: ${probeValue(v)}`);
  }
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

console.log(
  `resolve-places  mode=${EXISTING_MODE ? "existing" : `permits (--class ${CLASS})`}  via=${VIA}`,
);
console.log(`  entries in scope:        ${entries.length}`);

let apiKey;

if (VIA === "serper") {
  /* One shared, one-time 2,500-credit pool - find-websites.mjs spends from the
   * same ledger file, so "spent" sums every line in it, not just this SKU's. */
  const rawLines = existsSync(SERPER_LEDGER)
    ? (await readFile(SERPER_LEDGER, "utf8")).split("\n").filter((l) => l.trim())
    : [];
  const serperSpent = rawLines.reduce((acc, line) => {
    try {
      const e = JSON.parse(line);
      return acc + (Number.isFinite(e.credits) ? e.credits : 1);
    } catch {
      return acc + 1;
    }
  }, 0);

  console.log(
    `  Serper credits used (shared with find-websites.mjs): ${serperSpent} of ${SERPER_BUDGET}`,
  );
  console.log(
    `  --max-calls:             ${MAX_CALLS}${MAX_CALLS === 0 ? "  (default - no request will be made)" : ""}`,
  );

  if (!PROBE && serperSpent + MAX_CALLS * SERPER_CREDITS_PER_CALL > SERPER_BUDGET) {
    console.error(
      `\nRefusing to run: ${serperSpent} + ${MAX_CALLS} x ${SERPER_CREDITS_PER_CALL} credits = ${serperSpent + MAX_CALLS * SERPER_CREDITS_PER_CALL} would pass the ` +
        `${SERPER_BUDGET}-credit shared free-tier cap.`,
    );
    console.error(`Lower --max-calls, or account for what find-websites.mjs has already spent.`);
    process.exit(1);
  }

  apiKey = process.env.SERPER_API_KEY || "";
  if ((MAX_CALLS > 0 || PROBE) && !DRY_RUN && !apiKey) {
    console.error("\nSERPER_API_KEY is not set. Re-run with --env-file=.env.local");
    process.exit(1);
  }
} else {
  const ledger = await ledgerEntries();
  const month = thisMonth();
  const proThisMonth = ledger.filter((e) => e.sku === SKU && String(e.ts).startsWith(month)).length;

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

  apiKey = process.env.GOOGLE_PLACES_API_KEY;
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
}

await mkdir(CACHE_DIR, { recursive: true });

/**
 * `--probe`: exactly one live `/maps` call, against the first queue entry that
 * has no cache yet, printed and thrown away. This is how Calvin checks
 * `placeId` is really in the response before `--max-calls` buys anything.
 * Nothing here touches `deh-resolved.json`.
 */
if (PROBE) {
  const target = entries.find((e) => !existsSync(cacheFile(e.sourceKey, "serper")));
  if (!target) {
    console.log("\nEvery entry in scope already has a Serper cache file; nothing to probe.");
    process.exit(0);
  }
  if (DRY_RUN) {
    console.log(`\n--dry with --probe: would call Serper /maps for ${target.sourceKey}. No call made.`);
    console.log(`  query: ${serperQueryFor(target)}`);
    process.exit(0);
  }
  console.log(`\nprobe: one live Serper /maps call for ${target.sourceKey}`);
  const { json, query } = await searchSerperMaps(apiKey, target);
  console.log(`query: ${query}`);
  printProbe(json);
  console.log("\n--probe made its one call and wrote nothing to deh-resolved.json.");
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const resolved = [];
let calls = 0;
let fromCache = 0;
let skippedNoBudget = 0;

let unmatchedNoId = 0;

for (const entry of entries) {
  let cached = await readCache(entry.sourceKey, VIA);
  /* A permit already answered by the other path is not bought again: the
   * Google cache serves a Serper run and vice versa. Which adapter applies is
   * decided by the cached response's own sku, not by --via. */
  if (!cached) cached = await readCache(entry.sourceKey, VIA === "serper" ? "google" : "serper");

  if (!cached) {
    if (DRY_RUN || calls >= MAX_CALLS) {
      skippedNoBudget += 1;
      continue;
    }
    if (VIA === "serper") {
      const { json, error, query, fetchedAt } = await searchSerperMaps(apiKey, entry);
      calls += 1;
      cached = {
        sourceKey: entry.sourceKey,
        query,
        fetchedAt,
        sku: SERPER_SKU,
        ...(error ? { error } : {}),
        places: json?.places ?? [],
        ...(json?.error ? { serperError: json.error } : {}),
      };
    } else {
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
    }
    /* Cache before anything is decided about it, so a crash inside the matcher
     * never costs the call again. */
    await writeFile(cacheFile(entry.sourceKey, VIA), JSON.stringify(cached, null, 1), "utf8");
    await sleep(120);
  } else {
    fromCache += 1;
  }

  const rawCandidates = cached.places ?? [];
  /* Google's Text Search rows are already in the shape pickMatch/classify
   * expect; Serper's need the adapter. Once mapped, the rest of this loop -
   * pickMatch, classify, the unmatched branch - runs unforked over either. */
  const candidates = cached.sku === SERPER_SKU ? rawCandidates.map(serperCandidate) : rawCandidates;
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

  /* Serper-only: a matched result with no placeId and only a cid is not
   * classifiable - cid is not a place id and nothing here invents one from
   * it. Reported separately so it is easy to tell apart from a genuine
   * unmatched permit in the run's tally. */
  if (VIA === "serper" && place.id == null) {
    unmatchedNoId += 1;
    resolved.push({
      ...entry,
      status: "unmatched-no-id",
      why: "matched on address/name but Serper returned no placeId (only cid)",
      serper: place.serper,
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
    ...(VIA === "serper" ? { serper: place.serper } : {}),
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

/* Merge, never replace: a run scoped to one --class (or one --via) must not
 * drop what earlier runs resolved. This run's verdicts win for the keys it
 * touched; everything else in the file survives. (A --class restaurant Serper
 * run on 2026-09-04 rewrote the file with 30 entries and lost 1,282.) */
let previous = [];
try { previous = JSON.parse(await readFile(outPath, "utf8")); } catch {}
const touched = new Set(resolved.map((r) => r.sourceKey));
const merged = [...previous.filter((r) => !touched.has(r.sourceKey)), ...resolved];
await writeFile(outPath, JSON.stringify(merged, null, 1), "utf8");
console.log(`\nwrote ${outPath} (${merged.length} entries; ${resolved.length} from this run)`);
if (unmatchedNoId) {
  console.log(`(${unmatchedNoId} of those are unmatched-no-id: matched, but Serper gave no placeId.)`);
}

if (VIA === "serper") {
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
  console.log(
    `ledger: ${SERPER_LEDGER} now holds ${afterLines.length} calls, ${afterSpent} credits of the shared ${SERPER_BUDGET}`,
  );
} else {
  const afterLedger = await ledgerEntries();
  const month = thisMonth();
  const afterMonth = afterLedger.filter((e) => e.sku === SKU && String(e.ts).startsWith(month)).length;
  console.log(`ledger: ${LEDGER} now holds ${afterLedger.length} calls, ${afterMonth} of them in ${month}`);
}
