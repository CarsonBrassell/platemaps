/**
 * Un-labels "chain-shared" menus that were shared from the same restaurant.
 *
 *   node --env-file=.env.local scripts/fix-chain-shared.mjs          # report
 *   node --env-file=.env.local scripts/fix-chain-shared.mjs --apply
 *
 * share-chain-menus.mjs groups rows by normalised name and copies the nearest
 * branch's menu onto branches without one. When the "nearest branch" is a
 * duplicate row for the same address (Las Cuatro Milpas 205 got its menu from
 * its own duplicate 4544), the row ends up tagged chain-shared with a
 * `chain-shared:restaurant/<id>` source, so the site shows it as a borrowed
 * menu and the freshness checker skips it. The menu is that restaurant's own.
 *
 * For each chain-shared lookup whose final source (chains followed) is either
 * held `duplicate of <this row>` or sits at the same street address, adopt the
 * source's real source_url / confidence / fingerprint as the row's own. Every
 * other chain-shared row is a genuine different branch and is left alone.
 *
 * A row whose chain loops back on itself (205 <-> 4544, each "shared" from the
 * other, no real source anywhere) keeps its dishes but is marked confidence
 * 'low' with an empty source_url: provenance unknown, do not claim a source.
 */
import { neon } from "@neondatabase/serverless";
import { writeFileSync, mkdirSync } from "node:fs";

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");

const lookups = await sql`
  SELECT ml.restaurant_id, ml.source_url, ml.confidence, ml.source_fingerprint, ml.checked_at, ml.dish_count,
         r.name, r.address, r.hold_reason
  FROM menu_lookups ml JOIN restaurants r ON r.id = ml.restaurant_id
  WHERE ml.status = 'found'`;
const byId = new Map(lookups.map((l) => [l.restaurant_id, l]));

const sharedFrom = (l) => l.source_url?.match(/^chain-shared:restaurant\/(\d+)$/)?.[1] ?? null;
const streetOf = (a) =>
  (a ?? "").toLowerCase().replace(/\b(suite|ste|unit|#)\s*[a-z0-9-]+/g, "").replace(/[^a-z0-9]/g, "").slice(0, 18);

function finalSource(l) {
  const seen = new Set([l.restaurant_id]);
  let cur = l;
  for (let src = sharedFrom(cur); src; src = sharedFrom(cur)) {
    if (seen.has(src)) return "loop";
    seen.add(src);
    cur = byId.get(src);
    if (!cur) return null;
  }
  return cur === l ? null : cur;
}

const fixes = [];
for (const l of lookups) {
  if (l.confidence !== "chain-shared") continue;
  const src = finalSource(l);
  if (src === "loop") { fixes.push({ row: l, src: null, why: "loop: no real source anywhere in the chain" }); continue; }
  if (!src) continue;
  const selfDup = src.hold_reason === `duplicate of ${l.restaurant_id}`;
  const sameAddr = streetOf(l.address) && streetOf(l.address) === streetOf(src.address);
  if (selfDup || sameAddr) fixes.push({ row: l, src, why: selfDup ? "source is held as duplicate of this row" : "same address" });
}

console.log(`${lookups.filter((l) => l.confidence === "chain-shared").length} chain-shared lookups; ${fixes.length} are shared from the same restaurant.\n`);
for (const f of fixes) console.log(f.src ? `  ${f.row.restaurant_id} ${f.row.name} <- ${f.src.restaurant_id} (${f.why}) -> ${f.src.source_url} [${f.src.confidence}]` : `  ${f.row.restaurant_id} ${f.row.name} (${f.why}) -> source_url '' [low]`);
if (!APPLY) { console.log("\nDry run. Re-run with --apply to write."); process.exit(0); }

mkdirSync("probe/snapshots", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
writeFileSync(`probe/snapshots/chain-shared-self-${stamp}.json`, JSON.stringify(fixes.map((f) => f.row), null, 1));
for (const f of fixes) {
  if (!f.src) {
    await sql`UPDATE menu_lookups SET source_url = '', confidence = 'low' WHERE restaurant_id = ${f.row.restaurant_id} AND confidence = 'chain-shared'`;
    continue;
  }
  await sql`
    UPDATE menu_lookups
       SET source_url = ${f.src.source_url}, confidence = ${f.src.confidence},
           source_fingerprint = ${f.src.source_fingerprint}, checked_at = ${f.src.checked_at}
     WHERE restaurant_id = ${f.row.restaurant_id} AND confidence = 'chain-shared'`;
}
console.log(`\nUpdated ${fixes.length} lookups. Snapshot: probe/snapshots/chain-shared-self-${stamp}.json`);
