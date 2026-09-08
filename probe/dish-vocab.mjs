/**
 * How big is the dish vocabulary, and can it be queried per keystroke?
 *
 * SEARCH-PLAN.md A3 says to decide the dish-suggestion strategy with this
 * number in hand rather than before: if the distinct vocabulary is small, the
 * suggest endpoint can group `dishes` live; if it is large, the answer is a
 * materialised `dish_names(name, place_count)` table refreshed by the menu
 * loader. Read-only.
 *
 *   node --env-file=.env.local probe/dish-vocab.mjs
 */
import { sql } from "../scripts/sql-client.mjs";

const LISTED = "r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL";

const [totals] = await sql`
  SELECT count(*)::int rows,
         count(DISTINCT lower(btrim(d.name)))::int distinct_names
  FROM dishes d
`;
console.log("all dishes            ", totals);

const [listed] = await sql`
  SELECT count(*)::int rows,
         count(DISTINCT lower(btrim(d.name)))::int distinct_names,
         count(DISTINCT d.restaurant_id)::int restaurants
  FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
  WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
`;
console.log("on listed restaurants ", listed);

/* The shape the suggest endpoint would actually run: distinct name plus how
   many listed restaurants serve it, prefix-matched. Timed cold-ish, three
   different prefixes, because one warm run proves nothing. */
for (const q of ["car", "carne", "pizz", "birria", "pad t"]) {
  const started = Date.now();
  const rows = await sql`
    SELECT lower(btrim(d.name)) AS name, count(DISTINCT d.restaurant_id)::int AS places
    FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
    WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
      AND d.name ILIKE ${`${q}%`}
    GROUP BY 1
    ORDER BY places DESC, name
    LIMIT 5
  `;
  const ms = Date.now() - started;
  console.log(`\nprefix "${q}"  ${ms}ms`);
  for (const row of rows) console.log(`   ${String(row.places).padStart(5)}  ${row.name}`);
}

/* Word-boundary rather than string-start: "asada" should reach "Carne Asada
   Fries". This is the query the dropdown actually wants, and the expensive one
   — a leading wildcard cannot use a btree, so it leans on the trigram index.

   Spelled `(^|[^a-z0-9])` rather than Postgres's own `\m`: through the Neon
   HTTP driver a backslash in the pattern arrives eaten, so `\masada` reaches
   the server as `masada` and matches nothing — silently, which is worse than an
   error. `SELECT 'carne asada' ~ '\masada'` returns false there and true in
   psql. Don't put `\m`, `\y` or `\b` in a pattern this driver sends. */
for (const q of ["asada", "birria"]) {
  const started = Date.now();
  const rows = await sql`
    SELECT lower(btrim(d.name)) AS name, count(DISTINCT d.restaurant_id)::int AS places
    FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
    WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
      AND d.name ~* ${`(^|[^a-z0-9])${q}`}
    GROUP BY 1
    ORDER BY places DESC, name
    LIMIT 5
  `;
  const ms = Date.now() - started;
  console.log(`\nword-boundary "${q}"  ${ms}ms`);
  for (const row of rows) console.log(`   ${String(row.places).padStart(5)}  ${row.name}`);
}

console.log(`\n(listed gate used: ${LISTED})`);

/* --- After materialising ---------------------------------------------------
 *
 * The answer the numbers above forced: scripts/index-dish-names.mjs collapses
 * the table once into `dish_names`. This is the same pair of questions asked of
 * that table, so the two halves of this file can be read against each other.
 */
const [names] = await sql`SELECT count(*)::int AS n FROM dish_names`;
console.log(`\n\ndish_names               { rows: ${names.n} }`);

/* Read every timing below against this one. Neon is HTTP over the open
   internet from here, and an empty `SELECT 1` costs ~85ms warm — so the ~90ms
   a lookup takes is almost entirely the trip, and the queries above and below
   are not really being compared on execution at all. The case for
   materialising was never latency from this machine; it is that a fuzzy
   suggestion has to rank 187,183 names once instead of 429,350 rows that
   repeat them. */
for (let i = 0; i < 3; i++) {
  const started = Date.now();
  await sql`SELECT 1 AS n`;
  console.log(`  round-trip baseline (SELECT 1)  ${Date.now() - started}ms`);
}

for (const q of ["car", "carne", "pizz", "birria", "pad t"]) {
  const started = Date.now();
  const rows = await sql`
    SELECT label, place_count FROM dish_names
    WHERE name LIKE ${`${q}%`}
    ORDER BY place_count DESC, name
    LIMIT 5
  `;
  const ms = Date.now() - started;
  console.log(`\nprefix "${q}"  ${ms}ms`);
  for (const row of rows) console.log(`   ${String(row.place_count).padStart(5)}  ${row.label}`);
}

for (const q of ["asada", "birria"]) {
  const started = Date.now();
  const rows = await sql`
    SELECT label, place_count FROM dish_names
    WHERE name ~ ${`(^| )${q}`}
    ORDER BY place_count DESC, name
    LIMIT 5
  `;
  const ms = Date.now() - started;
  console.log(`\nword-boundary "${q}"  ${ms}ms`);
  for (const row of rows) console.log(`   ${String(row.place_count).padStart(5)}  ${row.label}`);
}

await sql.end?.();
