import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
for (const t of ["posts","post_upvotes","post_downvotes","comments"]) {
  const cols = await sql.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
  console.log(t, cols.map(c=>c.column_name+":"+c.data_type).join(", "));
  const n = await sql.query(`SELECT count(*)::int AS n FROM ${t}`);
  console.log("  rows:", n[0].n);
}
