#!/usr/bin/env node
/**
 * Trending-formula simulation harness (2026-10-27).
 *
 * Compares ranking formulas on IDENTICAL data: snapshot.json (built by
 * snapshot.mjs, read-only from Neon). No database or network is touched here.
 *
 *   node probe/trending-2026-10-27/harness.mjs            # CURRENT formula, human report
 *   node probe/trending-2026-10-27/harness.mjs --json     # same, as JSON
 *   node probe/trending-2026-10-27/harness.mjs --center=32.7757,-117.0719   # Nearby chip on
 *   node probe/trending-2026-10-27/harness.mjs --at=2026-10-20T00:00:00Z    # "now" override
 *
 * As a library:
 *   import { runSim, printReport, loadSnapshot, baselineScore } from "./harness.mjs";
 *   const r = runSim(({ up, down, comments, ageHours }) => ..., { label: "my formula" });
 *   printReport(r);
 *
 * ---------------------------------------------------------------------------
 * scoreFn contract. Called once per eligible post per ranked moment:
 *   scoreFn({
 *     id, up, down, net, comments,          // counts AS OF atMs (see replay note)
 *     ageHours, createdAtMs, atMs,          // ageHours = (atMs - createdAtMs) / 3.6e6
 *     upTimes, downTimes, commentTimes,     // ascending epoch-ms of rows cast <= atMs
 *     selfUp,                               // 1 if the author's own (auto) upvote exists, else 0
 *     authorIdx, lat, lng, distMi,          // opaque author number; restaurant coords;
 *                                           // distMi only when opts.center is set
 *   }) -> number (higher ranks first)
 * Returning null/undefined EXCLUDES the post from the Trending ranking (it is
 * still counted as eligible for New). NaN is treated as -Infinity (sinks).
 * Ties break by id DESC, exactly like the SQL (`rank_score DESC, id DESC`).
 *
 * Production constraint the formula must respect: the score must be a pure
 * function of (vote counts, timestamps, `atMs`), because keyset pagination
 * orders by (score, id) against one fixed `$1 = atMs` for the whole scroll.
 *
 * ---------------------------------------------------------------------------
 * Replay approximation (the vote tables DO have created_at):
 *   At replay hour H a post exists iff created_at <= H (and is inside the 60-day
 *   window of H), and only votes/comments with created_at <= H are counted.
 *   Because the tables hold only the rows that survive today, a vote that was
 *   later taken back, and the old row of a switched vote, are missing; replayed
 *   counts are therefore lower bounds. Replay is viewer-agnostic (no blocks).
 *
 * Authors' own upvote: since publish seeds the author's upvote at creation,
 * every real post starts at up=1, net=+1. The synthetic table below uses the
 * net votes the owner wrote ("brand new, 0 votes"); real brand-new plates are +1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const FEED_WINDOW_DAYS = 60; // src/lib/feedWindow.ts
export const NEARBY_RADIUS_MI = 5; // src/lib/geo.ts
export const TRENDING_GRAVITY = 1.0; // src/lib/feedSort.ts
const EARTH_RADIUS_MI = 3958.8;

export const CENTERS = {
  sdsu: { label: "SDSU", lat: 32.7757, lng: -117.0719 },
  downtown: { label: "Downtown San Diego", lat: 32.7157, lng: -117.1611 },
};

/** Same haversine as src/lib/geo.ts. */
export function milesBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** CURRENT production formula: (max(net,0)+1) / (ageHours+2)^1.0, comment weight 0. */
export const baselineScore = ({ up, down, ageHours }) =>
  (Math.max(up - down, 0) + 1) / Math.pow(ageHours + 2, TRENDING_GRAVITY);

/** The twelve plates from the brief. `ageH` for "brand new" is 0.5h to match the table in feedSort.ts. */
export const SYNTHETIC_PLATES = [
  { label: "brand new, 0", ageH: 0.5, net: 0 },
  { label: "2h, +2", ageH: 2, net: 2 },
  { label: "8h, +18", ageH: 8, net: 18 },
  { label: "14h, +35", ageH: 14, net: 35 },
  { label: "1d, +5", ageH: 24, net: 5 },
  { label: "2d, +40", ageH: 48, net: 40 },
  { label: "3d, +22", ageH: 72, net: 22 },
  { label: "5d, +30", ageH: 120, net: 30 },
  { label: "7d, +10", ageH: 168, net: 10 },
  { label: "7d, +100", ageH: 168, net: 100 },
  { label: "15d, +7", ageH: 360, net: 7 },
  { label: "1h, -3", ageH: 1, net: -3 },
];

