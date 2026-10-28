#!/usr/bin/env node
/**
 * reddit-log-hot -- Reddit-style hot for Discover Trending.
 *
 *   o     = net - 1                       (net minus the author's own seed upvote)
 *   score = sign(o) * log10(1 + |o|)  +  (created_epoch_s - 1134028003) / TAU_s
 *
 * For a seeded post with net >= 1 this is EXACTLY Reddit's
 * sign(net)*log10(max(|net|,1)) (log10(1+o) = log10(net)). It differs only at
 * net <= 0, where Reddit's term is flat on [-1, 1] and this one keeps falling,
 * so a downvote always costs something. Votes are logarithmic, age is linear,
 * and the score does not depend on "now" at all.
 *
 * Reading the constant: a post with net N sits above a brand-new net-1 post for
 * at most TAU * log10(N) hours.  TAU = 54 h  ->  +3: 25.8 h, +4: 32.5 h,
 * +9: 51.5 h, +30: 79.8 h, +100: 108 h, +1000: 162 h; a week needs net ~ 1,300.
 *
 *   node probe/trending-2026-10-27/sim-reddit-log-hot.mjs               # everything
 *   node probe/trending-2026-10-27/sim-reddit-log-hot.mjs --grid        # grids only
 *   node probe/trending-2026-10-27/sim-reddit-log-hot.mjs --pick=54 --variant=organic
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runSim, printReport, computeStats, nearbyDensity, loadSnapshot, baselineScore,
  CENTERS, HOUR_MS, DAY_MS, percentile,
} from "./harness.mjs";

const REDDIT_EPOCH_S = 1134028003; // r2/lib/db/_sorts.pyx; only keeps the numbers small

// ---- score variants --------------------------------------------------------
// exact   : sign(n)*log10(max(|n|,1))   Reddit verbatim (n = -1, 0, +1 all tie at 0)
// organic : sign(n-1)*log10(1+|n-1|)    same for n>=1, strictly monotone below
// log1p   : sign(n)*log10(1+|n|)        not seed-aware; kept as a comparison
export const voteTerm = {
  exact: (n) => Math.sign(n) * Math.log10(Math.max(Math.abs(n), 1)),
  organic: (n) => Math.sign(n - 1) * Math.log10(1 + Math.abs(n - 1)),
  log1p: (n) => Math.sign(n) * Math.log10(1 + Math.abs(n)),
};
export const makeScore = (tauH, variant = "organic") => ({ net, createdAtMs }) =>
  voteTerm[variant](net) + (createdAtMs / 1000 - REDDIT_EPOCH_S) / (tauH * 3600);

// ---- generic hourly replay on any snapshot-shaped object --------------------
function countLE(arr, t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; }
  return lo;
}
const byIdDesc = (a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** Hourly top-3 for `days` days ending at endMs. Returns [{t, top:[{id,ageH,net}]}]. */
export function replayTop(snapshot, scoreFn, { days = 21, endMs, windowDays = 60, netXform = null, eliteNet = Infinity } = {}) {
  const end = Math.floor((endMs ?? snapshot.generatedAtMs) / HOUR_MS) * HOUR_MS;
  const out = [];
  for (let i = 0; i <= days * 24; i++) {
    const t = end - (days * 24 - i) * HOUR_MS;
    const rows = [];
    for (const p of snapshot.posts) {
      if (p.createdAtMs > t) break; // posts sorted ascending by createdAtMs
      if (p.createdAtMs <= t - windowDays * DAY_MS) continue;
      const up = countLE(p.upMs, t), down = countLE(p.downMs, t);
      let net = up - down;
      if (netXform) net = netXform(net, p.selfUpMs != null && p.selfUpMs <= t ? 1 : 0);
      const ageH = (t - p.createdAtMs) / HOUR_MS;
      rows.push({ id: p.id, ageH, net, createdAtMs: p.createdAtMs, score: scoreFn({ net, up, down, ageHours: ageH, createdAtMs: p.createdAtMs, atMs: t }) });
    }
    rows.sort((a, b) => (a.score !== b.score ? b.score - a.score : byIdDesc(a, b)));
    // newest post (what "New" would put first) and the R3 test: a brand-new (<1h) net<=1 post
    // ranked above an earlier-today (<24h) elite (net >= eliteNet) post.
    let newest = null;
    for (const r of rows) if (!newest || r.createdAtMs > newest.createdAtMs) newest = r;
    const elite = rows.map((r, i) => ({ r, i })).filter((x) => x.r.ageH < 24 && x.r.net >= eliteNet);
    const fresh = rows.map((r, i) => ({ r, i })).filter((x) => x.r.ageH < 1 && x.r.net <= 1);
    const r3 = elite.length && fresh.length ? (fresh.some((f) => elite.some((e) => f.i < e.i)) ? 2 : 1) : 0;
    out.push({ t, n: rows.length, top: rows.slice(0, 3), topIsNewest: rows.length > 0 && rows[0].id === newest.id, r3 });
  }
  return out;
}

