/**
 * Turns resolved county permits into restaurant rows.
 *
 *   node --env-file=.env.local scripts/import-deh.mjs            # dry, the default
 *   node --env-file=.env.local scripts/import-deh.mjs --apply
 *   node --env-file=.env.local scripts/import-deh.mjs --limit 200 --apply
 *
 * Reads `data/deh-resolved.json` (written by `scripts/resolve-places.mjs`) and
 * does one thing per verdict:
 *
 *   import      insert a new row, `listed = false`
 *   duplicate   stamp the permit id onto the row we already have, nothing else
 *   closed      skip - Google says CLOSED_PERMANENTLY
 *   not-food    skip - Google's primaryType is not somewhere you eat
 *   unmatched   skip, and counted, because it is the next piece of work
 *
 * ## The second dedupe, and why place id alone is not enough
 *
 * `resolve-places.mjs` calls a permit a duplicate when Google's place id is
 * already in `restaurants.google_place_id`. That is exact and it is the right
 * first test - and it is blind to **834 open rows that have no place id at
 * all**. Those came from OpenStreetMap and were never enriched, so every one of
 * them is a restaurant this import would happily insert a second copy of, under
 * a different source key, with the two copies then splitting that restaurant's
 * posts between them. Silently. That is the exact failure `src/lib/sourceKey.ts`
 * was written to prevent, arriving through a door it does not cover.
 *
 * So before any insert, the resolved place is checked against the corpus on
 * geometry plus one of two agreements, both within MATCH_METRES:
 *
 *   - the same parsed street number and street (verify-coverage's `address()`),
 *     which catches a restaurant we hold under a different spelling, or
 *   - a name score >= NAME_STRONG against Google's display name, which catches
 *     one we hold at a differently-written address.
 *
 * Distance is required in both directions because neither signal is safe alone:
 * "Subway" scores 1.0 against forty other Subways, and a street number matches
 * across a whole county of numbered roads. 150 m is tight enough that two
 * genuinely different restaurants in one plaza stay separate.
 *
 * A hit is reclassified `duplicate` and the row is stamped. If that row had no
 * `google_place_id`, it gets one from this resolution - purely additive, it
 * fills a null and overwrites nothing, and it means the next import dedupes
 * that row by exact id instead of by this heuristic.
 *
 * ## The name on the row is Google's, never the county's
 *
 * This is the whole reason the resolve step exists. The permit says "SDCE FOOD
 * SERVICES INC" or "MARIA G HERNANDEZ"; the sign over the door says "Clems
 * Station". A directory that prints the legal name is not a directory anybody
 * can use, and there is no cleaning rule that recovers a trade name from an
 * owner's name. So `name` and `address` both come from the Google place, and
 * the county record survives only as `deh_record_id` - the provenance, not the
 * label.
 *
 * The same rule is why a `duplicate` updates *only* `deh_record_id` and
 * `deh_verified_at`. That row already has a name a human recognises, an
 * address, probably a rating and possibly a menu. A permit is evidence the
 * business is real; it is not a better spelling of its name.
 *
 * ## These arrive invisible
 *
 * Every insert is `listed = false`, like the OSM import before it, and nothing
 * reaches Discover, the facets or the map until `scripts/publish-check.mjs`
 * confirms a sourced rating and a real menu. The field mask on the Google resolve
 * step is the free Pro SKU, which carries no rating - so a Google-resolved entry
 * cannot pass the gate yet, by construction. That is intended: the row has to
 * exist before a menu can be keyed to it.
 *
 * An entry resolved via `resolve-places.mjs --via serper` is different: Serper's
 * `/maps` response carries a rating in the same call, so its resolved entry
 * holds a `serper{}` and this importer writes `rating`, `review_count` and
 * `website` straight onto the new row - see `serperFields()` below. The same
 * MIN_REVIEWS floor every other rating-writing script in this repo uses decides
 * whether that rating is trusted or left null; `enrich-places.mjs` is then only
 * needed for the photo. There is no `phone` column on `restaurants` today, so a
 * `serper.phone` is read off the resolved entry but never written - adding one
 * is out of scope here (see the brief: don't add columns).
 *
 * ## --dry is the default
 *
 * `--apply` is required to write. Nothing here deletes or renames anything, but
 * it can insert several thousand rows in one go, and a script that does that on
 * a bare invocation is a script that does it by accident.
 */