// ---------------------------------------------------------------- snapshot --

export function loadSnapshot(file = path.join(HERE, "snapshot.json")) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const ms = (arr) => (arr ?? []).map((s) => Date.parse(s)).sort((a, b) => a - b);
  const posts = raw.posts
    .map((p) => ({
      id: p.id,
      createdAtMs: Date.parse(p.created_at),
      lat: p.restaurant_lat ?? null,
      lng: p.restaurant_lng ?? null,
      authorIdx: p.authorIdx ?? null,
      selfUpMs: p.selfUpTime ? Date.parse(p.selfUpTime) : null,
      upMs: ms(p.upTimes),
      downMs: ms(p.downTimes),
      commentMs: ms(p.commentTimes),
    }))
    .sort((a, b) => a.createdAtMs - b.createdAtMs || (a.id < b.id ? -1 : 1));
  return { generatedAtMs: Date.parse(raw.generatedAt), feedWindowDays: raw.feedWindowDays, posts };
}

// ----------------------------------------------------------------- helpers --

/** Number of elements <= t in an ascending array. */
function countLE(arr, t) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = ((s.length - 1) * p) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 10 ** d) / 10 ** d);
const short = (id) => id.slice(0, 8);
const byIdDesc = (a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  const union = new Set([...A, ...B]).size;
  if (!union) return null;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / union;
}

/** Eligible posts at time t (window + optional Nearby), scored; returns ranked + New order. */
function rankAt(snap, t, scoreFn, o) {
  const cutoff = t - o.windowDays * DAY_MS;
  const eligible = [];
  const scored = [];
  let excluded = 0;
  let nan = 0;
  for (const p of snap.posts) {
    if (p.createdAtMs > t || p.createdAtMs <= cutoff) continue;
    let distMi = null;
    if (o.center) {
      if (p.lat == null || p.lng == null) continue;
      distMi = milesBetween(o.center, { lat: p.lat, lng: p.lng });
      if (distMi > o.radiusMi) continue;
    }
    const nu = countLE(p.upMs, t);
    const nd = countLE(p.downMs, t);
    const nc = countLE(p.commentMs, t);
    const ageHours = (t - p.createdAtMs) / HOUR_MS;
    const row = {
      id: p.id,
      createdAtMs: p.createdAtMs,
      ageHours,
      up: nu,
      down: nd,
      net: nu - nd,
      comments: nc,
      score: 0,
    };
    eligible.push(row);
    let s = scoreFn({
      id: p.id,
      up: nu,
      down: nd,
      net: nu - nd,
      comments: nc,
      ageHours,
      createdAtMs: p.createdAtMs,
      atMs: t,
      upTimes: p.upMs.slice(0, nu),
      downTimes: p.downMs.slice(0, nd),
      commentTimes: p.commentMs.slice(0, nc),
      selfUp: p.selfUpMs != null && p.selfUpMs <= t ? 1 : 0,
      authorIdx: p.authorIdx,
      lat: p.lat,
      lng: p.lng,
      distMi,
    });
    if (s == null) {
      excluded++;
      continue;
    }
    if (typeof s !== "number" || Number.isNaN(s)) {
      nan++;
      s = -Infinity;
    }
    row.score = s;
    scored.push(row);
  }
  scored.sort((a, b) => (a.score !== b.score ? (b.score > a.score ? 1 : -1) : byIdDesc(a, b)));
  const newest = [...eligible].sort((a, b) => b.createdAtMs - a.createdAtMs || byIdDesc(a, b));
  return { ranked: scored, newest, eligibleCount: eligible.length, excluded, nan };
}

const view = (r, i) => ({
  rank: i + 1,
  id: short(r.id),
  ageHours: round(r.ageHours, 1),
  up: r.up,
  down: r.down,
  comments: r.comments,
  score: Number.isFinite(r.score) ? round(r.score, 4) : r.score,
});

// ------------------------------------------------------------------ runSim --

