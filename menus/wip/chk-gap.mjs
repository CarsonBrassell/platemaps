import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const [a] = await sql`SELECT COUNT(*)::int n FROM restaurants WHERE website IS NULL AND hold_reason IS NULL`;
const [b] = await sql`SELECT COUNT(*)::int n FROM restaurants r WHERE r.website IS NULL AND r.hold_reason IS NULL
  AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM menu_lookups m WHERE m.restaurant_id=r.id)`;
console.log(`no website at all: ${a.n}`);
console.log(`no website AND no menu AND no ledger row (the real target): ${b.n}`);
