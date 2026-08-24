/**
 * Deletes photos from posts older than the retention window.
 *
 *   npm run photos:purge           # report only — what would go
 *   npm run photos:purge -- --apply
 *
 * ## What it does and does not do
 *
 * Empties the `media` column. The post stays: text, rating, dish, price and
 * restaurant are all untouched, so plate scores, category tallies and every
 * restaurant page read exactly what they read before. Both feed cards already
 * render a post with no media as a text card, so nothing needs a new state.
 *
 * **This is permanent.** Photos are base64 in that column and there is no copy
 * anywhere else — no object store, no soft-delete flag, no backup this script
 * takes. A run with `--apply` destroys user content.
 *
 * ## Why the window is worth a second look before you run it
 *
 * `PHOTO_RETENTION_DAYS` is 14 and `FEED_WINDOW_DAYS` is 60, so a post is
 * served by Discover, the friends feed and the map for six weeks after its
 * photo is gone. Measured on 2026-08-21 that band held 389 of 510 posts. The
 * report below prints the same split every time it runs, so the cost of the
 * mismatch is in front of you rather than in a comment somewhere.
 *
 * The scheduled path is `/api/cron/purge-photos`, which calls the same
 * function in `src/lib/db.ts`. This script exists for the first run and for
 * looking, not as the mechanism.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

/**
 * Both windows are read out of their TypeScript modules rather than restated
 * here, because a script that purges on a stale copy of the number is the
 * whole failure this guards against.
 *
 * Read as text, not imported: this repo's Node is 20.20, which cannot load a
 * `.ts` file at all — `scripts/recompute-price-bands.mjs` imports
 * `priceBands.ts` the obvious way and has been crashing on
 * ERR_UNKNOWN_FILE_EXTENSION as a result. Parsing throws if the constant moves
 * or is renamed, so this fails loudly rather than falling back to a default.
 */
function constFrom(file, name) {
  const src = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`could not read ${name} from ${file}`);
  return Number(m[1]);
}

const PHOTO_RETENTION_DAYS = constFrom("photoRetention.ts", "PHOTO_RETENTION_DAYS");
const FEED_WINDOW_DAYS = constFrom("feedWindow.ts", "FEED_WINDOW_DAYS");

const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Pass --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const [split] = await sql`
  SELECT
    count(*) FILTER (
      WHERE jsonb_array_length(media) > 0
        AND created_at >= now() - make_interval(days => ${PHOTO_RETENTION_DAYS})
    )::int AS kept,
    count(*) FILTER (
      WHERE jsonb_array_length(media) > 0
        AND created_at < now() - make_interval(days => ${PHOTO_RETENTION_DAYS})
    )::int AS expiring,
    COALESCE(sum(pg_column_size(media)) FILTER (
      WHERE jsonb_array_length(media) > 0
        AND created_at < now() - make_interval(days => ${PHOTO_RETENTION_DAYS})
    ), 0)::int AS expiring_bytes,
    count(*) FILTER (
      WHERE created_at <  now() - make_interval(days => ${PHOTO_RETENTION_DAYS})
        AND created_at >= now() - make_interval(days => ${FEED_WINDOW_DAYS})
    )::int AS in_feed_without_photo
  FROM posts`;

console.log(`retention ${PHOTO_RETENTION_DAYS}d · feed window ${FEED_WINDOW_DAYS}d\n`);
console.log(`  photos inside the window, kept   ${split.kept}`);
console.log(`  photos past the window, expiring ${split.expiring}  (${kb(split.expiring_bytes)})`);
console.log(
  `  posts still in the feed with no photo after this runs   ${split.in_feed_without_photo}`,
);

if (!APPLY) {
  console.log("\nreport only — nothing was written. Re-run with --apply to delete.");
  process.exit(0);
}

if (split.expiring === 0) {
  console.log("\nnothing to clear.");
  process.exit(0);
}

const rows = await sql`
  UPDATE posts SET media = '[]'::jsonb
   WHERE jsonb_array_length(media) > 0
     AND created_at < now() - make_interval(days => ${PHOTO_RETENTION_DAYS})
  RETURNING id`;

console.log(`\ncleared ${rows.length} posts, freed about ${kb(split.expiring_bytes)}.`);
console.log("Postgres reuses that space for new rows; it does not shrink the file.");
