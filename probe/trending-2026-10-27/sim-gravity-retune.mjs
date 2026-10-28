#!/usr/bin/env node
/**
 * "gravity-retune" candidate (2026-10-27).
 *
 * Family: HN-style  (votes) / (ageHours + T0)^G, retuned, plus
 *   - a soft negative branch (downvoted sinks BELOW neutral, never vanishes),
 *   - an exponential age tail past TS hours so a stale plate needs a lot of votes to stay up.
 *
 *   score = V(net) / (age + T0)^G * exp(-max(age - TS, 0) / TAU)
 *   V(n)  = n + 1            for n >= 0
 *         = 1 / (1 - n)      for n <  0     (n=-1 -> .5, -3 -> .25, -5 -> .167)
 *
 *   node probe/trending-2026-10-27/sim-gravity-retune.mjs            # grid + chosen report
 *   node probe/trending-2026-10-27/sim-gravity-retune.mjs --grid     # grid only
 *   node probe/trending-2026-10-27/sim-gravity-retune.mjs --chosen   # chosen report only
 */
import {
  runSim,
  printReport,
  loadSnapshot,
  baselineScore,
  computeStats,
  nearbyDensity,
  SYNTHETIC_PLATES,
  CENTERS,
  HOUR_MS,
  DAY_MS,
} from "./harness.mjs";

const snap = loadSnapshot();

// ---------------------------------------------------------------- formula --

export const mk = ({ T0, G, TS = 72, TAU = 0, soft = true }) => (p) => {
  const n = p.up - p.down;
  const v = soft ? (n >= 0 ? n + 1 : 1 / (1 - n)) : Math.max(n, 0) + 1;
  const a = Math.max(p.ageHours, 0);
  const tail = TAU ? Math.exp(-Math.max(a - TS, 0) / TAU) : 1;
  return (v / Math.pow(a + T0, G)) * tail;
};

// ---- analytic helpers (pure formula, independent of the replay) -----------
/** Net votes a plate of age `a` needs to tie a brand-new plate (0.5h old) with `freshNet`. */
function netToMatchFresh(f, a, freshNet = 1) {
  const target = f({ up: Math.max(freshNet, 0), down: Math.max(-freshNet, 0), ageHours: 0.5 });
  let lo = 0;
  let hi = 100000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const s = f({ up: mid, down: 0, ageHours: a });
    if (s >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}
/** Oldest age (h) at which a plate with `net` still outranks a brand-new +freshNet plate. */
function maxAgeBeating(f, net, freshNet = 1) {
  const target = f({ up: freshNet, down: 0, ageHours: 0.5 });
  let lo = 0.5;
  let hi = 24 * 60;
  if (f({ up: net, down: 0, ageHours: lo }) < target) return 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f({ up: net, down: 0, ageHours: mid }) >= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------- replay checks --
const countLE = (arr, t) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) lo = m + 1;
    else hi = m;
  }
  return lo;
};

/**
 * R3 on the real replay: an hour is a violation when a plate younger than 3h ranks
 * above a "well-voted" plate (net >= 3, the p90 of net) aged 3h..18h.
 */
function r3Replay(f, hours = 21 * 24) {
  const endMs = Math.floor(snap.generatedAtMs / HOUR_MS) * HOUR_MS;
  let pairs = 0;
  let viol = 0;
  let hoursWithPair = 0;
  let hoursViol = 0;
  for (let i = 0; i <= hours; i++) {
    const t = endMs - i * HOUR_MS;
    const rows = [];
    for (const p of snap.posts) {
      if (p.createdAtMs > t || p.createdAtMs <= t - 60 * DAY_MS) continue;
      const up = countLE(p.upMs, t);
      const down = countLE(p.downMs, t);
      const ageHours = (t - p.createdAtMs) / HOUR_MS;
      rows.push({ ageHours, net: up - down, s: f({ up, down, ageHours }) });
    }
    const fresh = rows.filter((r) => r.ageHours < 3);
    const strong = rows.filter((r) => r.net >= 3 && r.ageHours >= 3 && r.ageHours <= 18);
    if (!fresh.length || !strong.length) continue;
    hoursWithPair++;
    let any = false;
    for (const a of fresh)
      for (const b of strong) {
        pairs++;
        if (a.s > b.s) {
          viol++;
          any = true;
        }
      }
    if (any) hoursViol++;
  }
  return { pairs, viol, hoursWithPair, hoursViol };
}

