import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = JSON.parse(fs.readFileSync('probe/snapshots/hold-retail-2026-11-03.json', 'utf8'));
for (const r of rows) {
  await sql.query("UPDATE restaurants SET hold_reason = $2, listed = $3 WHERE id = $1 AND hold_reason = 'menu_enrich: retail'", [r.id, r.hold_reason, r.listed]);
}
const back = await sql`SELECT id, name, listed, hold_reason FROM restaurants WHERE id = ANY(${rows.map((r) => r.id)})`;
console.log(back.map((r) => `${r.id} ${r.name} listed=${r.listed} hold=${r.hold_reason}`).join('\n'));