/**
 * @param {(p: object) => number|null} scoreFn
 * @param {object} [opts]
 * @param {object|string} [opts.snapshot]  loaded snapshot or path (default ./snapshot.json)
 * @param {number} [opts.atMs]             "now" (default: snapshot.generatedAt)
 * @param {number} [opts.replayDays=21]
 * @param {number} [opts.windowDays=60]    eligibility window, like FEED_WINDOW_DAYS
 * @param {{lat:number,lng:number}} [opts.center]  Nearby chip: only posts within radiusMi of this point
 * @param {number} [opts.radiusMi=5]
 * @param {number} [opts.topN=10]
 * @param {"uniform"|"early"|"late"} [opts.synthVotes="uniform"]  when synthetic plates' votes landed
 * @param {string} [opts.label]
 */
export function runSim(scoreFn, opts = {}) {
  const o = {
    replayDays: 21,
    windowDays: FEED_WINDOW_DAYS,
    center: null,
    radiusMi: NEARBY_RADIUS_MI,
    topN: 10,
    synthVotes: "uniform",
    label: "unnamed formula",
    ...opts,
  };
  const snap = typeof o.snapshot === "string" ? loadSnapshot(o.snapshot) : (o.snapshot ?? loadSnapshot());
  const atMs = o.atMs ?? snap.generatedAtMs;

  // a) + c) now
  const now = rankAt(snap, atMs, scoreFn, o);
  const currentTop10 = now.ranked.slice(0, o.topN).map(view);
  const newTop10 = now.newest.slice(0, o.topN).map(view);
  const jaccardNow = jaccard(
    now.ranked.slice(0, o.topN).map((r) => r.id),
    now.newest.slice(0, o.topN).map((r) => r.id),
  );

  // b) hourly replay
  const endMs = Math.floor(atMs / HOUR_MS) * HOUR_MS;
  const nHours = o.replayDays * 24 + 1;
  const samples = [];
  for (let i = 0; i < nHours; i++) {
    const t = endMs - (nHours - 1 - i) * HOUR_MS;
    const r = rankAt(snap, t, scoreFn, o);
    samples.push({
      t,
      top1: r.ranked[0] ?? null,
      top3: r.ranked.slice(0, 3).map((x) => x.id),
      eligible: r.eligibleCount,
      jaccard: jaccard(
        r.ranked.slice(0, o.topN).map((x) => x.id),
        r.newest.slice(0, o.topN).map((x) => x.id),
      ),
    });
  }
  const replay = summarizeReplay(samples, snap);

  // d) synthetic
  const synthetic = syntheticTable(scoreFn, atMs, o.synthVotes);

  return {
    meta: {
      label: o.label,
      atIso: new Date(atMs).toISOString(),
      windowDays: o.windowDays,
      nearby: o.center ? { ...o.center, radiusMi: o.radiusMi } : null,
      eligibleNow: now.eligibleCount,
      excludedNow: now.excluded,
      nanScoresNow: now.nan,
      replayHours: nHours,
      replayFrom: new Date(samples[0].t).toISOString(),
    },
    currentTop10,
    newTop10,
    jaccardNow: round(jaccardNow, 3),
    replay,
    synthetic,
  };
}

