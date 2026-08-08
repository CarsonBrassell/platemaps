/**
 * Blends each restaurant's Yelp rating with its Google rating and writes the
 * result back to src/data/restaurants.ts.
 *
 *   node --env-file=.env.local scripts/blend-ratings.mjs --dry
 *   node --env-file=.env.local scripts/blend-ratings.mjs
 *
 * The blend is a review-count-weighted mean, so a 4.3 from 2,302 Yelp reviews
 * is not pulled around by a 4.8 from 40 Google ones:
 *
 *   rating = (yelpRating * yelpCount + googleRating * googleCount)
 *            / (yelpCount + googleCount)
 *
 * This is a real statistic over real data — nothing here invents a number. The
 * component ratings are kept on each row (`yelpRating`, `googleRating`, and
 * their counts) so any displayed figure can be traced back to what produced it.
 * They are not rendered anywhere; they exist so this is auditable later.
 *
 * A restaurant with no confident Google match keeps its Yelp rating unchanged
 * rather than being dropped or guessed at.
 *
 * NOTE ON TERMS: both Yelp's and Google's platform terms cover derived use of
 * their ratings, including attribution and how long the data may be cached.
 * Computing a blend does not remove those obligations — see the app's
 * attribution decisions before shipping this publicly.
 */

import { readFile, writeFile } from "node:fs/promises";
import { restaurants } from "../src/data/restaurants.ts";

const DATA_PATH = new URL("../src/data/restaurants.ts", import.meta.url);
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DRY_RUN = process.argv.includes("--dry");

/** How far a Google result may sit from Yelp's coordinates and still count. */
const MAX_MATCH_METRES = 300;
/** Below this, a Google listing is too thin to be worth blending in. */
const MIN_GOOGLE_REVIEWS = 20;

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error(
    "GOOGLE_PLACES_API_KEY is not set.\n" +
      "Add it to .env.local and pass --env-file=.env.local",
  );
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

/** Loose comparison — "Farmer's Table" vs "Farmers Table" should still match. */
function normalise(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function namesAgree(a, b) {
  const x = normalise(a);
  const y = normalise(b);
  return x === y || x.includes(y) || y.includes(x);
}

async function findOnGoogle(restaurant) {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.rating,places.userRatingCount,places.location",
    },
    body: JSON.stringify({
      textQuery: `${restaurant.name} ${restaurant.neighborhood} San Diego`,
      // Biasing on Yelp's own coordinates is what keeps a chain like Farmer's
      // Table from matching the wrong branch.
      locationBias: {
        circle: {
          center: { latitude: restaurant.lat, longitude: restaurant.lng },
          radius: 500,
        },
      },
      maxResultCount: 5,
    }),
  });

  if (!res.ok) throw new Error(`Google ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const target = { lat: restaurant.lat, lng: restaurant.lng };
  let best = null;
  for (const place of data.places ?? []) {
    if (place.rating == null || place.userRatingCount == null) continue;
    const coords = { lat: place.location.latitude, lng: place.location.longitude };
    const distance = metresBetween(target, coords);
    if (distance > MAX_MATCH_METRES) continue;
    const title = place.displayName?.text ?? "";
    // A name that agrees wins outright; otherwise fall back to proximity, but
    // only among candidates already inside the radius.
    const score = (namesAgree(restaurant.name, title) ? 0 : 1000) + distance;
    if (!best || score < best.score) {
      best = { score, distance, rating: place.rating, count: place.userRatingCount, title };
    }
  }
  return best;
}

/** Review-count-weighted mean, to one decimal. */
function blend(yelpRating, yelpCount, googleRating, googleCount) {
  const total = yelpCount + googleCount;
  return Math.round(((yelpRating * yelpCount + googleRating * googleCount) / total) * 10) / 10;
}

console.log(`Looking up ${restaurants.length} restaurants on Google...\n`);

const rows = [];
let matched = 0;

for (const [i, restaurant] of restaurants.entries()) {
  const yelpRating = restaurant.yelpRating ?? restaurant.rating;
  const yelpCount = restaurant.yelpReviewCount ?? restaurant.reviewCount;

  let google = null;
  try {
    google = await findOnGoogle(restaurant);
  } catch (err) {
    console.error(`  ! ${restaurant.name}: ${err.message}`);
  }
  await sleep(120);

  const usable = google && google.count >= MIN_GOOGLE_REVIEWS;
  const next = { ...restaurant, yelpRating, yelpReviewCount: yelpCount };

  if (usable) {
    matched++;
    next.googleRating = google.rating;
    next.googleReviewCount = google.count;
    next.rating = blend(yelpRating, yelpCount, google.rating, google.count);
    next.reviewCount = yelpCount + google.count;
    console.log(
      `  ${restaurant.name}\n` +
        `      yelp ${yelpRating}★ (${yelpCount})  google ${google.rating}★ (${google.count})` +
        `  ->  ${next.rating}★ (${next.reviewCount})`,
    );
  } else {
    delete next.googleRating;
    delete next.googleReviewCount;
    next.rating = yelpRating;
    next.reviewCount = yelpCount;
    const why = google ? `only ${google.count} Google reviews` : "no confident match";
    console.log(`  ${restaurant.name}\n      ${why} — keeping Yelp ${yelpRating}★ (${yelpCount})`);
  }

  rows.push(next);
  process.stdout.write(`\r`);
}

console.log(`\n${matched}/${restaurants.length} blended, ${restaurants.length - matched} left on Yelp alone.`);

if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

/*
 * Same splice as fetch-restaurants.mjs: replace ONLY the restaurants array so
 * the `neighborhoodCenters` / `neighborhoods` / `cuisines` exports below it
 * survive.
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
      `    yelpRating: ${r.yelpRating},`,
      `    yelpReviewCount: ${r.yelpReviewCount},`,
    ];
    if (r.googleRating != null) {
      lines.push(`    googleRating: ${r.googleRating},`);
      lines.push(`    googleReviewCount: ${r.googleReviewCount},`);
    }
    if (r.trending) lines.push(`    trending: true,`);
    if (r.photo) lines.push(`    photo: ${JSON.stringify(r.photo)},`);
    if (r.photoAlt) lines.push(`    photoAlt: ${JSON.stringify(r.photoAlt)},`);
    if (r.yelpUrl) lines.push(`    yelpUrl: ${JSON.stringify(r.yelpUrl)},`);
    return `  {\n${lines.join("\n")}\n  },`;
  })
  .join("\n");

const next =
  current.slice(0, arrayStart) +
  `// Generated by scripts/fetch-restaurants.mjs, then re-rated by\n` +
  `// scripts/blend-ratings.mjs. \`rating\` is a review-count-weighted mean of\n` +
  `// the Yelp and Google figures kept alongside it; where no Google match was\n` +
  `// found it is the Yelp rating unchanged. \`statusLabel\` wait copy is still\n` +
  `// invented — see the fetch script's header.\n` +
  `export const restaurants: Restaurant[] = [\n${body}\n];` +
  tail;

await writeFile(DATA_PATH, next, "utf8");
console.log(`Wrote ${rows.length} restaurants to src/data/restaurants.ts`);
