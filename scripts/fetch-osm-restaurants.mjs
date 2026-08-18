/**
 * Reads every named eating place in San Diego County out of OpenStreetMap.
 *
 *   node scripts/fetch-osm-restaurants.mjs --dry
 *   node scripts/fetch-osm-restaurants.mjs
 *   node scripts/fetch-osm-restaurants.mjs --with-cafes
 *
 * No API key, no quota, no per-call cost. Overpass is a public endpoint over
 * OSM's own data, which is why this exists: Yelp's free tier ended, and Yelp
 * search could never have enumerated the city anyway — `offset` caps at 240 per
 * coordinate, so a search-shaped API returns a ranked sample and calls it a
 * corpus. OSM is a registry. It can be asked for everything inside a box.
 *
 * ## What this does NOT do
 *
 * It does not write `src/data/restaurants.ts`. Output is a reviewable JSON file
 * under `osm/`, on the same principle as `menus/*.json`: reading data off a
 * third party is slow and fallible, writing it into the corpus must be exactly
 * right, and keeping a file between the two means a bad match is caught by
 * reading a diff rather than by finding a wrong restaurant on the live site.
 *
 * The loader is a separate script, and it is the one that needs care — see
 * "Matching" below for why.
 *
 * ## What OSM gives, and what it doesn't
 *
 * Real: name, coordinates, address, cuisine tag, opening hours, website, phone.
 *
 * Absent: ratings, review counts, photos. There is no rating in OSM and this
 * script invents none — no placeholder stars, no zero-that-means-unknown, and
 * no `statusLabel` busyness copy, which PRODUCT.md had removed once already.
 * A restaurant from here has no number until Google Places supplies one or
 * someone rates a plate. That gap is the honest state and belongs in the UI as
 * a gap, not as a default.
 *
 * ## Matching
 *
 * Thousands of OSM places overlap the 682 already on file, and a false merge
 * and a false split are both bad in ways that only surface later — one attaches
 * a post to the wrong restaurant, the other splits one restaurant's posts
 * across two cards. So this sorts into three buckets rather than deciding:
 *
 *   - `matched`    — names agree and within MATCH_METRES; already on file
 *   - `ambiguous`  — needs a human, for either of two reasons below
 *   - `new`        — no plausible relation to anything on file
 *
 * Only `new` is safe to import unreviewed.
 *
 * **Distance alone is not evidence.** An early version treated "close together"
 * as a reason to suspect a duplicate and put 1,179 places in `ambiguous`,
 * almost all of them pairs like "Pizzeria Luigi" and "Raglan Public House"
 * ninety-three metres apart. On a dense block every restaurant is a hundred
 * metres from a different restaurant. Proximity only discriminates *between
 * places that already share a name*.
 *
 * **Name matching has to be fuzzy, and the failures are mundane.** "South Beach
 * Bar and Grille" vs "South Beach Bar & Grille"; "Bleu Bohème" vs "Bleu Boheme"
 * (an accent); "Puesto La Jolla" vs "Puesto"; "Landini's Pizzeria" vs
 * "Landini's Pizza". The first pass missed all of these and would have imported
 * 353 duplicates of restaurants already on file.
 *
 * So `ambiguous` catches two shapes: names agree but the coordinates are far
 * apart (a chain's second branch, or one place with disagreeing coordinates),
 * and names *disagree* while sharing an identifying word within NEARBY_METRES
 * (probably one restaurant written two ways). Erring toward review is cheap.
 * Erring toward `new` is a duplicate nobody notices until someone posts to it.
 *
 * ODbL: OSM data requires attribution wherever it is displayed.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { restaurants as existing } from "../src/data/restaurants.ts";
import { regions } from "../src/data/regions.ts";
import { osmSourceKey, sourceKeyFor } from "../src/lib/sourceKey.ts";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OUT_DIR = new URL("../osm/", import.meta.url);
const OUT_PATH = new URL("../osm/san-diego.json", import.meta.url);
const DECISIONS_PATH = new URL("../osm/ambiguous-decisions.json", import.meta.url);
const RAW_PATH = new URL("../osm/overpass-raw.json", import.meta.url);

const DRY_RUN = process.argv.includes("--dry");
/** Go back to Overpass instead of using the cached response. */
const REFETCH = process.argv.includes("--refetch");
/** `amenity=cafe` is mostly coffee, which is not what this app is for. */
const WITH_CAFES = process.argv.includes("--with-cafes");

