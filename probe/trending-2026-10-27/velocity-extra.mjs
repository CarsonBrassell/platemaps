import { makeScore, extraReplay } from "./sim-velocity.mjs";
import { baselineScore, runSim } from "./harness.mjs";
const rows = [
  ["FLOOR created_at DESC", (p) => p.createdAtMs],
  ["BASELINE (net+1)/(age+2)", baselineScore],
  ["velocity Hv24 g1 b0.3 noSelf", makeScore({ Hv: 24, F: { kind: "pow", g: 1 }, b: 0.3, excludeSelf: true })],
  ["velocity Hv36 g1 b0.3 noSelf", makeScore({ Hv: 36, F: { kind: "pow", g: 1 }, b: 0.3, excludeSelf: true })],
];
for (const [n, f] of rows) {
  const x = extraReplay(f);
  const r = runSim(f, { label: n });
  console.log(n.padEnd(32), JSON.stringify(x), "jac", r.replay.jaccardTrendingVsNewHourly.mean, "#1changes/day", r.replay.numberOneChangesPerDay ?? "");
}
