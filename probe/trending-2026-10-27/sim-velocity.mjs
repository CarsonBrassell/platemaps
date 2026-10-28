#!/usr/bin/env node
/**
 * "velocity" candidate for the Trending formula (2026-10-27).
 *
 * Trending as momentum: every vote counts fully when it is cast and fades with
 * a half-life; the post's own age then damps the result so a lone late vote on
 * an old plate cannot jump it over fresh content.
 *
 *   S      = sum(up votes by someone other than the author, 0.5^(voteAgeH / Hv))
 *          - sum(down votes,                                  0.5^(voteAgeH / Hv))
 *   score  = max(S + b, eps) * F(postAgeH)
 *   F      = 0.5^(postAgeH / Hp)            (exp)   or   (postAgeH + 2)^-g   (pow)
 *
 * Pure function of (vote timestamps, post created_at, `at`), so keyset paging
 * stays exact. Run:
 *   node probe/trending-2026-10-27/sim-velocity.mjs            # grid + chosen report
 *   node probe/trending-2026-10-27/sim-velocity.mjs --grid     # grid only
 */
import { pathToFileURL } from "node:url";
import {
  runSim,
  printReport,
  loadSnapshot,
  computeStats,
  CENTERS,
  SYNTHETIC_PLATES,
  percentile,
  HOUR_MS,
  DAY_MS,
  baselineScore,
} from "./harness.mjs";

const snap = loadSnapshot();
const selfUpById = new Map(snap.posts.map((p) => [p.id, p.selfUpMs]));

// ------------------------------------------------------------- the formula --
const cap = (x) => Math.min(Math.max(x, 0), 800); // SQL clamps the exponent the same way (Postgres raises on underflow)
const mass = (times, atMs, Hv) => {
  let s = 0;
  for (const t of times) s += Math.pow(0.5, cap((atMs - t) / HOUR_MS / Hv));
  return s;
};

export function makeScore({ Hv, F = { kind: "exp", Hp: 72 }, b = 0.5, epsFrac = 0.1, excludeSelf = true }) {
  return (p) => {
    let ups = p.upTimes;
    if (excludeSelf) {
      const selfMs = selfUpById.get(p.id);
      if (selfMs != null) {
        const k = ups.indexOf(selfMs);
        if (k >= 0) ups = ups.slice(0, k).concat(ups.slice(k + 1));
      }
    }
    const S = mass(ups, p.atMs, Hv) - mass(p.downTimes, p.atMs, Hv);
    const f =
      F.kind === "none"
        ? 1
        : F.kind === "exp"
          ? Math.pow(0.5, cap(p.ageHours / F.Hp))
          : Math.pow(p.ageHours + 2, -F.g);
    return Math.max(S + b, b * epsFrac) * f;
  };
}