// -------------------------------------------------------------- one row ----
function evaluate(name, f, opts = {}) {
  const r = runSim(f, { snapshot: snap, label: name, ...opts });
  const p = r.replay;
  const syn = r.synthetic;
  const rank = (label) => syn.order.find((o) => o.plate === label)?.rank;
  const checksPass = syn.checks.filter((c) => c.pass).length;
  return {
    name,
    r,
    streak: p.longestNumberOneStreak?.hours,
    age50: p.numberOneAgeHours.p50,
    age90: p.numberOneAgeHours.p90,
    ageMax: p.numberOneAgeHours.max,
    gt48: p.pctHoursNumberOneOlderThan48h,
    gt7d: p.pctHoursNumberOneOlderThan7d,
    lt24: p.pctHoursNumberOneYoungerThan24h,
    top3Avg: p.top3.avgDwellHoursPerRun,
    top3Max: p.top3.maxDwellHours,
    jacNow: r.jaccardNow,
    jacMean: p.jaccardTrendingVsNewHourly.mean,
    checks: `${checksPass}/5`,
    checksPass,
    rk7d10: rank("7d, +10"),
    rk7d100: rank("7d, +100"),
    rk2d40: rank("2d, +40"),
    rk5d30: rank("5d, +30"),
    rkNew0: rank("brand new, 0"),
  };
}


/** Synthetic checks across all three vote-time shapes; returns number of failed checks in total. */
function shapeFails(f) {
  let fails = 0;
  const detail = {};
  for (const shape of ["uniform", "early", "late"]) {
    const rs = runSim(f, { snapshot: snap, synthVotes: shape, replayDays: 0 });
    const bad = rs.synthetic.checks.filter((c) => !c.pass).map((c) => c.name.split(" ")[0]);
    fails += bad.length;
    detail[shape] = bad;
  }
  return { fails, detail };
}

const TD = (v, w = 6) => String(v ?? "-").padStart(w);

// ------------------------------------------------------------------ main ---
const argv = process.argv.slice(2);
const only = argv.includes("--fine") || argv.includes("--stale") || argv.includes("--lib");
const doGrid = argv.includes("--grid") || (!only && !argv.includes("--chosen") && !argv.includes("--nearby"));
const doChosen = argv.includes("--chosen") || (!only && !argv.includes("--grid") && !argv.includes("--nearby"));

if (argv.includes("--fine")) {
  console.log("=== fine grid, filtered: 0 failed synthetic checks across uniform/early/late, 7d+100 above brand-new-0, R3 age(+3)>=11.5h ===");
  console.log("T0   G    TS  TAU |  a50 >48h t3avg jMean | need2d need3d need5d need7d need14d | R3+3 R3+2 | 7d100 new0 | fails");
  const out = [];
  for (const T0 of [18, 20, 24, 28, 30, 36]) {
    for (const G of [1.2, 1.5, 1.6, 1.7, 1.8, 2.0]) {
      for (const TS of [48, 72]) {
        for (const TAU of [0, 48, 72, 96, 120, 168]) {
          if (TAU === 0 && TS === 48) continue;
          const cfg = { T0, G, TS, TAU, soft: true };
          const f = mk(cfg);
          const r3a3 = maxAgeBeating(f, 3);
          if (r3a3 < 11.5) continue;
          const e = evaluate("x", f, { replayDays: 21 });
          if (!(e.rk7d100 < e.rkNew0)) continue;
          const sf = shapeFails(f);
          if (sf.fails > 0) continue;
          out.push({ cfg, e, r3a3, r3a2: maxAgeBeating(f, 2), f });
        }
      }
    }
  }
  for (const { cfg, e, r3a3, r3a2, f } of out) {
    console.log(
      `${String(cfg.T0).padStart(2)} ${String(cfg.G).padStart(4)} ${String(cfg.TS).padStart(4)} ${String(cfg.TAU).padStart(4)} | ${TD(e.age50)} ${TD(e.gt48)} ${TD(e.top3Avg)} ${TD(e.jacMean)} | ` +
        [48, 72, 120, 168, 336].map((a) => TD(netToMatchFresh(f, a).toFixed(0), 7)).join("") +
        ` | ${TD(r3a3.toFixed(1))} ${TD(r3a2.toFixed(1))} | ${TD(e.rk7d100)} ${TD(e.rkNew0)} | 0`,
    );
  }
  console.log(`${out.length} configs pass`);
}