function summarizeReplay(samples, snap) {
  const withTop = samples.filter((s) => s.top1);
  const ageOf = (s) => (s.t - s.top1.createdAtMs) / HOUR_MS;
  const ages = withTop.map(ageOf);

  // #1 streaks (consecutive hourly samples with the same #1).
  const streaks = [];
  let cur = null;
  samples.forEach((s, i) => {
    const id = s.top1?.id ?? null;
    if (cur && id === cur.id) {
      cur.endIdx = i;
      cur.last = s.top1;
      return;
    }
    if (cur) streaks.push(cur);
    cur = id ? { id, startIdx: i, endIdx: i, first: s.top1, last: s.top1 } : null;
  });
  if (cur) streaks.push(cur);
  const describeStreak = (st) => ({
    post: short(st.id),
    hours: st.endIdx - st.startIdx + 1,
    from: new Date(samples[st.startIdx].t).toISOString(),
    to: new Date(samples[st.endIdx].t).toISOString(),
    ageAtStartH: round((samples[st.startIdx].t - st.first.createdAtMs) / HOUR_MS, 1),
    ageAtEndH: round((samples[st.endIdx].t - st.last.createdAtMs) / HOUR_MS, 1),
    netAtStart: st.first.net,
    netAtEnd: st.last.net,
    up: st.last.up,
    down: st.last.down,
    beganBeforeReplay: st.startIdx === 0,
    stillNumberOne: st.endIdx === samples.length - 1,
  });
  const longest = streaks.reduce((b, s) => (!b || s.endIdx - s.startIdx > b.endIdx - b.startIdx ? s : b), null);
  const currentStreak = streaks.length && streaks[streaks.length - 1].endIdx === samples.length - 1
    ? streaks[streaks.length - 1]
    : null;

  // top-3 dwell: consecutive hours a post stays inside the top 3.
  const runs = new Map(); // id -> [run lengths]
  const open = new Map(); // id -> current run length
  for (const s of samples) {
    const inNow = new Set(s.top3);
    for (const id of inNow) open.set(id, (open.get(id) ?? 0) + 1);
    for (const [id, len] of [...open]) {
      if (!inNow.has(id)) {
        if (!runs.has(id)) runs.set(id, []);
        runs.get(id).push(len);
        open.delete(id);
      }
    }
  }
  for (const [id, len] of open) {
    if (!runs.has(id)) runs.set(id, []);
    runs.get(id).push(len);
  }
  const allRuns = [...runs.values()].flat();
  const perPostTotals = [...runs.values()].map((r) => r.reduce((a, b) => a + b, 0));

  const top1Ids = new Set(withTop.map((s) => s.top1.id));
  const changes = streaks.length ? streaks.length - 1 : 0;
  const jac = samples.map((s) => s.jaccard).filter((x) => x != null);
  const pct = (n) => round((100 * n) / (withTop.length || 1), 1);

  return {
    hoursSampled: samples.length,
    hoursWithAnyPost: withTop.length,
    longestNumberOneStreak: longest ? describeStreak(longest) : null,
    currentNumberOneStreak: currentStreak ? describeStreak(currentStreak) : null,
    numberOneAgeHours: {
      p50: round(percentile(ages, 50), 1),
      p90: round(percentile(ages, 90), 1),
      max: round(ages.length ? Math.max(...ages) : null, 1),
      mean: round(mean(ages), 1),
    },
    pctHoursNumberOneOlderThan48h: pct(ages.filter((a) => a > 48).length),
    pctHoursNumberOneOlderThan7d: pct(ages.filter((a) => a > 168).length),
    pctHoursNumberOneYoungerThan24h: pct(ages.filter((a) => a < 24).length),
    pctHoursNumberOneNetLE1: pct(withTop.filter((s) => s.top1.net <= 1).length),
    distinctNumberOnes: top1Ids.size,
    numberOneChangesPerDay: round(changes / (samples.length / 24), 2),
    top3: {
      distinctPosts: runs.size,
      avgDwellHoursPerRun: round(mean(allRuns), 1),
      avgDwellHoursPerPost: round(mean(perPostTotals), 1),
      maxDwellHours: allRuns.length ? Math.max(...allRuns) : null,
      p90DwellHoursPerRun: round(percentile(allRuns, 90), 1),
    },
    jaccardTrendingVsNewHourly: {
      mean: round(mean(jac), 3),
      min: round(jac.length ? Math.min(...jac) : null, 3),
      max: round(jac.length ? Math.max(...jac) : null, 3),
    },
  };
}

