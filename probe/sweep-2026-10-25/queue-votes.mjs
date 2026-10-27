import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
const sql = neon(process.env.DATABASE_URL);
const q = JSON.parse(readFileSync("probe/sweep-2026-10-25/reextract-queue.json", "utf8"));
const ids = q.map(x => String(x.id));
const v = await sql`SELECT restaurant_id, sum(yes_votes+no_votes)::int votes FROM dishes WHERE restaurant_id = ANY(${ids}) GROUP BY restaurant_id HAVING sum(yes_votes+no_votes) > 0`;
const p = await sql`SELECT count(DISTINCT restaurant_id)::int n FROM posts WHERE restaurant_id = ANY(${ids})`;
const hosts = {}; for (const x of q) { try { const h = new URL(x.url).hostname.replace(/^www\./,""); hosts[h]=(hosts[h]??0)+1; } catch {} }
console.log("queue", q.length, "with dish votes", v.length, v.slice(0,10), "with posts", p[0].n);
console.log(Object.entries(hosts).sort((a,b)=>b[1]-a[1]).slice(0,15));
