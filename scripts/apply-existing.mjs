/**
 * Applies `data/existing-resolved.json` (written by `resolve-places.mjs
 * --existing`) to the `restaurants` table. Nothing else reads that file today,
 * so a row resolved in `--existing` mode sits there forever unless this runs.
 *
 *   node --env-file=.env.local scripts/apply-existing.mjs            # dry run, default
 *   node --env-file=.env.local scripts/apply-existing.mjs --apply
 *
 * Entries are matched to a row by `restaurantId` (the id `loadExisting` put on
 * every entry), falling back to `source_key` for any entry that predates that
 * field. A row is only ever touched while it still has `google_place_id IS
 * NULL AND hold_reason IS NULL` — checked against the database at run time,
 * not against whatever the entry's stale snapshot says — because another
 * script (exclude-chains, a permit import, a human) may have already resolved
 * or held it since `resolve-places.mjs` wrote this file.
 *
 * Per verdict:
 *
 *   import     google_place_id = place.id (the row's first place id, by the
 *              gate above); lat/lng filled from place only where ours are
 *              null; if the entry carries a Serper `serper{}`, rating and
 *              review_count are written together under the same MIN_REVIEWS
 *              floor import-deh.mjs uses, and only where ours are not already
 *              a real value - COALESCE(rating, ...), COALESCE(NULLIF
 *              (review_count, 0), ...), COALESCE(website, ...), the exact
 *              additive idiom deh-rows.mjs's `insertRow` uses for the same
 *              three columns. Name and address are never touched: this row's
 *              trade name is already ours, unlike a fresh permit import where
 *              the county only has the legal name.
 *   duplicate  hold_reason = 'duplicate of <existingRestaurantId>', but only
 *              when the row it duplicates is, right now, either listed or
 *              already carries a place id - a duplicate note pointing at a
 *              row nobody would ever publish is not worth holding this one
 *              for. An entry with no `existingRestaurantId` (the resolver
 *              matched a place id but couldn't say whose) is skipped and
 *              counted rather than guessed at.
 *   closed     hold_reason = the exact string fetch-google.mjs uses for a
 *              CLOSED_PERMANENTLY verdict, so every closed hold in this table
 *              reads the same regardless of which script set it.
 *   not-food, unmatched, unmatched-no-id
 *              left alone - none of these say enough to act on. Counted so
 *              the report shows where the queue still stands.
 *
 * Before any UPDATE, every row about to be touched is snapshotted to a JSON
 * file - id, listed, hold_reason, google_place_id, the same four columns
 * exclude-chains.mjs snapshots, because these have no history in the
 * database and a bad run has no other way back.
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sql } from "./sql-client.mjs";

const APPLY = process.argv.includes("--apply");
const RESOLVED_PATH = "data/existing-resolved.json";
const SNAP_DIR = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/deh";

/*
 * Matches `MIN_REVIEWS` in blend-ratings.mjs, enrich-google.mjs,
 * enrich-places.mjs and import-deh.mjs. None of those export it - deh-rows.mjs,
 * which all four otherwise share their row-writing logic through, doesn't
 * define it either - so every consumer restates the literal 20 with a comment
 * pointing at the others rather than inventing a shared export none of them
 * has. Same rule here.
 */
const MIN_REVIEWS = 20;

/* fetch-google.mjs's exact string for a CLOSED_PERMANENTLY verdict - grepped
 * verbatim so every closed hold in this table reads the same. */
const CLOSED_HOLD_REASON = "Google reports this business as permanently closed";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

if (!existsSync(RESOLVED_PATH)) {
  console.error(`${RESOLVED_PATH} is missing. Run resolve-places.mjs --existing first.`);
  process.exit(1);
}
const entries = JSON.parse(await readFile(RESOLVED_PATH, "utf8"));

console.log(`apply-existing  ${APPLY ? "APPLY" : "Dry run"}  ${entries.length} entries in ${RESOLVED_PATH}\n`);

