/**
 * Regenerates src/data/restaurants.ts from real Yelp businesses.
 *
 *   node --env-file=.env.local scripts/fetch-restaurants.mjs --dry
 *   node --env-file=.env.local scripts/fetch-restaurants.mjs
 *
 * Searches near each region's sub-areas (from src/data/regions.ts) so the
 * result is spread across San Diego County rather than clustered downtown,
 * and keeps only businesses that actually have a photo.
 *
 * WHAT IS REAL: name, cuisine, coordinates, rating, reviewCount, photo,
 * yelpUrl, and closingTime all come from Yelp.
 *
 * WHAT IS NOT: `status` / `statusLabel` — the "No wait" / "25 min wait" live
 * busyness copy. Yelp exposes no wait-time data, so those are derived from the
 * business's real open/closed state plus a deterministic hash of its id. They
 * are presentation filler, not observations. Wiring them to something true
 * needs a real source (a POS integration, user check-ins, Google's popular
 * times); until then the app is displaying invented numbers.
 */

import { readFile, writeFile } from "node:fs/promises";

const DATA_PATH = new URL("../src/data/restaurants.ts", import.meta.url);
const REGIONS_PATH = new URL("../src/data/regions.ts", import.meta.url);
const SEARCH_URL = "https://api.yelp.com/v3/businesses/search";
const DETAIL_URL = "https://api.yelp.com/v3/businesses";
const DRY_RUN = process.argv.includes("--dry");

/** Roughly how many to keep per region, budget permitting. */
const PER_REGION = 3;
/**
 * Yelp files caterers, food tours and cake decorators under "restaurants".
 * They're real businesses but they aren't places you decide to walk to for
 * dinner, which is what this app is for.
 */
const EXCLUDED_CATEGORIES = new Set([
  "catering", "foodtrucks", "foodstands", "streetvendors", "foodtours",
  "personalchefs", "customcakes", "bakeries", "desserts", "juicebars",
  "acaibowls", "wholesalers", "grocery", "convenience", "farmersmarket",
  "delis", "gourmet", "importedfood", "chocolate", "cupcakes", "donuts",
]);
/** Below this, a listing reads as obscure rather than discoverable. */
const MIN_REVIEWS = 300;
/** Well-reviewed but genuinely bad isn't a recommendation either. */
const MIN_RATING = 4;
/** Downtown reference point for the decorative "distance from you" figure. */
const ORIGIN = { lat: 32.7157, lng: -117.1611 };

