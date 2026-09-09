import { sql } from "../../scripts/sql-client.mjs";
const rows = await sql`select id, name, address, neighborhood, listed, hold_reason, source_key, google_place_id from restaurants where address ilike '%5824 montezuma%' or (address ilike '%montezuma%' and neighborhood ilike '%college%') order by id`;
console.log(JSON.stringify(rows, null, 1));
const near = await sql`select count(*)::int as n, count(*) filter (where listed) ::int as listed from restaurants where lat between 32.76 and 32.785 and lng between -117.09 and -117.06`;
console.log('near SDSU box', JSON.stringify(near));
