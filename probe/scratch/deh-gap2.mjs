import { readFileSync } from "node:fs";
import { sql } from "../../scripts/sql-client.mjs";
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const arr = (j) => Array.isArray(j) ? j : Object.values(j).find(Array.isArray);
const resolved = J("data/deh-resolved.json"), queue = J("data/deh-queue.json"), existing = J("data/existing-resolved.json");
const R = arr(resolved), Q = arr(queue), E = arr(existing);
console.log("resolved", R.length, "keys", Object.keys(R[0]).join(","), "\n  sample", JSON.stringify(R[0]).slice(0,300));
console.log("queue", Q.length, "keys", Object.keys(Q[0]).join(","));
console.log("existing-resolved", E.length, "keys", Object.keys(E[0]).join(","), "\n  sample", JSON.stringify(E[0]).slice(0,300));
const deh = arr(J("data/deh-facilities.json")); const excl = new Set(arr(J("data/deh-excluded.json")).map(e=>e.recordId));
const rows = await sql`select id, name, address, deh_record_id, source_key, lat, lng, listed from restaurants`;
const have = new Set(); for (const r of rows) { if (r.deh_record_id) have.add(r.deh_record_id); if (r.source_key?.startsWith("deh:")) have.add(r.source_key.slice(4)); }
const idOf = (e) => e.recordId ?? e.sourceKey?.replace(/^deh:/, "") ?? e["Record ID"];
for (const e of R) have.add(idOf(e)); for (const e of E) have.add(idOf(e));
const TYPES = new Set(["Restaurant Food Facility","Low Risk Food Facility"]);
// street-number+first-word index of DB rows for fuzzy match
const key = (addr) => { const m = /^(\d+)\s+([A-Za-z0-9]+)/.exec((addr ?? "").toUpperCase()); return m ? m[1]+" "+m[2] : null; };
const dbAddr = new Map(); for (const r of rows) { const k = key(r.address); if (k) (dbAddr.get(k) ?? dbAddr.set(k, []).get(k)).push(r); }
const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\b(the|llc|inc|restaurant|cafe|bar|grill|and|&|#\d+|\d+)\b/g," ").replace(/\s+/g," ").trim();
let active=0, byId=0, byAddrName=0, byAddrOnly=0, unmatched=[];
for (const f of deh) {
  if (f["Active Permit"] !== "Y" || f["Permit Status"] === "Expired" || !TYPES.has(f["Business Type"])) continue;
  active++; const id = f["Record ID"]; if (have.has(id) || excl.has(id)) { byId++; continue; }
  const cands = dbAddr.get(key(f["Address"])) ?? [];
  const fn = norm(f["Record Name"]).split(" ").filter(w=>w.length>2);
  const hit = cands.find(r => { const rn = norm(r.name); return fn.some(w => rn.includes(w)); });
  if (hit) { byAddrName++; continue; }
  if (cands.length) { byAddrOnly++; }
  unmatched.push(f);
}
console.log({ active, matchedByIdOrRule: byId, matchedByAddrAndName: byAddrName, sameAddressDifferentName: byAddrOnly, trulyUnmatched: unmatched.length });
const CHAIN = /starbucks|jamba|wingstop|sbarro|carls jr|subway|panda express|chipotle|domino|pizza hut|papa john|little caesars|jack in the box|taco bell|burger king|wendy|kfc|popeyes|el pollo loco|del taco|panera|chick.fil|five guys|in.n.out|rubio|dunkin|7.eleven|coffee bean|peets|cold stone|baskin|yogurtland|dairy queen|sonic|arby|raising cane|shake shack|habit|jersey mike|firehouse|togo|quiznos|ihop|denny|applebee|chili|olive garden|red lobster|outback|bj s|cheesecake|pf chang|yard house|buffalo wild|marie callender|wienerschnitzel|filiberto|robertos|pressed juicery|ding tea|kung fu tea|sharetea|boba|85 c|paris baguette|crumbl|nothing bundt|salt.*straw|handel/i;
const VENUE = /hotel|resort|marriott|hilton|hyatt|fairmont|sheraton|westin|omni|casino|stadium|arena|club|golf|country club|yacht|university|college|school|hospital|medical|church|senior|convention|airport|terminal|navy|base|camp|ymca|museum|zoo|seaworld|legoland|fairground|theater|theatre|cinema|bowling|kitchen llc|commissary|catering|market|deli|liquor|gas|chevron|shell|arco|7 eleven|am pm|donut|bakery|coffee|espresso|juice|smoothie|nutrition|tea/i;
let chain=0, venue=0, indep=[];
for (const f of unmatched) { const n = f["Record Name"]; if (CHAIN.test(n)) chain++; else if (VENUE.test(n)) venue++; else indep.push(f); }
console.log({ chainLike: chain, venueOrNonRestaurant: venue, independentLooking: indep.length });
const yr = {}; for (const f of indep) { const y = +f["Record ID"].slice(3,7); const b = y>=2024?"2024+":y>=2020?"2020-23":"pre-2020"; yr[b]=(yr[b]??0)+1; } console.log("independent-looking by permit year", yr);
console.log("independent-looking sample:"); for (const f of indep.sort(()=>Math.random()-0.5).slice(0,30)) console.log(" ", f["Record ID"], "|", f["Record Name"], "|", f["Address"], f["City"]);
// Google-known rows absent from DEH feed at their street number
const dehAddr = new Set(deh.map(f => key(f["Address"]+" "+f["City"]) ?? key(f["Address"])).filter(Boolean));
const dehKeys = new Set(deh.map(f => key(f["Address"])).filter(Boolean));
for (const src of ["gmap:","sweep:","osm:","yelp:"]) { const rs = rows.filter(r => r.source_key?.startsWith(src) && r.listed); const absent = rs.filter(r => !r.deh_record_id && !dehKeys.has(key(r.address))); console.log(src, "listed", rs.length, "no permit at same street number", absent.length, `(${(100*absent.length/rs.length).toFixed(0)}%)`); }
// Salt & Straw check
const ss = await sql`select id, name, address, listed from restaurants where name ilike '%salt%straw%'`; console.log("Salt & Straw rows:", JSON.stringify(ss));
for (const n of ["Raki Raki","Blue Ocean Sushi","Swami","Meet Dumpling","Pho Xpress","Upper East","R Place"]) { const r = await sql`select id, name, address, listed from restaurants where name ilike ${'%'+n+'%'} limit 3`; console.log("check", n, "=>", r.map(x=>`${x.id} ${x.name} @ ${x.address} listed=${x.listed}`).join(" ; ") || "NONE"); }
