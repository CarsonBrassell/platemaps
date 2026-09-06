/**
 * Finds restaurants that none of our three sources carry, through Google Maps
 * via Serper.
 *
 *   node --env-file=.env.local scripts/discover-serper.mjs --fetch [--limit N] [--query cafe]
 *   node --env-file=.env.local scripts/discover-serper.mjs --deep [--limit N]
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
// --query <word> runs the cell walk with a different search term. "restaurants"
// misses what Google types as a cafe, bar or bakery; each word keeps its own
// cell ledger so the passes are independently resumable.
const queryIdx = args.indexOf("--query");
const QUERY = queryIdx >= 0 ? args[queryIdx + 1] : "restaurants";

const CELLS_PATH = QUERY === "restaurants" ? "data/serper-cells.json" : `data/serper-cells-${QUERY.replace(/[^a-z0-9]+/gi, "-")}.json`;
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
    body: JSON.stringify({ q: QUERY, ll, gl: "us", hl: "en", page }),
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
    FROM restaurants WHERE lat IS NOT NULL AND lng IS NOT NULL
      AND lat BETWEEN 32.534 AND 33.44 AND lng BETWEEN -117.6 AND -116.08 ORDER BY 1, 2`;
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
        if (!places[id]) { found++; places[id] = { ...p, cell: key, query: QUERY }; }
      }
      done.add(key);
      if (done.size % 25 === 0) { await saveJson(CELLS_PATH, [...done]); await saveJson(PLACES_PATH, places); console.log(`  ${done.size} cells, ${Object.keys(places).length} places, ${credits} credits`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await saveJson(CELLS_PATH, [...done]); await saveJson(PLACES_PATH, places);
  console.log(`done: ${done.size} cells, ${Object.keys(places).length} distinct places (+${found} new), ${credits} credits this run`);
}

// ---------------------------------------------------------------- deep
//
// A 16z page-1 call returns 20 places. In downtown, North Park, Convoy and
// Hillcrest a cell holds far more than that, so the first pass saw only the
// most prominent 20 and the rest were never asked for. This pass takes every
// cell that came back full — 20+ places landing inside its square, or 18+
// first seen there — and spends up to six more credits on it: pages 2 and 3
// at 16z, then the four quarter-cell centres at 17z (page 2 too when full).
// `data/serper-deep.json` records finished cells so a re-run is free.

const DEEP_PATH = "data/serper-deep.json";

async function deepCells() {
  if (!process.env.SERPER_API_KEY) { console.error("SERPER_API_KEY is not set"); process.exit(1); }
  const done = new Set(await loadJson(CELLS_PATH, []));
  const deepDone = new Set(await loadJson(DEEP_PATH, []));
  const places = await loadJson(PLACES_PATH, {});
  const inSquare = new Map(), firstSeen = new Map();
  for (const p of Object.values(places)) {
    if (p.latitude) { const k = `${p.latitude.toFixed(2)},${p.longitude.toFixed(2)}`; inSquare.set(k, (inSquare.get(k) ?? 0) + 1); }
    firstSeen.set(p.cell, (firstSeen.get(p.cell) ?? 0) + 1);
  }
  const todo = [...done].filter((k) => !deepDone.has(k) && ((inSquare.get(k) ?? 0) >= 20 || (firstSeen.get(k) ?? 0) >= 18)).slice(0, LIMIT);
  console.log(`${done.size} cells, ${deepDone.size} deepened, deepening ${todo.length}`);
  let credits = 0, found = 0;
  const take = (got) => { for (const p of got) { const id = p.cid ?? p.placeId; if (!id) continue; if (!places[id]) { found++; places[id] = { ...p, cell: "deep" }; } } };
  const CONCURRENCY = 4;
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const key = todo[i++];
      const [lat, lng] = key.split(",").map(Number);
      try {
        const ll = `@${lat},${lng},16z`;
        const p2 = await serperMaps(ll, 2); credits++; take(p2);
        if (p2.length >= 20) { take(await serperMaps(ll, 3)); credits++; }
        for (const [dy, dx] of [[0.0025, 0.0025], [0.0025, -0.0025], [-0.0025, 0.0025], [-0.0025, -0.0025]]) {
          const sub = `@${(lat + dy).toFixed(4)},${(lng + dx).toFixed(4)},17z`;
          const s1 = await serperMaps(sub, 1); credits++; take(s1);
          if (s1.length >= 20) { take(await serperMaps(sub, 2)); credits++; }
        }
      } catch (e) {
        console.error(`cell ${key}: ${e.message}`); continue;
      }
      deepDone.add(key);
      if (deepDone.size % 10 === 0) { await saveJson(DEEP_PATH, [...deepDone]); await saveJson(PLACES_PATH, places); console.log(`  ${deepDone.size} deepened, ${Object.keys(places).length} places, ${credits} credits`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await saveJson(DEEP_PATH, [...deepDone]); await saveJson(PLACES_PATH, places);
  console.log(`done: ${deepDone.size} cells deepened, ${Object.keys(places).length} distinct places (+${found} new), ${credits} credits this run`);
}

// ---------------------------------------------------------------- report

const NON_FOOD = /grocery|supermarket|gas station|convenience|liquor|hotel|motel|caterer|catering|banquet|wedding|event venue|school|church|hospital|casino|movie theater|golf|park$|stadium|arena|meal delivery|food bank|distributor|wholesale|manufacturer|corporate office|apartment|store$|shop$|beach|public|^house$|^cottage$|salon|cleaners|playground|supplier|processing|producer|company/i;
const FOOD = /restaurant|cafe|café|coffee|bar$|bar &|grill|pizza|taco|bakery|deli|food|kitchen|bistro|eatery|diner|sushi|bbq|barbecue|brewery|brewpub|\bpub\b|\btea\b|boba|ice cream|dessert|juice|donut|bagel|sandwich|burger|noodle|ramen|\bpho\b|\bwings?\b|seafood|steak|buffet|taqueria|creperie|gelato|cafeteria|lounge|bakeshop|patisserie|chicken|hot dog|smoothie|acai|poke|dumpling|dim sum|hot pot|kebab|shawarma|falafel|pastry|cupcake|frozen yogurt|churro|empanada|takeout|brunch|breakfast|wine bar|cocktail|gastropub|tavern|cantina|pupuseria|panaderia|birria|mariscos|fish|lobster|pasta|pizzeria|taqueria|tortas|ceviche|\bcrab\b|oyster|espresso|\bcakes?\b|\bpies?\b|waffle|crepe|hawaiian|teriyaki|curry|thai|vietnamese|filipino|halal|mediterranean|greek|indian|korean|japanese|chinese|italian|mexican|salvadoran|peruvian|ethiopian|kabob|gyro|burrito|wings|nachos|pancake|omelet|brunch/i;

// Venue-shaped names: a shopping centre, resort or bowling alley that Google
// typed as a bare "Restaurant" because something inside it serves food.
const VENUE_NAME = /\b(village|town center|towne center|commons|plaza|center|centre|mall|marketplace|market|shopping|harbor|harbour|resort|casino|lanes|speed|crossings|arcade|club house|clubhouse|hotel|inn|lodge|dispensary|cannabis|festival|fair|farmers|cinemas?|theatre|theater|racket|paddle|pickleball)\b/i;
// Never a restaurant no matter how Google typed it.
const VENUE_ALWAYS = /\b(casino|dispensary|cannabis|k1 speed|lucky strike|bowling|bowlero|supermarket|grocery|mercado|liquor|smoke shop|vape|gas|chevron|arco|shell|7-eleven|circle k|costco|walmart|target|vons|ralphs|albertsons|food 4 less|northgate|amusement|golf|resort|cinemas?|cinépolis|cinepolis)\b/i;
// Hard venue words: skipped even when the name carries a food word ("Costco Food Court").
const VENUE_HARD = /costco|food court|dispensary|cannabis|smoke shop|hookah|k1 speed|lucky strike|farmers'? market|cinemas?|cin[eé]polis/i;
const COUNTY_ZIP = /\bCA\s+9(19\d\d|2[01]\d\d)\b/;
// Not open to a visitor: military galleys and base exchanges, campus and
// clinic cafeterias, members' clubs, park concessions, corporate offices, and
// businesses Google typed as restaurants that only tour, deliver or sell
// groceries. Found in the 2026-09-05 deep pass; every one has Google reviews.
const NOT_PUBLIC_NAME = /dining facility|recreation center|(^|[^a-z0-9])mcrd([^a-z0-9]|$)|support center|food tours?|(^|[^a-z0-9])vfw([^a-z0-9]|$)|beach club|concessions?|scripps clinic|nicholson commons|navy exchange|(^|[^a-z0-9])nex([^a-z0-9]|$)|(^|[^a-z0-9])nbsd([^a-z0-9]|$)|(^|[^a-z0-9])nab([^a-z0-9]|$)|(^|[^a-z0-9])nasni([^a-z0-9]|$)|duncan hall|canyonside snack bar|fairway cafe|بقاله|grocery/i;
const NOT_PUBLIC_ADDR = /camp pendleton|guadalcanal rd|callagan hwy|boyington rd|(^|[^a-z0-9])mcrd([^a-z0-9]|$)|brinser st|mchugh st|3750 anderson ave|nicholson commons|navy exchange|womble st|(^|[^a-z0-9])s r ave([^a-z0-9]|$)|rotary park/i;
const NOT_PUBLIC_TYPE = /tour operator|delivery service|corporate office/i;
// The "cafe" and "bar" query words (2026-09-05) return everything Google calls
// a bar: brow bars, wax bars, IV drip bars, dog cafes, grocery-store bakeries.
// Only types that are unambiguously food service get through that pass, and
// bars keep the same rule as restaurants: no nightclubs, cigar lounges,
// billiard halls, liquor stores, hotel lobbies, wholesale roasters, Herbalife
// "nutrition" clubs, or anything inside an airport, zoo, theme park, campus
// or hospital.
const SERVICE_TYPE = /eyebrow|waxing|hair|facial|spa$|groomer|skin care|clinic|tour agency|art center|car rental|non-profit|cycling|sports complex|music venue|therapist|make-up|makeup|fishing|therapy|beautician|vacation|exporter|storage|check cashing|party service|mental health|vending|day care|dog cafe|cat cafe|hookah|karaoke|seafood market|food court|cafeteria|dessert buffet|nightclub|night club|adult|strip club/i;
const BAR_VENUE_NAME = new RegExp("nightclub|night club|cigar|billiard|liquor|home brew mart|barworks|bartending|axe throwing|golf & game|roaster|roasting|roastery|nutrition|candy buffet|cpo club|athlete connections|mama's kitchen|youth venture|^cafeteria$|vacation|cottage|hotel|" + "(^|[^a-z0-9])inn([^a-z0-9]|$)" + "|" + "(^|[^a-z0-9])bw([^a-z0-9]|$)" + "|thrift|beauty|brows?|lash|wax|threading|grooming|boarding|barnes & noble|el super|food 4 less|albertsons|vons|farm fresh market|natural market|harvest market|pool club|pool bar|lobby|sapphire lounge|rental car|zoofari|paratha point|sheraton|middle earth|catering|venue$|pool lounge|corner pin|crowbeard", "i");
const BAR_VENUE_ADDR = /terminal|admiral boland|gate 1[0-9][0-9]|zoo pl|sea world dr|legoland|gilman dr|athena cir|frost st|^1 park blvd|hotel cir|harney st|zoofari|balboa park|^n[/]a|human resources|parking lot|please call/i;
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

  const skip = { ours: 0, nonFood: 0, outsideCounty: 0, noCoords: 0, fewReviews: 0, venue: 0, notPublic: 0 };
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
    if (NOT_PUBLIC_TYPE.test(primary) || NOT_PUBLIC_NAME.test(title) || NOT_PUBLIC_ADDR.test(p.address ?? "")) { skip.notPublic++; venueSkips.push(title); continue; }
    if (SERVICE_TYPE.test(primary) || BAR_VENUE_NAME.test(title) || BAR_VENUE_ADDR.test(p.address ?? "") || /3225 n harbor dr/i.test(p.address ?? "")) { skip.notPublic++; venueSkips.push(title); continue; }
    // No street number and no cross-street: a campus lounge or a town name, not a door.
    if (!/[0-9]/.test(p.address ?? "") && !/&/.test(p.address ?? "")) { skip.notPublic++; venueSkips.push(title); continue; }
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
else if (has("--deep")) await deepCells();
else if (has("--report")) await report();
else if (has("--import")) await importNew();
else { console.error("usage: discover-serper.mjs --fetch [--limit N] | --deep [--limit N] | --report | --import [--dry]"); process.exit(1); }