/** Stale-on-top metrics from a replay. superNet = the net that counts as "super popular". */
export function staleMetrics(replay, superNet) {
  const h = replay.filter((s) => s.top.length);
  const pct = (n) => (100 * n) / (h.length || 1);
  const ages = h.map((s) => s.top[0].ageH);
  const stale = (th) => h.filter((s) => s.top[0].ageH > th);
  const staleNotSuper = (th) => stale(th).filter((s) => s.top[0].net < superNet).length;
  const staleSuper = (th) => stale(th).filter((s) => s.top[0].net >= superNet).length;
  // top-3 slots occupied by a post older than 48h with net < superNet
  let slots = 0, slotsStale = 0;
  for (const s of h) for (const r of s.top) { slots++; if (r.ageH > 48 && r.net < superNet) slotsStale++; }
  // longest continuous #1 streak
  let best = 0, cur = 0, prev = null;
  for (const s of h) { const id = s.top[0].id; cur = id === prev ? cur + 1 : 1; prev = id; best = Math.max(best, cur); }
  return {
    p50: percentile(ages, 50), p90: percentile(ages, 90), max: Math.max(...ages),
    gt24: pct(stale(24).length), gt48: pct(stale(48).length), gt168: pct(stale(168).length),
    gt48NotSuper: pct(staleNotSuper(48)), gt48Super: pct(staleSuper(48)),
    top3Gt48NotSuper: (100 * slotsStale) / (slots || 1), streakH: best,
    medNetOf1: percentile(h.map((s) => s.top[0].net), 50),
    pctTopIsNewest: pct(h.filter((s) => s.topIsNewest).length),
    r3Both: replay.filter((s) => s.r3 > 0).length, r3Inv: replay.filter((s) => s.r3 === 2).length,
  };
}

// ---- synthetic snapshots at other volumes (seeded RNG) ----------------------
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const expo = (r, mean) => -Math.log(1 - r()) * mean;
function poisson(r, lam) { if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(r))); let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

/** perDay posts/day (Poisson process, `days` days ending at endMs); organic votes ~ Poisson(meanVotes * lognormal(sigma)); 10% downvote ratio; votes arrive exp(8h). Every post carries the author's seed upvote. */
export function synthSnapshot({ perDay, meanVotes, sigma = 1.1, days = 81, endMs, seed = 7 }) {
  const r = rng(seed);
  const posts = [];
  const startMs = endMs - days * DAY_MS;
  let t = startMs, i = 0;
  const norm = Math.exp(-(sigma * sigma) / 2); // makes the lognormal mean 1
  for (;;) {
    t += expo(r, DAY_MS / perDay);
    if (t > endMs) break;
    const m = Math.exp(sigma * gauss(r)) * norm;
    const ups = poisson(r, meanVotes * m), downs = poisson(r, meanVotes * m * 0.1);
    const times = (n) => Array.from({ length: n }, () => t + expo(r, 8 * HOUR_MS)).sort((a, b) => a - b);
    posts.push({
      id: `s${String(i++).padStart(6, "0")}`, createdAtMs: Math.round(t), lat: null, lng: null, authorIdx: i % 40,
      selfUpMs: Math.round(t) + 1000, upMs: [Math.round(t) + 1000, ...times(ups)].sort((a, b) => a - b), downMs: times(downs), commentMs: [],
    });
  }
  return { generatedAtMs: endMs, feedWindowDays: 60, posts };
}

// ---- main ------------------------------------------------------------------
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) main();

