import { sql } from "../scripts/sql-client.mjs";
import { writeFileSync } from "node:fs";
const DRY = !process.argv.includes("--go");
const users = await sql`SELECT * FROM users WHERE email LIKE '%@demo.platemaps.app' OR email LIKE '%@example.platemaps.app' OR email LIKE '%@example.com'`;
const ids = users.map(r => r.id);
const fks = await sql`SELECT c.conrelid::regclass::text t, a.attname col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.confrelid='users'::regclass`;
const snap = { users, related: {} };
for (const { t, col } of fks) {
  const rows = await sql.query(`SELECT * FROM ${t} WHERE ${col} = ANY($1)`, [ids]);
  const list = Array.isArray(rows) ? rows : rows.rows;
  if (list.length) snap.related[`${t}.${col}`] = list;
}
// posts touched by fake votes, so cached counters can be checked afterwards
const cols = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name='posts'`).map(r => r.column_name);
console.log("posts count-like cols:", cols.filter(c => /count|score|upvote|heart|vote/.test(c)).join(",") || "none");
for (const [k, v] of Object.entries(snap.related)) console.log(k, v.length);
writeFileSync(`probe/snapshot-fake-users-2026-09-29.json`, JSON.stringify(snap, null, 1));
console.log("users", ids.length, DRY ? "(dry run)" : "");
if (!DRY) {
  if (!ids.length) process.exit(0);
  const r = await sql`DELETE FROM users WHERE id = ANY(${ids}) AND (email LIKE '%@demo.platemaps.app' OR email LIKE '%@example.platemaps.app' OR email LIKE '%@example.com') RETURNING id`;
  console.log("deleted", r.length);
}
process.exit(0);