const apiKey = process.env.YELP_API_KEY;
if (!apiKey) {
  console.error("YELP_API_KEY is not set. Add it to .env.local and pass --env-file=.env.local");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yelp(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`Yelp ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Pull region names + their sub-area coordinates straight out of regions.ts. */
async function loadRegions() {
  const src = await readFile(REGIONS_PATH, "utf8");
  const out = [];
  for (const block of src.matchAll(/name:\s*"([^"]+)",\s*\n\s*subAreas:\s*\[([\s\S]*?)\],\s*\n\s*\}/g)) {
    const [, name, body] = block;
    const subAreas = [...body.matchAll(/name:\s*"([^"]+)",\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)/g)]
      .map((m) => ({ name: m[1], lat: Number(m[2]), lng: Number(m[3]) }));
    if (subAreas.length) out.push({ name, subAreas });
  }
  return out;
}

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

/** "2100" -> "Closes 9pm" */
function formatClosing(hhmm) {
  if (!hhmm || hhmm.length !== 4) return null;
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(2);
  const suffix = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `Closes ${hour12}${m === "00" ? "" : `:${m}`}${suffix}`;
}

/** Stable pseudo-random in [0,1) from a string — same input, same output. */
function hashUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Busyness copy. `is_closed_now` is real; the wait figure is not — see the
 * header note. Deterministic so it doesn't churn the diff on every run.
 */
function busyness(business, closedNow) {
  if (closedNow) return { status: "calm", statusLabel: "Closed now" };
  const roll = hashUnit(business.id);
  if (roll < 0.4) return { status: "calm", statusLabel: "No wait" };
  if (roll < 0.6) return { status: "calm", statusLabel: "Seated quickly" };
  if (roll < 0.8) return { status: "urgent", statusLabel: "Filling up" };
  return { status: "urgent", statusLabel: "Busy right now" };
}

const regions = await loadRegions();
console.log(`Searching ${regions.length} regions...\n`);

const seen = new Set();
const picked = [];

for (const region of regions) {
  const found = [];
  // Walk sub-areas until this region has enough, so a quiet corner still
  // contributes rather than silently dropping out of the map.
  for (const area of region.subAreas) {
    if (found.length >= PER_REGION) break;
    const url = new URL(SEARCH_URL);
    url.searchParams.set("latitude", String(area.lat));
    url.searchParams.set("longitude", String(area.lng));
    url.searchParams.set("radius", "2400");
    url.searchParams.set("categories", "restaurants");
    // Most-reviewed rather than highest-rated: a 5.0 from 51 reviews is a
    // caterer nobody has heard of, while review volume tracks the places
    // people actually recognise and travel to.
    url.searchParams.set("sort_by", "review_count");
    url.searchParams.set("limit", "30");

    let data;
    try {
      data = await yelp(url);
    } catch (err) {
      console.error(`  ! ${region.name}/${area.name}: ${err.message}`);
      continue;
    }
    await sleep(150);

    for (const b of data.businesses ?? []) {
      if (found.length >= PER_REGION) break;
      if (seen.has(b.id)) continue;
      if (!b.image_url) continue;                        // a photo is the whole point here
      if (b.is_closed) continue;                         // permanently closed
      if ((b.review_count ?? 0) < MIN_REVIEWS) continue; // too obscure to recommend
      if ((b.rating ?? 0) < MIN_RATING) continue;
      const aliases = (b.categories ?? []).map((c) => c.alias);
      if (aliases.some((a) => EXCLUDED_CATEGORIES.has(a))) continue;
      seen.add(b.id);
      found.push({ business: b, region: region.name });
    }
  }
  console.log(`  ${region.name}: ${found.length}`);
  picked.push(...found);
}

console.log(`\n${picked.length} restaurants selected. Fetching hours...`);

/**
 * Label a restaurant with the sub-area nearest its real coordinates, not the
 * one we happened to search from. A search anchored on Mission Valley can
 * legitimately return a Hillcrest pizzeria; calling that pizzeria "Mission
 * Valley" would be exactly the kind of invented data this rewrite is removing.
 */
const allSubAreas = regions.flatMap((r) => r.subAreas);
function nearestNeighborhood(coords) {
  let best = null;
  for (const area of allSubAreas) {
    const d = milesBetween(coords, area);
    if (!best || d < best.d) best = { d, name: area.name };
  }
  return best.name;
}

const rows = [];
for (const [i, entry] of picked.entries()) {
  const { business } = entry;
  let closingTime = "Hours vary";
  let closedNow = false;
  try {
    const detail = await yelp(`${DETAIL_URL}/${business.id}`);
    const today = new Date().getDay();
    // Yelp weeks run Monday=0; JS runs Sunday=0.
    const yelpDay = (today + 6) % 7;
    const hours = detail.hours?.[0];
    closedNow = hours?.is_open_now === false;
    const slot = hours?.open?.find((o) => o.day === yelpDay);
    closingTime = formatClosing(slot?.end) ?? "Hours vary";
  } catch {
    // Detail lookups are a nicety; a failure shouldn't lose the restaurant.
  }
  await sleep(150);

  const coords = { lat: business.coordinates.latitude, lng: business.coordinates.longitude };
  const miles = milesBetween(ORIGIN, coords);
  const { status, statusLabel } = busyness(business, closedNow);

  rows.push({
    id: String(i + 1),
    name: business.name,
    cuisine: business.categories?.[0]?.title ?? "Restaurant",
    neighborhood: nearestNeighborhood(coords),
    distance: `${miles.toFixed(1)} mi`,
    walkTime: `${Math.max(1, Math.round(miles * 20))} min walk`,
    closingTime,
    lat: Number(coords.lat.toFixed(4)),
    lng: Number(coords.lng.toFixed(4)),
    status,
    statusLabel,
    rating: business.rating,
    reviewCount: business.review_count,
    trending: business.rating >= 4.5 && business.review_count >= 400,
    photo: business.image_url,
    yelpUrl: business.url.split("?")[0],
  });
  process.stdout.write(`\r  ${i + 1}/${picked.length}`);
}
console.log("\n");

for (const r of rows) {
  console.log(`  ${r.rating}★ ${r.name} — ${r.cuisine}, ${r.neighborhood} (${r.reviewCount} reviews)`);
}

if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

/*
 * Replace ONLY the restaurants array. An earlier version sliced from
 * `export const restaurants` to end-of-file, which silently deleted the
 * `neighborhoodCenters`, `neighborhoods` and `cuisines` exports that live
 * below it and broke the build. Find both ends of the array and splice
 * between them, so anything after it survives untouched.
 */
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
const tail = current.slice(arrayEnd + "\n];".length);

const body = rows
  .map((r) => {
    const lines = [
      `    id: ${JSON.stringify(r.id)},`,
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
      `    rating: ${r.rating},`,
      `    reviewCount: ${r.reviewCount},`,
    ];
    if (r.trending) lines.push(`    trending: true,`);
    lines.push(`    photo: ${JSON.stringify(r.photo)},`);
    lines.push(`    yelpUrl: ${JSON.stringify(r.yelpUrl)},`);
    return `  {\n${lines.join("\n")}\n  },`;
  })
  .join("\n");

const next =
  current.slice(0, arrayStart) +
  `// Generated by scripts/fetch-restaurants.mjs from the Yelp Fusion API.\n` +
  `// Names, cuisines, coordinates, ratings, review counts, photos and closing\n` +
  `// times are real. \`statusLabel\` wait copy is not — see the script header.\n` +
  `export const restaurants: Restaurant[] = [\n${body}\n];` +
  tail;

await writeFile(DATA_PATH, next, "utf8");
console.log(`Wrote ${rows.length} restaurants to src/data/restaurants.ts`);

const keptExports = [...tail.matchAll(/^export (?:const|type) (\w+)/gm)].map((m) => m[1]);
console.log(`Preserved exports after the array: ${keptExports.join(", ") || "(none)"}`);