/**
 * San Diego County, same bounds as the Yelp fetcher, and the southern edge
 * matters for the same reason: a box that reaches past 32.534 starts returning
 * Tijuana. Seven Mexican businesses reached the corpus that way once and four
 * had no US location at all.
 */
const COUNTY = { minLat: 32.534, maxLat: 33.505, minLng: -117.61, maxLng: -116.08 };

/** How close two rows must be to be the same restaurant. */
const MATCH_METRES = 150;
/** Beyond this, not even worth calling ambiguous. */
const AMBIGUOUS_METRES = 400;

/* --- Overpass ------------------------------------------------------------ */

/**
 * The county in tiles rather than one query.
 *
 * A single bbox covering all of San Diego County resets the connection —
 * Overpass is a shared volunteer service and a request that size is neither
 * reliable nor polite. A 4x4 grid answers in a few seconds per tile, fails one
 * tile at a time instead of losing the whole sweep, and stays well inside the
 * endpoint's limits.
 */
const GRID = 4;

function tiles() {
  const out = [];
  const dLat = (COUNTY.maxLat - COUNTY.minLat) / GRID;
  const dLng = (COUNTY.maxLng - COUNTY.minLng) / GRID;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      out.push({
        minLat: COUNTY.minLat + i * dLat,
        maxLat: COUNTY.minLat + (i + 1) * dLat,
        minLng: COUNTY.minLng + j * dLng,
        maxLng: COUNTY.minLng + (j + 1) * dLng,
      });
    }
  }
  return out;
}

function overpassQuery(box) {
  const bbox = `${box.minLat},${box.minLng},${box.maxLat},${box.maxLng}`;
  const kinds = ["restaurant", "fast_food", ...(WITH_CAFES ? ["cafe"] : [])];
  // `out center` so ways and relations (a restaurant mapped as a building
  // outline rather than a point) come back with a usable coordinate.
  return `[out:json][timeout:120];
(
${kinds.map((k) => `  nwr["amenity"="${k}"]["name"](${bbox});`).join("\n")}
);
out tags center;`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(box, attempt = 1) {
  try {
    if (attempt > 1) await sleep(attempt * 15000);
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Not optional. Overpass answers 406 to a request with no User-Agent,
        // which reads as a malformed query rather than a missing header. It is
        // also the polite thing to send to a volunteer-run public endpoint.
        "User-Agent": "PlateMaps/1.0 (San Diego restaurant corpus; +https://platemaps.app)",
      },
      body: new URLSearchParams({ data: overpassQuery(box) }),
    });
    // 429 and 504 are Overpass saying "busy", not "wrong" — both are worth
    // waiting out rather than dropping a tile's worth of the county.
    if (res.status === 429 || res.status === 504) throw new Error(`busy (${res.status})`);
    if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).elements ?? [];
  } catch (err) {
    if (attempt >= 6) throw err;
    console.log(`    retry ${attempt} after ${(attempt + 1) * 15}s (${err.message})`);
    return fetchTile(box, attempt + 1);
  }
}

/**
 * The raw Overpass response, cached on disk.
 *
 * Overpass is free and volunteer-run, and the matching rules below took several
 * passes to get right. Re-querying the whole county to re-test a name
 * comparison is both slow and rude — it is what got this script rate-limited
 * while it was being written. The cache makes the expensive half happen once;
 * `--refetch` is how you deliberately go back for fresh data.
 */
async function fetchOsm() {
  if (!REFETCH) {
    try {
      const cached = JSON.parse(await readFile(RAW_PATH, "utf8"));
      console.log(
        `Using cached Overpass response from ${cached.fetchedAt} ` +
          `(${cached.elements.length} elements). Pass --refetch for fresh data.\n`,
      );
      return { elements: cached.elements };
    } catch {
      // No cache yet, or an unreadable one. Fetch.
    }
  }

  const grid = tiles();
  // Keyed by type/id: a way straddling a tile edge comes back from both.
  const byId = new Map();
  for (const [i, box] of grid.entries()) {
    const elements = await fetchTile(box);
    for (const el of elements) byId.set(`${el.type}/${el.id}`, el);
    process.stdout.write(
      `\r  tile ${i + 1}/${grid.length} — ${byId.size} distinct elements so far`,
    );
    await sleep(2000);
  }
  console.log("");

  const elements = [...byId.values()];
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    RAW_PATH,
    JSON.stringify({ fetchedAt: new Date().toISOString(), elements }),
    "utf8",
  );
  return { elements };
}