/* --- load current state for every row an entry could touch ---------------- */

const ids = [...new Set(entries.map((e) => e.restaurantId).filter(Boolean))];
const sourceKeys = [...new Set(entries.filter((e) => !e.restaurantId).map((e) => e.sourceKey).filter(Boolean))];
const otherIds = [...new Set(
  entries
    .filter((e) => e.status === "duplicate" && e.existingRestaurantId)
    .map((e) => e.existingRestaurantId),
)];
const allIds = [...new Set([...ids, ...otherIds])];

const rows = await sql`
  SELECT id::text, source_key, name, listed, hold_reason, google_place_id, lat, lng,
         rating, review_count, website
  FROM restaurants
  WHERE id = ANY(${allIds}) OR source_key = ANY(${sourceKeys})`;

const byId = new Map(rows.map((r) => [r.id, r]));
const bySourceKey = new Map(rows.filter((r) => r.source_key).map((r) => [r.source_key, r]));

function rowFor(entry) {
  if (entry.restaurantId) return byId.get(entry.restaurantId) ?? null;
  return bySourceKey.get(entry.sourceKey) ?? null;
}

/* --- decide, per entry ----------------------------------------------------- */

const LEAVE_ALONE = new Set(["not-food", "unmatched", "unmatched-no-id"]);

const report = {}; // status -> { total, applied, wouldApply, leftAlone, skipped: { reason: count } }
function bucket(status) {
  return (report[status] ??= { total: 0, applied: 0, wouldApply: 0, leftAlone: 0, skipped: {} });
}
function skip(status, reason) {
  const b = bucket(status);
  b.skipped[reason] = (b.skipped[reason] ?? 0) + 1;
}

const updates = []; // { id, sql: () => Query }
const touchedForSnapshot = []; // { id, listed, hold_reason, google_place_id } pre-image

for (const entry of entries) {
  const b = bucket(entry.status);
  b.total += 1;

  const row = rowFor(entry);
  if (!row) {
    skip(entry.status, "row not found in restaurants (restaurantId/source_key)");
    continue;
  }

  if (LEAVE_ALONE.has(entry.status)) {
    b.leftAlone += 1;
    continue;
  }

  if (row.google_place_id != null) {
    skip(entry.status, "already has google_place_id");
    continue;
  }
  if (row.hold_reason != null) {
    skip(entry.status, `already held (${row.hold_reason})`);
    continue;
  }

  if (entry.status === "import") {
    if (!entry.place?.id) {
      skip(entry.status, "entry has no place.id");
      continue;
    }
    const lat = row.lat == null && entry.place.lat != null ? entry.place.lat : row.lat;
    const lng = row.lng == null && entry.place.lng != null ? entry.place.lng : row.lng;

    let ratingVal = row.rating;
    let reviewCountVal = row.review_count;
    let websiteVal = row.website;
    if (entry.serper) {
      const s = entry.serper;
      const floorOk = s.rating != null && Number.isFinite(s.reviewCount) && s.reviewCount >= MIN_REVIEWS;
      if (row.rating == null) ratingVal = floorOk ? s.rating : row.rating;
      if (!row.review_count) reviewCountVal = floorOk ? s.reviewCount : row.review_count;
      if (row.website == null && s.website) websiteVal = s.website;
    }

    b.wouldApply += 1;
    touchedForSnapshot.push({ id: row.id, listed: row.listed, hold_reason: row.hold_reason, google_place_id: row.google_place_id });
    updates.push({
      id: row.id,
      status: entry.status,
      run: () => sql`
        UPDATE restaurants
        SET google_place_id = ${entry.place.id},
            lat = ${lat}, lng = ${lng},
            rating = ${ratingVal}, review_count = ${reviewCountVal}, website = ${websiteVal}
        WHERE id = ${row.id} AND google_place_id IS NULL AND hold_reason IS NULL
        RETURNING id`,
    });
    row.google_place_id = entry.place.id; // guard a later entry that hits the same row
    continue;
  }

  if (entry.status === "duplicate") {
    if (!entry.existingRestaurantId) {
      skip(entry.status, "entry does not say which row it duplicates");
      continue;
    }
    const other = byId.get(entry.existingRestaurantId);
    if (!other) {
      skip(entry.status, "duplicated row not found in restaurants");
      continue;
    }
    if (!other.listed && other.google_place_id == null) {
      skip(entry.status, "duplicated row is neither listed nor place-identified");
      continue;
    }

    const reason = `duplicate of ${entry.existingRestaurantId}`;
    b.wouldApply += 1;
    touchedForSnapshot.push({ id: row.id, listed: row.listed, hold_reason: row.hold_reason, google_place_id: row.google_place_id });
    updates.push({
      id: row.id,
      status: entry.status,
      run: () => sql`
        UPDATE restaurants SET hold_reason = ${reason}
        WHERE id = ${row.id} AND google_place_id IS NULL AND hold_reason IS NULL
        RETURNING id`,
    });
    row.hold_reason = reason;
    continue;
  }

  if (entry.status === "closed") {
    b.wouldApply += 1;
    touchedForSnapshot.push({ id: row.id, listed: row.listed, hold_reason: row.hold_reason, google_place_id: row.google_place_id });
    updates.push({
      id: row.id,
      status: entry.status,
      run: () => sql`
        UPDATE restaurants SET hold_reason = ${CLOSED_HOLD_REASON}
        WHERE id = ${row.id} AND google_place_id IS NULL AND hold_reason IS NULL
        RETURNING id`,
    });
    row.hold_reason = CLOSED_HOLD_REASON;
    continue;
  }

  skip(entry.status, "unrecognised status");
}

