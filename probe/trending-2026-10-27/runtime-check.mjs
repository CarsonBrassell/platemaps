#!/usr/bin/env node
/**
 * Runtime check of the new Trending order against the REAL route
 * (/api/posts/discover) and the REAL database, read-only.
 *
 *   npx tsx --env-file=.env.local probe/trending-2026-10-27/runtime-check.mjs
 *   BASE=http://localhost:3000 ...   # which dev server to hit
 *
 * Only SELECT statements are issued (guarded below); nothing is printed from
 * the environment.
 */
import { neon } from "@neondatabase/serverless";
import { trendingScore } from "../../src/lib/feedSort.ts";
import { milesBetween, NEARBY_RADIUS_MI } from "../../src/lib/geo.ts";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SDSU = { lat: 32.7757, lng: -117.0719 };
const fails = [];
const notes = [];
const fail = (m) => {
  fails.push(m);
  console.log("  FAIL:", m);
};
const ok = (m) => console.log("  ok:", m);
const note = (m) => {
  notes.push(m);
  console.log("  note:", m);
};

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const db = neon(url);
async function select(text, params = []) {
  if (!/^\s*SELECT/i.test(text)) throw new Error("read-only guard: not a SELECT");
  return db.query(text, params);
}

// --- time helpers -----------------------------------------------------------
function textToMs(t) {
  // '2026-10-25 19:42:23.419901+00' -> epoch ms with microsecond fraction
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2})(?::?(\d{2}))?$/.exec(t);
  if (!m) throw new Error("bad ts " + t);
  const frac = (m[3] ?? "").padEnd(6, "0");
  const base = Date.parse(`${m[1]}T${m[2]}${m[4]}:${m[5] ?? "00"}`);
  return base + Number(frac) / 1000; // base has whole seconds; frac is microseconds
}

// --- SQL snapshot (independent structure from the feed query) -----------------
async function snapshot(atIso) {
  const rows = await select(
    `SELECT p.id::text AS id, p.created_at::text AS created_at_text,
            p.restaurant_lat, p.restaurant_lng,
            (SELECT count(*) FROM post_upvotes x WHERE x.post_id = p.id)::int AS up,
            (SELECT count(*) FROM post_downvotes x WHERE x.post_id = p.id)::int AS down,
            (SELECT count(*) FROM comments c WHERE c.post_id = p.id)::int AS comments
       FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.meal_id IS NULL
        AND p.created_at > $1::timestamptz - make_interval(days => 60)`,
    [atIso],
  );
  const withoutJoin = await select(
    `SELECT count(*)::int AS n FROM posts p
      WHERE p.meal_id IS NULL AND p.created_at > $1::timestamptz - make_interval(days => 60)`,
    [atIso],
  );
  return { rows, noJoinCount: withoutJoin[0].n };
}

