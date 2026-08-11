/**
 * What the extracted menus actually look like, per restaurant.
 *
 *   node --env-file=.env.local scripts/menus-audit.mjs
 *
 * Coverage counts say a menu exists. They do not say it is any good. This
 * reports the two ways an extraction quietly disappoints:
 *
 *  - **Priceless menus.** A dish list with no prices is half a menu, and it
 *    looks complete on the page. Upscale and chain sites routinely publish
 *    names and descriptions without a single number.
 *  - **Suspiciously short menus.** Under about eight dishes usually means a
 *    truncated page or a partial section rather than a small restaurant.
 *
 * Confidence and source come from menu_lookups, so a menu read off a third
 * party can be found again when it goes stale.
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT
    r.id,
    r.name,
    count(d.id)::int AS dishes,
    count(*) FILTER (WHERE d.price = '—' OR d.price = '')::int AS no_price,
    m.confidence,
    m.source_url
  FROM restaurants r
  JOIN dishes d ON d.restaurant_id = r.id
  LEFT JOIN menu_lookups m ON m.restaurant_id = r.id
  GROUP BY r.id, r.name, m.confidence, m.source_url
  ORDER BY (count(*) FILTER (WHERE d.price = '—' OR d.price = ''))::float / count(d.id) DESC,
           count(d.id)
`;

console.log("dishes  no price  confidence  restaurant");
for (const r of rows) {
  const flag = r.no_price === r.dishes ? "  <-- no prices at all" : r.dishes < 8 ? "  <-- short" : "";
  console.log(
    `${String(r.dishes).padStart(6)}  ${String(r.no_price).padStart(8)}  ` +
      `${(r.confidence ?? "-").padEnd(10)}  ${r.name}${flag}`,
  );
}

/*
 * Mechanical smells — the errors a transcription makes, as opposed to the ones
 * a bad source makes.
 *
 * None of these prove an entry is wrong. They point at the handful worth a
 * human looking at, which is the difference between an audit you act on and a
 * list of 15,000 dishes nobody reads. Checking that a price is *correct* needs
 * the source page reopened; that is the verifier's job, not this script's.
 */
const suspect = await sql`
  SELECT r.name AS restaurant, d.name, d.price, d.section, d.description
  FROM dishes d
  JOIN restaurants r ON r.id = d.restaurant_id
  WHERE
    -- A decimal slip: entrées are not $2 and are not $900.
    (d.price ~ '^\\$[0-9.]+$' AND (
       replace(d.price, '$', '')::numeric > 400 OR
       replace(d.price, '$', '')::numeric < 1.5))
    -- Page furniture that got read as a dish.
    OR d.name ~* '^(order|view|download|gift card|reservation|catering|see |click)'
    OR d.section ~* '^(order|view|download|gift card|reservation|click|home|about)'
    -- A description that swallowed a paragraph rather than a dish line.
    OR length(d.description) > 160
`;

if (suspect.length > 0) {
  console.log(`\n${suspect.length} entries worth a look:\n`);
  for (const s of suspect) {
    console.log(`  ${s.restaurant} — ${s.section} / ${s.name} ${s.price}`);
  }
}

/*
 * Grouped by restaurant *id*, not name.
 *
 * Grouping by name reported every chain as a mass of duplicates: there are four
 * Broken Yolk Cafes and three Phil's BBQs in the corpus, each legitimately
 * carrying the same dish once. A branch sharing its chain's menu is expected;
 * one restaurant listing the same dish twice is the thing worth looking at, and
 * only the id can tell those apart.
 */
const dupes = await sql`
  SELECT r.name AS restaurant, r.neighborhood, d.name, count(*)::int AS n
  FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
  GROUP BY d.restaurant_id, r.name, r.neighborhood, d.name HAVING count(*) > 1
  ORDER BY count(*) DESC LIMIT 15
`;
if (dupes.length > 0) {
  console.log(`\n${dupes.length} duplicated dish names (a menu read twice, or a real size variant):\n`);
  for (const d of dupes) console.log(`  ${d.restaurant} (${d.neighborhood}) — ${d.name} ×${d.n}`);
}

const priceless = rows.filter((r) => r.no_price === r.dishes).length;
const partial = rows.filter((r) => r.no_price > 0 && r.no_price < r.dishes).length;
const short = rows.filter((r) => r.dishes < 8).length;
const thirdParty = rows.filter((r) => r.confidence && r.confidence !== "high").length;

console.log(
  `\n${rows.length} menus.` +
    `\n  ${priceless} with no prices at all` +
    `\n  ${partial} with some prices missing` +
    `\n  ${short} shorter than 8 dishes` +
    `\n  ${thirdParty} read off a third party rather than the official site`,
);
