import { sql } from "../scripts/sql-client.mjs";
const listedGate = "hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL";
const [tot] = await sql`SELECT count(*)::int total,
  count(*) FILTER (WHERE cuisine IS NULL OR cuisine='')::int no_cuisine,
  count(*) FILTER (WHERE hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL)::int listed,
  count(*) FILTER (WHERE hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL AND (cuisine IS NULL OR cuisine=''))::int listed_no_cuisine
  FROM restaurants`;
console.log("TOTALS", tot);
const bySrc = await sql`SELECT split_part(source_key,':',1) src, count(*)::int listed,
  count(*) FILTER (WHERE cuisine IS NULL OR cuisine='')::int no_cuisine
  FROM restaurants WHERE hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
  GROUP BY 1 ORDER BY 3 DESC`;
console.table(bySrc);
const raws = await sql`SELECT coalesce(cuisine_raw,'(null)') raw, count(*)::int n,
  count(*) FILTER (WHERE cuisine_tags IS NOT NULL AND cuisine_tags<>'')::int with_tags
  FROM restaurants WHERE hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL AND (cuisine IS NULL OR cuisine='')
  GROUP BY 1 ORDER BY 2 DESC LIMIT 40`;
console.table(raws);
const dist = await sql`SELECT cuisine, count(*)::int n FROM restaurants WHERE hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`;
console.table(dist);
const [menu] = await sql`SELECT count(*)::int listed_no_cuisine_with_menu FROM restaurants r
  WHERE hold_reason IS NULL AND lat IS NOT NULL AND lng IS NOT NULL AND (cuisine IS NULL OR cuisine='')
  AND EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id=r.id)`.catch(e=>[{err:e.message.slice(0,120)}]);
console.log(menu);