/* --- report ----------------------------------------------------------------- */

const order = ["import", "duplicate", "closed", "not-food", "unmatched", "unmatched-no-id"];
const statuses = [...order.filter((s) => report[s]), ...Object.keys(report).filter((s) => !order.includes(s))];

function printTable(countKey, countLabel) {
  console.table(
    statuses.map((s) => {
      const b = report[s];
      const skipped = Object.values(b.skipped).reduce((a, n) => a + n, 0);
      return {
        status: s,
        total: b.total,
        [countLabel]: b[countKey],
        "left alone": b.leftAlone,
        skipped,
      };
    }),
  );
}

for (const s of statuses) {
  const b = report[s];
  if (!Object.keys(b.skipped).length) continue;
  console.log(`\n${s} - skipped, by reason:`);
  for (const [reason, n] of Object.entries(b.skipped).sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${reason}`);
  }
}
console.log();

if (!APPLY) {
  printTable("wouldApply", "would-apply");
  console.log(`\nDry run - nothing written. ${updates.length} row(s) would be updated.`);
  console.log("Re-run with --apply to write, e.g.:");
  console.log("  node --env-file=.env.local scripts/apply-existing.mjs --apply");
  process.exit(0);
}

if (!updates.length) {
  printTable("applied", "applied");
  console.log("\nNothing to apply.");
  process.exit(0);
}

await mkdir(SNAP_DIR, { recursive: true });
const snapPath = `${SNAP_DIR}/apply-existing-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
await writeFile(snapPath, JSON.stringify(touchedForSnapshot, null, 1));
console.log(`snapshot (${touchedForSnapshot.length} rows): ${snapPath}`);

let applied = 0;
for (const u of updates) {
  const res = await u.run();
  if (res.length) {
    applied += 1;
    bucket(u.status).applied += 1;
  }
}

printTable("applied", "applied");
console.log(`\napplied ${applied} of ${updates.length} attempted updates.`);
console.log("Run publish-check.mjs next so any newly-eligible row's listed flag gets recomputed:");
console.log("  node --env-file=.env.local scripts/publish-check.mjs");
