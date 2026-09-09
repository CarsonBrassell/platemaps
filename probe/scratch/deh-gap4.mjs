import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { sql } from "../../scripts/sql-client.mjs";
const J = (p) => JSON.parse(readFileSync(p, "utf8")); const arr = (j) => Array.isArray(j) ? j : Object.values(j).find(Array.isArray);
// --- cell cut-off
const places = Object.values(J("data/serper-places.json")); const byCell = new Map(); for (const p of places) byCell.set(p.cell, (byCell.get(p.cell)??0)+1);
const h={exactly20:0,"21-39":0,"40":0,"41+":0,"<20":0}; for (const n of byCell.values()) h[n===20?"exactly20":n>=41?"41+":n===40?"40":n>20?"21-39":"<20"]++; console.log("restaurants-query cells by result count", h);
for (const q of ["bakery","bar","cafe"]) { const p=`data/serper-cells-${q}.json`; if (existsSync(p)) { const c=J(p); console.log(`  ${q} query cells:`, Array.isArray(c)?c.length:Object.keys(c).length); } }
// --- rebuild independent-looking list (same logic as gap3) and check each by name
const deh = arr(J("data/deh-facilities.json")); const excl = new Set(arr(J("data/deh-excluded.json")).map(e=>e.recordId));
const have = new Set([...arr(J("data/deh-resolved.json")), ...arr(J("data/existing-resolved.json"))].map(e => e.recordId ?? e.sourceKey?.replace(/^deh:/,"")).filter(Boolean));
const rows = await sql`select id, name, address, deh_record_id, source_key, listed, hold_reason from restaurants`;
for (const r of rows) { if (r.deh_record_id) have.add(r.deh_record_id); if (r.source_key?.startsWith("deh:")) have.add(r.source_key.slice(4)); }
const key = (addr) => { let a = (addr ?? "").toUpperCase().replace(/\b0+(\d)/g, "$1"); const m = /^(\d+)\s+([A-Z]*\s*)?([A-Z0-9]+)/.exec(a); if (!m) return null; const w = /^(N|S|E|W|NORTH|SOUTH|EAST|WEST)$/.test(m[2]?.trim()||"") ? m[3] : (m[2]?.trim() || m[3]); return m[1] + " " + w.replace(/(ST|ND|RD|TH)$/,""); };
const dbAddr = new Map(); for (const r of rows) { const k = key(r.address); if (k) (dbAddr.get(k) ?? dbAddr.set(k, []).get(k)).push(r); }
const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\b(the|llc|inc|restaurant|cafe|bar|grill|and|of|no|\d+)\b/g," ").replace(/\s+/g," ").trim();
const TYPES = new Set(["Restaurant Food Facility","Low Risk Food Facility"]);
const CHAIN = /starbucks|jamba|wingstop|sbarro|carls jr|subway|panda express|chipotle|domino|pizza hut|papa john|little caesar|jack in the box|taco bell|burger king|wendy|kfc|kentucky|popeye|el pollo loco|del taco|panera|chick.?fil|five guys|in.?n.?out|rubio|dunkin|7.?eleven|coffee bean|peet|cold stone|baskin|yogurtland|dairy queen|sonic|arby|raising cane|shake shack|habit|jersey mike|firehouse|togo|quizno|ihop|denny|applebee|chili|olive garden|red lobster|outback|bj.?s|cheesecake|p ?f ?chang|yard house|buffalo wild|marie callender|wienerschnitzel|filiberto|roberto|pressed juicery|ding tea|kung fu tea|sharetea|85 ?c|paris baguette|crumbl|nothing bundt|mcdonald|rally|church.?s|pollo|wahoo|islands|red robin|cpk|california pizza|corner bakery|einstein|noah|bruegger|blaze|mod pizza|pieology|round table|mountain mike|chuck e|dave.?busters|hooters|texas roadhouse|black angus|claim jumper|mimi|coco|elephant bar|panda|pick up stix|flame broiler|waba|yoshinoya|l&l|ono hawaiian|poke|lemonade|tender greens|sweetgreen|cava|luna grill|daphne|zoes|noodles|smashburger|carl|whataburger|fatburger|farmer boys|tommy|original tommy/i;
const VENUE = /hotel|resort|marriott|hilton|hyatt|fairmont|sheraton|westin|omni|casino|stadium|arena|petco park|safari park|club|golf|country club|yacht|university|college|school|hospital|medical|church|senior|convention|airport|terminal|navy|base|camp|ymca|museum|zoo|seaworld|legoland|fairground|theater|theatre|cinema|bowling|commissary|catering|market|deli|liquor|gas|chevron|arco|am pm|donut|bakery|coffee|espresso|juice|smoothie|nutrition|\btea\b|vi at|lounge|banquet|events?\b|snack|concession|cafeteria|kitchen llc/i;
const indep = [];
for (const f of deh) { if (f["Active Permit"] !== "Y" || f["Permit Status"] === "Expired" || !TYPES.has(f["Business Type"])) continue; const id=f["Record ID"]; if (have.has(id)||excl.has(id)) continue;
  const cands = dbAddr.get(key(f["Address"])) ?? []; const fn = norm(f["Record Name"]).split(" ").filter(w=>w.length>2);
  if (cands.find(r => { const rn = norm(r.name); return fn.some(w => rn.includes(w)) || cands.length===1; })) continue;
  const n=f["Record Name"]; if (CHAIN.test(n) || VENUE.test(n)) continue; indep.push(f); }
console.log("independent-looking", indep.length, "— checking each by name in DB");
let none = [], found = 0;
for (const f of indep) { const ws = norm(f["Record Name"]).split(" ").filter(w=>w.length>2).slice(0,2); if (!ws.length) { found++; continue; }
  const pat = "%" + ws.join("%") + "%"; const r = await sql`select id, name, address, listed from restaurants where name ilike ${pat} limit 3`;
  if (r.length) found++; else none.push(f); }
console.log({ nameFoundSomewhere: found, noRowAtAll: none.length });
const yr={}; for (const f of none){const y=+f["Record ID"].slice(3,7); const b=y>=2024?"2024+":y>=2020?"2020-23":y>=2010?"2010-19":"pre-2010"; yr[b]=(yr[b]??0)+1;} console.log("no-row by permit year", yr);
writeFileSync("probe/deh-unmatched-independent.json", JSON.stringify(none.map(f=>({recordId:f["Record ID"],name:f["Record Name"],address:f["Address"],city:f["City"],owner:f["Permit Owner Full Name"]})), null, 1));
console.log("sample of no-row (2020+):"); for (const f of none.filter(f=>+f["Record ID"].slice(3,7)>=2020).slice(0,25)) console.log(" ", f["Record ID"], "|", f["Record Name"], "|", f["Address"], f["City"]);
const c85 = await sql`select id, name, address, listed, hold_reason from restaurants where name ~* '85 ?(c|degrees)' or id::text = '5346'`; console.log("85C rows:", c85.map(r=>`${r.id} ${r.name} @ ${r.address} L=${r.listed} ${r.hold_reason??""}`).join("\n  "));
