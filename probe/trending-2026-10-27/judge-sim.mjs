#!/usr/bin/env node
/**
 * Judge re-implementation of the four candidate Trending formulas, written from
 * the formula text (NOT from the candidates' sim scripts), plus an independent
 * Poisson-volume stress test. Offline only: reads snapshot.json, no DB.
 *
 *   node probe/trending-2026-10-27/judge-sim.mjs real
 *   node probe/trending-2026-10-27/judge-sim.mjs hold
 *   node probe/trending-2026-10-27/judge-sim.mjs poisson
 */
import { runSim, loadSnapshot, HOUR_MS } from "./harness.mjs";

// ---------------------------------------------------------------- formulas --
export const F = {
  baseline: ({ up, down, ageHours }) => (Math.max(up - down, 0) + 1) / Math.pow(ageHours + 2, 1),
  yikyak: ({ net, ageHours }) => {
    const a = Math.max(ageHours, 0);
    const v = net >= 0 ? net + 1 : 1 / Math.pow(1 - net, 2);
    return v * Math.pow(1 + Math.pow(a / 24, 6), -2.25 / 6);
  },
  reddit: ({ net, createdAtMs }) => {
    const o = net - 1;
    return Math.sign(o) * Math.log10(1 + Math.abs(o)) + (createdAtMs / 1000 - 1134028003) / 194400;
  },
  gravity: ({ net, ageHours }) => {
    const a = Math.max(ageHours, 0);
    const V = net >= 0 ? net + 1 : 1 / (1 - net);
    return (V / Math.pow(a + 24, 1.7)) * Math.exp(-Math.max(a - 72, 0) / 96);
  },
  velocity: ({ upTimes, downTimes, selfUp, ageHours, atMs }) => {
    const mass = (arr) => {
      let s = 0;
      for (const t of arr) {
        const h = Math.min(Math.max((atMs - t) / HOUR_MS, 0) / 24, 800);
        s += Math.pow(0.5, h);
      }
      return s;
    };
    const ups = selfUp ? upTimes.slice(1) : upTimes; // earliest = author's seed (at creation)
    const S = mass(ups) - mass(downTimes);
    return Math.max(S + 0.3, 0.03) / (Math.max(ageHours, 0) + 2);
  },
};
const NAMES = Object.keys(F);

// ---------------------------------------------------------------- utilities --
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function poisson(r, lam) {
  if (lam > 40) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal(r)));
  const L = Math.exp(-lam);
  let k = 0,
    p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = ((s.length - 1) * p) / 100;
  const lo = Math.floor(i),
    hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const f1 = (x) => (x == null ? "-" : Number.isFinite(x) ? x.toFixed(1) : String(x));
function countLE(arr, t) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

// ------------------------------------------------------------------- real --
function realReplay() {
  console.log("=== REAL DATA replay (harness runSim, judge-implemented formulas)");
  for (const n of NAMES) {
    const r = runSim((p) => F[n](p), { label: n });
    const rp = r.replay;
    console.log(
      n.padEnd(9),
      "streak", rp.longestNumberOneStreak.hours,
      "| #1 age p50/p90/max", rp.numberOneAgeHours.p50, rp.numberOneAgeHours.p90, rp.numberOneAgeHours.max,
      "| >48h%", rp.pctHoursNumberOneOlderThan48h,
      "| >7d%", rp.pctHoursNumberOneOlderThan7d,
      "| top3 avgDwell", rp.top3.avgDwellHoursPerRun, "max", rp.top3.maxDwellHours,
      "| jac", rp.jaccardTrendingVsNewHourly.mean,
      "| top10now", r.currentTop10.map((x) => x.id).join(","),
    );
    console.log("   synthetic:", r.synthetic.order.map((s) => s.plate).join(" > ") + "  checks:" + r.synthetic.checks.filter((c) => c.pass).length + "/5");
  }
}

