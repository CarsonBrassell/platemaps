// One-off: create event_tickets (Pizza on Pearl free slice) on its own,
// without running the rest of scripts/migrate.mjs. Additive only.
// Run from the repo root: node --env-file=.env.local probe/run-ddl-event-tickets.mjs
import { readFileSync } from "node:fs";
import { sql, usingLocalPostgres } from "../scripts/sql-client.mjs";

const ddl = readFileSync(new URL("./ddl-event-tickets.sql", import.meta.url), "utf8").trim().replace(/;$/, "");
if (ddl.includes(";") || !/^CREATE TABLE IF NOT EXISTS event_tickets/.test(ddl)) throw new Error("unexpected DDL");
console.log(usingLocalPostgres ? "→ local Postgres" : "→ Neon");
await sql.query(ddl);
const cols = await sql.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'event_tickets' ORDER BY ordinal_position",
);
const n = await sql.query("SELECT count(*)::int AS n FROM event_tickets");
console.log("columns:", cols.map((c) => c.column_name).join(", "), "| rows:", n[0].n);
