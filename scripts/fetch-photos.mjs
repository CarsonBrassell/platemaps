/**
 * Fills in restaurant photos from the Yelp Fusion API.
 *
 *   YELP_API_KEY=... node scripts/fetch-photos.mjs          # write the results
 *   YELP_API_KEY=... node scripts/fetch-photos.mjs --dry    # print them only
 *
 * Get a free key at https://fusion.yelp.com/v3/manage_app
 *
 * Re-runnable: each run overwrites the photo/yelpUrl of every restaurant it can
 * match. Yelp's terms don't allow caching their content indefinitely, so this is
 * meant to be re-run periodically rather than treated as a one-time import.
 *
 * Matching is name + coordinates. Yelp's top hit for a name at a location is
 * usually right, but "usually" isn't "always" — anything below the similarity
 * threshold is skipped and reported rather than guessed at, so a wrong photo
 * never lands silently.
 */

import { readFile, writeFile } from "node:fs/promises";

const DATA_PATH = new URL("../src/data/restaurants.ts", import.meta.url);
const SEARCH_URL = "https://api.yelp.com/v3/businesses/search";
const DRY_RUN = process.argv.includes("--dry");

/** Below this, treat the match as untrustworthy and skip it. */
const MIN_SIMILARITY = 0.55;

const apiKey = process.env.YELP_API_KEY;
if (!apiKey) {
  console.error("YELP_API_KEY is not set.\nGet one at https://fusion.yelp.com/v3/manage_app");
  process.exit(1);
}

/**
 * Lowercase, drop punctuation, collapse whitespace — and nothing else.
 *
 * An earlier version also stripped words like "kitchen", "cafe" and "bar" as
 * filler. That was wrong: those words are load-bearing parts of real names, so
 * "Prep Kitchen" collapsed to "prep" and stopped matching the actual Prepkitchen.
 * Only "&"/"and" is unified, since sources genuinely disagree on that one.
 */
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dice coefficient over character bigrams — tolerant of small spelling drift. */
function similarity(a, b) {
  const [x, y] = [normalize(a), normalize(b)];
  if (!x || !y) return 0;
  if (x === y) return 1;

  // Yelp often carries a location suffix the local name omits ("Prepkitchen
  // Little Italy" vs "Prep Kitchen"). Treat full containment as a strong match,
  // since bigram overlap alone under-scores it badly.
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (longer.includes(shorter) && shorter.length >= 4) return 0.9;
  if (longer.replace(/\s/g, "").includes(shorter.replace(/\s/g, "")) && shorter.length >= 6) {
    return 0.85;
  }

  const bigrams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };

  const [bx, by] = [bigrams(x), bigrams(y)];
  let shared = 0;
  for (const [g, count] of bx) shared += Math.min(count, by.get(g) ?? 0);
  const total = [...bx.values()].reduce((n, c) => n + c, 0) +
    [...by.values()].reduce((n, c) => n + c, 0);
  return total === 0 ? 0 : (2 * shared) / total;
}

async function findPhoto({ name, lat, lng }) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("term", name);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("radius", "1600"); // ~1 mile; these are exact coordinates
  url.searchParams.set("limit", "5");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    throw new Error(`Yelp ${res.status} ${res.statusText} — ${await res.text()}`);
  }

  const { businesses = [] } = await res.json();

  // Best name match among the nearby hits, not simply the first result.
  let best = null;
  for (const b of businesses) {
    const score = similarity(name, b.name);
    if (!best || score > best.score) best = { score, business: b };
  }

  if (!best || best.score < MIN_SIMILARITY) {
    return { ok: false, reason: best ? `best match "${best.business.name}" scored ${best.score.toFixed(2)}` : "no results" };
  }
  if (!best.business.image_url) {
    return { ok: false, reason: `matched "${best.business.name}" but it has no photo` };
  }

  return {
    ok: true,
    matched: best.business.name,
    score: best.score,
    photo: best.business.image_url,
    yelpUrl: best.business.url,
  };
}

/** Pull id/name/lat/lng out of each object literal in the exported array. */
function parseRestaurants(source) {
  const out = [];
  const blocks = source.matchAll(/\{\s*\n\s*id:\s*"([^"]+)"[\s\S]*?\n\s*\},/g);
  for (const block of blocks) {
    const [text, id] = block;
    const name = text.match(/name:\s*"([^"]+)"/)?.[1];
    const lat = text.match(/lat:\s*(-?[\d.]+)/)?.[1];
    const lng = text.match(/lng:\s*(-?[\d.]+)/)?.[1];
    if (name && lat && lng) {
      out.push({ id, name, lat: Number(lat), lng: Number(lng), start: block.index, text });
    }
  }
  return out;
}

/** Insert or replace `photo`/`yelpUrl` on one restaurant's object literal. */
function applyPhoto(block, photo, yelpUrl) {
  let next = block
    .replace(/\n\s*photo:\s*"[^"]*",/g, "")
    .replace(/\n\s*yelpUrl:\s*"[^"]*",/g, "");
  // Insert just before the closing brace of the literal.
  return next.replace(/\n(\s*)\},$/, `\n$1  photo: "${photo}",\n$1  yelpUrl: "${yelpUrl}",\n$1},`);
}

const source = await readFile(DATA_PATH, "utf8");
const restaurants = parseRestaurants(source);

if (restaurants.length === 0) {
  console.error("Parsed 0 restaurants — the shape of restaurants.ts probably changed.");
  process.exit(1);
}

console.log(`Looking up ${restaurants.length} restaurants...\n`);

let updated = source;
const skipped = [];
let found = 0;

for (const r of restaurants) {
  try {
    const result = await findPhoto(r);
    if (!result.ok) {
      skipped.push(`${r.name} — ${result.reason}`);
      console.log(`  skip  ${r.name}: ${result.reason}`);
      continue;
    }
    found++;
    console.log(`  ok    ${r.name} -> "${result.matched}" (${result.score.toFixed(2)})`);
    if (!DRY_RUN) {
      updated = updated.replace(r.text, applyPhoto(r.text, result.photo, result.yelpUrl));
    }
  } catch (err) {
    skipped.push(`${r.name} — ${err.message}`);
    console.error(`  FAIL  ${r.name}: ${err.message}`);
  }
  // Stay well clear of Yelp's rate limit.
  await new Promise((resolve) => setTimeout(resolve, 200));
}

console.log(`\n${found} matched, ${skipped.length} skipped.`);

if (DRY_RUN) {
  console.log("\nDry run — nothing written. Re-run without --dry to apply.");
} else if (found > 0) {
  await writeFile(DATA_PATH, updated, "utf8");
  console.log(`Wrote ${DATA_PATH.pathname}`);
}

if (skipped.length) {
  console.log("\nNeeds a photo set by hand:");
  for (const line of skipped) console.log(`  - ${line}`);
}
