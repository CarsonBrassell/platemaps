/*
 * Moves photos that were stored as base64 data URLs into the blob store and
 * leaves their address behind in the row.
 *
 * Posts written before the switch carry the whole JPEG inside `posts.media`,
 * and profiles the same way in `users.avatar_url`. Both columns are read on
 * ordinary queries, so until those rows are converted every feed page that
 * includes one still drags the picture through Postgres.
 *
 * Safe to run more than once: a row is only touched if its URL still starts
 * with `data:`, so a second pass over converted rows does nothing. Run it with
 * --dry first to see what it would do.
 *
 *   node --env-file=.env.local scripts/backfill-media-to-blob.mjs --dry
 *   node --env-file=.env.local scripts/backfill-media-to-blob.mjs
 */
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const sql = neon(process.env.DATABASE_URL);
const DRY = process.argv.includes("--dry");

if (!process.env.BLOB_READ_WRITE_TOKEN && !DRY) {
  console.error("BLOB_READ_WRITE_TOKEN is not set — run with --env-file=.env.local");
  process.exit(1);
}

const isDataUrl = (v) => typeof v === "string" && v.startsWith("data:");
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

function decode(dataUrl) {
  const match = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/is.exec(dataUrl);
  if (!match) return null;
  return { contentType: match[1], bytes: Buffer.from(match[2], "base64") };
}

/** One data URL to one object in the store, returning its address. */
async function move(dataUrl, folder, owner) {
  const decoded = decode(dataUrl);
  if (!decoded) {
    console.warn(`  ! not a base64 image, left alone: ${dataUrl.slice(0, 32)}…`);
    return null;
  }
  const ext = decoded.contentType === "image/png" ? "png" : "jpg";
  if (DRY) {
    console.log(`  would upload ${kb(decoded.bytes.length)} → ${folder}/${owner}/<uuid>.${ext}`);
    return null;
  }
  const { url } = await put(`${folder}/${owner}/${randomUUID()}.${ext}`, decoded.bytes, {
    access: "public",
    contentType: decoded.contentType,
  });
  console.log(`  uploaded ${kb(decoded.bytes.length)} → ${url}`);
  return url;
}

async function backfillPosts() {
  const rows = await sql`
    SELECT id, user_id, media FROM posts
    WHERE media::text LIKE '%data:%'
    ORDER BY created_at`;
  console.log(`\nposts holding base64: ${rows.length}`);

  let changed = 0;
  for (const row of rows) {
    console.log(`\npost ${row.id}`);
    const media = Array.isArray(row.media) ? row.media : [];
    const next = [];
    let touched = false;

    for (const item of media) {
      if (!isDataUrl(item?.url)) {
        next.push(item);
        continue;
      }
      const url = await move(item.url, "posts", row.user_id);
      if (!url) {
        // Nothing was written, so the row keeps what it had rather than
        // losing a photo to a failed upload.
        next.push(item);
        continue;
      }
      next.push({ ...item, url });
      touched = true;
    }

    if (touched && !DRY) {
      await sql`UPDATE posts SET media = ${JSON.stringify(next)}::jsonb WHERE id = ${row.id}`;
      changed++;
    }
  }
  return changed;
}

async function backfillAvatars() {
  const rows = await sql`
    SELECT id, avatar_url FROM users WHERE avatar_url LIKE 'data:%'`;
  console.log(`\nusers holding base64 avatars: ${rows.length}`);

  let changed = 0;
  for (const row of rows) {
    console.log(`\nuser ${row.id}`);
    const url = await move(row.avatar_url, "avatars", row.id);
    if (url && !DRY) {
      await sql`UPDATE users SET avatar_url = ${url} WHERE id = ${row.id}`;
      changed++;
    }
  }
  return changed;
}

const posts = await backfillPosts();
const avatars = await backfillAvatars();

console.log(
  DRY
    ? "\ndry run — nothing was uploaded or written"
    : `\ndone: ${posts} post${posts === 1 ? "" : "s"} and ${avatars} avatar${avatars === 1 ? "" : "s"} moved to the blob store`,
);