function syntheticTable(scoreFn, atMs, shape) {
  const rows = SYNTHETIC_PLATES.map((pl, idx) => {
    const createdAtMs = atMs - pl.ageH * HOUR_MS;
    const up = Math.max(pl.net, 0);
    const down = Math.max(-pl.net, 0);
    const times = (n) =>
      Array.from({ length: n }, (_, i) => {
        const f = (i + 1) / (n + 1); // 0..1 through the plate's life
        const g = shape === "early" ? f * 0.33 : shape === "late" ? 1 - (1 - f) * 0.33 : f;
        return Math.round(createdAtMs + g * (atMs - createdAtMs));
      });
    let score = scoreFn({
      id: `synthetic-${String(idx).padStart(2, "0")}`,
      up,
      down,
      net: pl.net,
      comments: 0,
      ageHours: pl.ageH,
      createdAtMs,
      atMs,
      upTimes: times(up),
      downTimes: times(down),
      commentTimes: [],
      selfUp: 0,
      authorIdx: 0,
      lat: null,
      lng: null,
      distMi: null,
    });
    if (score == null || Number.isNaN(score)) score = -Infinity;
    return { label: pl.label, ageH: pl.ageH, net: pl.net, score };
  });
  const ordered = [...rows].sort((a, b) => (a.score !== b.score ? (b.score > a.score ? 1 : -1) : 0));
  ordered.forEach((r, i) => (r.rank = i + 1));
  const rankOf = (label) => rows.find((r) => r.label === label).rank;
  const checks = [
    { source: "feedSort.ts", name: "2d,+40 beats brand new,0 (popular beats empty)", pass: rankOf("2d, +40") < rankOf("brand new, 0") },
    { source: "feedSort.ts", name: "5d,+30 loses to brand new,0 (recency matters)", pass: rankOf("5d, +30") > rankOf("brand new, 0") },
    { source: "owner", name: "7d,+10 is NOT in the top 3 (a week-old plate needs to be super popular)", pass: rankOf("7d, +10") > 3 },
    { source: "owner", name: "7d,+100 beats 7d,+10 (super popular can stay up)", pass: rankOf("7d, +100") < rankOf("7d, +10") },
    { source: "product", name: "1h,-3 ranks below brand new,0 (downvoted sinks)", pass: rankOf("1h, -3") > rankOf("brand new, 0") },
  ];
  return {
    voteTimeShape: shape,
    note: "Votes spread across the plate's life per voteTimeShape; real brand-new plates are +1 (author seed vote), this table uses the net the brief states.",
    order: ordered.map((r) => ({
      rank: r.rank,
      plate: r.label,
      score: Number.isFinite(r.score) ? round(r.score, 4) : r.score,
    })),
    checks,
  };
}

// ------------------------------------------------------- stats & density --

/** Dataset stats over the posts inside the feed window at atMs. */
export function computeStats(snap, atMs = snap.generatedAtMs, windowDays = FEED_WINDOW_DAYS) {
  const inWin = snap.posts.filter((p) => p.createdAtMs <= atMs && p.createdAtMs > atMs - windowDays * DAY_MS);
  const last = (d) => inWin.filter((p) => p.createdAtMs > atMs - d * DAY_MS).length;
  const nets = inWin.map((p) => countLE(p.upMs, atMs) - countLE(p.downMs, atMs));
  const organicNets = inWin.map((p, i) => nets[i] - (p.selfUpMs != null ? 1 : 0));
  const votes = inWin.map((p) => countLE(p.upMs, atMs) + countLE(p.downMs, atMs));
  const organicVotes = inWin.map((p, i) => votes[i] - (p.selfUpMs != null ? 1 : 0));
  const pctOf = (n) => round((100 * n) / (inWin.length || 1), 1);
  const dist = (v) => ({
    min: Math.min(...v),
    p50: round(percentile(v, 50), 2),
    p90: round(percentile(v, 90), 2),
    p99: round(percentile(v, 99), 2),
    max: Math.max(...v),
  });
  // Minutes from post to first upvote: any upvote, and first upvote by someone other than the author.
  const firstAny = [];
  const firstOrganic = [];
  for (const p of inWin) {
    if (p.upMs.length) firstAny.push((p.upMs[0] - p.createdAtMs) / 60000);
    const organic = [...p.upMs];
    if (p.selfUpMs != null) {
      const k = organic.indexOf(p.selfUpMs);
      if (k >= 0) organic.splice(k, 1);
    }
    if (organic.length) firstOrganic.push((organic[0] - p.createdAtMs) / 60000);
  }
  return {
    postsInWindow: inWin.length,
    last7Days: { posts: last(7), perDay: round(last(7) / 7, 2) },
    last30Days: { posts: last(30), perDay: round(last(30) / 30, 2) },
    last60Days: { posts: inWin.length, perDay: round(inWin.length / 60, 2) },
    netVotes: dist(nets),
    netVotesExcludingAuthorSeed: dist(organicNets),
    pctPostsWithZeroVotes: pctOf(votes.filter((v) => v === 0).length),
    pctPostsWithNoVotesBeyondAuthorSeed: pctOf(organicVotes.filter((v) => v <= 0).length),
    pctPostsNetPositiveBeyondAuthorSeed: pctOf(organicNets.filter((v) => v > 0).length),
    pctPostsWithAuthorSeedVote: pctOf(inWin.filter((p) => p.selfUpMs != null).length),
    pctPostsWithAnyComment: pctOf(inWin.filter((p) => countLE(p.commentMs, atMs) > 0).length),
    minutesToFirstUpvoteAny: { n: firstAny.length, median: round(percentile(firstAny, 50), 2) },
    minutesToFirstOrganicUpvote: {
      n: firstOrganic.length,
      median: round(percentile(firstOrganic, 50), 1),
      p90: round(percentile(firstOrganic, 90), 1),
      medianHours: round(percentile(firstOrganic, 50) / 60, 2),
    },
    distinctAuthors: new Set(inWin.map((p) => p.authorIdx)).size,
  };
}

