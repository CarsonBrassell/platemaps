#!/usr/bin/env node
/**
 * "yikyak-faithful" Trending candidate (2026-10-27).
 *
 *   node probe/trending-2026-10-27/sim-yikyak-faithful.mjs            # grid + chosen report
 *   node probe/trending-2026-10-27/sim-yikyak-faithful.mjs --grid     # grid only
 *
 * Formula (all constants named, see CHOSEN below):
 *
 *   v(net)    = net + 1                       net >= 0     (the "+1" is the current formula's, kept)
 *             = 1 / (1 - net)^2               net <  0     (a downvoted plate sinks below "nobody voted")
 *   fresh(a)  = (1 + (a / W)^P) ^ (-G / P)    a = age in hours against the fixed $1 clock
 *   score     = v(net) * fresh(a)
 *
 * fresh(a) is ~1 while a << W (inside the window Trending is ordered by net votes, newest first on a
 * tie: the documented Yik Yak Hot behaviour), is exactly 2^(-G/P) at a = W, and is (W/a)^G for a >> W
 * (a polynomial tail: a very popular plate can outlive the window, a normal one cannot). It is the
 * smooth version of Yik Yak's hard 24 h cutoff, because a hard cutoff would empty Trending at the
 * volume here (~0.75 posts/day) and has no "unless it was super popular" exception.
 *
 * No vote timestamps are needed; the score is a pure function of (up, down, created_at, $1).
 */
import { loadSnapshot, runSim, printReport, computeStats, nearbyDensity, baselineScore, percentile, HOUR_MS, DAY_MS, CENTERS, milesBetween } from "./harness.mjs";

export const mk = ({ W, P, G }) => ({ net, ageHours }) => {
  const v = net >= 0 ? net + 1 : 1 / (1 - net) ** 2;
  return v * Math.pow(1 + Math.pow(ageHours / W, P), -G / P);
};

// Reference: Yik Yak's documented Hot, hard window, then (my R4 patch) newest-first for the tail.
export const hardYikYak = (W) => ({ net, ageHours }) =>
  ageHours <= W ? 1e9 + net * 1e6 + (W - ageHours) : -ageHours;

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 10 ** d) / 10 ** d);
const byIdDesc = (a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

function countLE(arr, t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; }
  return lo;
}

/** Own hourly replay so we can measure things runSim does not (see metrics below). */
function rows(snap, t, fn, { center = null, radiusMi = 5, windowDays = 60 } = {}) {
  const out = [];
  for (const p of snap.posts) {
    if (p.createdAtMs > t || p.createdAtMs <= t - windowDays * DAY_MS) continue;
    if (center) {
      if (p.lat == null) continue;
      if (milesBetween(center, { lat: p.lat, lng: p.lng }) > radiusMi) continue;
    }
    const up = countLE(p.upMs, t), down = countLE(p.downMs, t);
    const ageHours = (t - p.createdAtMs) / HOUR_MS;
    out.push({ id: p.id, createdAtMs: p.createdAtMs, ageHours, up, down, net: up - down, score: fn({ net: up - down, ageHours, up, down }) });
  }
  out.sort((a, b) => (a.score !== b.score ? (b.score > a.score ? 1 : -1) : byIdDesc(a, b)));
  return out;
}