// ----------------------------------------------------------- extra metrics --
const byIdDesc = (a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** Own hourly replay (same 21 days / 60d window as the harness) for metrics the harness does not print. */
export function extraReplay(scoreFn, { replayDays = 21, windowDays = 60 } = {}) {
  const count = (arr, t) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const end = Math.floor(snap.generatedAtMs / HOUR_MS) * HOUR_MS;
  const n = replayDays * 24 + 1;
  let hrs = 0;
  let notNewest = 0;
  let staleNotNewest = 0; // #1 older than 72h AND a newer post exists (an old plate leapfrogged fresher ones)
  let old72Top3Hours = 0;
  const oldTop3Posts = new Set();
  const leaders = new Set();
  const topAges = [];
  for (let i = 0; i < n; i++) {
    const t = end - (n - 1 - i) * HOUR_MS;
    const rows = [];
    for (const p of snap.posts) {
      if (p.createdAtMs > t || p.createdAtMs <= t - windowDays * DAY_MS) continue;
      const nu = count(p.upMs, t);
      const nd = count(p.downMs, t);
      const ageHours = (t - p.createdAtMs) / HOUR_MS;
      const s = scoreFn({
        id: p.id,
        up: nu,
        down: nd,
        net: nu - nd,
        comments: 0,
        ageHours,
        createdAtMs: p.createdAtMs,
        atMs: t,
        upTimes: p.upMs.slice(0, nu),
        downTimes: p.downMs.slice(0, nd),
        commentTimes: [],
      });
      rows.push({ id: p.id, createdAtMs: p.createdAtMs, ageHours, score: s });
    }
    if (!rows.length) continue;
    rows.sort((a, b) => (a.score !== b.score ? b.score - a.score : byIdDesc(a, b)));
    const newest = rows.reduce((m, r) => (r.createdAtMs > m.createdAtMs ? r : m), rows[0]);
    const top = rows[0];
    hrs++;
    topAges.push(top.ageHours);
    leaders.add(top.id);
    if (top.id !== newest.id) {
      notNewest++;
      if (top.ageHours > 72) staleNotNewest++;
    }
    let any = false;
    for (const r of rows.slice(0, 3))
      if (r.ageHours > 72) {
        any = true;
        oldTop3Posts.add(r.id);
      }
    if (any) old72Top3Hours++;
  }
  const pct = (x) => Math.round((1000 * x) / hrs) / 10;
  return {
    pctHoursLeaderIsNotNewest: pct(notNewest),
    pctHoursOldLeaderLeapfrog72h: pct(staleNotNewest),
    pctHoursAnyTop3Older72h: pct(old72Top3Hours),
    distinctPostsOlder72hInTop3: oldTop3Posts.size,
    distinctLeaders: leaders.size,
  };
}

// ------------------------------------------------------ synthetic checks ---
/** Rank of every synthetic plate under a vote-time shape; returns {label -> rank} and the order. */
function synthRanks(scoreFn, shape) {
  const r = runSim(scoreFn, { replayDays: 1, synthVotes: shape, label: "x" });
  const rank = Object.fromEntries(r.synthetic.order.map((o) => [o.plate, o.rank]));
  return { rank, order: r.synthetic.order, checks: r.synthetic.checks };
}

export function customChecks(scoreFn) {
  const u = synthRanks(scoreFn, "uniform");
  const early = synthRanks(scoreFn, "early");
  const late = synthRanks(scoreFn, "late");
  const R = (s, l) => s.rank[l];
  const checks = [
    ...u.checks.map((c) => ({ name: `[harness/${c.source}] ${c.name}`, pass: c.pass })),
    {
      name: "R3 brand new,0 ranks below 1d,+5 / 8h,+18 / 14h,+35 (top-decile from earlier today)",
      pass: ["1d, +5", "8h, +18", "14h, +35"].every((l) => R(u, "brand new, 0") > R(u, l)),
    },
    // Strict top-3 version failed for all 252 configs: the plate legitimately ranks behind 14h,+35 / 8h,+18 / 2d,+40.
    // Relaxed to top 5; the strict rank is printed by velocity-shapes.mjs.
    { name: "R2 7d,+100 votes still arriving (late shape) reaches top 5", pass: R(late, "7d, +100") <= 5 },
    { name: "R2 7d,+100 whose burst ended days ago (early shape) is NOT top 3", pass: R(early, "7d, +100") > 3 },
    { name: "R2 7d,+10 never top 3 under any vote-time shape", pass: [u, early, late].every((s) => R(s, "7d, +10") > 3) },
    { name: "R2 5d,+30 never top 3 under any vote-time shape", pass: [u, early, late].every((s) => R(s, "5d, +30") > 3) },
    { name: "R6 1h,-3 below brand new,0 under every shape", pass: [u, early, late].every((s) => R(s, "1h, -3") > R(s, "brand new, 0")) },
    { name: "15d,+7 is last or second-to-last", pass: R(u, "15d, +7") >= 11 },
  ];
  return { checks, u, early, late };
}

// ---------------------------------------------------------------- metrics ---
function metricsFor(scoreFn, label) {
  const r = runSim(scoreFn, { label });
  const x = extraReplay(scoreFn);
  const c = customChecks(scoreFn);
  return { r, x, c };
}

const summarize = (cfgLabel, m) => ({
  cfg: cfgLabel,
  age50: m.r.replay.numberOneAgeHours.p50,
  age90: m.r.replay.numberOneAgeHours.p90,
  ageMax: m.r.replay.numberOneAgeHours.max,
  gt48: m.r.replay.pctHoursNumberOneOlderThan48h,
  gt7d: m.r.replay.pctHoursNumberOneOlderThan7d,
  streak: m.r.replay.longestNumberOneStreak?.hours,
  top3max: m.r.replay.top3.maxDwellHours,
  top3avg: m.r.replay.top3.avgDwellHoursPerRun,
  jac: m.r.replay.jaccardTrendingVsNewHourly.mean,
  notNewest: m.x.pctHoursLeaderIsNotNewest,
  leapfrog: m.x.pctHoursOldLeaderLeapfrog72h,
  old3: m.x.distinctPostsOlder72hInTop3,
  leaders: m.x.distinctLeaders,
  pass: `${m.c.checks.filter((k) => k.pass).length}/${m.c.checks.length}`,
});

// -------------------------------------------------------------------- main --
const argv = process.argv.slice(2);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Floor: pure New ordering (created_at DESC) and the current formula.
  const floor = metricsFor((p) => p.createdAtMs, "FLOOR: created_at DESC");
  const base = metricsFor(baselineScore, "BASELINE");
  const rows = [summarize("FLOOR created_at DESC", floor), summarize("BASELINE (net+1)/(age+2)^1", base)];

  const grid = [];
  for (const excludeSelf of [true, false])
    for (const Hv of [6, 12, 18, 24, 36, 48])
      for (const F of [
        { kind: "none" },
        { kind: "exp", Hp: 24 },
        { kind: "exp", Hp: 48 },
        { kind: "exp", Hp: 72 },
        { kind: "exp", Hp: 120 },
        { kind: "pow", g: 0.5 },
        { kind: "pow", g: 1 },
      ])
        for (const b of [0.25, 0.5, 1]) grid.push({ Hv, F, b, excludeSelf });

  const results = [];
  for (const cfg of grid) {
    const label = `Hv=${cfg.Hv}h F=${cfg.F.kind === "none" ? "none" : cfg.F.kind === "exp" ? `exp Hp=${cfg.F.Hp}` : `pow g=${cfg.F.g}`} b=${cfg.b} ${cfg.excludeSelf ? "noSelf" : "withSelf"}`;
    const m = metricsFor(makeScore(cfg), label);
    results.push({ cfg, label, m, s: summarize(label, m) });
  }

  const fmt = (s) =>
    `${s.cfg.padEnd(46)} #1age p50 ${String(s.age50).padStart(5)} p90 ${String(s.age90).padStart(5)} max ${String(s.ageMax).padStart(5)} | >48h ${String(s.gt48).padStart(4)}% >7d ${String(s.gt7d).padStart(3)}% | streak ${String(s.streak).padStart(3)}h top3max ${String(s.top3max).padStart(3)}h | jac ${s.jac} | !newest ${String(s.notNewest).padStart(4)}% leapfrog ${String(s.leapfrog).padStart(4)}% old3 ${s.old3} leaders ${s.leaders} | checks ${s.pass}`;
  console.log("=== reference rows ===");
  rows.forEach((s) => console.log(fmt(s)));
  console.log("\n=== grid (only configs passing ALL custom checks) ===");
  const allPass = results.filter((r) => r.m.c.checks.every((k) => k.pass));
  console.log(`${allPass.length} of ${results.length} configs pass every check`);
  allPass.forEach((r) => console.log(fmt(r.s)));
  if (argv.includes("--all")) {
    console.log("\n=== all configs ===");
    results.forEach((r) => console.log(fmt(r.s)));
  }
  globalThis.__results = results;
  if (argv.includes("--diag")) {
    const tally = {};
    for (const r of results) for (const k of r.m.c.checks) if (!k.pass) tally[k.name] = (tally[k.name]||0)+1;
    console.log("\nfailure tally across grid:");
    Object.entries(tally).sort((a,b)=>b[1]-a[1]).forEach(([n,c])=>console.log(String(c).padStart(4), n));
    const best = [...results].sort((a,b)=>b.m.c.checks.filter(k=>k.pass).length-a.m.c.checks.filter(k=>k.pass).length).slice(0,12);
    console.log("\nbest by checks passed:");
    best.forEach(r=>{console.log(fmt(r.s)); console.log("     fails:", r.m.c.checks.filter(k=>!k.pass).map(k=>k.name).join(" | "));});
  }
}