if (argv.includes("--stale")) {
  // Quiet-week scenario: the newest plate is L days old with net +2; a challenger 2 days OLDER has net N.
  // Who is #1?  (Tests "stale leader must be unseated only by something genuinely popular".)
  const cfgs = {
    baseline: baselineScore,
    "G2 T0=24 no-tail": mk({ T0: 24, G: 2, TAU: 0 }),
    "G1.5 T0=24 tail96": mk({ T0: 24, G: 1.5, TS: 72, TAU: 96 }),
    "G1.7 T0=24 tail96": mk({ T0: 24, G: 1.7, TS: 72, TAU: 96 }),
    "G1.5 T0=24 tail48": mk({ T0: 24, G: 1.5, TS: 72, TAU: 48 }),
  };
  for (const [name, f] of Object.entries(cfgs)) {
    console.log(`\n${name}: leader +2 aged L; challenger aged L+48h with net N -> challenger overtakes? (net needed)`);
    for (const L of [24, 72, 120, 168, 240]) {
      const lead = f({ up: 2, down: 0, ageHours: L });
      let lo = 0;
      let hi = 1e6;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (f({ up: mid, down: 0, ageHours: L + 48 }) >= lead) hi = mid;
        else lo = mid;
      }
      console.log(`   L=${String(L).padStart(3)}h (${(L / 24).toFixed(0)}d): challenger needs net >= ${hi.toFixed(1)}`);
    }
  }
}

export const CHOSEN = { T0: 24, G: 1.7, TS: 72, TAU: 96, soft: true };

if (doGrid) {
  console.log("=== floor + baseline ===");
  const floor = evaluate("FLOOR: pure New (created_at DESC)", (p) => p.createdAtMs);
  const base = evaluate("BASELINE: (max(net,0)+1)/(age+2)^1.0", baselineScore);
  const hdr =
    "name".padEnd(44) +
    ["str", "a50", "a90", "aMax", ">48h", ">7d", "<24h", "t3avg", "t3max", "jNow", "jMean", "chk", "7d10", "7d100", "2d40", "5d30", "new0"]
      .map((s) => s.padStart(6))
      .join("");
  console.log(hdr);
  const line = (e) =>
    e.name.padEnd(44) +
    [e.streak, e.age50, e.age90, e.ageMax, e.gt48, e.gt7d, e.lt24, e.top3Avg, e.top3Max, e.jacNow, e.jacMean, e.checks, e.rk7d10, e.rk7d100, e.rk2d40, e.rk5d30, e.rkNew0]
      .map((x) => TD(x))
      .join("");
  console.log(line(floor));
  console.log(line(base));

  console.log("\n=== grid: T0 (offset h) x G x tail ===");
  console.log(hdr + "   need@2d  need@3d  need@7d  R3age+3  R3age+2");
  const rows = [];
  const tails = [
    { TS: 72, TAU: 0, tag: "no-tail" },
    { TS: 72, TAU: 72, tag: "tail72" },
    { TS: 72, TAU: 48, tag: "tail48" },
    { TS: 72, TAU: 24, tag: "tail24" },
  ];
  for (const T0 of [2, 6, 12, 18, 24, 36]) {
    for (const G of [1.0, 1.2, 1.5, 1.8, 2.0]) {
      for (const t of tails) {
        const cfg = { T0, G, TS: t.TS, TAU: t.TAU, soft: true };
        const f = mk(cfg);
        const e = evaluate(`T0=${T0} G=${G} ${t.tag}`, f);
        e.cfg = cfg;
        e.need2d = netToMatchFresh(f, 48);
        e.need3d = netToMatchFresh(f, 72);
        e.need7d = netToMatchFresh(f, 168);
        e.r3a3 = maxAgeBeating(f, 3);
        e.r3a2 = maxAgeBeating(f, 2);
        rows.push(e);
      }
    }
  }
  for (const e of rows) {
    console.log(
      line(e) + [e.need2d, e.need3d, e.need7d, e.r3a3, e.r3a2].map((x) => TD(x >= 1e5 ? "inf" : x.toFixed(x < 10 ? 1 : 0), 9)).join(""),
    );
  }
  // shortlist
  console.log("\n=== shortlist: all 5 synthetic checks + 7d+100 above brand-new-0 + R3 age(+3) >= 12h ===");
  const keep = rows.filter(
    (e) => e.checksPass === 5 && e.rk7d100 < e.rkNew0 && e.r3a3 >= 12,
  );
  for (const e of keep) {
    console.log(
      line(e) + [e.need2d, e.need3d, e.need7d, e.r3a3, e.r3a2].map((x) => TD(x >= 1e5 ? "inf" : x.toFixed(x < 10 ? 1 : 0), 9)).join(""),
    );
  }
}

