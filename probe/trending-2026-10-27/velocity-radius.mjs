import { loadSnapshot, nearbyDensity } from "./harness.mjs";
const snap = loadSnapshot();
for (const r of [5, 10, 15]) {
  const d = nearbyDensity(snap, snap.generatedAtMs, r);
  console.log(`${r} mi:`, ["densestCluster", "sdsu", "downtown"].map((k) => `${d[k].label.split(" ")[0]} 7d ${d[k].last7Days}/30d ${d[k].last30Days}/60d ${d[k].last60Days}`).join(" | "));
}
