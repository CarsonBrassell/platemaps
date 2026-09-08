/**
 * Rebuilds `dish_names`, the distinct dish vocabulary the search dropdown offers.
 *
 *   node --env-file=.env.local scripts/index-dish-names.mjs [--dry]
 *   npm run dishes:index
 *
 * `dishes` holds one row per dish per restaurant — 429,350 of them on listed
 * restaurants, collapsing to 194,650 distinct names — 187,183 once folded and
 * bounded by the rules below. The dropdown wants the collapsed form, and
 * `probe/dish-vocab.mjs` measured what it costs to collapse live: 100-150ms a
 * keystroke. So it is collapsed once, here.
 *
 * The milliseconds are the smaller half of the reason. The larger one is that a
 * spell-corrected suggestion has to score a *vocabulary*: with the raw table, a
 * dish served by 300 places gets 300 chances to beat one served by two, and the
 * fuzzy ranking becomes a popularity contest it never meant to hold. Ranked
 * once per name, `place_count` is a tiebreak instead of a thumb on the scale.
 *
 * ## Idempotent, and never momentarily empty
 *
 * Upsert-then-sweep rather than truncate-then-fill. A TRUNCATE would leave the
 * live dropdown with no dishes for the length of the rebuild, and this runs at
 * the end of every `menus:load`. So: every current name is upserted with a
 * fresh `refreshed_at`, and only then are the rows this run did *not* touch
 * deleted — those are dishes that left the corpus since the last rebuild.
 *
 * Re-running changes nothing, which is what lets `menus:load` call it blindly.
 */

import { sql } from "./sql-client.mjs";

const DRY_RUN = process.argv.includes("--dry");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local.");
  process.exit(1);
}

/*
 * `dishes.name_folded` is a stored generated column and the fold is written out
 * in scripts/migrate.mjs, which is the only place it exists. It has to agree
 * exactly with `normalize()` in src/lib/textMatch.ts — the browser folds what
 * was typed, that column folds what was stored, and a mismatch is invisible
 * until a dish plainly on a menu returns nothing. Don't re-derive it here.
 */
const FOLD = "d.name_folded";

/*
 * Same gate as everywhere else: listed means no hold and real coordinates.
 * A dish on a held restaurant is not offerable, so it is not vocabulary.
 */
const LISTED = "r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL";

/*
 * Two bounds on what counts as a name, both aimed at the same failure: menu
 * extraction occasionally lands a section heading or a whole description in the
 * name column, and those are unusable as dropdown rows. Under 3 characters is
 * not a searchable term either. Neither bound touches `dishes` — a rejected row
 * still shows on the restaurant's menu, it just never gets offered as a query.
 */
const MIN_LENGTH = 3;
const MAX_LENGTH = 80;

const [{ t: startedAt }] = await sql`SELECT now() AS t`;
const [{ n: before }] = await sql`SELECT count(*)::int AS n FROM dish_names`;

/* The vocabulary this run would write, as one subquery both branches share. */
const VOCABULARY = `
  SELECT ${FOLD} AS name,
         mode() WITHIN GROUP (ORDER BY btrim(d.name)) AS label,
         count(DISTINCT d.restaurant_id)::int AS place_count
  FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id
  WHERE ${LISTED}
    AND length(${FOLD}) BETWEEN ${MIN_LENGTH} AND ${MAX_LENGTH}
  GROUP BY 1`;

if (DRY_RUN) {
  const [counted] = await sql.query(
    `SELECT count(*)::int AS names, sum(place_count)::int AS pairs FROM (${VOCABULARY}) v`,
  );
  console.log(
    `Dry run — nothing written.\n` +
      `  ${before} rows in dish_names now\n` +
      `  ${counted.names} distinct names would be written ` +
      `(${counted.pairs} name/restaurant pairs)`,
  );
} else {
  /*
   * `label` is the spelling to print, and it is the most common *original* form
   * among the rows that folded together — `mode()` rather than `min()`, because
   * min() sorts "BIRRIA TACOS" above "Birria Tacos" and would print the corpus's
   * shoutiest casing. Ties inside mode() are arbitrary, which is fine: a tie
   * means two spellings are equally common and either is a fair thing to show.
   *
   * Counted through a CTE rather than `RETURNING 1` alone, so 187,000 rows are
   * tallied in the database instead of sent back over the wire to be counted.
   */
  const [{ n: written }] = await sql.query(
    `WITH upserted AS (
       INSERT INTO dish_names (name, label, place_count, refreshed_at)
       SELECT v.name, v.label, v.place_count, $1::timestamptz
       FROM (${VOCABULARY}) v
       ON CONFLICT (name) DO UPDATE SET
         label = EXCLUDED.label,
         place_count = EXCLUDED.place_count,
         refreshed_at = EXCLUDED.refreshed_at
       RETURNING 1
     )
     SELECT count(*)::int AS n FROM upserted`,
    [startedAt],
  );

  /*
   * Anything the pass above did not touch describes dishes that are no longer
   * on a listed menu. Compared against this run's start rather than `now()`:
   * the rebuild takes seconds, and comparing against a clock that had moved
   * would delete the rows it had just written.
   */
  const [{ n: swept }] = await sql.query(
    `WITH gone AS (
       DELETE FROM dish_names WHERE refreshed_at < $1::timestamptz RETURNING 1
     )
     SELECT count(*)::int AS n FROM gone`,
    [startedAt],
  );

  const [{ n: after }] = await sql`SELECT count(*)::int AS n FROM dish_names`;
  console.log(
    `dish_names rebuilt: ${after} names (was ${before}; ` +
      `${written} written, ${swept} swept).`,
  );
}

/* Only the local `pg` shim has a pool to close; the Neon driver has no `end`.
   Not process.exit(): exiting under an in-flight driver handle aborts the
   process with a libuv assertion instead of returning a clean zero. */
await sql.end?.();
