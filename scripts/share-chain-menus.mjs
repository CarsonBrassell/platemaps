/**
 * Gives a chain branch the menu already extracted from another branch.
 *
 *   node --env-file=.env.local scripts/share-chain-menus.mjs --dry
 *   node --env-file=.env.local scripts/share-chain-menus.mjs
 *
 * ## Why
 *
 * The corpus holds 5,686 open restaurants under 3,785 distinct names. Two
 * hundred of them are Starbucks. Extracting each branch separately would mean
 * reading the same menu two hundred times, and menu extraction is the most
 * expensive thing this project does - so a third of the remaining work is
 * duplicate by construction.
 *
 * ## Nearest branch, not any branch
 *
 * Chains do not always price alike. Broken Yolk Cafe's University Heights menu
 * runs $2-3 above its Pacific Beach one, and Underbelly North Park carries
 * items Little Italy does not. Copying an arbitrary branch's menu would import
 * that error silently.
 *
 * So a branch inherits from the geographically NEAREST branch that has a menu.
 * That does not make the prices right - only the restaurant can do that - but
 * it makes them as right as a shared menu can be, and it is the difference
 * between "the other San Diego location" and "the one in Oceanside".
 *
 * ## Everything it writes says it was shared
 *
 * `menu_lookups.confidence = 'chain-shared'` and `source_url` points at the
 * branch the menu came from, not at a page. Nothing here should ever be
 * mistaken for a menu somebody read off this restaurant's own listing:
 * re-extraction, freshness checks and any future audit need to be able to find
 * these and treat them as the second-hand data they are.
 *
 * A branch that already has its own menu is never touched.
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");

/**
 * Beyond this, two same-named restaurants are more likely to be a coincidence
 * or a genuinely independent operation than a branch of one chain. Kept
 * generous because San Diego County is 70 miles end to end and a real chain
 * spans it; the nearest-branch rule below is what limits the damage.
 */
const MAX_SHARE_KM = 60;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function kmBetween(a, b) {
  const latRad = (a.lat * Math.PI) / 180;
  return Math.hypot((b.lat - a.lat) * 111.32, (b.lng - a.lng) * 111.32 * Math.cos(latRad));
}

const rows = await sql`
  SELECT r.id, r.name, r.neighborhood, r.lat, r.lng,
         EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id) AS has_menu
  FROM restaurants r
  WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
`;

/* Group by normalised name, then pair each menu-less branch with its nearest
 * sibling that has one. */
const byName = new Map();
for (const r of rows) {
  const key = normalise(r.name);
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(r);
}

const plans = [];
for (const branches of byName.values()) {
  const sources = branches.filter((b) => b.has_menu);
  const needy = branches.filter((b) => !b.has_menu);
  if (sources.length === 0 || needy.length === 0) continue;

  for (const target of needy) {
    let best = null;
    for (const source of sources) {
      const km = kmBetween(target, source);
      if (km > MAX_SHARE_KM) continue;
      if (!best || km < best.km) best = { source, km };
    }
    if (best) plans.push({ target, source: best.source, km: best.km });
  }
}

console.log(
  `${plans.length} branches can inherit a menu from a nearer branch of the same chain.\n`,
);

if (plans.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

const preview = [...plans].sort((a, b) => a.target.name.localeCompare(b.target.name));
for (const p of preview.slice(0, 20)) {
  console.log(
    `  ${p.target.name} (${p.target.neighborhood})` +
      `  <-  ${p.source.neighborhood}  ${p.km.toFixed(1)}km`,
  );
}
if (preview.length > 20) console.log(`  ... and ${preview.length - 20} more`);

if (DRY_RUN) {
  console.log("\nDry run - nothing written.");
  process.exit(0);
}

let copied = 0;
let dishes = 0;
let skippedPriceless = 0;

for (const p of plans) {
  const source = await sql`
    SELECT name, description, price, section, sort_order
    FROM dishes WHERE restaurant_id = ${p.source.id} ORDER BY sort_order
  `;
  if (source.length === 0) continue;

  /*
   * A menu with no prices is not propagated.
   *
   * Starbucks publishes 383 products through its own API with no price field
   * on any of them, and McDonald's offers only app-only pickup or a delivery
   * menu that says outright its prices are higher than in the restaurant. Both
   * were extracted honestly as dish names with empty prices - but copying them
   * across every branch would hand ~200 Starbucks and ~104 McDonald's a menu
   * that never answers what a coffee costs.
   *
   * That would move the coverage number by three hundred restaurants and the
   * product forward by nothing, which is the wrong trade for a site whose
   * whole promise is the price. One branch carrying a dish list is honest;
   * three hundred of them is a statistic.
   */
  const priced = source.filter((d) => d.price && d.price !== "" && d.price !== "—").length;
  if (priced === 0) {
    skippedPriceless += 1;
    continue;
  }

  // Re-checked here rather than trusted from the snapshot above: an earlier
  // iteration of this same run may have filled this branch in.
  const [{ n: already }] = await sql`
    SELECT count(*)::int AS n FROM dishes WHERE restaurant_id = ${p.target.id}
  `;
  if (already > 0) continue;

  for (const [i, d] of source.entries()) {
    await sql`
      INSERT INTO dishes
        (id, restaurant_id, name, description, price, section, yes_votes, no_votes, sort_order)
      VALUES
        (${`${p.target.id}-${i + 1}`}, ${p.target.id}, ${d.name}, ${d.description},
         ${d.price}, ${d.section}, 0, 0, ${i})
      ON CONFLICT (id) DO NOTHING`;
  }

  await sql`
    INSERT INTO menu_lookups
      (restaurant_id, status, source_url, confidence, dish_count, requested_by, attempted_at)
    VALUES
      (${p.target.id}, 'found',
       ${`chain-shared:restaurant/${p.source.id}`},
       -- requested_by is a foreign key to users: it records which signed-in
       -- person asked for a lookup, and a script is not a person. The
       -- provenance lives in source_url and confidence instead.
       'chain-shared', ${source.length}, NULL, now())
    ON CONFLICT (restaurant_id) DO UPDATE SET
      status = 'found', source_url = EXCLUDED.source_url,
      confidence = 'chain-shared', dish_count = EXCLUDED.dish_count,
      attempted_at = now()`;

  copied += 1;
  dishes += source.length;
  process.stdout.write(`\r  ${copied}/${plans.length}`);
}

const [after] = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id))::int AS with_menu
  FROM restaurants WHERE hold_reason IS NULL`;

console.log(
  `\n\n${copied} branches given a menu, ${dishes} dishes copied.\n` +
    (skippedPriceless > 0
      ? `${skippedPriceless} branches skipped: their chain's menu carries no prices.\n`
      : "") +
    `${after.with_menu}/${after.total} restaurants now carry a menu.\n` +
    `All of it is marked confidence = 'chain-shared' and points at the source branch.`,
);
