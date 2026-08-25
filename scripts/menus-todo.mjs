/**
 * Which restaurants still need a menu, best-known first.
 *
 *   node --env-file=.env.local scripts/menus-todo.mjs --limit 20
 *   node --env-file=.env.local scripts/menus-todo.mjs --limit 20 --skip 20
 *
 * The work queue for menu extraction. Ordered by review count so the places
 * people actually search for get menus first — a missing menu on Phil's BBQ is
 * a hole a visitor notices, a missing menu on a 60-review taco shop is not.
 *
 * Restaurants already recorded in `menu_lookups` are excluded even when they
 * have no dishes: that row means the menu was looked for and isn't findable,
 * and re-hunting it every run is how a queue stops making progress.
 */

import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};

const LIMIT = flag("--limit", 20);
const SKIP = flag("--skip", 0);
const JSON_OUT = args.includes("--json");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/*
 * Two kinds of restaurant need a menu, and only one of them is obvious.
 *
 * The obvious kind has no dishes at all. The other kind carries the original
 * hand-written seed data — four to twelve dishes, written before any extraction
 * existed — and the first version of this query walked straight past all
 * nineteen of them, because they *have* dishes. Sushi Ota sat at 10 dishes all
 * day while the batches worked through restaurants with none.
 *
 * A missing `menu_lookups` row is what distinguishes them: every extracted menu
 * writes one, so its absence means the dishes came from somewhere else. That is
 * a more reliable test than a dish-count threshold, which would also catch the
 * genuinely small menus (a conveyor-belt sushi bar, a fish-market café) that
 * extraction has already confirmed are that short.
 */
const rows = await sql`
  SELECT r.id, r.name, r.cuisine, r.neighborhood, r.review_count,
         count(d.id)::int AS existing_dishes
  FROM restaurants r
  LEFT JOIN dishes d ON d.restaurant_id = r.id
  -- hold_reason IS NULL keeps closed and mislocated restaurants out of the
  -- work. Without it 391 held rows sat in a 3,742-row queue - one in ten - and
  -- agents spent real budget hunting menus for businesses that no longer trade.
  -- One extraction ran a full search on Marco Italian before concluding it was
  -- permanently closed, which the Google pass had already recorded weeks
  -- earlier. A held row is a decision already made; the queue should honour it.
  WHERE r.hold_reason IS NULL
    AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id = r.id)
  GROUP BY r.id, r.name, r.cuisine, r.neighborhood, r.review_count
  -- Seed menus first regardless of review count: going from 4 dishes to 45 is a
  -- bigger gain than going from 0 to 45, because those pages are already live
  -- and already showing a menu that is wrong by omission.
  ORDER BY (count(d.id) > 0) DESC, r.review_count DESC NULLS LAST, r.id
  LIMIT ${LIMIT} OFFSET ${SKIP}
`;

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const [{ n: done }] = await sql`SELECT count(DISTINCT restaurant_id)::int AS n FROM dishes`;
  const [{ n: total }] = await sql`SELECT count(*)::int AS n FROM restaurants`;
  console.log(`Coverage: ${done}/${total}. Next ${rows.length} (skipping ${SKIP}):\n`);
  for (const r of rows) {
    // Flagged so a batch prompt can say "this one already shows a menu, and it
    // is wrong by omission" rather than treating it as a blank slate.
    const seed = r.existing_dishes > 0 ? `\t[SEED: ${r.existing_dishes} dishes to replace]` : "";
    console.log(
      `${r.id}\t${r.name}\t${r.cuisine}\t${r.neighborhood}\t${r.review_count} reviews${seed}`,
    );
  }
}
