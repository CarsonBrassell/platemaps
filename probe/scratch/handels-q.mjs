import { sql } from "../../scripts/sql-client.mjs";
const rows = await sql`select * from restaurants where name ilike '%handel%' order by name`;
for (const r of rows) { const o = {}; for (const [k,v] of Object.entries(r)) if (v !== null && !['description','hours','menu','photos'].includes(k)) o[k] = typeof v === 'string' && v.length > 120 ? v.slice(0,120)+'…' : v; console.log(JSON.stringify(o)); }
console.log('count', rows.length);