/* --- Geometry ------------------------------------------------------------ */

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

const subAreas = regions.flatMap((r) => r.subAreas);

/** Label by the nearest sub-area to the real coordinate — never by search origin. */
function nearestNeighborhood(coords) {
  let best = null;
  for (const area of subAreas) {
    const d = metresBetween(coords, area);
    if (!best || d < best.d) best = { d, name: area.name };
  }
  return best.name;
}

/* --- Cuisine -------------------------------------------------------------- */

/**
 * OSM writes `cuisine=mexican;taco`, lowercase and semicolon-delimited. The
 * corpus uses Yelp's title-cased vocabulary ("Sushi Bars", "Breakfast &
 * Brunch"), which the Discover filter reads, so an unmapped value would create
 * a one-restaurant facet rather than joining an existing one.
 *
 * Only the first tag is used. Unmapped values fall back to "Restaurant" — a
 * true statement — rather than being title-cased into a near-miss like
 * "Sushi" sitting next to "Sushi Bars".
 */
const CUISINE_MAP = {
  mexican: "Mexican", taco: "Tacos", tacos: "Tacos", burrito: "Mexican",
  pizza: "Pizza", italian: "Italian", sushi: "Sushi Bars", japanese: "Japanese",
  ramen: "Ramen", chinese: "Chinese", thai: "Thai", vietnamese: "Vietnamese",
  korean: "Korean", indian: "Indian", mediterranean: "Mediterranean",
  greek: "Greek", american: "American", burger: "Burgers", steak_house: "Steakhouses",
  seafood: "Seafood", barbecue: "Barbeque", bbq: "Barbeque", sandwich: "Sandwiches",
  breakfast: "Breakfast & Brunch", brunch: "Breakfast & Brunch",
  coffee_shop: "Coffee & Tea", cafe: "Coffee & Tea", asian: "Asian Fusion",
  french: "French", spanish: "Spanish", filipino: "Filipino", hawaiian: "Hawaiian",
  peruvian: "Peruvian", brazilian: "Brazilian", ethiopian: "Ethiopian",
  german: "German", vegan: "Vegan", vegetarian: "Vegetarian", deli: "Delis",
  chicken: "Chicken Shop", noodle: "Noodles", poke: "Poke", salad: "Salad",
  soup: "Soup", bakery: "Bakeries", dessert: "Desserts", ice_cream: "Ice Cream",
};

function cuisineFrom(tags) {
  const raw = (tags.cuisine ?? "").split(";")[0].trim().toLowerCase();
  return CUISINE_MAP[raw] ?? "Restaurant";
}

/* --- Normalisation -------------------------------------------------------- */

/**
 * "Farmer's Table" and "Farmers Table" are the same restaurant. So are "Bleu
 * Bohème" and "Bleu Boheme" — the accent has to come off before the strip, or
 * `è` is simply deleted and the two names differ by a letter.
 */
