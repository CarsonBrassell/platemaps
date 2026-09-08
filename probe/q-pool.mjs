/**
 * Would pooling dish ratings across a chain's branches actually produce a
 * number anywhere?
 *
 * The plate score floor is 3 distinct rated dishes AND 8 total ratings
 * (lib/plateScore.ts). Pooling only earns its complexity if a meaningful set of
 * brands clears that floor together while none of their branches clears it
 * alone. This counts exactly that, using the same brand key the "other
 * locations" strip uses and the same dish grouping the score query uses.
 */
import { sql } from "../scripts/sql-client.mjs";

const MIN_RATED_DISHES = 3;
const MIN_TOTAL_RATINGS = 8;
const MIN_KEY_LENGTH = 6;

const foldAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function brandKey(name, places) {
  const folded = foldAccents(name).toLowerCase().trim();
  for (const place of places.filter(Boolean).map((p) => foldAccents(p).toLowerCase().trim())) {
    if (!place) continue;
    const m = folded.match(new RegExp(`^(.*?)[\\s]*(?:[-–—,]\\s*)?${escapeRegExp(place)}$`));
    if (!m) continue;
    const key = m[1].trim().replace(/[^a-z0-9]/g, "");
    if (key.length >= MIN_KEY_LENGTH) return key;
  }
  return folded.replace(/[^a-z0-9]/g, "");
}

const restaurants = await sql`
  SELECT id, name, neighborhood, city FROM restaurants WHERE listed
`;

// One row per (branch, dish) with its rating headcount — the grain the floor
// is measured at.
const rated = await sql`
  SELECT restaurant_id, lower(trim(coalesce(dish_name, ''))) AS dish, count(*)::int AS n
  FROM posts
  WHERE rating_kind = 'dish' AND rating IS NOT NULL
  GROUP BY restaurant_id, lower(trim(coalesce(dish_name, '')))
`;

const byRestaurant = new Map();
for (const r of rated) {
  if (!byRestaurant.has(r.restaurant_id)) byRestaurant.set(r.restaurant_id, []);
  byRestaurant.get(r.restaurant_id).push(r);
}

const groups = new Map();
for (const r of restaurants) {
  const key = brandKey(r.name, [r.neighborhood, r.city]);
  if (key.length < MIN_KEY_LENGTH) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

const clears = (rows) => {
  const dishes = new Set();
  let ratings = 0;
  for (const row of rows) {
    if (row.dish) dishes.add(row.dish);
    ratings += row.n;
  }
  return {
    dishes: dishes.size,
    ratings,
    ok: dishes.size >= MIN_RATED_DISHES && ratings >= MIN_TOTAL_RATINGS,
  };
};

let multiBranch = 0;
let branchesInChains = 0;
let branchesClearingAlone = 0;
let groupsClearingPooled = 0;
const wins = [];

for (const [key, rows] of groups) {
  if (rows.length < 2) continue;
  multiBranch += 1;
  branchesInChains += rows.length;

  const all = [];
  let soloClear = 0;
  for (const r of rows) {
    const own = byRestaurant.get(r.id) ?? [];
    all.push(...own);
    if (clears(own).ok) soloClear += 1;
  }
  branchesClearingAlone += soloClear;

  const pooled = clears(all);
  if (pooled.ok) groupsClearingPooled += 1;
  if (pooled.ok && soloClear < rows.length) {
    wins.push({
      key,
      branches: rows.length,
      soloClear,
      gained: rows.length - soloClear,
      dishes: pooled.dishes,
      ratings: pooled.ratings,
      name: rows[0].name,
    });
  }
}

const totalRatedBranches = [...byRestaurant.keys()].length;
console.log("listed restaurants          ", restaurants.length);
console.log("branches with any rating    ", totalRatedBranches);
console.log("multi-branch brand groups   ", multiBranch);
console.log("branches inside those groups", branchesInChains);
console.log("branches clearing floor solo", branchesClearingAlone);
console.log("groups clearing floor pooled", groupsClearingPooled);
console.log(
  "branches that would GAIN a number:",
  wins.reduce((s, w) => s + w.gained, 0),
);
console.log("");
for (const w of wins.sort((a, b) => b.gained - a.gained).slice(0, 20)) {
  console.log(
    `${w.name} (${w.key}) — ${w.branches} branches, ${w.soloClear} clear alone, ` +
      `pooled ${w.dishes} dishes / ${w.ratings} ratings, +${w.gained} branches gain`,
  );
}