import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { address, nameTokens, nameScore } from "./verify-coverage.mjs";
import { buildRow, cityFrom, cuisineFrom, idAllocator, insertRow } from "./deh-rows.mjs";

const RESOLVED_PATH = "data/deh-resolved.json";

/** How close a resolved place must sit to one of ours to be the same business. */
const MATCH_METRES = 150;
/**
 * Jaccard floor on identifying words when the name is deciding alone.
 *
 * Higher than verify-coverage's 0.5, and the difference is the question being
 * asked. There, 0.5 answers "does this business exist in the county list at
 * all", where a near miss is still informative. Here it decides whether to
 * merge two records, and 0.5 is exactly where "Julian Pie Company" meets
 * "Julian Beer Company" - two real, different Julian businesses.
 */
const NAME_CONFIDENT = 0.8;

/**
 * Matches `MIN_REVIEWS` in blend-ratings.mjs, enrich-google.mjs and
 * enrich-places.mjs: below this many reviews a rating is too thin to publish
 * on, so `rating` and `review_count` are written together or not at all - the
 * same "they move together" rule enrich-places.mjs's header explains for the
 * Google Place Details column pair. A resolved entry's `serper{}` that fails
 * this floor writes exactly what a Google-resolved row with no enrichment
 * yet already gets: `rating` NULL, `review_count` 0.
 */
const MIN_REVIEWS = 20;

/** `serper{}` off a resolved entry -> the three fields import-deh writes. */
function serperFields(entry) {
  const s = entry.serper;
  const ok = s && s.rating != null && Number.isFinite(s.reviewCount) && s.reviewCount >= MIN_REVIEWS;
  return {
    rating: ok ? s.rating : null,
    reviewCount: ok ? s.reviewCount : 0,
    website: s?.website || null,
  };
}

function strFlag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
function numFlag(name, fallback) {
  const n = Number(strFlag(name, NaN));
  return Number.isFinite(n) ? n : fallback;
}

