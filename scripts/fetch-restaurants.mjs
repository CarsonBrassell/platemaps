/**
 * Regenerates src/data/restaurants.ts from real Yelp businesses.
 *
 *   node --env-file=.env.local scripts/fetch-restaurants.mjs --dry
 *   node --env-file=.env.local scripts/fetch-restaurants.mjs --per-area 25
 *   node --env-file=.env.local scripts/fetch-restaurants.mjs --min-reviews 100 --min-rating 3.5
 *
 * Searches near each region's sub-areas (from src/data/regions.ts) so the
 * result is spread across San Diego County rather than clustered downtown.
 *
 * WHAT IS REAL: name, cuisine, coordinates, rating, reviewCount, photo,
 * yelpUrl, and closingTime all come from Yelp.
 *
 * WHAT IS NOT: `status` / `statusLabel` — the "No wait" / "25 min wait" live
 * busyness copy. Yelp exposes no wait-time data, so those are derived from the
 * business's real open/closed state plus a deterministic hash of its id. They
 * are presentation filler, not observations. Nothing on Discover renders them
 * any more (see `RestaurantView` in src/data/restaurants.ts); they are still
 * written because the type and the table still carry the columns.
 *
 * ## This script MERGES; it does not replace
 *
 * It used to number restaurants by array position — `id: String(i + 1)` — and
 * overwrite the file. Every run therefore reassigned every id, which quietly
 * repointed `posts.restaurant_id`, aspect votes and saves at whatever
 * restaurant happened to land in that slot next time. That made widening the
 * search unsafe, which made the whole corpus unable to grow.
 *
 * Identity now comes from Yelp's own business alias, taken from `yelpUrl`:
 *
 *   - a business already in the file keeps its `id` and its position, and has
 *     its Yelp-sourced fields refreshed;
 *   - a business not in the file gets the next free id and is appended;
 *   - a restaurant the search didn't return this time is KEPT, not dropped.
 *     Yelp search is a ranked sample, not an enumeration — a place missing from
 *     one run is usually still there. Deleting it would orphan whatever anyone
 *     has already written about it.
 *
 * Nothing here deletes a restaurant. Removing one is a deliberate act and
 * belongs in its own script, with a plan for the posts pointing at it.
 *
 * ## API quota
 *
 * Yelp bills per call and the daily cap is low. This prints its call count as
 * it goes and stops at `--max-calls` (default 400) rather than running you into
 * a wall mid-corpus and leaving a half-updated file. `--no-hours` halves the
 * cost by skipping the per-business detail lookup that supplies closing times;
 * places fetched that way read "Hours vary" until a later run fills them in.
 */

import { readFile, writeFile } from "node:fs/promises";
import { restaurants as existing } from "../src/data/restaurants.ts";

const DATA_PATH = new URL("../src/data/restaurants.ts", import.meta.url);
const REGIONS_PATH = new URL("../src/data/regions.ts", import.meta.url);
const SEARCH_URL = "https://api.yelp.com/v3/businesses/search";
const DETAIL_URL = "https://api.yelp.com/v3/businesses";

/* --- Options ------------------------------------------------------------ */

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const DRY_RUN = process.argv.includes("--dry");
const SKIP_HOURS = process.argv.includes("--no-hours");

/**
 * Fill in closing times for restaurants that don't have one, and do nothing
 * else. No search, so none of the 66 calls a sweep spends on finding places.
 *
 * This exists because `--no-hours` has a consequence that only shows up at
 * scale: `openStateFor` returns "unknown" for an unparseable closing time, and
 * the "Open now" filter passes unknowns rather than hiding places it can't
 * judge. At 36 restaurants every row had real hours and that never mattered.
 * At 682 with 648 unknown, "Open now" silently became "everything" — a filter
 * making a claim the data doesn't support, which is the exact failure mode
 * PRODUCT.md is written against.
 *
 * One Yelp call per restaurant, looked up by the alias already stored in
 * `yelpUrl`, so it is resumable: run it, hit the cap, run it again tomorrow.
 */