if (doChosen) {
  const f = mk(CHOSEN);
  console.log(`\n\n######## CHOSEN ${JSON.stringify(CHOSEN)} ########`);
  const r = runSim(f, {
    snapshot: snap,
    label: `gravity-retune: V(net)/(age+${CHOSEN.T0})^${CHOSEN.G} * exp(-max(age-${CHOSEN.TS},0)/${CHOSEN.TAU})`,
  });
  printReport(r);
  console.log("\n-- synthetic, other vote-time shapes --");
  for (const shape of ["early", "late"]) {
    const rs = runSim(f, { snapshot: snap, synthVotes: shape });
    console.log(shape, rs.synthetic.order.map((o) => `${o.rank}.${o.plate}`).join(" | "));
    console.log("  checks", rs.synthetic.checks.map((c) => (c.pass ? "P" : "F")).join(""));
  }
  console.log("\n-- break-even: net a plate of age A needs to tie a brand-new +1 plate (real seeded) --");
  for (const a of [6, 12, 24, 48, 72, 120, 168, 336, 720, 1440]) {
    console.log(`   ${String(a).padStart(5)}h  net >= ${netToMatchFresh(f, a).toFixed(1)}   (baseline: ${netToMatchFresh(baselineScore, a).toFixed(1)})`);
  }
  console.log("\n-- R3: oldest age (h) at which a well-voted plate still outranks a brand-new +1 plate --");
  for (const net of [2, 3, 4, 6, 10]) {
    console.log(`   net +${net}: ${maxAgeBeating(f, net).toFixed(1)}h   (baseline: ${maxAgeBeating(baselineScore, net).toFixed(1)}h)`);
  }
  const r3 = r3Replay(f);
  const r3b = r3Replay(baselineScore);
  console.log(`   replay (fresh <3h vs net>=3 aged 3-18h): chosen ${JSON.stringify(r3)}   baseline ${JSON.stringify(r3b)}`);

  console.log("\n-- real-data 'super popular' definition --");
  const st = computeStats(snap);
  console.log(`   net p50 ${st.netVotes.p50} p90 ${st.netVotes.p90} p99 ${st.netVotes.p99} max ${st.netVotes.max}; excl seed p99 ${st.netVotesExcludingAuthorSeed.p99}`);
  console.log("   typical #1 net (replay median) ~ 2-3, so >=3x => net >= 9-10; real max ever is 4, so nothing in the live data qualifies yet.");

  const floorR = runSim((p) => p.createdAtMs, { snapshot: snap, label: "floor" });
  const fp = floorR.replay;
  console.log(`\n-- floor (pure New): #1 age p50 ${fp.numberOneAgeHours.p50} p90 ${fp.numberOneAgeHours.p90} max ${fp.numberOneAgeHours.max}; >48h ${fp.pctHoursNumberOneOlderThan48h}%  >7d ${fp.pctHoursNumberOneOlderThan7d}%  longest #1 streak ${fp.longestNumberOneStreak.hours}h; top-3 avg stay ${fp.top3.avgDwellHoursPerRun}h max ${fp.top3.maxDwellHours}h`);
}

if (argv.includes("--nearby") || doChosen) {
  const f = mk(CHOSEN);
  console.log("\n\n######## NEARBY (5 mi filter) ########");
  const dens = nearbyDensity(snap);
  const centers = [
    { label: "densest cluster", lat: dens.densestCluster.lat, lng: dens.densestCluster.lng },
    CENTERS.sdsu,
    CENTERS.downtown,
  ];
  for (const radiusMi of [5, 10]) {
    for (const c of centers) {
      const center = { lat: c.lat, lng: c.lng };
      const a = evaluate(`chosen @${c.label} r=${radiusMi}`, f, { center, radiusMi });
      const b = evaluate(`baseline @${c.label} r=${radiusMi}`, baselineScore, { center, radiusMi });
      const fl = evaluate(`floor(New) @${c.label} r=${radiusMi}`, (p) => p.createdAtMs, { center, radiusMi });
      for (const e of [a, b, fl]) {
        console.log(
          `${e.name.padEnd(46)} eligible ${String(e.r.meta.eligibleNow).padStart(3)} | #1 age p50 ${e.age50} p90 ${e.age90} max ${e.ageMax} | >48h ${e.gt48}% >7d ${e.gt7d}% | streak ${e.streak}h | top3 avg ${e.top3Avg}h max ${e.top3Max}h | jacc now ${e.jacNow} mean ${e.jacMean}`,
        );
      }
    }
  }
}