/** Posts within radiusMi of each center over the last 7 / 30 / 60 days, plus the densest 5-mile cluster. */
export function nearbyDensity(snap, atMs = snap.generatedAtMs, radiusMi = NEARBY_RADIUS_MI) {
  const win = snap.posts.filter(
    (p) => p.createdAtMs <= atMs && p.createdAtMs > atMs - FEED_WINDOW_DAYS * DAY_MS && p.lat != null && p.lng != null,
  );
  const within = (c, days) =>
    win.filter((p) => p.createdAtMs > atMs - days * DAY_MS && milesBetween(c, { lat: p.lat, lng: p.lng }) <= radiusMi).length;
  const measure = (label, c) => ({
    label,
    lat: round(c.lat, 4),
    lng: round(c.lng, 4),
    last7Days: within(c, 7),
    last30Days: within(c, 30),
    last60Days: within(c, 60),
    perDayLast30: round(within(c, 30) / 30, 2),
  });
  let best = null;
  for (const p of win) {
    const c = { lat: p.lat, lng: p.lng };
    const key = [within(c, 60), within(c, 7)];
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) best = { c, key };
  }
  return {
    radiusMi,
    densestCluster: best ? measure("densest cluster (a post's own location)", best.c) : null,
    sdsu: measure(CENTERS.sdsu.label, CENTERS.sdsu),
    downtown: measure(CENTERS.downtown.label, CENTERS.downtown),
  };
}

// ----------------------------------------------------------------- report --

export function printReport(r) {
  const L = (s = "") => console.log(s);
  const m = r.meta;
  L(`=== ${m.label} ===`);
  L(
    `at ${m.atIso} | window ${m.windowDays}d | eligible now ${m.eligibleNow}` +
      (m.nearby ? ` | NEARBY ${m.nearby.radiusMi}mi of ${m.nearby.lat},${m.nearby.lng}` : "") +
      (m.excludedNow ? ` | excluded ${m.excludedNow}` : "") +
      (m.nanScoresNow ? ` | NaN scores ${m.nanScoresNow}` : ""),
  );
  L();
  L("a) Trending top 10 now");
  L("   rank  post      age(h)   up  down  cmts   score");
  for (const t of r.currentTop10)
    L(
      `   ${String(t.rank).padStart(4)}  ${t.id}  ${String(t.ageHours).padStart(7)}  ${String(t.up).padStart(3)}  ${String(t.down).padStart(4)}  ${String(t.comments).padStart(4)}  ${t.score}`,
    );
  L();
  L("   New top 10 now (created_at DESC)");
  L("   rank  post      age(h)   up  down");
  for (const t of r.newTop10)
    L(`   ${String(t.rank).padStart(4)}  ${t.id}  ${String(t.ageHours).padStart(7)}  ${String(t.up).padStart(3)}  ${String(t.down).padStart(4)}`);
  L();
  const p = r.replay;
  L(`b) Hourly replay, ${p.hoursSampled} hourly rankings (${m.replayFrom} -> now), ${p.hoursWithAnyPost} with at least one post`);
  const s = p.longestNumberOneStreak;
  if (s) {
    L(
      `   longest #1 streak: ${s.hours}h  post ${s.post}  net ${s.netAtStart} -> ${s.netAtEnd} (+${s.up}/-${s.down})  age ${s.ageAtStartH}h -> ${s.ageAtEndH}h` +
        `${s.beganBeforeReplay ? "  [began before replay window]" : ""}${s.stillNumberOne ? "  [still #1 now]" : ""}`,
    );
  }
  const c = p.currentNumberOneStreak;
  if (c) L(`   current #1 has held ${c.hours}h (within replay)  post ${c.post}  net ${c.netAtEnd}  age ${c.ageAtEndH}h`);
  L(`   #1 age (h): p50 ${p.numberOneAgeHours.p50}  p90 ${p.numberOneAgeHours.p90}  max ${p.numberOneAgeHours.max}  mean ${p.numberOneAgeHours.mean}`);
  L(
    `   % hours #1 older than 48h: ${p.pctHoursNumberOneOlderThan48h}   older than 7d: ${p.pctHoursNumberOneOlderThan7d}   younger than 24h: ${p.pctHoursNumberOneYoungerThan24h}   #1 net<=1: ${p.pctHoursNumberOneNetLE1}`,
  );
  L(`   distinct #1 posts: ${p.distinctNumberOnes}   #1 changes/day: ${p.numberOneChangesPerDay}`);
  L(
    `   top-3 dwell: ${p.top3.distinctPosts} posts, avg ${p.top3.avgDwellHoursPerRun}h per stay, avg ${p.top3.avgDwellHoursPerPost}h total per post, p90 stay ${p.top3.p90DwellHoursPerRun}h, max stay ${p.top3.maxDwellHours}h`,
  );
  L();
  L(`c) Trending vs New top-10 Jaccard: now ${r.jaccardNow}   hourly mean ${p.jaccardTrendingVsNewHourly.mean} (min ${p.jaccardTrendingVsNewHourly.min}, max ${p.jaccardTrendingVsNewHourly.max})   [1.0 = Trending is just New]`);
  L();
  L(`d) Synthetic plates (votes ${r.synthetic.voteTimeShape})`);
  for (const o of r.synthetic.order) L(`   ${String(o.rank).padStart(2)}. ${o.plate.padEnd(14)} ${o.score}`);
  for (const k of r.synthetic.checks) L(`   [${k.pass ? "PASS" : "FAIL"}] (${k.source}) ${k.name}`);
}

