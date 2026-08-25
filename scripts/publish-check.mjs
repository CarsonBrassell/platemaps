/**
 * Decides which restaurants are ready to appear on the site, and says what is
 * missing from the ones that aren't.
 *
 *   node --env-file=.env.local scripts/publish-check.mjs --dry
 *   node --env-file=.env.local scripts/publish-check.mjs
 *
 * ## Why `listed` is computed and not set
 *
 * A readiness flag somebody flips by hand is a claim about the past. This
 * recomputes it from the row every time it runs, so the gate cannot drift away
 * from the data behind it — a restaurant whose photo is later removed stops
 * being listed on the next run without anyone remembering to look.
 *
 * The one thing it will not override is `hold_reason`. That column carries the
 * judgements a query cannot make: four rows held out by hand were complete in
 * every mechanical sense and were also in Tijuana. Recomputation must not be
 * able to undo a decision like that, so a hold beats readiness, always.
 *
 * ## What "ready" means
 *
 * Everything the card and detail page *render*, and nothing else:
 *
 *   rating + review_count   `.toFixed(1)` is called on rating in seven
 *                           components with no null branch, so an unrated row
 *                           is not a degraded listing, it is a thrown error
 *                           that takes the whole search page with it
 *   lat + lng               the map places every restaurant it is given
 *   photo                   a card with no image is an empty rectangle
 *
 * Hours were on that list and came off it (21 Aug 2026). They were there
 * because "Hours vary" passed the Open-now filter, so rows without hours
 * inflated its count — but that was a bug in the filter, and holding thousands
 * of restaurants off the site was an expensive way to work around it. The
 * filter now excludes unknown hours, and the card prints hours instead of
 * judging open or closed, so a restaurant with no hours yet renders honestly:
 * it shows none. Hours are a second Yelp call against the same 300-a-day quota
 * as photos, so requiring them meant every restaurant waited roughly two extra
 * weeks to appear for a field the card no longer needs.
 *
 * A menu is deliberately NOT in that list, even though menus are the reason
 * this site exists. The gate's job is narrow — keep pages from rendering
 * wrong — and a restaurant with a photo, a rating and real hours renders
 * correctly whether or not its menu has been extracted yet. Making the menu a
 * gate would also silently unpublish live listings the moment a menu was
 * cleared for re-extraction. Menu coverage is a target, tracked below and by
 * menus:audit; it is not a rendering precondition.
 */

import { sql } from "./sql-client.mjs";

const DRY_RUN = process.argv.includes("--dry");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

/*
 * One expression, used for both the update and the report, so the two can
 * never disagree about what "ready" means. `hours != '[]'` matters: an empty
 * array is fetch-hours.mjs recording "Yelp publishes no hours for this place",
 * which is an answer, but not one the Open-now filter can use.
 */
const READY = sql`
  hold_reason IS NULL
  AND rating IS NOT NULL
  AND review_count IS NOT NULL
  AND lat IS NOT NULL AND lng IS NOT NULL
  AND photo IS NOT NULL AND photo <> ''
`;

const before = await sql`SELECT count(*) FILTER (WHERE listed)::int AS n, count(*)::int AS total FROM restaurants`;

if (!DRY_RUN) {
  await sql`UPDATE restaurants SET listed = TRUE  WHERE NOT listed AND ${READY}`;
  await sql`UPDATE restaurants SET listed = FALSE WHERE listed AND NOT (${READY})`;
}

/* What is missing, counted per reason. A row can be missing several things, so
 * these overlap on purpose — the question being answered is "how much work is
 * each field", not "how many rows are broken". */
const [gaps] = await sql`
  SELECT
    count(*)::int AS unlisted,
    count(*) FILTER (WHERE hold_reason IS NOT NULL)::int AS held,
    count(*) FILTER (WHERE rating IS NULL)::int AS no_rating,
    count(*) FILTER (WHERE photo IS NULL OR photo = '')::int AS no_photo,
    count(*) FILTER (WHERE hours IS NULL OR hours = '[]'::jsonb)::int AS no_hours,
    count(*) FILTER (WHERE lat IS NULL OR lng IS NULL)::int AS no_coords
  FROM restaurants WHERE NOT listed
`;

const [after] = await sql`
  SELECT
    count(*) FILTER (WHERE listed)::int AS listed,
    count(*)::int AS total,
    count(*) FILTER (WHERE listed AND EXISTS (
      SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id))::int AS listed_with_menu
  FROM restaurants
`;

const held = await sql`
  SELECT name, neighborhood, hold_reason FROM restaurants
  WHERE hold_reason IS NOT NULL ORDER BY name
`;

console.log(
  `${DRY_RUN ? "Dry run — nothing written.\n\n" : ""}` +
    `${after.listed} of ${after.total} restaurants listed ` +
    `(was ${before[0].n}).\n` +
    `${after.listed_with_menu} of those carry a menu.\n\n` +
    `${gaps.unlisted} not listed, blocked by:\n` +
    `  ${String(gaps.no_photo).padStart(4)} no photo\n` +
    `  ${String(gaps.no_rating).padStart(4)} no rating\n` +
    `  ${String(gaps.no_hours).padStart(4)} no hours\n` +
    `  ${String(gaps.no_coords).padStart(4)} no coordinates\n` +
    `  ${String(gaps.held).padStart(4)} held by hand`,
);

if (held.length > 0) {
  console.log("\nHeld:");
  for (const h of held) console.log(`  ${h.name} (${h.neighborhood}) — ${h.hold_reason}`);
}
