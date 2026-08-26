/**
 * Retires chains that publish no prices anywhere, so waves stop re-hunting them.
 *
 *   node --env-file=.env.local scripts/mark-unpriced-chains.mjs --dry
 *   node --env-file=.env.local scripts/mark-unpriced-chains.mjs
 *
 * ## Why this exists
 *
 * Starbucks and McDonald's are the two largest chains in the corpus - 199 and
 * 74 branches - and neither publishes a price anywhere reachable. Starbucks'
 * own API returns 383 products with no price field. McDonald's offers app-only
 * pickup or a delivery menu that states outright its prices are higher than in
 * the restaurant. Both were extracted once, honestly, as dish names with "-"
 * for every price.
 *
 * Because none of those branches carried a `menu_lookups` row, all 271 of them
 * sat in the work queue, and every wave drew some. One 48-restaurant wave drew
 * seven McDonald's. Each would have cost an agent ten minutes to rediscover a
 * fact this project already knew and had already written down.
 *
 * A `not_found` row is the honest record of that: the menu was looked for and
 * its prices are not published. It costs about 5.6 waves of agent time to keep
 * NOT writing it.
 *
 * ## This is a reversible decision, deliberately
 *
 * Every row written here is `confidence = 'unpriced-chain'`, so if one of these
 * chains ever starts publishing prices, `DELETE FROM menu_lookups WHERE
 * confidence = 'unpriced-chain'` puts all of them back in the queue in one
 * statement. Nothing is deleted and no restaurant is unlisted.
 *
 * ## What this does NOT do
 *
 * It does not touch the two branches that already carry the priceless dish
 * lists (McDonald's El Cajon, Starbucks La Mesa). Those 200 rows still render
 * as a menu where every price is a dash, which is arguably worse than showing
 * no menu on a site whose whole promise is the price - but that is a
 * product-visible call for a person to make, not a cleanup script.
 */

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");

/*
 * Named explicitly rather than detected. A rule like "no branch has prices"
 * would also catch a chain nobody has extracted YET, and retire it before it
 * was ever tried - which is the opposite of what this is for. These two are on
 * the list because they were attempted and the prices proved not to exist.
 */
const UNPRICED_CHAINS = ["Starbucks", "McDonald's"];

const targets = await sql`
  SELECT r.id, r.name
  FROM restaurants r
  WHERE r.name = ANY(${UNPRICED_CHAINS})
    AND r.hold_reason IS NULL
    AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
  ORDER BY r.name, r.id
`;

const byChain = new Map();
for (const t of targets) byChain.set(t.name, (byChain.get(t.name) ?? 0) + 1);
for (const [name, n] of byChain) console.log(`  ${name}: ${n} branches`);

if (DRY_RUN) {
  console.log(`\nDry run - would retire ${targets.length} branches. Nothing written.`);
  process.exit(0);
}

for (const t of targets) {
  await sql`
    INSERT INTO menu_lookups (restaurant_id, status, source_url, confidence, dish_count, attempted_at)
    VALUES (${t.id}, 'not_found', null, 'unpriced-chain', 0, now())
    ON CONFLICT (restaurant_id) DO NOTHING
  `;
}

const [{ n: queue }] = await sql`
  SELECT count(*)::int AS n FROM restaurants r
  WHERE r.hold_reason IS NULL
    AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
`;

console.log(`\nRetired ${targets.length} branches as 'unpriced-chain'.`);
console.log(`Queue is now ${queue}.`);
console.log(`Reversible: DELETE FROM menu_lookups WHERE confidence = 'unpriced-chain';`);
