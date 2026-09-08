import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
for (const term of ["poke chop", "poké chop", "pho ca dao"]) {
  const needle = `%${term}%`;
  const folded = `%${term.replace(/['’`´]/g, "")}%`;
  const rows = await sql`
    SELECT r.name, r.neighborhood FROM restaurants r
    WHERE r.listed AND (
      (coalesce(r.name,'')||' '||coalesce(r.cuisine,'')||' '||coalesce(r.cuisine_tags,'')||' '||coalesce(r.neighborhood,'')) ILIKE ${needle}
      OR translate(coalesce(r.name,'')||' '||coalesce(r.cuisine,'')||' '||coalesce(r.cuisine_tags,'')||' '||coalesce(r.neighborhood,''), '''’\x60´','') ILIKE ${folded})
    ORDER BY r.name`;
  console.log(`"${term}" -> ${rows.length}: ${rows.map(r=>r.name+" ("+r.neighborhood+")").join(", ")}`);
}
