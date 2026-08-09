/**
 * One-off backfill: converts every pre-split `rating` off the old flattened
 * 0-10 scale and onto the scale it was actually collected on.
 *
 *   node --env-file=.env.local scripts/backfill-rating-kind.mjs --dry
 *   node --env-file=.env.local scripts/backfill-rating-kind.mjs
 *
 * The old composer wrote both instruments into one column: a restaurant
 * review as `stars * 2`, a dish review as `pct / 10`. Which one a row came
 * from is recoverable from its shape rather than guessed — the dish branch is
 * the only one that sets `dish_name`, and the restaurant branch is the only
 * one that sets `vibe`. So:
 *
 *   dish_name present -> dish review    -> percent = rating * 10
 *   dish_name absent  -> restaurant     -> stars   = rating / 2
 *
 * Idempotent: rows that already carry a rating_kind are skipped, so this can
 * be re-run without double-converting anything.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");

const rows = await sql`
  SELECT id, rating, dish_name, vibe, left(text, 45) AS snippet
  FROM posts
  WHERE rating IS NOT NULL AND rating_kind IS NULL
  ORDER BY rating
`;

if (rows.length === 0) {
  console.log("Nothing to backfill — every rated post already has a rating_kind.");
  process.exit(0);
}

console.log(`${rows.length} rows to convert\n`);

const updates = [];
for (const row of rows) {
  const old = Number(row.rating);
  const kind = row.dish_name ? "dish" : "restaurant";
  // Round to the scale's own granularity: percents and stars are both whole
  // numbers, same as what the composer produces today.
  const next = kind === "dish" ? Math.round(old * 10) : Math.round(old / 2);

  // A star count of 0 isn't selectable in the picker (it means "nothing
  // chosen"), so clamp rather than write a rating no UI can produce.
  const clamped =
    kind === "dish" ? Math.min(100, Math.max(0, next)) : Math.min(5, Math.max(1, next));

  updates.push({ id: row.id, kind, clamped });
  console.log(
    `  ${String(old).padEnd(5)} -> ${String(clamped).padEnd(3)} ${
      kind === "dish" ? "%   " : "star"
    }  (${kind})  ${row.snippet}`,
  );
}

if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

for (const u of updates) {
  await sql`
    UPDATE posts SET rating = ${u.clamped}, rating_kind = ${u.kind} WHERE id = ${u.id}
  `;
}

console.log(`\nConverted ${updates.length} rows.`);
