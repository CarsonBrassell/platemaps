/**
 * Decides which restaurants are visible, and is the only thing that does.
 *
 *   node --env-file=.env.local scripts/publish-restaurants.mjs --dry
 *   node --env-file=.env.local scripts/publish-restaurants.mjs
 *   node --env-file=.env.local scripts/publish-restaurants.mjs --min-dishes 8
 *
 * The rule: a restaurant is listed when it has a sourced rating AND a real menu.
 * Anything else stays off the grid until it earns its way on.
 *
 * ## Why this is a separate step
 *
 * A restaurant has to exist in the table before its menu can be extracted —
 * extraction is keyed by restaurant id — so rows necessarily arrive incomplete
 * and become complete later. Nothing about the import can know whether a row is
 * ready, because the menu shows up afterwards. Readiness is therefore recomputed
 * rather than assigned, and it is recomputed here.
 *
 * Idempotent, and safe to run after any import, any menu load, or any rating
 * pass. Run it after all three.
 *
 * ## What it hides, on purpose
 *
 * Against the corpus as it stands, 669 of 682 qualify. The other 13 are the
 * point: 11 have no menu at all — four of them Tijuana restaurants that were
 * never in San Diego — and 2 have menus of fewer than five dishes. Those have
 * been on the grid this whole time showing a rating and nothing to order.
 *
 * `restaurants:import` does not write `listed`, so a refresh cannot republish a
 * row behind this script's back.
 */

import { neon } from "@neondatabase/serverless";

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

const DRY_RUN = process.argv.includes("--dry");

/**
 * Publish the rows that now qualify without hiding the ones that no longer do.
 *
 * The two halves of this script answer different questions and, on 2026-09-03,
 * had opposite urgencies. The county import had left 1,064 restaurants complete
 * but unpublished, while 1,328 already-visible rows had lost their menus to the
 * untrusted-source retirement and were failing the same rule. Running both
 * halves would have taken the site from 4,327 listings to 4,063 — a net loss,
 * including names like Bronx Pizza, on the day the ask was "get all of San
 * Diego on the site".
 *
 * So this flag exists for the case where the hide list is an EXTRACTION
 * BACKLOG rather than a quality problem: those rows have a rating and a real
 * business behind them, and the menu is coming. It is a deliberate, temporary
 * deviation from the rule, and the rule is still the default.
 *
 * Do not reach for it to inflate a number. If the hide list is rows that should
 * genuinely not be visible, hide them.
 */
const NO_HIDE = process.argv.includes("--no-hide");

/**
 * Fewer dishes than this is not a menu, it is a fragment.
 *
 * Five is low deliberately — a taco shop with five items has told you what it
 * sells, while a steakhouse listing five of forty has not. The floor is here to
 * exclude a failed extraction that landed two dishes, not to judge the kitchen.
 */
const MIN_DISHES = flag("min-dishes", 5);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Pass --env-file=.env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

/* --- What should change --------------------------------------------------- */

const rows = await sql.query(
  `WITH d AS (SELECT restaurant_id, count(*)::int AS n FROM dishes GROUP BY restaurant_id)
   SELECT r.id, r.name, r.neighborhood, r.listed, r.rating,
          coalesce(d.n, 0) AS dishes,
          (r.rating IS NOT NULL AND coalesce(d.n, 0) >= $1) AS should_be_listed
     FROM restaurants r
     LEFT JOIN d ON d.restaurant_id = r.id
    ORDER BY r.sort_order, r.id`,
  [MIN_DISHES],
);

const publishing = rows.filter((r) => r.should_be_listed && !r.listed);
const hiding = rows.filter((r) => !r.should_be_listed && r.listed);
const qualifying = rows.filter((r) => r.should_be_listed);

/** Why each unqualified restaurant does not qualify — the actionable half. */
const reasons = { noRating: [], noMenu: [], thinMenu: [] };
for (const r of rows) {
  if (r.should_be_listed) continue;
  if (r.rating == null) reasons.noRating.push(r);
  else if (r.dishes === 0) reasons.noMenu.push(r);
  else reasons.thinMenu.push(r);
}

/* --- Report --------------------------------------------------------------- */

console.log(`Rule: a sourced rating AND at least ${MIN_DISHES} dishes.\n`);
console.log(`Restaurants:      ${rows.length}`);
console.log(`Qualify:          ${qualifying.length}`);
console.log(`Do not:           ${rows.length - qualifying.length}`);
console.log(`  no rating:      ${reasons.noRating.length}`);
console.log(`  no menu:        ${reasons.noMenu.length}`);
console.log(`  under ${String(MIN_DISHES).padEnd(2)} dishes: ${reasons.thinMenu.length}`);
console.log(
  `\nChanges: ${publishing.length} to publish, ` +
    (NO_HIDE ? `${hiding.length} to hide — SKIPPED (--no-hide).` : `${hiding.length} to hide.`),
);

if (hiding.length) {
  console.log(`\nHiding (currently visible, should not be):`);
  for (const r of hiding.slice(0, 20)) {
    const why = r.rating == null ? "no rating" : r.dishes === 0 ? "no menu" : `${r.dishes} dishes`;
    console.log(`  ${r.name} — ${r.neighborhood} — ${why}`);
  }
  if (hiding.length > 20) console.log(`  ...and ${hiding.length - 20} more`);
}

if (publishing.length) {
  console.log(`\nPublishing (now complete):`);
  for (const r of publishing.slice(0, 20)) {
    console.log(`  ${r.name} — ${r.neighborhood} — ${r.dishes} dishes, ${r.rating}★`);
  }
  if (publishing.length > 20) console.log(`  ...and ${publishing.length - 20} more`);
}

if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

if (publishing.length === 0 && hiding.length === 0) {
  console.log("\nNothing to change.");
  process.exit(0);
}

// One statement, computed in SQL from the same predicate reported above, so the
// write cannot disagree with the preview. `--no-hide` adds one condition —
// only ever flip a row ON — rather than a second predicate that could drift
// from this one.
await sql.query(
  `WITH d AS (SELECT restaurant_id, count(*)::int AS n FROM dishes GROUP BY restaurant_id)
   UPDATE restaurants r
      SET listed = (r.rating IS NOT NULL AND coalesce(d.n, 0) >= $1)
     FROM (SELECT id FROM restaurants) ids
     LEFT JOIN d ON d.restaurant_id = ids.id
    WHERE r.id = ids.id
      AND r.listed <> (r.rating IS NOT NULL AND coalesce(d.n, 0) >= $1)
      ${NO_HIDE ? "AND (r.rating IS NOT NULL AND coalesce(d.n, 0) >= $1)" : ""}`,
  [MIN_DISHES],
);

const [{ listed }] = await sql`SELECT count(*)::int AS listed FROM restaurants WHERE listed`;
console.log(`\n${listed} restaurants are now visible.`);
