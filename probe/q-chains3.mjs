import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT r.id::text, r.name, r.neighborhood, r.lat, r.lng, r.listed,
         (SELECT count(*)::int FROM dishes d WHERE d.restaurant_id=r.id) AS dishes
  FROM restaurants r WHERE r.listed`;
console.log("listed rows:", rows.length);

const strict = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// 1. how many listed names carry diacritics / non-ascii
const accented = rows.filter((r) => /[^\x00-\x7F]/.test(r.name));
console.log(`\n1) listed names with non-ASCII characters: ${accented.length}`);
const diacritic = rows.filter((r) => strict(r.name) !== fold(r.name));
console.log(`   of which the accent actually changes the folded key: ${diacritic.length}`);
console.log("   sample:", diacritic.slice(0,15).map(r=>r.name).join(" | "));

// 2. groups that MERGE only once accents are folded
const byStrict = new Map(), byFold = new Map();
for (const r of rows) {
  (byStrict.get(strict(r.name)) ?? byStrict.set(strict(r.name), []).get(strict(r.name))).push(r);
  (byFold.get(fold(r.name)) ?? byFold.set(fold(r.name), []).get(fold(r.name))).push(r);
}
let newlyMerged = 0, newlyMergedRows = 0;
for (const [k, v] of byFold) {
  const distinctStrict = new Set(v.map((r) => strict(r.name)));
  if (v.length >= 2 && distinctStrict.size > 1) { newlyMerged++; newlyMergedRows += v.length;
    if (newlyMerged <= 15) console.log(`   + ${v.map(r=>`${r.name} (${r.neighborhood}, ${r.dishes}d)`).join("  ||  ")}`); }
}
console.log(`\n2) chain groups invisible to the current normaliser but visible after accent-folding: ${newlyMerged} (${newlyMergedRows} rows)`);

// 3. split menu coverage, folded
const kmBetween=(a,b)=>{const la=(a.lat*Math.PI)/180;return Math.hypot((b.lat-a.lat)*111.32,(b.lng-a.lng)*111.32*Math.cos(la));};
let splitG=0, splitRows=0;
for (const [k,v] of byFold) {
  const w=v.filter(r=>r.dishes>0), n=v.filter(r=>r.dishes===0);
  if (w.length&&n.length){splitG++;splitRows+=n.length;}
}
console.log(`\n3) folded groups where some branches have a menu and others do not: ${splitG} groups, ${splitRows} menu-less branches`);

// 4. prefix chains: "Jilberto's" vs "Jilberto's Taco Shop"
const keys=[...byFold.keys()].filter(k=>k.length>=6);
let prefixPairs=[];
for (const a of keys) for (const b of keys) {
  if (a===b||b.length<=a.length) continue;
  if (b.startsWith(a) && b.length-a.length>=3) prefixPairs.push([a,b]);
}
console.log(`\n4) folded-name prefix relationships (possible same brand, different suffix): ${prefixPairs.length}`);
for (const [a,b] of prefixPairs.slice(0,20)) console.log(`   "${byFold.get(a)[0].name}" (${byFold.get(a).length}) ~ "${byFold.get(b)[0].name}" (${byFold.get(b).length})`);

// 5. size of the multi-location universe
const multi=[...byFold.values()].filter(v=>v.length>=2);
console.log(`\n5) listed restaurants that share a folded name with at least one other: ${multi.reduce((a,v)=>a+v.length,0)} rows in ${multi.length} brands`);
