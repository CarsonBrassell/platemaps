import { runSim, loadSnapshot, CENTERS } from "./harness.mjs";
const snap = loadSnapshot();
// 1) pure "new": must reproduce New => jaccard 1 at every hour, #1 age = min age.
const r1 = runSim(({ createdAtMs }) => createdAtMs, { snapshot: snap, label: "pure new" });
console.log("pure-new jaccard now/mean/min:", r1.jaccardNow, r1.replay.jaccardTrendingVsNewHourly.mean, r1.replay.jaccardTrendingVsNewHourly.min, "| #1 age p50/max:", r1.replay.numberOneAgeHours.p50, r1.replay.numberOneAgeHours.max);
// 2) time-aware formula uses upTimes: count only votes in last 24h, exclude (null) posts older than 7d with <5 votes.
const r2 = runSim(({ upTimes, atMs, ageHours, net }) => (ageHours > 168 && net < 5 ? null : upTimes.filter((t) => atMs - t < 864e5).length / (ageHours + 2)), { snapshot: snap, label: "recent-votes", synthVotes: "late" });
console.log("recent-votes: excluded now", r2.meta.excludedNow, "top3", r2.currentTop10.slice(0,3).map(x=>x.id+"@"+x.ageHours+"h").join(","), "synthetic #1:", r2.synthetic.order[0].plate);
// 3) nearby
const r3 = runSim(({ up, down, ageHours }) => (Math.max(up - down, 0) + 1) / (ageHours + 2), { snapshot: snap, center: CENTERS.sdsu, label: "baseline @SDSU" });
console.log("SDSU nearby eligible now:", r3.meta.eligibleNow, "top1 age p50:", r3.replay.numberOneAgeHours.p50, "hours with a post:", r3.replay.hoursWithAnyPost);
// 4) independent replay check: at the 100th hour, recount votes straight from the raw JSON.
import fs from "node:fs";
const raw = JSON.parse(fs.readFileSync(new URL("./snapshot.json", import.meta.url)));
const t = Math.floor(Date.parse(raw.generatedAt)/36e5)*36e5 - 200*36e5;
const live = raw.posts.filter(p => Date.parse(p.created_at) <= t && Date.parse(p.created_at) > t - 60*864e5);
const best = live.map(p => { const u = p.upTimes.filter(x=>Date.parse(x)<=t).length, d = p.downTimes.filter(x=>Date.parse(x)<=t).length; return { id:p.id.slice(0,8), s:(Math.max(u-d,0)+1)/((t-Date.parse(p.created_at))/36e5+2)}; }).sort((a,b)=>b.s-a.s)[0];
console.log("independent #1 at t-200h:", best.id, best.s.toFixed(4));
const r4 = runSim(({ up, down, ageHours }) => (Math.max(up - down, 0) + 1) / (ageHours + 2), { snapshot: snap, atMs: t, replayDays: 0 });
console.log("harness   #1 at t-200h:", r4.currentTop10[0].id, r4.currentTop10[0].score);