function normalise(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tokens(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Which words identify a business, measured rather than listed.
 *
 * A hand-written stopword list was the first attempt and it failed in both
 * directions at once. "Mission" was on it as a neighborhood, so "The Mission -
 * East Village" and "The Mission" looked unrelated. "BJ" was excluded for being
 * two characters, so "BJ's" and "BJ's Restaurant & Brewhouse" looked unrelated.
 * Meanwhile nothing on the list covered "Poway" or the hundred other local
 * words that mean nothing on their own.
 *
 * Counting is better than guessing: a word appearing across many restaurant
 * names is generic *here* regardless of what it means, and a rare one
 * identifies a business. The corpus answers the question directly, so this
 * needs no maintenance as the corpus grows into new neighborhoods.
 */
const DF_MAX = 8;
const documentFrequency = new Map();

function countTokens(names) {
  for (const name of names) {
    for (const t of new Set(tokens(name))) {
      documentFrequency.set(t, (documentFrequency.get(t) ?? 0) + 1);
    }
  }
}

function isDistinctive(token) {
  return (documentFrequency.get(token) ?? 0) <= DF_MAX;
}

function distinctive(name) {
  return new Set(tokens(name).filter(isDistinctive));
}

/**
 * Character-bigram overlap, for the variants tokens cannot see.
 *
 * "Rakiraki Ramen" and "Raki Raki Ramen" differ only in a space; "Valentines"
 * and "Valentine's" in a letter; "Bluewater Boathouse" and "Blue Water Grill"
 * in both. Word-level comparison scores all three at or near zero. Bigrams over
 * the normalised string score them high, because the characters really are
 * nearly the same.
 */
function bigrams(name) {
  const s = normalise(name);
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function diceSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/**
 * Do two restaurant names refer to the same place?
 *
 * Plain containment is not enough, and the failure is not exotic: "South Beach
 * Bar and Grille" and "South Beach Bar & Grille" are one restaurant twenty-four
 * metres apart, but `and` breaks the substring test in both directions.
 *
 * Three rules, cheapest first. Exact match after normalising; every word of the
 * shorter name appearing in the longer, which is how "Puesto" relates to
 * "Puesto La Jolla" and "Sbicca" to "Sbicca Del Mar"; then token overlap, which
 * tolerates a word being added or dropped on either side.
 */
function namesAgree(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return true;

  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;

  const [shortT, longT] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(longT);
  // A subset only counts if what it shares is actually identifying — "Pizza"
  // is a subset of "Pizza Port" and means nothing.
  if (shortT.every((t) => longSet.has(t)) && shortT.some(isDistinctive)) {
    return true;
  }

  const sa = new Set(ta);
  const sb = new Set(tb);
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += 1;
  if (shared / new Set([...sa, ...sb]).size >= 0.6) return true;

  // Spacing and plural variants that word comparison cannot reach.
  return diceSimilarity(bigrams(a), bigrams(b)) >= 0.85;
}

/**
 * Close enough, and sharing an identifying word, that a human should look.
 *
 * This is the safety net under `namesAgree`, and it exists because the first
 * version of this script put 353 probable duplicates in the `new` bucket —
 * "Landini's Pizzeria" against "Landini's Pizza", "Tajima Ramen Mercury"
 * against "Tajima". Importing those would have created a second card for a
 * restaurant that already had one and split its posts between them.
 *
 * Erring toward review is cheap; erring toward `new` is a duplicate that only
 * shows up once somebody has posted to the wrong one.
 */
const NEARBY_METRES = 75;

/**
 * Practically the same address, where the bar for suspicion drops.
 *
 * Chain names defeat the rarity test by construction: "Luna Grill" appears
 * often enough to score as generic, so "Luna Grill" and "Luna Grill Pacific
 * Highlands Ranch" read as unrelated even standing on the same spot. But a
 * repeated name is only uninformative *across* the county — at forty metres
 * there is one restaurant, and which chain it belongs to is the whole answer.
 */
const SAME_BUILDING_METRES = 40;
const MICRO_STOPWORDS = new Set(["the", "and", "for", "of", "a", "at", "on", "in"]);

function possibleDuplicate(place, known, metres) {
  if (metres > NEARBY_METRES) return false;

  const dp = distinctive(place.name);
  const dk = distinctive(known.name);
  for (const t of dp) if (dk.has(t)) return true;

  // Looser than the threshold in `namesAgree`, because this only sends a pair
  // to a human rather than merging it.
  if (diceSimilarity(bigrams(place.name), bigrams(known.name)) >= 0.6) return true;

  if (metres <= SAME_BUILDING_METRES) {
    const tk = new Set(tokens(known.name));
    return tokens(place.name).some(
      (t) => t.length >= 3 && !MICRO_STOPWORDS.has(t) && tk.has(t),
    );
  }
  return false;
}


function addressFrom(tags) {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function inCounty(lat, lng) {
  return (
    lat >= COUNTY.minLat && lat <= COUNTY.maxLat &&
    lng >= COUNTY.minLng && lng <= COUNTY.maxLng
  );
}

/* --- Run ------------------------------------------------------------------ */

console.log(
  `Querying Overpass for ${WITH_CAFES ? "restaurants, fast food and cafes" : "restaurants and fast food"} in San Diego County...`,
);

const data = await fetchOsm();
const elements = data.elements ?? [];
console.log(`${elements.length} elements returned.\n`);

const skipped = { unnamed: 0, noCoords: 0, outOfBounds: 0, duplicateInOsm: 0 };
const places = [];
const seenInOsm = new Map();

for (const el of elements) {
  const tags = el.tags ?? {};
  const name = (tags.name ?? "").trim();
  if (!name) { skipped.unnamed += 1; continue; }

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) { skipped.noCoords += 1; continue; }
  if (!inCounty(lat, lng)) { skipped.outOfBounds += 1; continue; }

  // A restaurant mapped as both a node and a building way appears twice. Same
  // normalised name within MATCH_METRES is the same place; keep the first.
  const key = normalise(name);
  const near = (seenInOsm.get(key) ?? []).find(
    (p) => metresBetween({ lat, lng }, p) < MATCH_METRES,
  );
  if (near) { skipped.duplicateInOsm += 1; continue; }
  seenInOsm.set(key, [...(seenInOsm.get(key) ?? []), { lat, lng }]);

  places.push({
    sourceKey: osmSourceKey(el.type, el.id),
    name,
    cuisine: cuisineFrom(tags),
    neighborhood: nearestNeighborhood({ lat, lng }),
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    address: addressFrom(tags),
    openingHours: tags.opening_hours ?? null,
    website: tags.website ?? tags["contact:website"] ?? null,
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    amenity: tags.amenity,
    /**
     * OSM's own chain marker. A mapper sets `brand` (often with `brand:wikidata`)
     * when a place is a branch of something, which is a far better signal than
     * counting repeated names — it catches a lone Applebee's in a neighborhood
     * where no other Applebee's happens to sit.
     *
     * Load-bearing for selection, not decoration: without it the shortlist
     * filled thin neighborhoods with two McDonald's and a Domino's, because
     * chains reliably have websites and websites score well.
     */
    brand: tags.brand ?? tags["brand:wikidata"] ?? null,
    operator: tags.operator ?? null,
    // Deliberately absent: rating, reviewCount, photo, status, statusLabel.
    // See the header — OSM has none of them and this script invents nothing.
  });
}

/* --- Match against what is already on file -------------------------------- */

// Word frequencies come from both sides at once — what counts as a generic
// word is a property of San Diego restaurant names, not of either source.
countTokens([...places.map((p) => p.name), ...existing.map((r) => r.name)]);

/*
 * Hand-reviewed calls on pairs the matcher could not decide, from
 * `osm/ambiguous-decisions.json`. Keyed by OSM source key, so a decision
 * survives re-running this script and is never silently re-litigated.
 *
 * Reviewing 42 pairs by hand took minutes and cannot be automated away: "Fish
 * Restaurant" next to "El Indio Mexican Restaurant" shares only the word
 * restaurant, while "Addison at Fairmont Grand Del Mar" sits 369m from
 * "Addison" and is the same kitchen, because that is the size of the resort.
 * No distance-and-name rule gets both right.
 *
 * A pair with no decision stays in `ambiguous` and is not imported.
 */
let decisions = {};
try {
  const file = JSON.parse(await readFile(DECISIONS_PATH, "utf8"));
  decisions = file.decisions ?? {};
  console.log(`Applying ${Object.keys(decisions).length} reviewed decisions.\n`);
} catch {
  console.log("No osm/ambiguous-decisions.json yet — every unclear pair stays unresolved.\n");
}

const known = existing.map((r) => ({
  id: r.id,
  sourceKey: sourceKeyFor(r),
  name: r.name,
  norm: normalise(r.name),
  lat: r.lat,
  lng: r.lng,
}));

const buckets = { new: [], matched: [], ambiguous: [], dropped: [] };
const resolved = {};

/*
 * Only a name agreement makes two rows candidates for being the same place.
 *
 * Distance alone does not, and an earlier version that treated it as a signal
 * put 1,179 places in the ambiguous bucket — almost all of them pairs like
 * "Pizzeria Luigi" and "Raglan Public House", ninety-three metres apart and
 * obviously unrelated. On a dense commercial block every restaurant is within a
 * hundred metres of a different restaurant, so proximity on its own carries no
 * information at all. What it does do is discriminate between two places that
 * share a name: the same branch remapped, versus a second location across town.
 */
for (const place of places) {
  // A reviewed pair skips matching entirely. The answer is already known, and
  // re-deriving it would let a later tweak to these heuristics quietly overturn
  // a human call.
  const decided = decisions[place.sourceKey];
  if (decided) {
    resolved[decided.decision] = (resolved[decided.decision] ?? 0) + 1;
    if (decided.decision === "distinct") buckets.new.push(place);
    else buckets.dropped.push({ ...place, decision: decided.decision, note: decided.note });
    continue;
  }

  let best = null;
  let suspect = null;
  for (const k of known) {
    const d = metresBetween(place, k);
    if (d > AMBIGUOUS_METRES) continue;
    if (namesAgree(place.name, k.name)) {
      if (!best || d < best.d) best = { d, k };
    } else if (possibleDuplicate(place, k, d)) {
      if (!suspect || d < suspect.d) suspect = { d, k };
    }
  }

  if (!best && suspect) {
    buckets.ambiguous.push({
      ...place,
      candidateId: suspect.k.id,
      candidateName: suspect.k.name,
      metres: Math.round(suspect.d),
      why: "shares an identifying word with a nearby row — same restaurant under another name?",
    });
  } else if (!best) {
    buckets.new.push(place);
  } else if (best.d <= MATCH_METRES) {
    buckets.matched.push({
      ...place,
      matchedTo: best.k.id,
      matchedName: best.k.name,
      metres: Math.round(best.d),
    });
  } else {
    // Same name, too far to assume. Either a chain's second branch — which is a
    // genuinely separate restaurant and should be added — or one restaurant
    // whose OSM and Yelp coordinates disagree. A human can tell in one look.
    buckets.ambiguous.push({
      ...place,
      candidateId: best.k.id,
      candidateName: best.k.name,
      metres: Math.round(best.d),
      why: "name agrees but coordinates are far apart — branch, or bad coordinates?",
    });
  }
}

/* --- Report --------------------------------------------------------------- */

const byAmenity = {};
for (const p of places) byAmenity[p.amenity] = (byAmenity[p.amenity] ?? 0) + 1;

const withAddress = places.filter((p) => p.address).length;
const withHours = places.filter((p) => p.openingHours).length;
const withCuisine = places.filter((p) => p.cuisine !== "Restaurant").length;

console.log(`Usable places:      ${places.length}`);
console.log(`  by amenity:       ${Object.entries(byAmenity).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`  with address:     ${withAddress} (${Math.round((withAddress / places.length) * 100)}%)`);
console.log(`  with hours:       ${withHours} (${Math.round((withHours / places.length) * 100)}%)`);
console.log(`  with cuisine:     ${withCuisine} (${Math.round((withCuisine / places.length) * 100)}%)`);
console.log(`\nSkipped:            unnamed ${skipped.unnamed}, no coords ${skipped.noCoords}, outside county ${skipped.outOfBounds}, dupe within OSM ${skipped.duplicateInOsm}`);
console.log(`\nAgainst the ${existing.length} already on file:`);
console.log(`  new:              ${buckets.new.length}`);
console.log(`  matched:          ${buckets.matched.length}`);
console.log(`  ambiguous:        ${buckets.ambiguous.length}   <- needs review before any import`);
if (Object.keys(resolved).length) {
  console.log(
    `  reviewed:         ${Object.entries(resolved).map(([k, v]) => `${v} ${k}`).join(", ")}`,
  );
}

if (buckets.ambiguous.length) {
  console.log(`\nFirst 15 ambiguous:`);
  for (const a of buckets.ambiguous.slice(0, 15)) {
    console.log(`  "${a.name}" ~ "${a.candidateName}" (${a.metres}m) — ${a.why}`);
  }
}

if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  OUT_PATH,
  JSON.stringify(
    {
      source: "OpenStreetMap via Overpass API",
      license: "ODbL — attribution required wherever this is displayed",
      fetchedAt: new Date().toISOString(),
      bbox: COUNTY,
      counts: {
        usable: places.length,
        new: buckets.new.length,
        matched: buckets.matched.length,
        ambiguous: buckets.ambiguous.length,
      },
      ...buckets,
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`\nWrote osm/san-diego.json`);
console.log(`Review the ambiguous bucket before loading anything.`);