export function printStats(stats, density) {
  const L = (s = "") => console.log(s);
  L("=== dataset stats ===");
  L(`posts in window: ${stats.postsInWindow} | last 7d: ${stats.last7Days.posts} (${stats.last7Days.perDay}/day) | last 30d: ${stats.last30Days.posts} (${stats.last30Days.perDay}/day) | distinct authors ${stats.distinctAuthors}`);
  const d = (x) => `p50 ${x.p50} p90 ${x.p90} p99 ${x.p99} max ${x.max} (min ${x.min})`;
  L(`net votes (incl author seed): ${d(stats.netVotes)}`);
  L(`net votes (excl author seed): ${d(stats.netVotesExcludingAuthorSeed)}`);
  L(`% zero votes: ${stats.pctPostsWithZeroVotes} | % nobody but the author voted: ${stats.pctPostsWithNoVotesBeyondAuthorSeed} | % with author seed vote: ${stats.pctPostsWithAuthorSeedVote} | % with a comment: ${stats.pctPostsWithAnyComment}`);
  L(`median min to first upvote (any, incl author seed): ${stats.minutesToFirstUpvoteAny.median} (n=${stats.minutesToFirstUpvoteAny.n}) | to first organic upvote: ${stats.minutesToFirstOrganicUpvote.median} min = ${stats.minutesToFirstOrganicUpvote.medianHours} h (n=${stats.minutesToFirstOrganicUpvote.n}, p90 ${stats.minutesToFirstOrganicUpvote.p90} min)`);
  L();
  L(`=== nearby density (${density.radiusMi} mi) ===`);
  for (const k of ["densestCluster", "sdsu", "downtown"]) {
    const x = density[k];
    if (x) L(`${x.label} (${x.lat}, ${x.lng}): 7d ${x.last7Days} | 30d ${x.last30Days} | 60d ${x.last60Days}`);
  }
}

// -------------------------------------------------------------------- CLI --

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const centerArg = arg("center");
  const center = centerArg ? { lat: Number(centerArg.split(",")[0]), lng: Number(centerArg.split(",")[1]) } : null;
  const snap = loadSnapshot(arg("snapshot"));
  const atMs = arg("at") ? Date.parse(arg("at")) : snap.generatedAtMs;
  const result = runSim(baselineScore, {
    snapshot: snap,
    atMs,
    center,
    label: "CURRENT: (max(net,0)+1)/(age+2)^1.0",
  });
  const stats = computeStats(snap, atMs);
  const density = nearbyDensity(snap, atMs);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ result, stats, density }, null, 2));
  } else {
    printReport(result);
    console.log();
    printStats(stats, density);
  }
}
