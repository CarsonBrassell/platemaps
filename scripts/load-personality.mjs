/**
 * load-personality.mjs
 *
 * Fills the two lookup tables behind the food personality wheel
 * (src/lib/personality.ts) from the files the 2026-11-17/18 tagging run left in
 * probe/for-me/personality/:
 *
 *  - dish_flavor: every tagged dish key (tag/keys.txt + tag/out/bNNNN.tsv),
 *    plus a name-only key "name|*" where all corpus variants of a name agree on
 *    one non-empty tag at least 80% of the time.
 *  - restaurant_kind: q / t / u per restaurant (place-kinds.tsv), matched by
 *    folded name + city, and the foodie flag from foodie-lists.json.
 *
 * Inserts into those two tables only (upsert on their own keys). It never
 * updates or deletes a row of any existing table, so there is nothing to
 * snapshot. Prints counts only, never ids, names of users or the database URL.
 *
 *   node --env-file=.env.local scripts/load-personality.mjs          # dry run
 *   node --env-file=.env.local scripts/load-personality.mjs --apply
 */
import { readFileSync, existsSync } from "node:fs";
import { sql } from "./sql-client.mjs";

const APPLY = process.argv.includes("--apply");
const D = "probe/for-me/personality/";
const fold = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/* ---- dish tags ---- */
const keys = readFileSync(D + "tag/keys.txt", "utf8").split("\n");
const tag = new Map();
for (let b = 0; b * 500 < keys.length; b++) {
  const f = `${D}tag/out/b${String(b).padStart(4, "0")}.tsv`;
  if (!existsSync(f)) throw new Error(`missing batch ${f}`);
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = l.match(/^(\d+)\t([swdc]{1,2})(\?)?$/);
    if (m && keys[b * 500 + +m[1]]) tag.set(keys[b * 500 + +m[1]], m[2]);
  }
}
const byName = new Map();
for (const k of keys) {
  if (!k) continue;
  const n = k.split("|")[0];
  const a = byName.get(n) ?? [];
  a.push(tag.get(k) ?? "");
  byName.set(n, a);
}
const dishRows = [...tag.entries()];
let nameRows = 0;
for (const [n, a] of byName) {
  const c = {};
  for (const t of a) c[t] = (c[t] ?? 0) + 1;
  const [top, count] = Object.entries(c).sort((x, y) => y[1] - x[1])[0];
  if (top && count / a.length >= 0.8) {
    dishRows.push([`${n}|*`, top]);
    nameRows++;
  }
}
console.log(`dish_flavor: ${tag.size} exact keys + ${nameRows} name keys (${keys.length} dishes read)`);

/* ---- restaurant kinds ---- */
const kindByNameCity = new Map();
const kindByName = new Map();
for (const l of readFileSync(D + "place-kinds.tsv", "utf8").split(/\r?\n/)) {
  const [, kind, , name, , city] = l.split("\t");
  if (!name || !/^[qtu]$/.test(kind)) continue;
  kindByNameCity.set(`${fold(name)}|${fold(city ?? "")}`, kind);
  const prev = kindByName.get(fold(name));
  kindByName.set(fold(name), prev === undefined || prev === kind ? kind : null);
}
const foodie = new Set();
for (const r of JSON.parse(readFileSync(D + "foodie-lists.json", "utf8")).restaurants)
  for (const m of r.matched) foodie.add(fold(m));

const places = await sql`SELECT id, name, city FROM restaurants`;
const placeRows = [];
let byCity = 0, byNameOnly = 0, foodieCount = 0;
for (const p of places) {
  const n = fold(p.name ?? "");
  let kind = kindByNameCity.get(`${n}|${fold(p.city ?? "")}`);
  if (kind) byCity++;
  else if ((kind = kindByName.get(n))) byNameOnly++;
  const isFoodie = foodie.has(n);
  if (!kind && !isFoodie) continue;
  if (isFoodie) foodieCount++;
  placeRows.push([String(p.id), kind ?? "t", isFoodie]);
}
console.log(
  `restaurant_kind: ${placeRows.length} of ${places.length} restaurants (${byCity} by name+city, ${byNameOnly} by name, ${foodieCount} foodie)`,
);

if (!APPLY) {
  console.log("dry run; pass --apply to write");
  process.exit(0);
}

const CHUNK = 5000;
for (let i = 0; i < dishRows.length; i += CHUNK) {
  const part = dishRows.slice(i, i + CHUNK);
  await sql`
    INSERT INTO dish_flavor (key, tag)
    SELECT * FROM unnest(${part.map((r) => r[0])}::text[], ${part.map((r) => r[1])}::text[])
    ON CONFLICT (key) DO UPDATE SET tag = EXCLUDED.tag`;
}
for (let i = 0; i < placeRows.length; i += CHUNK) {
  const part = placeRows.slice(i, i + CHUNK);
  await sql`
    INSERT INTO restaurant_kind (restaurant_id, kind, foodie)
    SELECT * FROM unnest(${part.map((r) => r[0])}::text[], ${part.map((r) => r[1])}::text[], ${part.map((r) => r[2])}::boolean[])
    ON CONFLICT (restaurant_id) DO UPDATE SET kind = EXCLUDED.kind, foodie = EXCLUDED.foodie`;
}
const [{ d }] = await sql`SELECT count(*)::int AS d FROM dish_flavor`;
const [{ r }] = await sql`SELECT count(*)::int AS r FROM restaurant_kind`;
console.log(`written: dish_flavor ${d}, restaurant_kind ${r}`);
process.exit(0);
