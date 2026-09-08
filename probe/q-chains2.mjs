import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT hold_reason, listed, source_key FROM restaurants`;
const tally = (f) => { const m = new Map(); for (const r of rows) { const k = f(r); m.set(k, (m.get(k)??0)+1);} return [...m].sort((a,b)=>b[1]-a[1]); };
console.log("=== hold_reason (all rows) ===");
for (const [k,n] of tally(r => r.hold_reason ? r.hold_reason.replace(/\(.*/, "(...)").replace(/duplicate of \d+/, "duplicate of N") : "(none - listed)")) console.log(String(n).padStart(6), k);
console.log("\n=== source : rows / listed ===");
const bySrc = new Map();
for (const r of rows) { const k = (r.source_key||"?").split(":")[0]; const v = bySrc.get(k) ?? [0,0]; v[0]++; if (r.listed) v[1]++; bySrc.set(k,v); }
for (const [k,v] of [...bySrc].sort((a,b)=>b[1][0]-a[1][0])) console.log(String(v[0]).padStart(6), String(v[1]).padStart(6), k);
