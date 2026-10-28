// Fine local sweep around the pow g=1 region found by the coarse grid. noSelf only.
import { makeScore } from "./sim-velocity.mjs";
import { runSim } from "./harness.mjs";
import * as sv from "./sim-velocity.mjs";
const out = [];
for (const Hv of [18, 24, 30, 36, 48])
  for (const g of [0.75, 1, 1.25])
    for (const b of [0.1, 0.25, 0.35, 0.5]) {
      const f = makeScore({ Hv, F: { kind: "pow", g }, b, excludeSelf: true });
      const r = runSim(f, { label: "x" });
      const c = sv.customChecks ? sv.customChecks(f) : null;
      out.push({ Hv, g, b, jac: r.replay.jaccardTrendingVsNewHourly.mean, p50: r.replay.numberOneAgeHours.p50, max: r.replay.numberOneAgeHours.max, gt48: r.replay.pctHoursNumberOneOlderThan48h, c });
    }
for (const o of out) console.log(`Hv=${o.Hv} g=${o.g} b=${o.b}  jac ${o.jac}  #1age p50 ${o.p50} max ${o.max} >48h ${o.gt48}%  ${o.c ? o.c.checks.filter(k=>k.pass).length + "/" + o.c.checks.length + " fails: " + o.c.checks.filter(k=>!k.pass).map(k=>k.name.slice(0,60)).join(" | ") : ""}`);