// ------------------------------------------------------------------- hold --
function mkPost({ ageH, net, shape = "uniform", seed = true, atMs = 1.8e12 }) {
  // net includes the author's seed upvote when seed=true (a real post).
  const created = atMs - ageH * HOUR_MS;
  const up = Math.max(net, 0);
  const down = Math.max(-net, 0);
  const times = (n, offset) =>
    Array.from({ length: n }, (_, i) => {
      if (seed && offset && i === 0) return created; // seed vote at creation
      const idx = seed && offset ? i : i + 1;
      const tot = seed && offset ? n - 1 : n;
      const f = (idx) / (tot + 1);
      const g = shape === "early" ? f * 0.15 : shape === "late" ? 1 - (1 - f) * 0.33 : f;
      return Math.round(created + g * (atMs - created));
    });
  const upTimes = up ? times(up, true) : [];
  const downTimes = down ? times(down, false) : [];
  return { net, up, down, ageHours: ageH, createdAtMs: created, atMs, upTimes, downTimes, selfUp: seed && up > 0 ? 1 : 0 };
}
function holdAge(name, net, ref, shape) {
  // largest age at which post(net) still scores >= reference score
  const refScore = F[name](ref);
  let lo = 0.5,
    hi = 24 * 60;
  if (F[name](mkPost({ ageH: lo, net, shape })) < refScore) return 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (F[name](mkPost({ ageH: mid, net, shape })) >= refScore) lo = mid;
    else hi = mid;
  }
  return lo;
}
function hold() {
  console.log("=== HOLD TIME: hours a plate of final net N out-ranks a REAL brand-new plate (age 0.5h, net +1 = author seed)");
  console.log("net(with seed):  " + [2, 3, 4, 6, 11, 21, 31, 101, 301].map((n) => String(n).padStart(6)).join(""));
  for (const name of NAMES) {
    for (const shape of name === "velocity" ? ["uniform", "early"] : ["uniform"]) {
      const row = [2, 3, 4, 6, 11, 21, 31, 101, 301].map((n) => holdAge(name, n, mkPost({ ageH: 0.5, net: 1, shape }), shape));
      console.log((name + (name === "velocity" ? ":" + shape : "")).padEnd(16), row.map((x) => f1(x).padStart(6)).join(""));
    }
  }
  console.log("\n=== literal R3: brand-new 0-vote (no seed) vs net+3 plate");
  for (const name of NAMES) {
    const ref = mkPost({ ageH: 0.5, net: 0, seed: false });
    console.log(name.padEnd(9), "net+3 holds", f1(holdAge(name, 3, ref, "uniform")), "h ; net+5 holds", f1(holdAge(name, 5, ref, "uniform")));
  }
  console.log("\n=== Week-old: net needed to out-rank a real brand-new +1 plate at ages 24/48/72/120/168/336h");
  for (const name of NAMES) {
    if (name === "velocity") continue;
    const out = [];
    for (const age of [24, 48, 72, 120, 168, 336]) {
      const ref = mkPost({ ageH: 0.5, net: 1 });
      let lo = 1,
        hi = 1e9;
      for (let i = 0; i < 80; i++) {
        const mid = Math.sqrt(lo * hi);
        if (F[name](mkPost({ ageH: age, net: Math.round(mid) })) >= F[name](ref)) hi = mid;
        else lo = mid;
      }
      out.push(`${age}h:${hi < 1e8 ? Math.round(hi - 1) : "inf"}`);
    }
    console.log(name.padEnd(9), out.join("  "), "(net excluding seed)");
  }
}

// ---------------------------------------------------------------- poisson --
function genPool({ perDay, k, days, seed, delay, sigmaPop = 0.8, popMedian = 1.0 }) {
  const r = rng(seed);
  const t0 = Date.UTC(2026, 0, 1);
  const total = days * perDay;
  const posts = [];
  let t = t0;
  let i = 0;
  while (true) {
    t += (-Math.log(1 - r()) / perDay) * 24 * HOUR_MS;
    if (t > t0 + days * 24 * HOUR_MS) break;
    const L = k * popMedian * Math.exp(sigmaPop * normal(r));
    const nUp = poisson(r, L);
    const nDown = poisson(r, 0.1 * L);
    const dly = () => Math.min(delay.median * Math.exp(delay.sigma * normal(r)), 24 * 60) * HOUR_MS;
    const upMs = [Math.round(t), ...Array.from({ length: nUp }, () => Math.round(t + dly()))].sort((a, b) => a - b);
    const downMs = Array.from({ length: nDown }, () => Math.round(t + dly())).sort((a, b) => a - b);
    posts.push({ id: String(i++).padStart(6, "0"), createdAtMs: Math.round(t), upMs, downMs });
  }
  return { posts, t0, days };
}