function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
  const snap = loadSnapshot();
  const NOW = snap.generatedAtMs;
  const f1 = (x) => (x == null ? "-" : Number(x).toFixed(1));
  const GRID_ONLY = process.argv.includes("--grid");
  const PICK = Number(arg("pick") ?? 54);
  const VARIANT = arg("variant") ?? "organic";

  const summarize = (label, scoreFn, opts = {}) => {
    const r = runSim(scoreFn, { snapshot: snap, label, ...opts });
    const p = r.replay;
    return {
      label, s1: p.longestNumberOneStreak.hours,
      age: `${p.numberOneAgeHours.p50}/${p.numberOneAgeHours.p90}/${p.numberOneAgeHours.max}`,
      gt48: p.pctHoursNumberOneOlderThan48h, gt7d: p.pctHoursNumberOneOlderThan7d, n1: p.distinctNumberOnes,
      t3: `${p.top3.distinctPosts}/${p.top3.avgDwellHoursPerPost}/${p.top3.maxDwellHours}`,
      jac: `${r.jaccardNow}/${p.jaccardTrendingVsNewHourly.mean}`,
      synth: r.synthetic.checks.filter((c) => c.pass).length + "/" + r.synthetic.checks.length,
      failed: r.synthetic.checks.filter((c) => !c.pass).map((c) => c.name.split(" ")[0]).join("|"),
    };
  };
  const hdr = (a) => console.log(a.join("  "));

  // ---- 1. TAU grid on the real snapshot ------------------------------------
  console.log("=== 1. GRID on the real snapshot (21-day hourly replay; synth = the 5 built-in checks) ===");
  hdr(["label".padEnd(30), "streak", "#1 age p50/p90/max".padEnd(18), ">48h%", ">7d%", "#1s", "top3 posts/avg/max".padEnd(18), "jacc now/mean", "synth"]);
  const rows = [summarize("BASELINE (net+1)/(age+2)^1", baselineScore), summarize("pure NEW", ({ createdAtMs }) => createdAtMs)];
  for (const variant of ["exact", "organic"]) for (const tau of [12.5, 24, 36, 48, 54, 60, 72, 96, 168]) rows.push(summarize(`${variant} TAU=${tau}h`, makeScore(tau, variant)));
  for (const r of rows) hdr([r.label.padEnd(30), String(r.s1).padStart(5) + "h", r.age.padEnd(18), String(r.gt48).padStart(5), String(r.gt7d).padStart(4), String(r.n1).padStart(3), r.t3.padEnd(18), r.jac.padEnd(13), r.synth + (r.failed ? " fail:" + r.failed : "")]);

  // ---- 2. hold times --------------------------------------------------------
  console.log("\n=== 2. HOURS a post with net N out-ranks a brand-new net=1 post (organic / exact agree for N>=1) ===");
  for (const tau of [36, 48, 50.3, 54, 60, 72]) {
    const o = {};
    for (const n of [2, 3, 4, 9, 30, 100, 1000]) o[`+${n}`] = f1((voteTerm.organic(n) - voteTerm.organic(1)) * tau);
    console.log(`TAU=${String(tau).padEnd(5)}`, JSON.stringify(o), ` week-old needs net ~${Math.round(10 ** (168 / tau))}`);
  }
  console.log("downvotes: hours a fresh net=-k post sinks BELOW a brand-new net=1 post (TAU=54, organic):",
    JSON.stringify(Object.fromEntries([0, -1, -2, -3, -5].map((n) => [n, f1(-(voteTerm.organic(n) - voteTerm.organic(1)) * 54)]))));

  // ---- 3. R3 ----------------------------------------------------------------
  console.log("\n=== 3. R3: min net an earlier-today post needs to beat a brand-new (age 0.5h, net 1) post ===");
  console.log("age(h)  " + [36, 48, 54, 60, 72].map((t) => `TAU=${t}`.padEnd(8)).join(""));
  for (const age of [2, 6, 12, 18, 24]) {
    console.log(String(age).padEnd(7) + "  " + [36, 48, 54, 60, 72].map((t) => (">=" + Math.ceil(10 ** ((age - 0.5) / t) - 1e-9)).padEnd(8)).join(""));
  }
  const p90 = percentile(snap.posts.map((p) => countLE(p.upMs, NOW) - countLE(p.downMs, NOW)), 90);
  console.log(`(today's real p90 net = ${p90}; max = +4)`);

  // ---- 4. scale stress: same real timeline, organic votes x k ----------------
  console.log("\n=== 4. SCALE STRESS: real posting times, organic votes multiplied by k (growth of the vote base) ===");
  console.log("'super' = net >= 3x the median #1's net at that k. Columns: #1 age p50/p90/max | % hours #1 >48h (not super / super) | % top-3 slots >48h&not-super | longest #1 streak");
  for (const k of [1, 3, 10, 30]) {
    const xform = (net, selfUp) => selfUp + k * (net - selfUp);
    for (const [lab, f] of [["BASELINE", baselineScore], ["organic TAU=36", makeScore(36)], ["organic TAU=48", makeScore(48)], ["organic TAU=54", makeScore(54)], ["organic TAU=72", makeScore(72)]]) {
      const rp = replayTop(snap, lab === "BASELINE" ? ({ net, ageHours }) => (Math.max(net, 0) + 1) / (ageHours + 2) : f, { netXform: xform });
      const med = percentile(rp.filter((s) => s.top.length).map((s) => s.top[0].net), 50);
      const m = staleMetrics(rp, Math.max(3 * med, 3));
      console.log(`k=${String(k).padEnd(2)} ${lab.padEnd(15)} ${f1(m.p50)}/${f1(m.p90)}/${f1(m.max)}`.padEnd(46) + ` ${m.gt48.toFixed(1).padStart(5)}% (${m.gt48NotSuper.toFixed(1)} / ${m.gt48Super.toFixed(1)})  top3 ${m.top3Gt48NotSuper.toFixed(1)}%  streak ${m.streakH}h  med#1net ${f1(m.medNetOf1)}  #1=newest ${m.pctTopIsNewest.toFixed(0)}%`);
    }
  }

  // ---- 5. synthetic volumes (Poisson posting, heavy-tailed votes) -------------
  console.log("\n=== 5. SYNTHETIC VOLUMES (Poisson posts/day, lognormal popularity sigma=1.1; same stale metrics) ===");
  for (const { perDay, meanVotes } of [{ perDay: 0.75, meanVotes: 1.2 }, { perDay: 3, meanVotes: 3 }, { perDay: 10, meanVotes: 6 }, { perDay: 40, meanVotes: 12 }]) {
    const sy = synthSnapshot({ perDay, meanVotes, endMs: NOW });
    const allNet = sy.posts.map((p) => p.upMs.length - p.downMs.length);
    const superNet = Math.max(percentile(allNet, 99), 3);
    const p90 = Math.max(percentile(allNet, 90), 3);
    console.log(`-- ${perDay} posts/day, mean organic votes ${meanVotes}: ${sy.posts.length} posts, net p50 ${f1(percentile(allNet, 50))} p90 ${f1(percentile(allNet, 90))} p99 ${f1(percentile(allNet, 99))} max ${Math.max(...allNet)}; super = net>=${f1(superNet)} (p99)`);
    for (const [lab, f] of [["BASELINE", ({ net, ageHours }) => (Math.max(net, 0) + 1) / (ageHours + 2)], ["pure NEW", ({ createdAtMs }) => createdAtMs], ["organic TAU=36", makeScore(36)], ["organic TAU=48", makeScore(48)], ["organic TAU=54", makeScore(54)], ["organic TAU=72", makeScore(72)]]) {
      const m = staleMetrics(replayTop(sy, f, { days: 21, eliteNet: p90 }), superNet);
      console.log(`   ${lab.padEnd(15)} #1 age ${f1(m.p50)}/${f1(m.p90)}/${f1(m.max)}`.padEnd(46) + ` >24h ${m.gt24.toFixed(1)}%  >48h ${m.gt48.toFixed(1)}% (not super ${m.gt48NotSuper.toFixed(1)}, super ${m.gt48Super.toFixed(1)})  >7d ${m.gt168.toFixed(1)}%  top3 stale ${m.top3Gt48NotSuper.toFixed(1)}%  streak ${m.streakH}h  med#1net ${f1(m.medNetOf1)}  #1=newest ${m.pctTopIsNewest.toFixed(0)}%  R3 inversions ${m.r3Inv}/${m.r3Both}h`);
    }
  }
  if (GRID_ONLY) return;

  // ---- 6. chosen candidate -----------------------------------------------------
  console.log(`\n\n############ CHOSEN: reddit-log-hot, variant=${VARIANT}, TAU=${PICK}h ############\n`);
  const sc = makeScore(PICK, VARIANT);
  printReport(runSim(sc, { snapshot: snap, label: `reddit-log-hot ${VARIANT} TAU=${PICK}h` }));
  console.log("\nNearby (5 mi) filter, same formula (a filter on top of the same global order):");
  const dens = nearbyDensity(snap);
  for (const [k, c] of Object.entries({ sdsu: CENTERS.sdsu, downtown: CENTERS.downtown, densest: dens.densestCluster })) {
    const center = { lat: c.lat, lng: c.lng };
    const fmt = (x) => `#1 age p50 ${x.replay.numberOneAgeHours.p50} p90 ${x.replay.numberOneAgeHours.p90} max ${x.replay.numberOneAgeHours.max}; >48h ${x.replay.pctHoursNumberOneOlderThan48h}%; >7d ${x.replay.pctHoursNumberOneOlderThan7d}%; top3 max dwell ${x.replay.top3.maxDwellHours}h; hours with a post ${x.replay.hoursWithAnyPost}/${x.replay.hoursSampled}; eligible now ${x.meta.eligibleNow}`;
    console.log(` ${k.padEnd(9)} new formula: ${fmt(runSim(sc, { snapshot: snap, center }))}`);
    console.log(` ${"".padEnd(9)} baseline:    ${fmt(runSim(baselineScore, { snapshot: snap, center }))}`);
  }
  const st = computeStats(snap);
  console.log("\nDataset: net votes", JSON.stringify(st.netVotes), "| posts/day 30d", st.last30Days.perDay);
}