const HOURS_ONLY = process.argv.includes("--hours-only");

/**
 * How many keepers to take from each sub-area before moving on.
 *
 * This was a per-*region* cap of 3, which is why the corpus sat at 36. Yelp
 * pages 50 at a time, so anything above 50 costs an extra call per sub-area.
 */
const PER_AREA = flag("per-area", 3);

/** Below this, a listing reads as obscure rather than discoverable. */
const MIN_REVIEWS = flag("min-reviews", 300);
/** Well-reviewed but genuinely bad isn't a recommendation either. */
const MIN_RATING = flag("min-rating", 4);
/** Stop before this many Yelp calls, so a run can't eat the daily quota. */
const MAX_CALLS = flag("max-calls", 400);

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

/** Downtown reference point for the decorative "distance from you" figure. */
const ORIGIN = { lat: 32.7157, lng: -117.1611 };

const apiKey = process.env.YELP_API_KEY;
if (!apiKey) {
  console.error("YELP_API_KEY is not set. Add it to .env.local and pass --env-file=.env.local");
  process.exit(1);
}

/*
 * Check the key's shape before spending it on a request.
 *
 * A Yelp key is 128 URL-safe characters. On 13 Aug 2026 `.env.local` held the
 * Neon connection string under YELP_API_KEY, so every call sent
 * `Authorization: Bearer postgresql://neondb_owner:<password>@...` to Yelp —
 * seventy of them in one run — and Yelp echoed the whole string back in each
 * error body. A database password went to a third party and into this
 * terminal's scrollback because nothing looked at the value first.
 *
 * The error deliberately does not print the key.
 */
if (!/^[A-Za-z0-9_-]{128}$/.test(apiKey)) {
  console.error(
    `YELP_API_KEY does not look like a Yelp key (got ${apiKey.length} characters; expected 128 URL-safe ones).`,
  );
  console.error("Refusing to send it — an API key sent to the wrong place is a leaked credential.");
  if (apiKey.startsWith("postgres")) {
    console.error("It looks like a Postgres connection string. Check for a copy/paste slip in .env.local.");
  }
  process.exit(1);
}

/* --- Yelp --------------------------------------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let calls = 0;
class QuotaReached extends Error {}

async function yelp(url) {
  if (calls >= MAX_CALLS) throw new QuotaReached(`--max-calls ${MAX_CALLS} reached`);
  calls += 1;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 429) throw new QuotaReached("Yelp returned 429 (rate limited)");
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

/* --- Identity ----------------------------------------------------------- */

/**
 * Yelp's business alias, off the end of a business URL:
 * `https://www.yelp.com/biz/tacos-el-gordo-chula-vista` -> the last segment.
 *
 * This is the join key between a run and the file. It is stable across runs,
 * unlike array position, and it is already stored — `yelpUrl` has been written
 * on every row since photos were added, so no backfill is needed.
 */
