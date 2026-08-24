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

/*
 * Menus that look like somebody else's prices with a multiplier on top.
 *
 * Delivery marketplaces mark a restaurant's menu up by a flat percentage and
 * publish the result, so a scraped menu carries prices that are a real menu
 * times 1.1, 1.15 or 1.2. Four were caught by hand in one night of extraction
 * — Chart House at 1.10, Hayes Burger and Karina's at 1.20, Greek Corner at
 * 1.23 — and each was found the same way: the numbers were odd ($15.40,
 * $16.80, $24.24) and divided back to round ones.
 *
 * That is the test. Restaurants price in round numbers and in .95/.99 endings;
 * they do not price a majority of a menu at values that all divide cleanly by
 * the same odd factor. Two-thirds is the threshold because a handful of items
 * will divide evenly by chance.
 *
 * This finds a smell, not a fact — a genuine menu can trip it — so it prints
 * and does not delete. Confirming means opening the restaurant's own ordering
 * system, which is the extractor's job, not this script's.
 */
const menuPrices = await sql`
  SELECT r.id, r.name, array_agg(replace(d.price, '$', '')::numeric) AS prices
  FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
  WHERE d.price ~ '^\\$[0-9]+\\.[0-9]{2}$'
  GROUP BY r.id, r.name HAVING count(*) >= 8
`;

const marked = [];
for (const m of menuPrices) {
  for (const factor of [1.1, 1.15, 1.2, 1.25]) {
    // "Divides back to a round number" — a real price ends .00, .25, .50, .95
    // or .99, so allow those and nothing else.
    const clean = m.prices.filter((p) => {
      const back = Math.round((Number(p) / factor) * 100) / 100;
      const cents = Math.round((back % 1) * 100);
      return [0, 25, 50, 75, 95, 99].includes(cents);
    }).length;
    if (clean / m.prices.length >= 0.67) {
      marked.push({ name: m.name, factor, share: Math.round((clean / m.prices.length) * 100) });
      break;
    }
  }
}

if (marked.length > 0) {
  console.log(`\n${marked.length} menus whose prices divide back to round numbers — possible delivery markup:\n`);
  for (const m of marked.sort((a, b) => b.share - a.share)) {
    console.log(`  ${m.name} — ${m.share}% of prices divide cleanly by ${m.factor}`);
  }
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