function evalPool(pool, names, { warmDays = 60, measureDays = 30 }) {
  const end = pool.t0 + pool.days * 24 * HOUR_MS;
  const start = end - measureDays * 24 * HOUR_MS;
  // final nets for classification (all posts that exist in measurement window)
  const finals = pool.posts.filter((p) => p.createdAtMs > start - 60 * 24 * HOUR_MS).map((p) => p.upMs.length - p.downMs.length);
  const p99 = pct(finals, 99),
    p90 = pct(finals, 90);
  const out = {};
  for (const n of names) out[n] = { age1: [], age1NonSuper: 0, hours: 0, over48: 0, over72: 0, over7d: 0, over48NonSuper: 0, top3Stale: 0, top3AllFresh: 0, isNewest: 0, jac: [], r3pairs: 0, r3viol: 0, r3pairsB: [0, 0], r3violB: [0, 0], streakMax: 0, atTop1Final: [] };
  const streak = {};
  for (let t = start; t <= end; t += HOUR_MS) {
    const elig = [];
    for (const p of pool.posts) {
      if (p.createdAtMs > t) break;
      if (p.createdAtMs <= t - 60 * 24 * HOUR_MS) continue;
      const nu = countLE(p.upMs, t),
        nd = countLE(p.downMs, t);
      elig.push({ p, nu, nd, net: nu - nd, age: (t - p.createdAtMs) / HOUR_MS });
    }
    if (!elig.length) continue;
    const newest = [...elig].sort((a, b) => b.p.createdAtMs - a.p.createdAtMs || (a.p.id < b.p.id ? 1 : -1)).slice(0, 10).map((x) => x.p.id);
    for (const n of names) {
      const sc = elig.map((e) => ({
        e,
        s: F[n]({
          up: e.nu, down: e.nd, net: e.net, ageHours: e.age, createdAtMs: e.p.createdAtMs, atMs: t,
          upTimes: e.p.upMs.slice(0, e.nu), downTimes: e.p.downMs.slice(0, e.nd), selfUp: 1,
        }),
      }));
      sc.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.e.p.id < b.e.p.id ? 1 : -1));
      const o = out[n];
      o.hours++;
      const t1 = sc[0].e;
      const finalNet1 = t1.p.upMs.length - t1.p.downMs.length;
      const sup = finalNet1 >= p99;
      o.age1.push(t1.age);
      if (t1.age > 48) { o.over48++; if (!sup) o.over48NonSuper++; }
      if (t1.age > 72) o.over72++;
      if (t1.age > 168) o.over7d++;
      if (sc.slice(0, 3).some((x) => x.e.age > 72 && x.e.p.upMs.length - x.e.p.downMs.length < p99)) o.top3Stale++;
      if (sc.slice(0, 3).every((x) => x.e.age < 48)) o.top3AllFresh++;
      if (t1.p.id === newest[0]) o.isNewest++;
      const top10 = sc.slice(0, 10).map((x) => x.e.p.id);
      const A = new Set(top10),
        B = new Set(newest);
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      o.jac.push(inter / (A.size + B.size - inter));
      // streak
      if (streak[n]?.id === t1.p.id) streak[n].len++;
      else streak[n] = { id: t1.p.id, len: 1 };
      o.streakMax = Math.max(o.streakMax, streak[n].len);
      // R3 pairs
      const rank = new Map(sc.map((x, i) => [x.e.p.id, i]));
      let bestNew = Infinity;
      for (const x of sc) if (x.e.age < 1.5 && x.e.net <= 1) bestNew = Math.min(bestNew, rank.get(x.e.p.id));
      if (bestNew < Infinity) {
        for (const x of sc) {
          if (x.e.age >= 4 && x.e.age <= 24 && x.e.net >= p90) {
            const b = x.e.age < 12 ? 0 : 1;
            o.r3pairs++; o.r3pairsB[b]++;
            if (bestNew < rank.get(x.e.p.id)) { o.r3viol++; o.r3violB[b]++; }
          }
        }
      }
    }
  }
  return { out, p90, p99, nPosts: pool.posts.length };
}

