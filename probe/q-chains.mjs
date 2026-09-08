import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT r.id::text, r.name, r.neighborhood, r.address, r.lat, r.lng,
         r.listed, r.hold_reason, r.source_key,
         (SELECT count(*)::int FROM dishes d WHERE d.restaurant_id = r.id) AS dishes
  FROM restaurants r`;
console.log("total rows", rows.length);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const by = new Map();
for (const r of rows) {
  const k = norm(r.name);
  if (!by.has(k)) by.set(k, []);
  by.get(k).push(r);
}

// A. pork chop / poke
console.log("\n=== name search: pork chop / poke chop ===");
for (const r of rows) {
  if (/pork ?chop|poke ?chop/i.test(r.name))
    console.log(` ${r.id}  listed=${r.listed}  dishes=${r.dishes}  src=${(r.source_key||"").split(":")[0]}  hold=${r.hold_reason ?? "-"}  ${r.name} | ${r.neighborhood} | ${r.address}`);
}

// B. chain groups
const groups = [...by.entries()].filter(([, v]) => v.length >= 2)
  .map(([k, v]) => ({
    k, name: v[0].name, total: v.length,
    listed: v.filter((r) => r.listed).length,
    held: v.filter((r) => r.hold_reason).length,
    listedWithMenu: v.filter((r) => r.listed && r.dishes > 0).length,
    listedNoMenu: v.filter((r) => r.listed && r.dishes === 0).length,
  }));
console.log(`\n=== chain groups (>=2 same normalized name): ${groups.length} groups, ${groups.reduce((a,g)=>a+g.total,0)} rows ===`);

const split = groups.filter((g) => g.listedWithMenu > 0 && g.listedNoMenu > 0);
console.log(`groups where SOME listed branches have a menu and others do not: ${split.length}`);
console.log(`  affected menu-less listed branches: ${split.reduce((a,g)=>a+g.listedNoMenu,0)}`);
for (const g of split.sort((a,b)=>b.listedNoMenu-a.listedNoMenu).slice(0,30))
  console.log(`   ${String(g.listedNoMenu).padStart(3)} without / ${g.listedWithMenu} with   ${g.name}`);

// C. chains partly held
const partly = groups.filter((g) => g.listed > 0 && g.held > 0);
console.log(`\n=== chains with SOME branches listed and SOME held: ${partly.length} ===`);
const reasons = new Map();
for (const g of partly) for (const r of by.get(g.k)) if (r.hold_reason) {
  const key = r.hold_reason.replace(/\(.*\)/, "(...)").slice(0, 60);
  reasons.set(key, (reasons.get(key) ?? 0) + 1);
}
console.log([...reasons].sort((a,b)=>b[1]-a[1]).slice(0,25));
for (const g of partly.sort((a,b)=>b.held-a.held).slice(0,25))
  console.log(`   listed ${g.listed} / held ${g.held}   ${g.name}`);
