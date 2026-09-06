/**
 * apply-cuisine-decisions.mjs
 *
 * Reads probe/cuisine-todo/done-*.txt (lines of "<id> <Cuisine>"), validates
 * every cuisine against CUISINES, snapshots the affected rows, then fills the
 * blank cuisine column. Never touches cuisine_raw or cuisine_tags, and never
 * overwrites a cuisine that is already set.
 *
 *   node --env-file=.env.local scripts/apply-cuisine-decisions.mjs          # dry run
 *   node --env-file=.env.local scripts/apply-cuisine-decisions.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { sql } from "./sql-client.mjs";
import { CUISINES } from "../src/data/cuisines.ts";

const APPLY = process.argv.includes("--apply");
const DIR = "probe/cuisine-todo";
const SNAP_DIR = "probe/snapshots";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const files = fs
  .readdirSync(DIR)
  .filter((f) => /^done-\d+\.txt$/.test(f))
  .sort();

if (!files.length) {
  console.error(`No done-NN.txt files in ${DIR}.`);
  process.exit(1);
}

const decisions = new Map();
const bad = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(DIR, f), "utf8");
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) return void bad.push(`${f}:${i + 1} unparseable: ${line}`);
    const [, id, cuisine] = [m[0], m[1], m[2].trim()];
    if (!CUISINES.includes(cuisine)) return void bad.push(`${f}:${i + 1} unknown cuisine: ${cuisine}`);
    if (decisions.has(id) && decisions.get(id) !== cuisine) {
      bad.push(`${f}:${i + 1} conflicting verdict for ${id}`);
    }
    decisions.set(id, cuisine);
  });
}

if (bad.length) {
  console.error(`Refusing to run. ${bad.length} bad line(s):`);
  for (const b of bad.slice(0, 40)) console.error("  " + b);
  process.exit(1);
}

const ids = [...decisions.keys()];
console.log(`${files.length} file(s), ${ids.length} decisions.`);

const rows = await sql`
  SELECT id::text, name, cuisine, cuisine_raw, cuisine_tags, hold_reason
    FROM restaurants
   WHERE id::text = ANY(${ids})
`;
const byId = new Map(rows.map((r) => [r.id, r]));

const missing = ids.filter((id) => !byId.has(id));
const taken = ids.filter((id) => byId.get(id)?.cuisine);
const applicable = ids.filter((id) => byId.has(id) && !byId.get(id).cuisine);

console.log(`  ${applicable.length} blank and will be filled`);
console.log(`  ${taken.length} already have a cuisine (skipped)`);
console.log(`  ${missing.length} ids not in the table (skipped)`);

const tally = {};
for (const id of applicable) tally[decisions.get(id)] = (tally[decisions.get(id)] ?? 0) + 1;
for (const [c, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${c}`);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

fs.mkdirSync(SNAP_DIR, { recursive: true });
const snapPath = path.join(SNAP_DIR, `cuisine-manual-${STAMP}.json`);
fs.writeFileSync(
  snapPath,
  JSON.stringify(
    applicable.map((id) => {
      const r = byId.get(id);
      return {
        id,
        name: r.name,
        cuisine: r.cuisine,
        cuisine_raw: r.cuisine_raw,
        cuisine_tags: r.cuisine_tags,
        hold_reason: r.hold_reason,
        new_cuisine: decisions.get(id),
      };
    }),
    null,
    2,
  ),
);
console.log(`\nSnapshot: ${snapPath}`);

let written = 0;
for (const id of applicable) {
  await sql`
    UPDATE restaurants
       SET cuisine = ${decisions.get(id)}
     WHERE id::text = ${id}
       AND (cuisine IS NULL OR cuisine = '')
  `;
  written += 1;
  if (written % 100 === 0) console.log(`  writing ${written}/${applicable.length}`);
}
console.log(`Done. ${written} rows updated.`);
