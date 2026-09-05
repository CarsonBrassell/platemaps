/**
 * Hold generic chains and non-restaurant brands off the site.
 *
 *   node --env-file=.env.local scripts/exclude-chains.mjs            # dry, the default
 *   node --env-file=.env.local scripts/exclude-chains.mjs --apply
 *   node --env-file=.env.local scripts/exclude-chains.mjs --show fast_food
 *
 * Decision (Calvin, 2026-09-02): "start excluding generic fast food". The list
 * lives in data/excluded-chains.json so it can be edited without touching code.
 *
 * What it does: rows whose name matches a pattern get
 *   hold_reason = 'excluded: generic chain (<pattern>)'  and  listed = FALSE.
 * Rows that already carry a different hold_reason are left alone (a closure or
 * duplicate note is more specific than "it's a chain"). Rows already held by
 * this script whose name no longer matches (pattern removed from the list) get
 * their hold cleared so publish-check can list them again.
 *
 * Nothing is deleted. Re-runnable: new permit imports that match are picked up
 * on the next run. Before writing, it snapshots id/listed/hold_reason to the
 * scratch folder, because these two columns have no history in the database.
 */
import { neon } from "@neondatabase/serverless";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const showIdx = process.argv.indexOf("--show");
const SHOW = showIdx === -1 ? null : process.argv[showIdx + 1];
const PREFIX = "excluded: generic chain (";
const SNAP_DIR = "C:/Users/CALVIN~1/AppData/Local/Temp/claude/deh";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const cfg = JSON.parse(readFileSync("data/excluded-chains.json", "utf8"));
const groups = Object.entries(cfg).filter(([k]) => !k.startsWith("_"));
const patterns = groups.flatMap(([group, list]) =>
  list.map((p) => ({ group, src: p, re: new RegExp(`(^|[^a-z0-9])(?:${p})(?![a-z0-9])`, "i") })),
);

const rows = await sql`
  SELECT id::text, name, neighborhood, listed, hold_reason,
         (SELECT count(*)::int FROM dishes d WHERE d.restaurant_id = r.id) AS dishes
  FROM restaurants r ORDER BY name`;

const toHold = [];
const perPattern = new Map();
for (const r of rows) {
  const hit = patterns.find((p) => p.re.test(r.name));
  if (!hit) continue;
  const key = `${hit.group}:${hit.src}`;
  if (!perPattern.has(key)) perPattern.set(key, []);
  perPattern.get(key).push(r);
  const ownHold = r.hold_reason?.startsWith(PREFIX);
  if (r.hold_reason && !ownHold) continue; // a more specific hold wins
  if (ownHold && r.hold_reason === `${PREFIX}${hit.src})`) continue; // already done
  toHold.push({ r, reason: `${PREFIX}${hit.src})` });
}
const toRelease = rows.filter(
  (r) => r.hold_reason?.startsWith(PREFIX) && !patterns.some((p) => p.re.test(r.name)),
);

if (SHOW) {
  for (const [key, list] of perPattern) {
    if (!key.startsWith(`${SHOW}:`)) continue;
    console.log(`\n${key}  (${list.length})`);
    for (const r of list) console.log(`  ${r.id.padStart(5)}  ${r.listed ? "L" : "-"}  ${r.name}  (${r.neighborhood})`);
  }
  process.exit(0);
}

console.log(`${APPLY ? "APPLY" : "Dry run"} - ${patterns.length} patterns over ${rows.length} rows\n`);
const summary = [...perPattern.entries()]
  .map(([key, list]) => ({
    pattern: key,
    rows: list.length,
    listed: list.filter((r) => r.listed).length,
    with_menu: list.filter((r) => r.dishes > 0).length,
  }))
  .sort((a, b) => b.rows - a.rows);
console.table(summary);

const listedNow = toHold.filter(({ r }) => r.listed).length;
console.log(
  `\nwould hold ${toHold.length} rows (${listedNow} currently listed); ` +
    `would release ${toRelease.length} rows no longer matching a pattern`,
);
const [{ listed_total }] = await sql`SELECT count(*) FILTER (WHERE listed)::int AS listed_total FROM restaurants`;
console.log(`listed now ${listed_total} -> after publish-check about ${listed_total - listedNow}`);

if (!APPLY) {
  console.log("\nDry run - nothing written. Add --apply, or --show <group> to list the matched names.");
  process.exit(0);
}

mkdirSync(SNAP_DIR, { recursive: true });
const snapPath = `${SNAP_DIR}/holds-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(snapPath, JSON.stringify(rows.map(({ id, listed, hold_reason }) => ({ id, listed, hold_reason }))));
console.log(`\nsnapshot: ${snapPath}`);

let held = 0;
for (const { r, reason } of toHold) {
  const res = await sql`UPDATE restaurants SET hold_reason = ${reason}, listed = FALSE WHERE id = ${r.id} RETURNING id`;
  held += res.length;
}
let released = 0;
for (const r of toRelease) {
  const res = await sql`UPDATE restaurants SET hold_reason = NULL WHERE id = ${r.id} AND hold_reason LIKE ${PREFIX + "%"} RETURNING id`;
  released += res.length;
}
console.log(`held ${held}, released ${released}. Run publish-check.mjs to recompute listed.`);
