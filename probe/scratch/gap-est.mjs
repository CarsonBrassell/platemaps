import { readFileSync, existsSync } from "node:fs";
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const places = J("data/serper-places.json"); const arr = Array.isArray(places) ? places : Object.values(places);
const byCell = new Map(); for (const p of arr) { const k = p.cell ?? "?"; byCell.set(k, (byCell.get(k) ?? 0) + 1); }
const hist = {}; for (const n of byCell.values()) { const b = n >= 40 ? "40+" : n >= 20 ? "20-39" : "<20"; hist[b] = (hist[b] ?? 0) + 1; }
console.log("places", arr.length, "cells", byCell.size, "per-cell hist", hist);
const deep = existsSync("data/serper-deep.json") ? J("data/serper-deep.json") : null;
console.log("deep cells", deep ? (Array.isArray(deep) ? deep.length : Object.keys(deep).length) : "none");
const types = {}; for (const p of arr) types[p.type] = (types[p.type] ?? 0) + 1;
console.log("top types:", Object.entries(types).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([t,n])=>`${t}=${n}`).join(", "));
const dessert = arr.filter(p => /ice cream|dessert|frozen yogurt|boba|bubble tea|juice|gelato|donut|bakery|cafe|coffee|tea house|cake|shaved ice|acai/i.test([p.type,...(p.types??[])].join(" ")));
console.log("dessert/cafe-ish in discovery:", dessert.length);
const cm = J("data/coverage-missing.json"); const cmArr = Array.isArray(cm) ? cm : (Object.values(cm).find(Array.isArray) ?? []);
console.log("coverage-missing top-level:", Array.isArray(cm) ? "array" : Object.keys(cm).slice(0,10), "count", cmArr.length);
const t2 = {}; for (const e of cmArr) t2[e.type] = (t2[e.type] ?? 0) + 1; console.log("coverage-missing by type", t2);
const s2 = {}; for (const e of cmArr) s2[e.permitStatus] = (s2[e.permitStatus] ?? 0) + 1; console.log("coverage-missing by status", s2);
const deh = J("data/deh-facilities.json"); const dehArr = Array.isArray(deh) ? deh : (Object.values(deh).find(Array.isArray) ?? []);
console.log("deh facilities", dehArr.length);
for (const r of dehArr) { const s = JSON.stringify(r); if (/MONTEZUMA RD 130|TOPAZ/i.test(s)) console.log("DEH:", s.slice(0,250)); }