// --- HTTP paging --------------------------------------------------------------
async function walk({ sort, limit, coords }) {
  const pages = [];
  let cursor = null;
  for (let i = 0; i < 400; i++) {
    const u = new URL("/api/posts/discover", BASE);
    u.searchParams.set("sort", sort);
    u.searchParams.set("limit", String(limit));
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = coords
      ? await fetch(u, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ coords }),
          signal: AbortSignal.timeout(150000),
        })
      : await fetch(u, { signal: AbortSignal.timeout(150000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${u.pathname}${u.search}`);
    const j = await res.json();
    const dec = j.nextCursor ? JSON.parse(Buffer.from(j.nextCursor, "base64url").toString("utf8")) : null;
    pages.push({ posts: j.posts, dec });
    if (!j.nextCursor) break;
    cursor = j.nextCursor;
  }
  return pages;
}

const cmpIdDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

function scoreOf(row, atMs) {
  const ageHours = (atMs - textToMs(row.created_at_text)) / 3_600_000;
  return trendingScore({ up: row.up, down: row.down, ageHours });
}

function checkWalk(label, pages, snap, { sort, nearby }) {
  console.log(`\n== ${label} ==`);
  const ids = pages.flatMap((p) => p.posts.map((x) => x.id));
  console.log(`  pages=${pages.length} posts=${ids.length}`);
  // same `at` on every cursor
  const ats = new Set(pages.map((p) => p.dec?.at).filter(Boolean));
  if (ats.size === 1) ok(`one shared 'at' on all ${pages.length - 1} cursors (${[...ats][0]})`);
  else fail(`${label}: cursors carry ${ats.size} distinct 'at' values: ${[...ats].join(", ")}`);
  const at = [...ats][0];
  const atMs = Date.parse(at);

  // no duplicates
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length === 0) ok("no duplicate post ids across pages");
  else fail(`${label}: duplicate ids ${dupes.join(", ")}`);

  // expected set
  const byId = new Map(snap.rows.map((r) => [r.id, r]));
  let expected = snap.rows;
  if (nearby) {
    expected = expected.filter(
      (r) =>
        r.restaurant_lat != null &&
        r.restaurant_lng != null &&
        milesBetween(nearby, { lat: Number(r.restaurant_lat), lng: Number(r.restaurant_lng) }) <= NEARBY_RADIUS_MI,
    );
  }
  const expIds = new Set(expected.map((r) => r.id));
  if (ids.length === expected.length) ok(`total count ${ids.length} == SQL eligible count ${expected.length}`);
  else fail(`${label}: total ${ids.length} != SQL eligible ${expected.length}`);
  const missing = [...expIds].filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !expIds.has(id));
  if (missing.length) fail(`${label}: missing from API: ${missing.join(", ")}`);
  if (extra.length) fail(`${label}: not eligible per SQL: ${extra.join(", ")}`);
  if (!missing.length && !extra.length) ok("API id set == SQL eligible id set");

  // API vote counts + createdAt match SQL
  let countMismatch = 0;
  for (const p of pages.flatMap((x) => x.posts)) {
    const r = byId.get(p.id);
    if (!r) continue;
    if (p.upvoteCount !== r.up || p.downvoteCount !== r.down) {
      countMismatch++;
      note(`${p.id}: API up/down ${p.upvoteCount}/${p.downvoteCount} vs SQL ${r.up}/${r.down}`);
    }
  }
  if (countMismatch === 0) ok("API up/down counts == SQL counts for every post");

  // nearby radius
  if (nearby) {
    let worst = 0;
    let nullCoords = 0;
    for (const p of pages.flatMap((x) => x.posts)) {
      if (p.restaurantLat == null || p.restaurantLng == null) {
        nullCoords++;
        continue;
      }
      const d = milesBetween(nearby, { lat: p.restaurantLat, lng: p.restaurantLng });
      worst = Math.max(worst, d);
      if (d > NEARBY_RADIUS_MI) fail(`${label}: ${p.id} is ${d.toFixed(3)} mi away (> ${NEARBY_RADIUS_MI})`);
    }
    if (nullCoords) fail(`${label}: ${nullCoords} posts with null coordinates in a Nearby result`);
    ok(`all within ${NEARBY_RADIUS_MI} mi (farthest ${worst.toFixed(3)} mi)`);
    // boundary posts (distance within 0.02 mi of the radius) among ALL eligible
    const edge = snap.rows
      .filter((r) => r.restaurant_lat != null)
      .map((r) => ({ id: r.id, d: milesBetween(nearby, { lat: Number(r.restaurant_lat), lng: Number(r.restaurant_lng) }) }))
      .filter((x) => Math.abs(x.d - NEARBY_RADIUS_MI) < 0.02);
    if (edge.length) note(`${edge.length} posts within 0.02 mi of the radius edge: ${edge.map((e) => e.d.toFixed(4)).join(", ")}`);
  }

  // ordering
  const seq = pages.flatMap((p) => p.posts.map((x) => x.id));
  if (sort === "trending") {
    const scored = seq.map((id) => ({ id, s: scoreOf(byId.get(id), atMs) }));
    let bad = 0;
    for (let i = 1; i < scored.length; i++) {
      const a = scored[i - 1];
      const b = scored[i];
      if (a.s < b.s) {
        const rel = (b.s - a.s) / Math.max(a.s, b.s);
        if (rel < 1e-11) note(`float-noise inversion at ${i} (rel ${rel.toExponential(2)})`);
        else {
          bad++;
          fail(`${label}: score increases at index ${i}: ${a.s} -> ${b.s} (${a.id} -> ${b.id})`);
        }
      } else if (a.s === b.s && a.id < b.id) {
        bad++;
        fail(`${label}: tie at index ${i} not broken by id DESC (${a.id} before ${b.id})`);
      }
    }
    if (bad === 0) ok("scores (trendingScore @ shared 'at') non-increasing down the whole list, ties by id DESC");
    // vs full independent sort
    const exp = expected
      .map((r) => ({ id: r.id, s: scoreOf(r, atMs) }))
      .sort((a, b) => (b.s !== a.s ? b.s - a.s : cmpIdDesc(a.id, b.id)))
      .map((x) => x.id);
    let diffs = 0;
    for (let i = 0; i < exp.length; i++) {
      if (exp[i] !== seq[i]) {
        const a = scoreOf(byId.get(exp[i]), atMs);
        const b = scoreOf(byId.get(seq[i]), atMs);
        if (Math.abs(a - b) / Math.max(a, b) < 1e-11) continue;
        diffs++;
        fail(`${label}: position ${i}: API ${seq[i]} (${b}) vs JS-expected ${exp[i]} (${a})`);
      }
    }
    if (diffs === 0) ok("API order == independent sort by trendingScore() over SQL up/down counts");
    // cursor.score vs JS score of the last post on that page
    let maxRel = 0;
    let lastScore = Infinity;
    pages.forEach((p, i) => {
      if (!p.dec) return;
      const last = p.posts[p.posts.length - 1];
      const r = byId.get(last.id);
      const js = scoreOf(r, atMs);
      const rel = Math.abs(p.dec.score - js) / js;
      maxRel = Math.max(maxRel, rel);
      if (rel > 1e-9) fail(`${label}: page ${i} cursor.score ${p.dec.score} != trendingScore ${js}`);
      if (p.dec.id !== last.id) fail(`${label}: page ${i} cursor.id ${p.dec.id} != last post ${last.id}`);
      if (p.dec.createdAt !== r.created_at_text) fail(`${label}: page ${i} cursor.createdAt ${p.dec.createdAt} != ${r.created_at_text}`);
      if (p.dec.score > lastScore) fail(`${label}: cursor score rises at page ${i}: ${lastScore} -> ${p.dec.score}`);
      lastScore = p.dec.score;
    });
    ok(`cursor.score matches trendingScore on every page boundary (max rel diff ${maxRel.toExponential(2)}); cursor scores non-increasing`);
  } else {
    let bad = 0;
    for (let i = 1; i < seq.length; i++) {
      const a = byId.get(seq[i - 1]);
      const b = byId.get(seq[i]);
      const ta = textToMs(a.created_at_text);
      const tb = textToMs(b.created_at_text);
      if (ta < tb || (ta === tb && a.id < b.id)) {
        bad++;
        fail(`${label}: created_at order broken at ${i}: ${a.created_at_text} -> ${b.created_at_text}`);
      } else if (ta === tb) note(`created_at tie at ${i}, broken by id DESC`);
    }
    if (bad === 0) ok("created_at strictly non-increasing (ties by id DESC)");
    pages.forEach((p, i) => {
      if (!p.dec) return;
      if (p.dec.score !== null) fail(`${label}: page ${i} cursor.score should be null on New, got ${p.dec.score}`);
      const last = p.posts[p.posts.length - 1];
      if (p.dec.id !== last.id || p.dec.createdAt !== byId.get(last.id).created_at_text)
        fail(`${label}: page ${i} cursor does not name the last row`);
    });
    ok("New cursors carry score=null and name the last row");
  }
  return { at, atMs, seq, byId };
}

// ---------------------------------------------------------------------------
const results = {};

async function suite(name, args, opts) {
  const pages = await walk(args);
  const at = pages.find((p) => p.dec)?.dec.at;
  if (!at) {
    fail(`${name}: only one page, no cursor to take 'at' from`);
    return null;
  }
  const before = await snapshot(at);
  const after = await snapshot(at);
  const sameSnap = JSON.stringify(before.rows.map((r) => [r.id, r.up, r.down]).sort()) ===
    JSON.stringify(after.rows.map((r) => [r.id, r.up, r.down]).sort());
  if (!sameSnap) note(`${name}: data changed during the walk (production is live); results below are against the later snapshot`);
  if (before.noJoinCount !== before.rows.length)
    note(`${name}: posts without a users row: ${before.noJoinCount - before.rows.length}`);
  return checkWalk(name, pages, after, opts);
}

const idType = await select(
  `SELECT data_type FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'id'`,
);
console.log("posts.id type:", idType[0]?.data_type);

results.t5 = await suite("trending limit=5 (GET)", { sort: "trending", limit: 5 }, { sort: "trending" });
results.t1 = await suite("trending limit=1 (GET)", { sort: "trending", limit: 1 }, { sort: "trending" });
results.t30 = await suite("trending default limit (GET)", { sort: "trending", limit: 30 }, { sort: "trending" });
results.n5 = await suite("new limit=5 (GET)", { sort: "new", limit: 5 }, { sort: "new" });
results.n1 = await suite("new limit=1 (GET)", { sort: "new", limit: 1 }, { sort: "new" });
results.nt5 = await suite(
  "NEARBY trending limit=5 (POST, SDSU)",
  { sort: "trending", limit: 5, coords: SDSU },
  { sort: "trending", nearby: SDSU },
);
results.nt1 = await suite(
  "NEARBY trending limit=1 (POST, SDSU)",
  { sort: "trending", limit: 1, coords: SDSU },
  { sort: "trending", nearby: SDSU },
);
results.nn5 = await suite(
  "NEARBY new limit=5 (POST, SDSU)",
  { sort: "new", limit: 5, coords: SDSU },
  { sort: "new", nearby: SDSU },
);

// (d) top 10 tables --------------------------------------------------------
function table(title, r) {
  if (!r) return;
  console.log(`\n${title} (ranked at ${r.at})`);
  console.log("rank  age_h    up down net  score     restaurant / id");
  r.seq.slice(0, 10).forEach((id, i) => {
    const row = r.byId.get(id);
    const age = (r.atMs - textToMs(row.created_at_text)) / 3_600_000;
    const score = scoreOf(row, r.atMs);
    console.log(
      `${String(i + 1).padStart(2)}  ${age.toFixed(1).padStart(7)}  ${String(row.up).padStart(3)} ${String(row.down).padStart(3)} ${String(row.up - row.down).padStart(3)}  ${score.toFixed(4).padStart(8)}  ${id.slice(0, 8)}`,
    );
  });
}
table("TRENDING top 10 (limit=30 walk)", results.t30);
table("NEW top 10 (limit=5 walk)", results.n5);

console.log(`\nSUMMARY: ${fails.length} failures, ${notes.length} notes`);
process.exit(fails.length ? 1 : 0);
