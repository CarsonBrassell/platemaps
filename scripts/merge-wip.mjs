/**
 * Merges per-restaurant extraction files into one loadable batch.
 *
 *   node scripts/merge-wip.mjs menus/wip menus/batch-14.json
 *
 * Menu extraction is fanned out across several agents working at once, so each
 * one writes `menus/wip/<id>.json` on its own rather than all of them editing a
 * shared array — concurrent writers to a single file lose entries. This walks
 * that directory and produces the array `load-menus.mjs` expects.
 *
 * Validation here is deliberately loud but non-fatal per entry: a batch is worth
 * loading even if one restaurant came back malformed, and the report says which.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [dir = "menus/wip", out = "menus/batch-14.json"] = process.argv.slice(2);

const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();

const entries = [];
const problems = [];

for (const file of files) {
  const raw = await readFile(path.join(dir, file), "utf8");
  let entry;
  try {
    entry = JSON.parse(raw);
  } catch (err) {
    problems.push(`${file}: not valid JSON — ${err.message}`);
    continue;
  }
  if (!entry.restaurantId) problems.push(`${file}: no restaurantId`);
  if (!entry.name) problems.push(`${file}: no name`);
  // `restaurants.id` is a text column, and the loader matches with `id = ANY(...)`,
  // so a JSON number silently matches nothing and the whole batch reports
  // "no such restaurant". Agents write both forms depending on how the brief's
  // example was quoted, so normalise here rather than relying on the brief.
  if (entry.restaurantId != null) entry.restaurantId = String(entry.restaurantId);
  if (!Array.isArray(entry.dishes)) {
    problems.push(`${file}: dishes is not an array`);
    continue;
  }
  // The cap the batches have held to since batch-02. Over it is not an error
  // worth dropping the menu for, but it should be visible before loading.
  if (entry.dishes.length > 45) problems.push(`${file}: ${entry.dishes.length} dishes, over the 45 cap`);
  for (const [i, dish] of entry.dishes.entries()) {
    if (!dish.name) problems.push(`${file}: dish ${i + 1} has no name`);
  }
  entries.push(entry);
}

entries.sort((a, b) => Number(a.restaurantId) - Number(b.restaurantId));

await writeFile(out, `${JSON.stringify(entries, null, 2)}\n`);

const dishes = entries.reduce((n, e) => n + e.dishes.length, 0);
const empty = entries.filter((e) => e.dishes.length === 0);

console.log(`${out}: ${entries.length} restaurants, ${dishes} dishes.`);
if (empty.length > 0) {
  console.log(`${empty.length} with no menu (will load as not_found): ${empty.map((e) => e.name).join(", ")}`);
}
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
}