export function replayMetrics(snap, fn, W, opts = {}) {
  const end = Math.floor(snap.generatedAtMs / HOUR_MS) * HOUR_MS;
  const hours = 21 * 24 + 1;
  const ref = hardYikYak(W);
  let n = 0, inv = 0, invPairs = 0, notNewest = 0, refTop1 = 0, refTop3 = 0, r3Testable = 0, r3Viol = 0;
  const excess = [], topFreshNetOK = [];
  const ages = [];
  for (let i = 0; i < hours; i++) {
    const t = end - (hours - 1 - i) * HOUR_MS;
    const r = rows(snap, t, fn, opts);
    if (!r.length) continue;
    n++;
    const rr = rows(snap, t, ref, opts);
    ages.push(r[0].ageHours);
    const newest = [...r].sort((a, b) => a.ageHours - b.ageHours)[0];
    if (r[0].id !== newest.id) notNewest++;
    excess.push(r[0].ageHours - newest.ageHours);
    if (r[0].id === rr[0].id) refTop1++;
    const a3 = new Set(r.slice(0, 3).map((x) => x.id)), b3 = new Set(rr.slice(0, 3).map((x) => x.id));
    let k = 0; for (const x of a3) if (b3.has(x)) k++;
    refTop3 += k / Math.max(a3.size, 1);
    // R3: a brand-new (<2h) plate with net<=1 must not outrank a top-decile (net>=2, roughly the top decile here) plate from the last 24h
    const lows = r.filter((x) => x.ageHours < 2 && x.net <= 1), highs = r.filter((x) => x.ageHours < 24 && x.net >= 2);
    if (lows.length && highs.length) {
      r3Testable++;
      const bestLow = Math.min(...lows.map((x) => r.indexOf(x))), worstHigh = Math.max(...highs.map((x) => r.indexOf(x)));
      if (bestLow < worstHigh) r3Viol++;
    }
    // net-vote inversions among in-window plates inside the top 10
    const top = r.slice(0, 10).filter((x) => x.ageHours <= W);
    for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) {
      if (top[a].net !== top[b].net) { invPairs++; if (top[a].net < top[b].net) inv++; }
    }
  }
  return {
    hoursWithPosts: n,
    pctNumberOneNotNewest: round((100 * notNewest) / n, 1),
    excessAgeOverNewestMeanH: round(excess.reduce((a, b) => a + b, 0) / n, 1),
    excessAgeOverNewestMaxH: round(Math.max(...excess), 1),
    pctNumberOneMatchesHardYikYak: round((100 * refTop1) / n, 1),
    top3OverlapWithHardYikYak: round((100 * refTop3) / n, 1),
    pctInWindowNetInversions: invPairs ? round((100 * inv) / invPairs, 1) : 0,
    r3: { testableHours: r3Testable, hoursNewLowOutranksFreshHigh: r3Viol },
  };
}

/** Inject one hypothetical plate with `votes` upvotes (all within 2h of posting) and measure how long it holds #1 / top 3. */
export function survivalOnce(snap, fn, votes, c, opts = {}) {
  const clone = {
    ...snap,
    posts: [
      ...snap.posts,
      {
        id: 'zzzzzzzz-injected', createdAtMs: c, lat: 32.77, lng: -117.07, authorIdx: 999, selfUpMs: c,
        upMs: Array.from({ length: votes }, (_, i) => c + Math.round((i / Math.max(votes - 1, 1)) * 2 * HOUR_MS)),
        downMs: [], commentMs: [],
      },
    ].sort((a, b) => a.createdAtMs - b.createdAtMs),
  };
  const end = Math.floor(snap.generatedAtMs / HOUR_MS) * HOUR_MS;
  let h1 = 0, h3 = 0;
  for (let t = c; t <= end; t += HOUR_MS) {
    const r = rows(clone, t, fn, opts);
    const idx = r.findIndex((x) => x.id === 'zzzzzzzz-injected');
    if (idx === 0) h1++;
    if (idx >= 0 && idx < 3) h3++;
  }
  return { h1, h3 };
}

/** Inject one hypothetical plate (votes upvotes inside 2h of posting) at every 12th hour of the first 14 replay days. */
export function survival(snap, fn, votes, opts = {}) {
  const end = Math.floor(snap.generatedAtMs / HOUR_MS) * HOUR_MS;
  const start = end - 21 * DAY_MS;
  const a1 = [], a3 = [];
  for (let c = start; c <= end - 7 * DAY_MS; c += 12 * HOUR_MS) {
    const r = survivalOnce(snap, fn, votes, c, opts);
    a1.push(r.h1); a3.push(r.h3);
  }
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  return { votes, n: a1.length, at1Mean: round(mean(a1), 0), at1Max: Math.max(...a1), top3Mean: round(mean(a3), 0), top3Max: Math.max(...a3) };
}

function row(label, fn, W, snap, opts = {}) {
  const sim = runSim(fn, { snapshot: snap, label, ...opts });
  const m = replayMetrics(snap, fn, W, opts);
  return { label, sim, m };
}

