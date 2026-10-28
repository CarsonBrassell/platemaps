import { makeScore } from "./sim-velocity.mjs";
import { runSim } from "./harness.mjs";
const cfgs = [
  { name: "Hv12 exp24 b.5", cfg: { Hv: 12, F: { kind: "exp", Hp: 24 }, b: 0.5 } },
  { name: "Hv12 exp48 b.5", cfg: { Hv: 12, F: { kind: "exp", Hp: 48 }, b: 0.5 } },
  { name: "Hv24 exp48 b.5", cfg: { Hv: 24, F: { kind: "exp", Hp: 48 }, b: 0.5 } },
  { name: "Hv24 exp72 b.5", cfg: { Hv: 24, F: { kind: "exp", Hp: 72 }, b: 0.5 } },
  { name: "Hv24 pow.5 b.5", cfg: { Hv: 24, F: { kind: "pow", g: 0.5 }, b: 0.5 } },
  { name: "Hv24 pow1 b.5", cfg: { Hv: 24, F: { kind: "pow", g: 1 }, b: 0.5 } },
];
for (const { name, cfg } of cfgs) {
  console.log("\n###", name);
  for (const shape of ["uniform", "early", "late"]) {
    const r = runSim(makeScore({ ...cfg, excludeSelf: true }), { replayDays: 1, synthVotes: shape, label: "x" });
    console.log(shape.padEnd(8), r.synthetic.order.map((o) => `${o.rank}:${o.plate}`).join(" | "));
  }
}
