/**
 * Combines the Yelp and Google ratings into the one number the site shows.
 *
 *   node --env-file=.env.local scripts/blend-ratings.mjs --dry
 *   node --env-file=.env.local scripts/blend-ratings.mjs
 *
 * Touches no API and costs nothing. Both component ratings are already in the
 * table - Yelp's written by fetch-yelp.mjs, Google's by fetch-google.mjs - and
 * this is pure arithmetic over them.
 *
 * ## What it used to be
 *
 * This script fetched from Google itself and wrote the result into
 * `src/data/restaurants.ts`. Both halves were wrong by the time it mattered:
 * the fetching now belongs to fetch-google.mjs, which gets hours, address,
 * website and a photo from the same call, and the seed file is read by nothing
 * under `src/` - the app reads Postgres. Run as it was, it would have reported
 * success and changed nothing on the site.
 *
 * ## The blend
 *
 *   rating = (yelp x yelpCount + google x googleCount) / (yelpCount + googleCount)
 *
 * Weighted by review count so a 4.8 from 40 Google reviews cannot drag a 4.3
 * from 2,302 Yelp ones. Nothing here invents a number: a restaurant with only
 * one source keeps that source's rating unchanged, and one with neither is left
 * alone entirely.
 *
 * ## Recovering the Yelp component
 *
 * 770 rows carry a `rating` with no `yelp_rating` beside it - the early Yelp
 * import wrote the display column and never filled the component one. Blending
 * those as they stand would silently drop the Yelp half and leave a Google-only
 * number wearing a blended label.
 *
 * They are recoverable because `rating` can only ever have come from Yelp:
 * fetch-google.mjs writes it with COALESCE, so it never overwrites an existing
 * value, and nothing else has ever written it. A `yelp_url` on the row is the
 * proof Yelp matched it. So the first pass copies rating into yelp_rating for
 * exactly those rows, and after that the blend has both components to work with.
 *
 * Idempotent: it recomputes from the components every time, so running it twice
 * cannot compound a blend on top of a blend.
 *
 * ## Terms
 *
 * Both Yelp's and Google's platform terms cover derived use of their ratings,
 * including attribution and how long the data may be cached. Computing a mean
 * does not remove those obligations - see ratingDisplay.ts for what the UI says
 * about where these numbers come from.
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

/** Below this a source is too thin to move the blend and is ignored. */
const MIN_REVIEWS = 20;

/* --- 1. Recover the Yelp component where only the display column was set --- */

const orphaned = await sql`
  SELECT count(*)::int AS n FROM restaurants
  WHERE yelp_rating IS NULL AND rating IS NOT NULL AND yelp_url IS NOT NULL
`;

if (!DRY_RUN && orphaned[0].n > 0) {
  await sql`
    UPDATE restaurants
    SET yelp_rating = rating, yelp_review_count = review_count
    WHERE yelp_rating IS NULL AND rating IS NOT NULL AND yelp_url IS NOT NULL
  `;
}
console.log(`${orphaned[0].n} rows had a rating with no Yelp component; recovered.\n`);

/* --- 2. Blend ------------------------------------------------------------- */

const rows = await sql`
  SELECT id, name, yelp_rating, yelp_review_count, google_rating, google_review_count, rating
  FROM restaurants
  WHERE hold_reason IS NULL
    AND (yelp_rating IS NOT NULL OR google_rating IS NOT NULL)
`;

let blended = 0;
let singleSource = 0;
let unchanged = 0;
const examples = [];

for (const r of rows) {
  const yelpOk = r.yelp_rating != null && (r.yelp_review_count ?? 0) >= MIN_REVIEWS;
  const googleOk = r.google_rating != null && (r.google_review_count ?? 0) >= MIN_REVIEWS;

  let rating;
  let count;
  if (yelpOk && googleOk) {
    const total = r.yelp_review_count + r.google_review_count;
    rating =
      Math.round(
        ((r.yelp_rating * r.yelp_review_count + r.google_rating * r.google_review_count) / total) *
          10,
      ) / 10;
    count = total;
    blended += 1;
    if (examples.length < 8 && rating !== r.rating) {
      examples.push(
        `  ${r.name}: yelp ${r.yelp_rating} (${r.yelp_review_count}) + ` +
          `google ${r.google_rating} (${r.google_review_count}) -> ${rating} (${count})`,
      );
    }
  } else if (yelpOk) {
    rating = r.yelp_rating;
    count = r.yelp_review_count;
    singleSource += 1;
  } else if (googleOk) {
    rating = r.google_rating;
    count = r.google_review_count;
    singleSource += 1;
  } else {
    unchanged += 1;
    continue;
  }

  if (!DRY_RUN) {
    await sql`UPDATE restaurants SET rating = ${rating}, review_count = ${count} WHERE id = ${r.id}`;
  }
}

console.log(
  `${rows.length} restaurants carry at least one source rating.\n` +
    `  ${blended} blended from both Yelp and Google\n` +
    `  ${singleSource} kept a single source unchanged\n` +
    `  ${unchanged} below ${MIN_REVIEWS} reviews on every source - left alone\n`,
);
if (examples.length > 0) {
  console.log("Sample of what changed:\n" + examples.join("\n"));
}
if (DRY_RUN) console.log("\nDry run - nothing written.");
