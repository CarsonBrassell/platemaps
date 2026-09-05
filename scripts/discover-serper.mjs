/**
 * Finds restaurants that none of our three sources carry, through Google Maps
 * via Serper.
 *
 *   node --env-file=.env.local scripts/discover-serper.mjs --fetch [--limit N]
 *   node --env-file=.env.local scripts/discover-serper.mjs --report
 *   node --env-file=.env.local scripts/discover-serper.mjs --import [--dry]
 *
 * Why this exists: "The Other Side Bar and Grill" (6690 Mission Gorge Rd Ste D,
 * Google 4.8 with 28 reviews) was in neither OpenStreetMap, the county permit
 * feed, nor Yelp, while its two strip-mall neighbours were. Small or new places
 * fall through every source we have; Google Maps is the one index a visitor
 * actually compares us against.
 *
 * ## Cells
 *
 * The county is covered by walking every 1 km cell (lat/lng rounded to 0.01)
 * that already holds at least one restaurant with coordinates — where there is
 * one restaurant there are others, and a blank grid over the back country
 * would burn credits on nothing. Each cell is one Serper Maps call for
 * "restaurants" centred on the cell at 16z, which returns up to 20 places
 * nearest and most prominent. A cell whose 20 all land within a kilometre is
 * dense enough that page 2 is worth a second credit; page 3 is never fetched.
 * Roughly 900 cells, roughly 1,100 credits.
 *
 * `--fetch` is resumable: `data/serper-cells.json` records every cell already
 * done, so a crash or a Ctrl-C loses nothing and a re-run spends no credit
 * twice.
 *
 * ## Matching against what we have
 *
 * A place is "already ours" if its Google id matches `google_place_id` or its
 * cid matches `source_key = gmap:<cid>`, or a restaurant within 300 m has the
 * same name once punctuation, case and a trailing "restaurant"/"cafe" are
 * stripped, or shares its street number and first name word. Loose on
 * purpose: a duplicate row is far worse than a missed discovery, because the
 * miss is caught by the next run and the duplicate is a second page for the
 * same kitchen that splits its reviews forever.
 *
 * ## What is skipped and why
 *
 * Places whose Google type is not food (grocery, liquor, hotel, caterer,
 * venue) — Maps answers "restaurants" generously. Addresses outside the county
 * zip range 91901–92199. No coordinates. Fewer than 5 Google reviews: a place
 * that new is as likely to be a ghost listing as a restaurant, and it will be
 * back with more reviews on the next run.
 *
 * ## Import
 *
 * Rows go in through `deh-rows.mjs` buildRow/insertRow exactly as permit rows
 * do, with `source_key = gmap:<cid>`, Google's rating and count, website, and
 * the neighbourhood from coordinates. They arrive `listed = FALSE` and with no
 * hold; `scripts/exclude-chains.mjs` then holds the fast-food tier and
 * `scripts/publish-check.mjs` lists the rest. Run those two after `--import`.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { buildRow, cityFrom, cuisineFrom, idAllocator, insertRow } from "./deh-rows.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const DRY = has("--dry");

const CELLS_PATH = "data/serper-cells.json";
const PLACES_PATH = "data/serper-places.json";
const OUT_PATH = "data/serper-discovered.json";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local"); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);

const loadJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, "utf8")) : fallback);
const saveJson = (p, v) => writeFile(p, JSON.stringify(v));

// ---------------------------------------------------------------- fetch

async function serperMaps(ll, page) {
  const res = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: "restaurants", ll, gl: "us", hl: "en", page }),
  });
  if (!res.ok) throw new Error(`serper ${res.status} for ${ll} p${page}`);
  const data = await res.json();
  return data.places ?? [];
}

function distanceM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchCells() {
  if (!process.env.SERPER_API_KEY) { console.error("SERPER_API_KEY is not set"); process.exit(1); }
  const rows = await sql`
    SELECT DISTINCT round(lat::numeric, 2) AS lat, round(lng::numeric, 2) AS lng
    FROM restaurants WHERE lat IS NOT NULL AND lng IS NOT NULL ORDER BY 1, 2`;
  const done = new Set(await loadJson(CELLS_PATH, []));
  const places = await loadJson(PLACES_PATH, {});
  const todo = rows.map((r) => `${Number(r.lat).toFixed(2)},${Number(r.lng).toFixed(2)}`).filter((k) => !done.has(k)).slice(0, LIMIT);
  console.log(`${rows.length} cells, ${done.size} done, fetching ${todo.length}`);
  let credits = 0, found = 0;
  const CONCURRENCY = 4;
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const key = todo[i++];
      const [lat, lng] = key.split(",").map(Number);
      const ll = `@${lat},${lng},16z`;
      let got = [];
      try {
        const p1 = await serperMaps(ll, 1); credits++;
        got = p1;
        const near = p1.filter((p) => p.latitude && distanceM(lat, lng, p.latitude, p.longitude) < 1000).length;
        if (p1.length >= 20 && near >= 20) { got = got.concat(await serperMaps(ll, 2)); credits++; }
      } catch (e) {
        console.error(`cell ${key}: ${e.message}`); continue;
      }
      for (const p of got) {
        const id = p.cid ?? p.placeId; if (!id) continue;
        if (!places[id]) { found++; places[id] = { ...p, cell: key }; }
      }
      done.add(key);
      if (done.size % 25 === 0) { await saveJson(CELLS_PATH, [...done]); await saveJson(PLACES_PATH, places); console.log(`  ${done.size} cells, ${Object.keys(places).length} places, ${credits} credits`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await saveJson(CELLS_PATH, [...done]); await saveJson(PLACES_PATH, places);
  console.log(`done: ${done.size} cells, ${Object.keys(places).length} distinct places (+${found} new), ${credits} credits this run`);
}

// ---------------------------------------------------------------- report

const NON_FOOD = /grocery|supermarket|gas station|convenience|liquor|hotel|motel|caterer|catering|banquet|wedding|event venue|school|church|hospital|casino|movie theater|golf|park$|stadium|arena|meal delivery|food bank|distributor|wholesale|manufacturer|corporate office|apartment|store$|shop$|beach|public|^house$|^cottage$|salon|cleaners|playground|supplier|processing|producer|company/i;
const FOOD = /restaurant|cafe|café|coffee|bar$|bar &|grill|pizza|taco|bakery|deli|food|kitchen|bistro|eatery|diner|sushi|bbq|barbecue|brewery|brewpub|pub|tea|boba|ice cream|dessert|juice|donut|bagel|sandwich|burger|noodle|ramen|pho|wings?|seafood|steak|buffet|taqueria|creperie|gelato|cafeteria|lounge|bakeshop|patisserie|chicken|hot dog|smoothie|acai|poke|dumpling|dim sum|hot pot|kebab|shawarma|falafel|pastry|cupcake|frozen yogurt|churro|empanada|takeout|brunch|breakfast|wine bar|cocktail|gastropub|tavern|cantina|pupuseria|panaderia|birria|mariscos|fish|lobster|pasta|pizzeria|taqueria|tortas|ceviche|crab|oyster|espresso|cakes?|pies?|waffle|crepe|hawaiian|teriyaki|curry|thai|vietnamese|filipino|halal|mediterranean|greek|indian|korean|japanese|chinese|italian|mexican|salvadoran|peruvian|ethiopian|kabob|gyro|burrito|wings|nachos|pancake|omelet|brunch/i;

// Venue-shaped names: a shopping centre, resort or bowling alley that Google
// typed as a bare "Restaurant" because something inside it serves food.
const VENUE_NAME = /\b(village|town center|towne center|commons|plaza|center|centre|mall|marketplace|market|shopping|harbor|harbour|resort|casino|lanes|speed|crossings|arcade|club house|clubhouse|hotel|inn|lodge|dispensary|cannabis|festival|fair|farmers|cinemas?|theatre|theater|racket|paddle|pickleball)\b/i;
// Never a restaurant no matter how Google typed it.
const VENUE_ALWAYS = /\b(casino|dispensary|cannabis|k1 speed|lucky strike|bowling|bowlero|supermarket|grocery|mercado|liquor|smoke shop|vape|gas|chevron|arco|shell|7-eleven|circle k|costco|walmart|target|vons|ralphs|albertsons|food 4 less|northgate|amusement|golf|resort|cinemas?|cinépolis|cinepolis)\b/i;
// Hard venue words: skipped even when the name carries a food word ("Costco Food Court").
const VENUE_HARD = /costco|food court|dispensary|cannabis|smoke shop|hookah|k1 speed|lucky strike|farmers'? market|cinemas?|cin[eé]polis/i;
const COUNTY_ZIP = /\bCA\s+9(19\d\d|2[01]\d\d)\b/;
const MIN_REVIEWS = 5;

const loose = (s) => (s ?? "").toLowerCase().replace(/&/g, "and").replace(/\b(the|restaurant|cafe|café|bar|grill|kitchen|co|inc|llc)\b/g, "").replace(/[^a-z0-9]/g, "");
const firstWord = (s) => ((s ?? "").toLowerCase().match(/[a-z0-9']{4,}/) ?? [""])[0].replace(/'/g, "");
const streetNo = (s) => ((s ?? "").match(/^\s*(\d+)/) ?? [, ""])[1];

async function report() {
  const places = Object.values(await loadJson(PLACES_PATH, {}));
  const ours = await sql`SELECT id, name, address, lat, lng, google_place_id, source_key FROM restaurants WHERE lat IS NOT NULL`;
  const byPlaceId = new Map(ours.filter((r) => r.google_place_id).map((r) => [r.google_place_id, r]));
  const byCid = new Map(ours.filter((r) => r.source_key?.startsWith("gmap:")).map((r) => [r.source_key.slice(5), r]));
  // 0.01° buckets so the 300 m neighbourhood check touches nine buckets, not 9,000 rows.
  const grid = new Map();
  for (const r of ours) {
    const k = `${Math.round(r.lat / 0.01)},${Math.round(r.lng / 0.01)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(r);
  }
  const nearby = (lat, lng) => {
    const a = Math.round(lat / 0.01), b = Math.round(lng / 0.01), out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get(`${a + i},${b + j}`) ?? []));
    return out;
  };

  const skip = { ours: 0, nonFood: 0, outsideCounty: 0, noCoords: 0, fewReviews: 0, venue: 0 };
  const newOnes = [];
  const venueSkips = [];
  for (const p of places) {
    // The primary type decides. Google tags a bowling alley or a supermarket
    // with "Restaurant" somewhere down its secondary types because it serves
    // food, and a shopping centre is typed plain "Restaurant" with nothing
    // more specific — so a generic type plus a venue-shaped name is a venue.
    const primary = p.type ?? "";
    if (!p.latitude || !p.longitude) { skip.noCoords++; continue; }
    if (!COUNTY_ZIP.test(p.address ?? "")) { skip.outsideCounty++; continue; }
    if (NON_FOOD.test(primary)) { skip.nonFood++; continue; }
    if (!FOOD.test(primary) && !FOOD.test(p.title ?? "")) { skip.nonFood++; continue; }
    // A food word in the name ("Casino Inn Bar & Grill", "El Pescador Fish
    // Market") outranks a venue word; only VENUE_HARD overrides that.
    const title = p.title ?? "";
    const foodName = FOOD.test(title);
    if (VENUE_HARD.test(title)) { skip.venue++; venueSkips.push(title); continue; }
    if (!foodName && VENUE_NAME.test(title) && (primary === "Restaurant" || primary === "")) { skip.venue++; venueSkips.push(title); continue; }
    if (!foodName && VENUE_ALWAYS.test(title)) { skip.venue++; venueSkips.push(title); continue; }
    if ((p.ratingCount ?? 0) < MIN_REVIEWS) { skip.fewReviews++; continue; }
    if ((p.placeId && byPlaceId.has(p.placeId)) || byCid.has(String(p.cid))) { skip.ours++; continue; }
    const ln = loose(p.title), fw = firstWord(p.title), sn = streetNo(p.address);
    const twin = nearby(p.latitude, p.longitude).find((r) => {
      const d = distanceM(p.latitude, p.longitude, r.lat, r.lng);
      if (d > 300) return false;
      const rn = loose(r.name);
      if (ln && rn && (ln === rn || (ln.length >= 5 && rn.length >= 5 && (ln.includes(rn) || rn.includes(ln))))) return true;
      return sn && sn === streetNo(r.address) && fw && fw === firstWord(r.name);
    });
    if (twin) { skip.ours++; continue; }
    newOnes.push({
      cid: String(p.cid), placeId: p.placeId ?? null, name: p.title, address: p.address,
      lat: p.latitude, lng: p.longitude, type: p.type ?? null, types: p.types ?? [],
      rating: p.rating ?? null, reviewCount: p.ratingCount ?? null, website: p.website ?? null, cell: p.cell,
    });
  }
  newOnes.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
  await writeFile("probe/discover-venue-skips.txt", venueSkips.join(String.fromCharCode(10)) + String.fromCharCode(10));
  await writeFile(OUT_PATH, JSON.stringify(newOnes, null, 2));
  console.log(`${places.length} places seen; skipped ${JSON.stringify(skip)}; ${newOnes.length} new → ${OUT_PATH}`);
  for (const n of newOnes.slice(0, 12)) console.log(`  ${n.name} | ${n.address} | ${n.type} | ${n.rating} (${n.reviewCount})`);
}

// ---------------------------------------------------------------- import

async function importNew() {
  const newOnes = await loadJson(OUT_PATH, null);
  if (!newOnes) { console.error(`${OUT_PATH} missing — run --report first`); process.exit(1); }
  const existing = await sql`SELECT id, sort_order FROM restaurants`;
  const allocate = idAllocator(existing);
  const have = new Set((await sql`SELECT source_key FROM restaurants WHERE source_key LIKE 'gmap:%'`).map((r) => r.source_key));
  const snake = (t) => (t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const now = new Date().toISOString();
  let inserted = 0, skipped = 0, noCuisine = 0;
  for (const n of newOnes) {
    const sourceKey = `gmap:${n.cid}`;
    if (have.has(sourceKey)) { skipped++; continue; }
    const c = cuisineFrom({ primaryType: snake(n.type), types: n.types.map(snake) });
    if (!c.cuisine) noCuisine++;
    const row = buildRow({
      sourceKey, dehRecordId: null, name: n.name, address: n.address, city: cityFrom(n.address, null),
      lat: n.lat, lng: n.lng, googlePlaceId: n.placeId, ...c,
      rating: n.rating, reviewCount: n.reviewCount ?? 0, website: n.website,
    }, allocate);
    if (!DRY) await insertRow(sql, row, now);
    inserted++;
  }
  console.log(`${DRY ? "would insert" : "inserted"} ${inserted}, already present ${skipped}, without a cuisine ${noCuisine}`);
  if (!DRY) console.log("next: node --env-file=.env.local scripts/exclude-chains.mjs && node --env-file=.env.local scripts/publish-check.mjs");
}

if (has("--fetch")) await fetchCells();
else if (has("--report")) await report();
else if (has("--import")) await importNew();
else { console.error("usage: discover-serper.mjs --fetch [--limit N] | --report | --import [--dry]"); process.exit(1); }