function aliasFrom(yelpUrl) {
  if (typeof yelpUrl !== "string") return null;
  const match = yelpUrl.match(/\/biz\/([^/?#]+)/);
  return match ? match[1] : null;
}

/** The next free id, as a decimal string, matching the existing convention. */
function nextIdFrom(rows) {
  const highest = rows.reduce((max, r) => {
    const n = Number(r.id);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  let next = highest;
  return () => String(++next);
}

/* --- Search ------------------------------------------------------------- */

const regions = await loadRegions();
const byAlias = new Map();
for (const r of existing) {
  const alias = aliasFrom(r.yelpUrl);
  if (alias) byAlias.set(alias, r);
}

console.log(
  `${existing.length} restaurants on file (${byAlias.size} with a Yelp alias to match on).`,
);
if (!HOURS_ONLY) {
  console.log(
    `Searching ${regions.length} regions, up to ${PER_AREA} per sub-area, ` +
      `min ${MIN_REVIEWS} reviews / ${MIN_RATING}★, max ${MAX_CALLS} calls.\n`,
  );
}

const seen = new Set();
const picked = [];
let quotaHit = false;

/* --- Hours-only backfill ------------------------------------------------ */

/**
 * Reads the closing time for one business straight off the detail endpoint,
 * which accepts a Yelp alias in place of a business id — so the alias in
 * `yelpUrl` is enough and no search is needed.
 */
async function closingTimeFor(alias) {
  const detail = await yelp(`${DETAIL_URL}/${encodeURIComponent(alias)}`);
  const today = new Date().getDay();
  // Yelp weeks run Monday=0; JS runs Sunday=0.
  const yelpDay = (today + 6) % 7;
  const slot = detail.hours?.[0]?.open?.find((o) => o.day === yelpDay);
  return formatClosing(slot?.end);
}

if (HOURS_ONLY) {
  const missing = existing.filter(
    (r) => r.closingTime === "Hours vary" && aliasFrom(r.yelpUrl),
  );
  console.log(
    `${missing.length} of ${existing.length} restaurants have no closing time. ` +
      `Filling up to ${MAX_CALLS} of them.\n`,
  );

  const filled = new Map();
  for (const [i, r] of missing.entries()) {
    try {
      const closingTime = await closingTimeFor(aliasFrom(r.yelpUrl));
      if (closingTime) filled.set(r.id, closingTime);
      await sleep(150);
    } catch (err) {
      if (err instanceof QuotaReached) {
        console.log(`\n! ${err.message} — keeping the ${filled.size} filled so far.`);
        break;
      }
      // A business that has since vanished from Yelp keeps "Hours vary",
      // which is the honest answer for a place we can no longer ask about.
    }
    if (i % 25 === 0) process.stdout.write(`\r  ${i + 1}/${missing.length}`);
  }

  console.log(`\n\nFilled ${filled.size} closing times in ${calls} calls.`);
  const stillMissing = missing.length - filled.size;
  if (stillMissing > 0) {
    console.log(`${stillMissing} still unknown. Re-run --hours-only to continue.`);
  }

  if (DRY_RUN) {
    console.log("\nDry run — nothing written.");
    process.exit(0);
  }

  // Rewrites the file through the same serializer the full run uses, so the
  // two paths can't drift in how a row is written.
  const rows = existing.map((r) =>
    filled.has(r.id) ? { ...r, closingTime: filled.get(r.id) } : r,
  );
  await writeRestaurants(rows);
  process.exit(0);
}

/** One page of a sub-area search. Yelp caps `limit` at 50. */
async function searchArea(area, offset) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("latitude", String(area.lat));
  url.searchParams.set("longitude", String(area.lng));
  url.searchParams.set("radius", "2400");
  url.searchParams.set("categories", "restaurants");
  // Most-reviewed rather than highest-rated: a 5.0 from 51 reviews is a
  // caterer nobody has heard of, while review volume tracks the places
  // people actually recognise and travel to.
  url.searchParams.set("sort_by", "review_count");
  url.searchParams.set("limit", String(Math.min(50, Math.max(1, PER_AREA))));
  url.searchParams.set("offset", String(offset));
  return yelp(url);
}

/*
 * San Diego County. The southern edge is the one that matters: San Ysidro is
 * the border crossing, so a search centred there returns Tijuana businesses
 * ranked as normal results. Seven made it into the corpus that way and were
 * only caught during menu extraction, when agents kept reporting that a
 * restaurant's only address was in Mexico. Four of them have no US location at
 * all — Restaurante Caesar's, Mariscos el Mazateño, La Justina and La
 * Corriente Cevichería Nais — so no amount of neighborhood correction helps;
 * they simply are not in San Diego.
 *
 * The bound is 32.534, a hair south of the border at San Ysidro, so a genuine
 * business on the US side of the crossing still passes.
 */
const COUNTY = { minLat: 32.534, maxLat: 33.505, minLng: -117.61, maxLng: -116.08 };

function inCounty(coords) {
  if (!coords || coords.latitude == null || coords.longitude == null) return false;
  const { latitude: lat, longitude: lng } = coords;
  return lat >= COUNTY.minLat && lat <= COUNTY.maxLat && lng >= COUNTY.minLng && lng <= COUNTY.maxLng;
}

function keeps(b) {
  if (seen.has(b.id)) return false;
  if (!b.image_url) return false; // a photo is the whole point here
  if (b.is_closed) return false; // permanently closed
  if (!inCounty(b.coordinates)) return false; // across the border, or missing coordinates
  if ((b.review_count ?? 0) < MIN_REVIEWS) return false; // too obscure to recommend
  if ((b.rating ?? 0) < MIN_RATING) return false;
  const aliases = (b.categories ?? []).map((c) => c.alias);
  return !aliases.some((a) => EXCLUDED_CATEGORIES.has(a));
}

outer: for (const region of regions) {
  let found = 0;
  for (const area of region.subAreas) {
    // Paged, so `--per-area` above 50 keeps going rather than silently
    // truncating at Yelp's page size. Offset is capped by Yelp at 240.
    for (let offset = 0; offset < Math.min(PER_AREA, 240); offset += 50) {
      let data;
      try {
        data = await searchArea(area, offset);
      } catch (err) {
        if (err instanceof QuotaReached) {
          console.log(`\n  ! ${err.message} — keeping what has been found so far.`);
          quotaHit = true;
          break outer;
        }
        console.error(`  ! ${region.name}/${area.name}: ${err.message}`);
        break;
      }
      await sleep(150);

      const businesses = data.businesses ?? [];
      for (const b of businesses) {
        if (!keeps(b)) continue;
        seen.add(b.id);
        picked.push({ business: b, region: region.name });
        found += 1;
      }
      // Short page means the area is exhausted; no point paging further.
      if (businesses.length < 50) break;
    }
  }
  console.log(`  ${region.name}: ${found}`);
}

console.log(`\n${picked.length} businesses selected from ${calls} calls.`);

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

/* --- Merge -------------------------------------------------------------- */

const nextId = nextIdFrom(existing);
// Keyed by id so an update lands on the row it belongs to regardless of order.
const merged = new Map(existing.map((r) => [r.id, { ...r }]));
const order = existing.map((r) => r.id);

let updated = 0;
let added = 0;

if (!SKIP_HOURS) console.log("Fetching hours...");

for (const [i, entry] of picked.entries()) {
  const { business } = entry;
  const alias = aliasFrom(business.url);
  const prior = alias ? byAlias.get(alias) : undefined;

  let closingTime = prior?.closingTime ?? "Hours vary";
  let closedNow = false;
  if (!SKIP_HOURS) {
    try {
      const detail = await yelp(`${DETAIL_URL}/${business.id}`);
      const today = new Date().getDay();
      // Yelp weeks run Monday=0; JS runs Sunday=0.
      const yelpDay = (today + 6) % 7;
      const hours = detail.hours?.[0];
      closedNow = hours?.is_open_now === false;
      const slot = hours?.open?.find((o) => o.day === yelpDay);
      closingTime = formatClosing(slot?.end) ?? closingTime;
      await sleep(150);
    } catch (err) {
      if (err instanceof QuotaReached) {
        console.log(`\n  ! ${err.message} — remaining hours left as they were.`);
        quotaHit = true;
        break;
      }
      // Detail lookups are a nicety; a failure shouldn't lose the restaurant.
    }
  }

  const coords = { lat: business.coordinates.latitude, lng: business.coordinates.longitude };
  const miles = milesBetween(ORIGIN, coords);
  const { status, statusLabel } = busyness(business, closedNow);

  // An existing restaurant keeps its id and its place in the array; only the
  // fields Yelp is authoritative for are refreshed.
  const id = prior?.id ?? nextId();
  if (prior) updated += 1;
  else {
    added += 1;
    order.push(id);
  }

  merged.set(id, {
    ...merged.get(id),
    id,
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

  if (!SKIP_HOURS) process.stdout.write(`\r  ${i + 1}/${picked.length}`);
}
if (!SKIP_HOURS) console.log("");

const rows = order.map((id) => merged.get(id));
const untouched = existing.length - updated;

console.log(
  `\n${added} new, ${updated} refreshed, ${untouched} left as they were ` +
    `(not returned by this search — kept, never dropped).`,
);
console.log(`${rows.length} restaurants total. ${calls} Yelp calls used.`);
if (quotaHit) {
  console.log("Stopped early on quota. Re-run to continue; the merge is incremental.");
}

for (const r of rows.slice(existing.length)) {
  console.log(`  + ${r.rating}★ ${r.name} — ${r.cuisine}, ${r.neighborhood} (${r.reviewCount} reviews)`);
}

if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

await writeRestaurants(rows);

/* --- Write -------------------------------------------------------------- */

/**
 * Serialises the array back into src/data/restaurants.ts.
 *
 * A function, and hoisted, because both the full run and `--hours-only` end
 * here — two copies of this would be two chances to write a row differently
 * depending on which flag produced it.
 *
 * Replaces ONLY the restaurants array. An earlier version sliced from
 * `export const restaurants` to end-of-file, which silently deleted the
 * `neighborhoodCenters`, `neighborhoods` and `cuisines` exports that live
 * below it and broke the build. Find both ends of the array and splice
 * between them, so anything after it survives untouched.
 */
async function writeRestaurants(rows) {
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

/*
 * Everything before the array, with any previously generated banner stripped.
 *
 * The banner is rewritten below, and `slice(0, arrayStart)` still contains the
 * last run's copy of it — so without this the comment block grows by three
 * lines every time the script runs. It only shows up on the second run, which
 * is exactly the run this rewrite made possible.
 */
const headLines = current.slice(0, arrayStart).split("\n");
// Line-walked rather than regex-stripped: this file is checked out with CRLF
// (`core.autocrlf` is true here), and an end-anchored pattern over mixed line
// endings is the kind of thing that silently matches nothing.
while (headLines.length && headLines[headLines.length - 1].trimEnd() === "") headLines.pop();
while (headLines.length && headLines[headLines.length - 1].trimStart().startsWith("//")) {
  headLines.pop();
}
const head = headLines.join("\n") + "\n\n";

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
    // Written by scripts/blend-ratings.mjs, not by this script — carried
    // through so a fetch run can't silently undo a blend run.
    for (const key of ["yelpRating", "yelpReviewCount", "googleRating", "googleReviewCount"]) {
      if (r[key] !== undefined) lines.push(`    ${key}: ${r[key]},`);
    }
    if (r.trending) lines.push(`    trending: true,`);
    if (r.photo) lines.push(`    photo: ${JSON.stringify(r.photo)},`);
    if (r.photoAlt) lines.push(`    photoAlt: ${JSON.stringify(r.photoAlt)},`);
    if (r.yelpUrl) lines.push(`    yelpUrl: ${JSON.stringify(r.yelpUrl)},`);
    return `  {\n${lines.join("\n")}\n  },`;
  })
  .join("\n");

const next =
  head +
  `// Generated by scripts/fetch-restaurants.mjs from the Yelp Fusion API.\n` +
  `// Names, cuisines, coordinates, ratings, review counts, photos and closing\n` +
  `// times are real. \`statusLabel\` wait copy is not — see the script header.\n` +
  `//\n` +
  `// Ids are stable across runs and are matched on the Yelp alias in yelpUrl.\n` +
  `// Rows are merged, never replaced: posts, aspect votes and saves reference\n` +
  `// these ids, so a re-run must not renumber them.\n` +
  `export const restaurants: Restaurant[] = [\n${body}\n];` +
  tail;

await writeFile(DATA_PATH, next, "utf8");
console.log(`\nWrote ${rows.length} restaurants to src/data/restaurants.ts`);
console.log("Run `npm run restaurants:import` to load them into Postgres.");

const keptExports = [...tail.matchAll(/^export (?:const|type) (\w+)/gm)].map((m) => m[1]);
console.log(`Preserved exports after the array: ${keptExports.join(", ") || "(none)"}`);
}
