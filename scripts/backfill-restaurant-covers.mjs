/**
 * One-off backfill: set every restaurant's main photo to its most-upvoted
 * public plate photo (the same rule as refreshRestaurantCover in lib/db.ts).
 *
 *   node --env-file=.env.local scripts/backfill-restaurant-covers.mjs --dry
 *   node --env-file=.env.local scripts/backfill-restaurant-covers.mjs
 *
 * Needs BLOB_READ_WRITE_TOKEN (its store id builds the host pattern, exactly as
 * isStoredPhotoUrl does). Restaurants with no eligible post photo are left
 * alone. Idempotent. Snapshot restaurants.photo first if you want a way back.
 * After a real run, restaurant pages catch up within their 1h cache window.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const DRY_RUN = process.argv.includes("--dry");
const m = process.env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
if (!m) throw new Error("BLOB_READ_WRITE_TOKEN missing; cannot build the host pattern.");
const host = `${m[1].toLowerCase()}.public.blob.vercel-storage.com`;
const pattern = `^https://${host.replace(/\./g, "\.")}/(posts|avatars)/[^/]+/[0-9a-f-]{36}\.jpg$`;

const winners = await sql`
  SELECT DISTINCT ON (p.restaurant_id)
         p.restaurant_id, m.elem->>'url' AS url, m.elem->>'alt' AS alt
    FROM posts p
   CROSS JOIN LATERAL jsonb_array_elements(p.media) WITH ORDINALITY AS m(elem, ord)
   WHERE p.restaurant_id IS NOT NULL AND p.photos_public
     AND m.elem->>'type' = 'image' AND m.elem->>'url' ~ ${pattern}
   ORDER BY p.restaurant_id,
            (SELECT count(*) FROM post_upvotes u WHERE u.post_id = p.id) DESC,
            p.created_at ASC, p.id ASC, m.ord ASC
`;
let changed = 0;
for (const w of winners) {
  const cur = await sql`SELECT photo FROM restaurants WHERE id = ${w.restaurant_id}`;
  if (cur.length === 0 || cur[0].photo === w.url) continue;
  changed++;
  console.log(`${DRY_RUN ? "[dry] " : ""}${w.restaurant_id}: ${cur[0].photo ?? "(none)"} -> ${w.url}`);
  if (!DRY_RUN) {
    await sql`UPDATE restaurants SET photo = ${w.url}, photo_alt = ${w.alt}, photo_w = NULL, photo_h = NULL
              WHERE id = ${w.restaurant_id}`;
  }
}
console.log(`${changed} restaurant(s) ${DRY_RUN ? "would change" : "updated"} of ${winners.length} with eligible photos.`);
