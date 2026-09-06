/**
 * Dumps every restaurant with a blank cuisine into compact batches for hand
 * classification (no API key, no per-token bill).
 *
 *   node --env-file=.env.local probe/cuisine-todo.mjs
 *
 * Writes probe/cuisine-todo/batch-NN.txt, listed rows first, one row per line:
 *
 *   <id> | <name> | <raw label> | [section, section...] dish; dish; dish
 *
 * Two things matter about the sample. Sections come first because a section
 * list ("Pho", "Banh Mi", "Rice Plates") identifies a restaurant faster than
 * any number of dish names. Dishes are then sampled EVENLY across the menu in
 * menu order, not alphabetically - an alphabetical head is all appetizers and
 * cocktails ("Americano; Aperol; Avocado Toast") and identifies nothing.
 *
 * Read a batch, write verdicts to probe/cuisine-todo/done-NN.txt as
 * "<id> <Cuisine>", then apply with scripts/apply-cuisine-decisions.mjs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "../scripts/sql-client.mjs";

const PER_BATCH = 110;
const MAX_DISHES = 14;
const MAX_SECTIONS = 8;

const rows = await sql`
  SELECT r.id::text AS id, r.name, r.cuisine_raw,
         (r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL) AS listed,
         (SELECT array_agg(s ORDER BY n DESC) FROM (
            SELECT section AS s, count(*) AS n FROM dishes d
             WHERE d.restaurant_id = r.id AND coalesce(section,'') <> ''
             GROUP BY section ORDER BY count(*) DESC LIMIT ${MAX_SECTIONS}) y) AS sections,
         (SELECT array_agg(name ORDER BY ord) FROM (
            SELECT DISTINCT ON (lower(name)) name, sort_order AS ord FROM dishes d
             WHERE d.restaurant_id = r.id ORDER BY lower(name), sort_order) z) AS dishes
    FROM restaurants r
   WHERE (r.cuisine IS NULL OR r.cuisine = '')
   ORDER BY (r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL) DESC,
            (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id) DESC, r.id`;

const clean = (s) => (s ?? "").replace(/\s+/g, " ").replace(/[|;]/g, "/").trim();

/* Even spread across the whole menu, so the tail of the menu is represented. */
function spread(list, k) {
  if (!list?.length) return [];
  if (list.length <= k) return list;
  const step = list.length / k;
  return Array.from({ length: k }, (_, i) => list[Math.floor(i * step)]);
}

const line = (r) => {
  const secs = (r.sections ?? []).map((s) => clean(s).slice(0, 22)).filter(Boolean);
  const dish = spread(r.dishes ?? [], MAX_DISHES).map((d) => clean(d).slice(0, 26)).filter(Boolean);
  const menu = (secs.length ? `[${secs.join(", ")}] ` : "") + dish.join("; ");
  return `${r.id} | ${clean(r.name).slice(0, 46)} | ${clean(r.cuisine_raw).slice(0, 20)} | ${menu}`;
};

mkdirSync("probe/cuisine-todo", { recursive: true });
let n = 0;
for (let i = 0; i < rows.length; i += PER_BATCH) {
  n += 1;
  const chunk = rows.slice(i, i + PER_BATCH);
  const head = `# batch ${String(n).padStart(2, "0")}  rows ${i + 1}-${i + chunk.length} of ${rows.length}  (${chunk.filter((r) => r.listed).length} listed)`;
  writeFileSync(`probe/cuisine-todo/batch-${String(n).padStart(2, "0")}.txt`, head + "\n" + chunk.map(line).join("\n") + "\n");
}
console.log(`${rows.length} rows (${rows.filter((r) => r.listed).length} listed) -> ${n} batches`);
