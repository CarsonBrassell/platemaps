/**
 * Breaks "duplicate of" cycles so the restaurant behind them is visible again.
 *
 *   node --env-file=.env.local scripts/fix-circular-duplicates.mjs          # report
 *   node --env-file=.env.local scripts/fix-circular-duplicates.mjs --apply
 *
 * ## The bug
 *
 * apply-existing.mjs and retry-permit-only.mjs each write
 * `hold_reason = 'duplicate of <id>'` when a row resolves to a place that
 * already has a row. Neither checked whether the *other* row had already been
 * held as a duplicate of *this* one, so two rows for the same restaurant could
 * end up pointing at each other, both held, neither listed. The 2026-09-13
 * spot check found 24 such pairs — Supannee House of Thai and the original
 * Pho Ca Dao among them — each a real, open restaurant with a menu, invisible.
 *
 * ## What it does
 *
 * For every pair A<->B: the keeper is the row with more dishes, then the one
 * with hours, then the lower id (older). The keeper's hold is cleared and it
 * is listed if it has coordinates. The loser keeps `duplicate of <keeper>`.
 * Fields the keeper lacks (address, city, website, hours, price_band, photo,
 * rating, google_place_id) are copied from the loser — Supannee's better menu
 * sat on the row without hours, the hours on the row without the menu.
 *
 * Also handles chains: A -> B -> A through more than two rows, and any
 * duplicate whose target is itself a duplicate (re-pointed at the final
 * keeper). Rows whose target is held for another reason (closed, chain
 * excluded) are left alone: that is a judgement, not a cycle.
 *
 * Snapshots every touched row to probe/snapshots/ before writing.
 */
import { neon } from "@neondatabase/serverless";
import { writeFileSync, mkdirSync } from "node:fs";

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");

const COPY_FIELDS = ["address", "city", "website", "hours", "price_band", "photo", "photo_alt", "photo_w", "photo_h",
  "rating", "review_count", "google_rating", "google_review_count", "yelp_rating", "yelp_review_count",
  "google_place_id", "yelp_url", "cuisine_raw", "cuisine_tags", "deh_record_id"];

const rows = await sql`
  SELECT r.id, r.name, r.address, r.city, r.website, r.hours, r.price_band, r.photo, r.photo_alt, r.photo_w, r.photo_h,
         r.rating, r.review_count, r.google_rating, r.google_review_count, r.yelp_rating, r.yelp_review_count,
         r.google_place_id, r.yelp_url, r.cuisine_raw, r.cuisine_tags, r.deh_record_id,
         r.hold_reason, r.listed, r.lat, r.lng,
         substring(r.hold_reason from 'duplicate of ([0-9]+)') AS dup_of,
         (SELECT count(*)::int FROM dishes d WHERE d.restaurant_id = r.id) AS dishes
  FROM restaurants r
  WHERE r.hold_reason LIKE 'duplicate of %'`;
const byId = new Map(rows.map((r) => [r.id, r]));

/* Follow the chain from a row; return the cycle members if it loops back. */
function cycleFrom(start) {
  const seen = [];
  let cur = start;
  while (cur && cur.dup_of && !seen.includes(cur.id)) {
    seen.push(cur.id);
    cur = byId.get(cur.dup_of);
  }
  if (!cur || !seen.includes(cur.id)) return null; // ends at a non-duplicate row: fine
  return seen.slice(seen.indexOf(cur.id));
}

const cycles = new Map(); // key = sorted member ids
for (const r of rows) {
  const c = cycleFrom(r);
  if (c) cycles.set([...c].sort().join(","), c);
}

const better = (a, b) =>
  a.dishes !== b.dishes ? a.dishes > b.dishes : (a.hours != null) !== (b.hours != null) ? a.hours != null : Number(a.id) < Number(b.id);

const plans = [];
for (const members of cycles.values()) {
  const rs = members.map((id) => byId.get(id));
  const keeper = rs.reduce((k, r) => (better(r, k) ? r : k));
  const fill = {};
  for (const f of COPY_FIELDS) {
    if (keeper[f] != null) continue;
    const donor = rs.find((r) => r.id !== keeper.id && r[f] != null);
    if (donor) fill[f] = donor[f];
  }
  plans.push({ keeper, losers: rs.filter((r) => r.id !== keeper.id), fill });
}

/* Duplicates that point INTO a cycle member which is not the keeper. */
const keeperOf = new Map();
for (const p of plans) for (const l of p.losers) keeperOf.set(l.id, p.keeper.id);
const repoint = rows.filter((r) => keeperOf.has(r.dup_of) && !plans.some((p) => p.keeper.id === r.id || p.losers.some((l) => l.id === r.id)));

console.log(`${cycles.size} duplicate cycle(s) covering ${[...cycles.values()].flat().length} rows; ${repoint.length} outside row(s) point into them.\n`);
for (const p of plans) {
  console.log(`KEEP ${p.keeper.id} ${p.keeper.name} (${p.keeper.dishes} dishes, hours=${p.keeper.hours != null}) | ${p.keeper.address ?? "-"}`);
  for (const l of p.losers) console.log(`  dup  ${l.id} ${l.name} (${l.dishes} dishes, hours=${l.hours != null}) | ${l.address ?? "-"}`);
  const f = Object.keys(p.fill);
  if (f.length) console.log(`  fill ${f.join(", ")}`);
}
if (!APPLY) { console.log("\nDry run. Re-run with --apply to write."); process.exit(0); }

mkdirSync("probe/snapshots", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const touched = [...plans.flatMap((p) => [p.keeper, ...p.losers]), ...repoint];
writeFileSync(`probe/snapshots/circular-duplicates-${stamp}.json`, JSON.stringify(touched, null, 1));

let listedNow = 0;
for (const p of plans) {
  const k = p.keeper;
  const canList = k.lat != null && k.lng != null;
  // Column names are fixed by COPY_FIELDS above; values are parameterised.
  const cols = Object.keys(p.fill);
  const vals = cols.map((f) => (f === "hours" ? JSON.stringify(p.fill[f]) : p.fill[f]));
  const assign = cols.map((f, i) => `${f} = $${i + 2}${f === "hours" ? "::jsonb" : ""}`).join(", ");
  await sql.query(
    `UPDATE restaurants SET hold_reason = NULL, listed = ${canList ? "TRUE" : "listed"}${assign ? ", " + assign : ""} WHERE id = $1`,
    [k.id, ...vals],
  );
  if (canList) listedNow += 1;
  for (const l of p.losers) {
    await sql`UPDATE restaurants SET hold_reason = ${"duplicate of " + k.id}, listed = FALSE WHERE id = ${l.id}`;
  }
}
for (const r of repoint) {
  await sql`UPDATE restaurants SET hold_reason = ${"duplicate of " + keeperOf.get(r.dup_of)} WHERE id = ${r.id}`;
}
console.log(`\nDone: ${plans.length} keepers un-held (${listedNow} listed), ${plans.reduce((n, p) => n + p.losers.length, 0)} duplicates re-pointed, ${repoint.length} outside rows re-pointed. Snapshot: probe/snapshots/circular-duplicates-${stamp}.json`);
