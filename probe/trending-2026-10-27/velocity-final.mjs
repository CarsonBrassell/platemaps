// Final report for the chosen velocity config. node probe/trending-2026-10-27/velocity-final.mjs
import { makeScore, customChecks } from "./sim-velocity.mjs";
import { runSim, printReport, baselineScore, CENTERS } from "./harness.mjs";

export const CHOSEN = { Hv: 24, F: { kind: "pow", g: 1 }, b: 0.3, excludeSelf: true };
const score = makeScore(CHOSEN);

console.log("##### CHOSEN velocity: Hv=24h, F=(age+2)^-1, b=0.3, author seed excluded #####");
const r = runSim(score, { label: "velocity Hv24 pow1 b0.3" });
printReport(r);

console.log("\n##### synthetic ranks under each vote-time shape #####");
for (const shape of ["uniform", "early", "late"]) {
  const s = runSim(score, { replayDays: 1, synthVotes: shape, label: "x" });
  console.log(shape.padEnd(8), s.synthetic.order.map((o) => `${o.rank}:${o.plate}`).join(" | "));
}
const cc = customChecks(score);
console.log("\ncustom checks:");
cc.checks.forEach((c) => console.log(c.pass ? "PASS" : "FAIL", c.name));

console.log("\n##### nearby (5 mi) top 10 now: velocity vs New vs baseline #####");
const centers = { ...CENTERS, densest: { label: "densest cluster", lat: 32.8395, lng: -117.2762 } };
for (const [k, c] of Object.entries(centers)) {
  const v = runSim(score, { center: c, label: "v" });
  const b = runSim(baselineScore, { center: c, label: "b" });
  const n = v.newTop10.map((x) => x.id.slice(0, 6));
  const vt = v.currentTop10.map((x) => x.id.slice(0, 6));
  const bt = b.currentTop10.map((x) => x.id.slice(0, 6));
  console.log(`\n[${k}] velocity vs New hourly Jaccard ${v.replay.jaccardTrendingVsNewHourly.mean} | #1 age p50 ${v.replay.numberOneAgeHours.p50} max ${v.replay.numberOneAgeHours.max} | >48h ${v.replay.pctHoursNumberOneOlderThan48h}% | eligible now ${v.meta.eligibleCount ?? "?"}`);
  console.log("  velocity top10:", vt.join(" "));
  console.log("  baseline top10:", bt.join(" "));
  console.log("  new top10     :", n.join(" "));
}

console.log("\n##### sensitivity: b, Hv, withSelf #####");
for (const cfg of [
  { ...CHOSEN, b: 0.25 }, { ...CHOSEN, b: 0.35 }, { ...CHOSEN, Hv: 18, b: 0.25 }, { ...CHOSEN, Hv: 36, b: 0.3 },
  { ...CHOSEN, excludeSelf: false }, { ...CHOSEN, excludeSelf: false, b: 0.25 },
]) {
  const f = makeScore(cfg);
  const x = runSim(f, { label: "x" });
  const k = customChecks(f);
  console.log(`Hv=${cfg.Hv} b=${cfg.b} ${cfg.excludeSelf ? "noSelf" : "withSelf"} | jac ${x.replay.jaccardTrendingVsNewHourly.mean} | #1 p50 ${x.replay.numberOneAgeHours.p50} max ${x.replay.numberOneAgeHours.max} | checks ${k.checks.filter((c) => c.pass).length}/${k.checks.length} ${k.checks.filter((c) => !c.pass).map((c) => c.name.slice(0, 50)).join(" | ")}`);
}