const APPLY = process.argv.includes("--apply");
const LIMIT = numFlag("limit", Infinity);
const FROM = strFlag("from", RESOLVED_PATH);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
if (!existsSync(FROM)) {
  console.error(`${FROM} is missing. Run:`);
  console.error(`  node --env-file=.env.local scripts/verify-coverage.mjs --profile`);
  console.error(`  node --env-file=.env.local scripts/resolve-places.mjs --max-calls <n>`);
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const resolved = JSON.parse(await readFile(FROM, "utf8"));

/* --- field mapping -------------------------------------------------------- */

/*
 * `cityFrom`, `cuisineFrom`, `idAllocator`, `buildRow` and `insertRow` all live
 * in `scripts/deh-rows.mjs` now. They moved there when `geocode-permits.mjs`
 * needed the same row shape for the permits Google could not resolve; see that
 * file's header for why the write path is shared and the decision path is not.
 */

/* --- rows ----------------------------------------------------------------- */

const buckets = { import: [], duplicate: [], closed: [], "not-food": [], unmatched: [] };
for (const r of resolved) (buckets[r.status] ??= []).push(r);

const existing = await sql`
  SELECT id, source_key, sort_order, name, address, lat, lng, google_place_id, hold_reason
  FROM restaurants`;
const knownSourceKeys = new Set(existing.filter((r) => r.source_key).map((r) => r.source_key));

/* --- the second dedupe: geometry + name or street ------------------------- */

function metresBetween(a, b) {
  const latRad = (a.lat * Math.PI) / 180;
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos(latRad);
  return Math.hypot(dLat, dLng);
}

/*
 * Held rows are excluded. `hold_reason` is set on a row somebody has already
 * judged - a closure, a bad address, a Tijuana overshoot - and matching a live
 * permit onto one would quietly resurrect that judgement as "verified".
 */
const candidates = existing
  .filter((r) => r.hold_reason == null && r.lat != null && r.lng != null)
  .map((r) => ({ ...r, ...address(r.address), tokens: nameTokens(r.name) }));

/*
 * Bucketed by rounded coordinate, the same trick import-osm.mjs uses: each row
 * is filed into its own ~1.1 km cell and the eight around it, so a lookup is a
 * handful of comparisons instead of 4,500 x 5,695. The 3x3 fill is what lets a
 * place near a cell edge still find a neighbour on the other side.
 */
const grid = new Map();
const cell = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;
for (const r of candidates) {
  for (const dLat of [-0.01, 0, 0.01]) {
    for (const dLng of [-0.01, 0, 0.01]) {
      const k = cell(r.lat + dLat, r.lng + dLng);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(r);
    }
  }
}

/**
 * The row we already hold for this resolved place, or null.
 *
 * ## Every rule below was put here by a wrong pair this script printed
 *
 * The first version was distance plus *either* a street match *or* a name score
 * of 0.5. Run against the first 491 cached permits it produced ten pairs and
 * seven were wrong, all in the same way: `address()` strips suite numbers on
 * purpose - verify-coverage uses it to ask "is there a permit at this address",
 * where a whole-plaza hit is the right answer - so "same street number and
 * street" matched any two tenants of one building. It paired Firenze Trattoria
 * with Champagne Cafe & Bakery, Subway with Kokoro Restaurant, Red Ribbon
 * Bakeshop with Chowking. A bare 0.5 name score paired Julian Pie Company with
 * Julian Beer Company, which share "Julian" and "Company" and nothing else.
 *
 * A false positive is the expensive direction here. It loses the real
 * restaurant AND stamps somebody else's permit - and, through the additive
 * place-id fill, somebody else's `google_place_id` - onto an unrelated row.
 * A false negative just inserts a row a later pass can merge. So:
 *
 *  1. **A differing place id is a veto.** If our row already carries a
 *     `google_place_id` and it is not this one, Google has already looked at
 *     these two and called them different places. That is better evidence than
 *     any distance or string test, and it alone killed all seven bad pairs.
 *  2. **The street branch still needs a shared word.** Same number and street
 *     with zero identifying words in common is a neighbour, not a duplicate.
 *  3. **The name-only branch needs a high bar** (NAME_CONFIDENT), because
 *     without address agreement the name is carrying the whole decision.
 *     0.5 is where "Julian Pie" meets "Julian Beer".
 *
 * The nearest qualifying row wins, so a plaza with two of our rows in it does
 * not depend on insertion order.
 */
function corpusMatch(place) {
  const parsed = address(place.formattedAddress);
  const tokens = nameTokens(place.displayName);
  const here = { lat: place.lat, lng: place.lng };

  let best = null;
  for (const r of grid.get(cell(place.lat, place.lng)) ?? []) {
    /* Rule 1. Google has already distinguished these two. */
    if (r.google_place_id != null && r.google_place_id !== place.id) continue;

    const metres = metresBetween(here, { lat: r.lat, lng: r.lng });
    if (metres > MATCH_METRES) continue;

    const score = nameScore(tokens, r.tokens);
    const sameStreet =
      parsed.num != null && parsed.street != null && r.num === parsed.num && r.street === parsed.street;

    let why = null;
    if (sameStreet && score > 0) why = `same street and number, name score ${score.toFixed(2)}`;
    else if (score >= NAME_CONFIDENT) why = `name score ${score.toFixed(2)}`;
    if (!why) continue;

    if (!best || metres < best.metres) best = { row: r, metres, why };
  }
  return best;
}

/* Ids continue from the table's high-water mark; see deh-rows.mjs. */
const allocate = idAllocator(existing);

const inserts = [];
const alreadyPresent = [];
/** Reclassified from `import` to `duplicate` by corpusMatch, for the report. */
const reclassified = [];
/*
 * Two permits landing on one existing row. The first stamps it; the second is
 * still not an insert, but it must not overwrite the first one's permit id, so
 * it is counted and left alone. Usually a food hall or a business that moved.
 */
const collisions = [];
const claimedRows = new Set();

for (const r of buckets.import.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
  if (knownSourceKeys.has(r.sourceKey)) {
    /* A re-run. The ON CONFLICT below handles it, but it should not consume an
     * id, so it is counted here rather than pushed. */
    alreadyPresent.push(r);
    continue;
  }
  const p = r.place;
  if (p.lat == null || p.lng == null) {
    alreadyPresent.push({ ...r, why: "no coordinates" });
    continue;
  }

  const hit = corpusMatch(p);
  if (hit) {
    const entry = {
      ...r,
      matchedRowId: hit.row.id,
      matchedRowName: hit.row.name,
      matchedRowAddress: hit.row.address,
      matchedRowHadPlaceId: hit.row.google_place_id != null,
      metres: Math.round(hit.metres),
      why: hit.why,
    };
    if (claimedRows.has(hit.row.id)) collisions.push(entry);
    else {
      claimedRows.add(hit.row.id);
      reclassified.push(entry);
    }
    continue;
  }

  inserts.push(
    buildRow(
      {
        sourceKey: r.sourceKey,
        dehRecordId: r.recordId,
        name: p.displayName,
        address: p.formattedAddress,
        city: cityFrom(p.formattedAddress, r.city),
        lat: p.lat,
        lng: p.lng,
        googlePlaceId: p.id,
        /* Null: a permit Google resolved needs no operator judgement beyond the
         * `listed = false` every import gets. geocode-permits.mjs always sets
         * one. */
        holdReason: null,
        ...cuisineFrom(p),
        /* Only entries resolved via `resolve-places.mjs --via serper` carry a
         * `serper{}`; a Google-resolved entry has none and gets the same
         * null/0/null this row would have gotten before Serper existed. */
        ...serperFields(r),
      },
      allocate,
    ),
  );
}

/* --- report --------------------------------------------------------------- */

const pad = (n) => String(n).padStart(6);
console.log(`read ${resolved.length} resolved permits from ${FROM}\n`);
for (const [k, rows] of Object.entries(buckets)) {
  console.log(`  ${pad(rows.length)}  ${k}`);
}

console.log(`\nrows to insert: ${inserts.length}`);
if (alreadyPresent.length) {
  console.log(`  ${alreadyPresent.length} import-verdict rows skipped (source_key already in the table, or no coordinates)`);
}
console.log(`ids that would be assigned: ${inserts.length ? `${inserts[0].id}..${inserts[inserts.length - 1].id}` : "none"}`);
console.log(`rows to stamp with a permit id (duplicate verdict, exact place id): ${buckets.duplicate.length}`);

/* --- the fallback dedupe's own report ------------------------------------- */

const willFillPlaceId = reclassified.filter((r) => !r.matchedRowHadPlaceId).length;
console.log(
  `\nreclassified import -> duplicate by the corpus fallback: ${reclassified.length}` +
    ` (within ${MATCH_METRES} m)`,
);
console.log(`  of those, ${willFillPlaceId} matched a row with NO google_place_id — exactly the`);
console.log(`  case exact-id dedupe cannot see, and each would have become a second copy.`);
console.log(`  ${reclassified.length - willFillPlaceId} matched a row that already had a place id (a different one).`);
if (collisions.length) {
  console.log(`  ${collisions.length} further permits landed on a row already claimed by another permit;`);
  console.log(`  they are not inserted and not stamped. Check these by hand.`);
}

if (reclassified.length) {
  console.log(`\nfirst ${Math.min(20, reclassified.length)} fallback pairs (permit -> existing row):\n`);
  for (const r of reclassified.slice(0, 20)) {
    console.log(`  ${r.place.displayName}  [permit ${r.recordId}]`);
    console.log(`    -> id ${r.matchedRowId}  ${r.matchedRowName}`);
    console.log(`       ${r.metres} m, ${r.why}${r.matchedRowHadPlaceId ? "" : ", row has no place id -> would be filled"}`);
    console.log(`       google: ${r.place.formattedAddress}`);
    console.log(`       ours:   ${r.matchedRowAddress ?? "(no address)"}`);
  }
}
if (collisions.length) {
  console.log(`\ncollisions (second permit onto an already-claimed row):`);
  for (const r of collisions.slice(0, 10)) {
    console.log(`  ${r.place.displayName} [${r.recordId}] -> id ${r.matchedRowId} ${r.matchedRowName}`);
  }
}

const noCuisine = inserts.filter((r) => !r.cuisine).length;
console.log(`\ncuisine resolved for ${inserts.length - noCuisine} of ${inserts.length}; ${noCuisine} would be null`);

const withRating = inserts.filter((r) => r.rating != null).length;
const withWebsite = inserts.filter((r) => r.website != null).length;
if (withRating || withWebsite) {
  console.log(
    `serper carried in: ${withRating} with a rating/review_count (>= ${MIN_REVIEWS} reviews), ` +
      `${withWebsite} with a website`,
  );
}

/*
 * The unmatched pile is the next piece of work, not a failure to hide. The plan
 * is a US Census batch geocode (free, 10,000 an upload) for a coordinate, then
 * the row lands with `hold_reason` set so it is visible to an operator and
 * invisible to a visitor. Nothing in this script touches them.
 *
 * TODO(stage-02): geocode data/deh-resolved.json's unmatched entries through
 * the Census batch endpoint and import them held.
 */
console.log(`\nTODO(stage-02): ${buckets.unmatched.length} unmatched permits need a Census geocode + hold_reason.`);
console.log(`                Nothing in this script writes them.`);

if (inserts.length) {
  console.log(`\nfirst ${Math.min(10, inserts.length)} rows:\n`);
  for (const r of inserts.slice(0, 10)) {
    console.log(`  id ${r.id}  ${r.name}`);
    console.log(`     ${r.address}`);
    console.log(`     ${r.neighborhood} / ${r.cuisine ?? "(no cuisine)"} / ${r.cuisineRaw ?? "-"}` +
      `  ${r.lat.toFixed(5)},${r.lng.toFixed(5)}`);
    console.log(`     source_key ${r.sourceKey}  place ${r.googlePlaceId}`);
  }
}

if (!APPLY) {
  console.log(`\nDry run — nothing written. Re-run with --apply to insert.`);
  process.exit(0);
}

/* --- write ---------------------------------------------------------------- */

const verifiedAt = new Date().toISOString();

for (const [i, r] of inserts.entries()) {
  /* "update", not "nothing": a re-run of this importer is expected to refresh
   * what Google now says. See deh-rows.mjs for what it refuses to touch. */
  await insertRow(sql, r, verifiedAt, { onConflict: "update" });
  if (i % 50 === 0) process.stdout.write(`\r  inserting ${i}/${inserts.length}`);
}

/*
 * A duplicate is a row we already hold that this permit confirms. It gets the
 * provenance and nothing else — no name, no address, no coordinates. See the
 * header.
 */
let stamped = 0;
for (const r of buckets.duplicate) {
  const rows = await sql`
    UPDATE restaurants
       SET deh_record_id = ${r.recordId}, deh_verified_at = ${verifiedAt}::timestamptz
     WHERE google_place_id = ${r.place.id}
     RETURNING id`;
  stamped += rows.length;
}

/*
 * The fallback's hits, addressed by row id because the whole point is that
 * these rows have no place id to address them by.
 *
 * COALESCE on google_place_id is the additive half: a row that already has an
 * id keeps it (ours may be a different branch, and this heuristic is not
 * evidence enough to overwrite an exact identifier), and a row with none gains
 * one, so the next run dedupes it exactly instead of by geometry.
 */
let filledPlaceIds = 0;
for (const r of reclassified) {
  const rows = await sql`
    UPDATE restaurants
       SET deh_record_id   = ${r.recordId},
           deh_verified_at = ${verifiedAt}::timestamptz,
           google_place_id = COALESCE(google_place_id, ${r.place.id})
     WHERE id = ${r.matchedRowId}
     RETURNING id, google_place_id`;
  stamped += rows.length;
  if (rows.length && !r.matchedRowHadPlaceId) filledPlaceIds += 1;
}

console.log(`\n\ninserted or refreshed ${inserts.length} rows; stamped ${stamped} existing rows with a permit id.`);
console.log(`${reclassified.length} of those came from the corpus fallback; ${filledPlaceIds} gained a google_place_id they lacked.`);
console.log(`Everything inserted is listed = false. Run publish-check.mjs after enrichment.`);
