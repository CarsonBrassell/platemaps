/**
 * Builds probe/trending-2026-10-27/snapshot.json from the live database.
 * READ-ONLY: SELECTs only. Run with:
 *   node --env-file=.env.local probe/trending-2026-10-27/snapshot.mjs
 *
 * Snapshot covers every Discover-eligible post (meal_id IS NULL) from the last
 * SNAPSHOT_DAYS days. The live feed window is 60 days, but the harness replays
 * the last 21 days, and a replay hour 21 days ago still needs the posts that
 * were inside ITS 60-day window, so we keep 60 + 21 = 81 days.
 *
 * No user ids, names, or text are written. Vote/comment rows are reduced to
 * their timestamps.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DAYS = 81;
const sql = neon(process.env.DATABASE_URL);
const q = (text, params = []) => sql.query(text, params);

const [{ now }] = await q("SELECT now() AS now");
const posts = await q(
  `SELECT id, user_id, created_at, restaurant_lat::float8 AS lat, restaurant_lng::float8 AS lng
     FROM posts
    WHERE meal_id IS NULL
      AND created_at > now() - make_interval(days => $1)
    ORDER BY created_at, id`,
  [SNAPSHOT_DAYS],
);
const ids = posts.map((p) => p.id);

// Opaque author index (order of first appearance); the real user id never leaves this script.
const authorIdx = new Map();
for (const p of posts) if (!authorIdx.has(p.user_id)) authorIdx.set(p.user_id, authorIdx.size + 1);

// The author's own upvote on their own post (the app lets authors self-upvote), as a timestamp only.
const selfRows = await q(
  `SELECT u.post_id, u.created_at FROM post_upvotes u
     JOIN posts p ON p.id = u.post_id AND p.user_id = u.user_id
    WHERE u.post_id = ANY($1)`,
  [ids],
);
const selfUp = new Map(selfRows.map((r) => [r.post_id, new Date(r.created_at).toISOString()]));

const group = async (table) => {
  const rows = await q(`SELECT post_id, created_at FROM ${table} WHERE post_id = ANY($1) ORDER BY created_at`, [ids]);
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.post_id)) m.set(r.post_id, []);
    m.get(r.post_id).push(new Date(r.created_at).toISOString());
  }
  return m;
};
const [ups, downs, cmts] = await Promise.all([group("post_upvotes"), group("post_downvotes"), group("comments")]);

const out = {
  generatedAt: new Date(now).toISOString(),
  feedWindowDays: 60,
  snapshotDays: SNAPSHOT_DAYS,
  notes: [
    "posts = every Discover-eligible post (meal_id IS NULL) created in the last snapshotDays days.",
    "The live feed only shows the last feedWindowDays; the extra days exist so the 21-day hourly replay sees the same candidate pool the feed had at each past hour.",
    "upTimes/downTimes/commentTimes are the created_at of rows that STILL EXIST. A vote that was later un-voted, a switched vote's old row, and a deleted comment are absent, so historical counts are lower bounds.",
    "authorIdx is an opaque per-snapshot author number; selfUpTime is the timestamp of the author's own upvote on their own post (already counted in up/upTimes), or null.",
    "No user ids, names or text are included.",
  ],
  posts: posts.map((p) => {
    const upTimes = ups.get(p.id) ?? [];
    const downTimes = downs.get(p.id) ?? [];
    const commentTimes = cmts.get(p.id) ?? [];
    return {
      id: p.id,
      created_at: new Date(p.created_at).toISOString(),
      restaurant_lat: p.lat,
      restaurant_lng: p.lng,
      authorIdx: authorIdx.get(p.user_id),
      selfUpTime: selfUp.get(p.id) ?? null,
      up: upTimes.length,
      down: downTimes.length,
      comments: commentTimes.length,
      upTimes,
      downTimes,
      commentTimes,
    };
  }),
};
fs.writeFileSync(path.join(HERE, "snapshot.json"), JSON.stringify(out, null, 1));
console.log(`wrote snapshot.json: ${out.posts.length} posts, generatedAt ${out.generatedAt}`);

// Aggregate-only integrity checks (no identifiers printed).
const agg = await q(
  `SELECT
     (SELECT count(*)::int FROM post_upvotes u JOIN posts p ON p.id = u.post_id WHERE u.user_id = p.user_id AND p.meal_id IS NULL) AS self_upvotes,
     (SELECT count(*)::int FROM post_upvotes u JOIN posts p ON p.id = u.post_id WHERE p.meal_id IS NULL) AS upvotes_total,
     (SELECT count(DISTINCT u.user_id)::int FROM post_upvotes u JOIN posts p ON p.id = u.post_id WHERE p.meal_id IS NULL) AS distinct_upvoters,
     (SELECT count(DISTINCT user_id)::int FROM posts WHERE meal_id IS NULL AND created_at > now() - interval '60 days') AS distinct_authors_60d,
     (SELECT max(c) FROM (SELECT count(*) c FROM post_upvotes GROUP BY user_id) t) AS max_upvotes_by_one_user`,
);
console.log("aggregates:", JSON.stringify(agg[0]));
