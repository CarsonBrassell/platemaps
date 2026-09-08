import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT p.id::text, p.user_id::text AS uid, u.name AS author, p.created_at, p.restaurant, p.dish_name, p.rating, p.photos_public,
  jsonb_array_length(COALESCE(p.media,'[]'::jsonb)) AS n_media,
  LEFT(COALESCE(p.media::text,'null'), 400) AS media_head,
  LEFT(p.text, 50) AS text_head
  FROM posts p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 15`;
for (const p of r) console.log(`${p.created_at.toISOString()} media=${p.n_media} pub=${p.photos_public} ${p.author} | ${p.restaurant} | ${p.dish_name} | ${p.text_head}`);
console.log("\nnewest media:", r[0]?.media_head);
console.log("newest id:", r[0]?.id, "uid:", r[0]?.uid);