const checksPassed = (sim) => sim.synthetic.checks.filter((c) => c.pass).length;

// ----------------------------------------------------------------- grid ----
const snap = loadSnapshot();
const GRID_ONLY = process.argv.includes("--grid");

console.log("=== GRID (W hours, G tail gravity, P edge sharpness) ===");
console.log("W   G     P  chk  #1age p50/p90/max  %#1>48h  longest#1  notNewest%  exMean/Max  matchHardYY%  inv%  jacc(New)  R3viol/testable   +12: mean/max h@#1, mean/max h in top3   +40: same");
for (const [W, G, P] of [
  ...[12, 18, 24, 36, 48].flatMap((W) => [1.75, 2, 2.25, 2.5, 3].map((G) => [W, G, 6])),
  ...[3, 4, 8, 12].map((P) => [24, 2.25, P]),
]) {
  const fn = mk({ W, P, G });
  const { sim, m } = row(`W${W} G${G} P${P}`, fn, W, snap);
  const r = sim.replay;
  const s12 = survival(snap, fn, 12), s40 = survival(snap, fn, 40);
  console.log(
    `${String(W).padEnd(3)} ${String(G).padEnd(5)} ${P}  ${checksPassed(sim)}/5  ` +
      `${r.numberOneAgeHours.p50}/${r.numberOneAgeHours.p90}/${r.numberOneAgeHours.max}`.padEnd(19) +
      `${String(r.pctHoursNumberOneOlderThan48h).padStart(5)}   ${String(r.longestNumberOneStreak.hours).padStart(6)}h   ` +
      `${String(m.pctNumberOneNotNewest).padStart(7)}   ${m.excessAgeOverNewestMeanH}/${m.excessAgeOverNewestMaxH}`.padEnd(14) +
      `${String(m.pctNumberOneMatchesHardYikYak).padStart(7)}   ${String(m.pctInWindowNetInversions).padStart(4)}  ${String(r.jaccardTrendingVsNewHourly.mean).padStart(7)}   ` +
      `${m.r3.hoursNewLowOutranksFreshHigh}/${m.r3.testableHours}`.padEnd(14) +
      `  ${s12.at1Mean}/${s12.at1Max}, ${s12.top3Mean}/${s12.top3Max}`.padEnd(24) + `  ${s40.at1Mean}/${s40.at1Max}, ${s40.top3Mean}/${s40.top3Max}`,
  );
}
if (GRID_ONLY) process.exit(0);

// -------------------------------------------------------------- chosen ----
// Chosen after reading the grid above: W=24 (Yik Yak's documented 24 h Hot window), G=2.25 (the
// narrow band where BOTH feedSort.ts rows hold: 5d+30 loses to a brand-new 0, and 7d+100 still beats
// 7d+10 and a brand-new 0), P=6 (flat enough that net votes decide order inside the window).
export const CHOSEN = { W: 24, P: 6, G: 2.25 };
const fn = mk(CHOSEN);

console.log("\n\n================ CHOSEN: yikyak-faithful W=%d P=%d G=%s ================", CHOSEN.W, CHOSEN.P, CHOSEN.G);
const base = row("CURRENT baseline", baselineScore, CHOSEN.W, snap);
const cand = row(`yikyak-faithful W${CHOSEN.W} P${CHOSEN.P} G${CHOSEN.G}`, fn, CHOSEN.W, snap);
const hard = row("hard Yik Yak 24h (not shippable: tail ordering is mine)", hardYikYak(CHOSEN.W), CHOSEN.W, snap);

printReport(cand.sim);
console.log("\nextra metrics (candidate):", JSON.stringify(cand.m));
console.log("extra metrics (baseline): ", JSON.stringify(base.m));
console.log("extra metrics (hard YY):  ", JSON.stringify(hard.m));
console.log("\nbaseline replay summary:", JSON.stringify(base.sim.replay.numberOneAgeHours), "pct>48h", base.sim.replay.pctHoursNumberOneOlderThan48h, "longest", base.sim.replay.longestNumberOneStreak.hours, "h top3 max", base.sim.replay.top3.maxDwellHours);
console.log("hard YY replay summary: ", JSON.stringify(hard.sim.replay.numberOneAgeHours), "pct>48h", hard.sim.replay.pctHoursNumberOneOlderThan48h, "longest", hard.sim.replay.longestNumberOneStreak.hours, "h top3 max", hard.sim.replay.top3.maxDwellHours);

