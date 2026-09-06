import { sql } from "../scripts/sql-client.mjs";
const raws = await sql`SELECT coalesce(cuisine_raw,'(null)') raw, count(*)::int n
  FROM restaurants WHERE (cuisine IS NULL OR cuisine='') GROUP BY 1 ORDER BY 2 DESC`;
console.log(raws.map(r=>`${r.raw}=${r.n}`).join(", "));
