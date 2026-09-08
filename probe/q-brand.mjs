import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id::text,name,neighborhood,city,lat,lng FROM restaurants WHERE listed`;
const hoods = new Set(rows.map(r=>(r.neighborhood||"").toLowerCase()).filter(Boolean));
for (const c of rows.map(r=>(r.city||"").toLowerCase())) if (c) hoods.add(c);
const fold = (s)=>s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const strip = (name) => {
  let n = fold(name).replace(/\s*\((?:[^)]*)\)\s*$/,"").trim();
  // trailing " - X" or " X" where X is a neighborhood/city
  for (const sep of [" - ", " – ", " — ", ", ", " "]) {
    const i = n.lastIndexOf(sep);
    if (i <= 0) continue;
    const tail = n.slice(i + sep.length).trim();
    if (tail && hoods.has(tail)) { n = n.slice(0, i).trim(); break; }
  }
  return n.replace(/[^a-z0-9]/g,"");
};
const groups = new Map();
for (const r of rows) { const k = strip(r.name); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); }
const multi=[...groups.values()].filter(v=>v.length>=2);
console.log(`brands with >=2 listed locations: ${multi.length}, covering ${multi.reduce((a,v)=>a+v.length,0)} listed rows`);
// what the suffix strip newly merged vs plain fold
const plain = new Map();
for (const r of rows){const k=fold(r.name).replace(/[^a-z0-9]/g,"");if(!plain.has(k))plain.set(k,[]);plain.get(k).push(r);}
const plainMulti=[...plain.values()].filter(v=>v.length>=2);
console.log(`  (plain accent-fold only: ${plainMulti.length} brands, ${plainMulti.reduce((a,v)=>a+v.length,0)} rows)`);
let n=0;
for (const [k,v] of groups) { const ks=new Set(v.map(r=>fold(r.name).replace(/[^a-z0-9]/g,""))); if(v.length>=2&&ks.size>1){n++; if(n<=25) console.log("   merged:", v.map(r=>r.name+" ("+r.neighborhood+")").join(" || "));}}
console.log(`suffix strip merged ${n} extra brands`);