function poissonRun() {
  const scen = [
    { perDay: 0.75, k: 1, label: "0.75/day votes x1 (today)" },
    { perDay: 3, k: 3, label: "3/day votes x3" },
    { perDay: 10, k: 10, label: "10/day votes x10" },
    { perDay: 40, k: 30, label: "40/day votes x30" },
  ];
  const delays = { slow: { median: 5, sigma: 2.0 }, fast: { median: 1.5, sigma: 1.2 } };
  const names = ["baseline", "yikyak", "reddit", "gravity", "velocity"];
  const seeds = [11, 22];
  for (const dname of Object.keys(delays)) {
    for (const sc of scen) {
      console.log(`\n##### ${sc.label}  vote-delay=${dname}`);
      const agg = Object.fromEntries(names.map((n) => [n, null]));
      let info = null;
      for (const seed of seeds) {
        const pool = genPool({ ...sc, days: 100, seed, delay: delays[dname] });
        const res = evalPool(pool, names, { measureDays: 30 });
        info = `posts=${res.nPosts} p90net=${res.p90} p99net=${res.p99}`;
        for (const n of names) {
          const o = res.out[n];
          const a = (agg[n] ??= { age1: [], hours: 0, over48: 0, over72: 0, over7d: 0, over48NonSuper: 0, top3Stale: 0, top3AllFresh: 0, isNewest: 0, jac: [], r3pairs: 0, r3viol: 0, r3pairsB: [0, 0], r3violB: [0, 0], streakMax: 0 });
          a.age1.push(...o.age1); a.hours += o.hours; a.over48 += o.over48; a.over72 += o.over72; a.over7d += o.over7d;
          a.over48NonSuper += o.over48NonSuper; a.top3Stale += o.top3Stale; a.top3AllFresh += o.top3AllFresh; a.isNewest += o.isNewest;
          a.jac.push(...o.jac); a.r3pairs += o.r3pairs; a.r3viol += o.r3viol;
          a.r3pairsB[0] += o.r3pairsB[0]; a.r3pairsB[1] += o.r3pairsB[1]; a.r3violB[0] += o.r3violB[0]; a.r3violB[1] += o.r3violB[1];
          a.streakMax = Math.max(a.streakMax, o.streakMax);
        }
      }
      console.log(info);
      console.log("formula   | #1age p50/p90/max | >48h% (nonsuper) | >7d% | top3 stale% | top3 allFresh% | #1=newest% | jacNew | R3 viol% (4-12h / 12-24h) | maxStreak");
      for (const n of names) {
        const a = agg[n];
        const P = (x) => ((100 * x) / a.hours).toFixed(1);
        const r3 = a.r3pairs ? ((100 * a.r3viol) / a.r3pairs).toFixed(0) : "-";
        const r3a = a.r3pairsB[0] ? ((100 * a.r3violB[0]) / a.r3pairsB[0]).toFixed(0) : "-";
        const r3b = a.r3pairsB[1] ? ((100 * a.r3violB[1]) / a.r3pairsB[1]).toFixed(0) : "-";
        console.log(
          n.padEnd(9), "|",
          `${f1(pct(a.age1, 50))}/${f1(pct(a.age1, 90))}/${f1(Math.max(...a.age1))}`.padEnd(18), "|",
          `${P(a.over48)} (${P(a.over48NonSuper)})`.padEnd(16), "|",
          P(a.over7d).padEnd(5), "|", P(a.top3Stale).padEnd(11), "|", P(a.top3AllFresh).padEnd(14), "|",
          P(a.isNewest).padEnd(10), "|", (a.jac.reduce((x, y) => x + y, 0) / a.jac.length).toFixed(2).padEnd(6), "|",
          `${r3}% (${r3a}/${r3b}) n=${a.r3pairs}`.padEnd(26), "|", a.streakMax,
        );
      }
    }
  }
}

const mode = process.argv[2] ?? "real";
if (mode === "real") realReplay();
else if (mode === "hold") hold();
else if (mode === "poisson") poissonRun();