console.log("\n--- synthetic order under the other vote-time shapes (formula ignores vote times, so identical) ---");
for (const shape of ["early", "late"]) {
  const r = runSim(fn, { snapshot: snap, synthVotes: shape });
  console.log(shape, r.synthetic.order.map((o) => o.plate).join(" > "));
}

console.log("\n--- survival: ONE hypothetical plate with N upvotes (all inside 2h) injected every 12h across the first 14 replay days into the REAL pool ---");
console.log("hours as #1 and hours in top 3, mean / max over the injections.   candidate vs [current baseline]");
for (const v of [1, 2, 4, 8, 12, 20, 40, 100]) {
  const a = survival(snap, fn, v), b = survival(snap, baselineScore, v);
  console.log(`+${String(v).padEnd(4)} @#1 ${String(a.at1Mean).padStart(4)} / ${String(a.at1Max).padStart(4)}   top3 ${String(a.top3Mean).padStart(4)} / ${String(a.top3Max).padStart(4)}     [@#1 ${b.at1Mean}/${b.at1Max}, top3 ${b.top3Mean}/${b.top3Max}]`);
}

console.log("\n--- how long a plate with net N stays above a fresh +1 plate (v=2) and a fresh +3 (v=4) ---");
for (const N of [1, 2, 3, 4, 8, 12, 20, 40, 100]) {
  const hold = (vFresh) => {
    const v = N + 1;
    if (v <= vFresh) return 0;
    // solve v*fresh(a) = vFresh
    let lo = 0, hi = 5000;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (v * Math.pow(1 + Math.pow(mid / CHOSEN.W, CHOSEN.P), -CHOSEN.G / CHOSEN.P) > vFresh) lo = mid; else hi = mid; }
    return lo;
  };
  console.log(`net +${String(N).padEnd(4)} outranks a brand-new +1 plate until age ${round(hold(2), 1)}h (${round(hold(2) / 24, 1)}d); a brand-new +3 plate until ${round(hold(4), 1)}h`);
}

console.log("\n--- Nearby (filter) on the chosen formula ---");
const dens = nearbyDensity(snap);
for (const [name, c] of [["SDSU", CENTERS.sdsu], ["Downtown", CENTERS.downtown], ["densest", { lat: dens.densestCluster.lat, lng: dens.densestCluster.lng }]]) {
  const rc = row(`nearby ${name}`, fn, CHOSEN.W, snap, { center: c });
  const rb = row(`nearby ${name} baseline`, baselineScore, CHOSEN.W, snap, { center: c });
  const f = (x) => `eligible ${x.sim.meta.eligibleNow}  #1 age p50/p90/max ${x.sim.replay.numberOneAgeHours.p50}/${x.sim.replay.numberOneAgeHours.p90}/${x.sim.replay.numberOneAgeHours.max}  %#1>48h ${x.sim.replay.pctHoursNumberOneOlderThan48h}  longest#1 ${x.sim.replay.longestNumberOneStreak.hours}h  jaccardVsNew mean ${x.sim.replay.jaccardTrendingVsNewHourly.mean}`;
  console.log(`${name}: candidate ${f(rc)}`);
  console.log(`${" ".repeat(name.length)}  baseline  ${f(rb)}`);
}

console.log("\n--- live pool at snapshot time, top 12 with the candidate formula ---");
{
  const t = snap.generatedAtMs;
  const r = rows(snap, t, fn);
  r.slice(0, 12).forEach((x, i) => console.log(`${String(i + 1).padStart(2)}. ${x.id.slice(0, 8)} age ${round(x.ageHours, 1)}h +${x.up}/-${x.down} score ${x.score.toPrecision(8)}`));
  console.log("full score list (for SQL comparison):", JSON.stringify(r.map((x) => [x.id.slice(0, 8), Number(x.score.toPrecision(10))])));
}
