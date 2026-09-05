import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT source_url, status FROM menu_lookups WHERE source_url IS NOT NULL`;
const tally = {};
for (const x of r) {
  let h = "?"; try { h = new URL(x.source_url).hostname.replace(/^www\./,""); } catch {}
  const k = /doordash/.test(h) ? "doordash" : /ubereats/.test(h) ? "ubereats"
    : /toasttab|order\.online/.test(h) ? "toast/order.online" : /square|clover/.test(h) ? "square/clover"
    : /grubhub|seamless|slice|chownow|menufy|beyondmenu/.test(h) ? "other-marketplace" : "own site";
  tally[k] = tally[k] || {found:0, other:0};
  if (x.status === "found") tally[k].found++; else tally[k].other++;
}
for (const [k,v] of Object.entries(tally).sort((a,b)=>b[1].found-a[1].found))
  console.log(`  ${k.padEnd(20)} found=${v.found}  other=${v.other}`);
