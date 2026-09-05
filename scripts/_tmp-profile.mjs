import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT r.id::text, r.source_key, r.name, r.address, r.city, r.listed,
         r.latitude, r.longitude,
         (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id) AS dishes
  FROM restaurants r
  WHERE r.google_place_id IS NULL AND r.hold_reason IS NULL
  ORDER BY r.id`;
const has = (v) => v !== null && String(v).trim() !== "";
const n = rows.length;
const withAddr = rows.filter(r => has(r.address)).length;
const listed = rows.filter(r => r.listed).length;
const withDishes = rows.filter(r => Number(r.dishes) > 0).length;
const noPin = rows.filter(r => !has(r.latitude) || !has(r.longitude)).length;
const noCity = rows.filter(r => !has(r.city)).length;
console.log({ n, withAddr, noAddr: n - withAddr, listed, withDishes, noPin, noCity });
const cross = {};
for (const r of rows) {
  const k = `${r.listed ? "listed" : "unlisted"}/${has(r.address) ? "addr" : "noaddr"}/${Number(r.dishes) > 0 ? "dishes" : "nodishes"}`;
  cross[k] = (cross[k] ?? 0) + 1;
}
console.log(cross);
const srcs = {};
for (const r of rows) { const s = String(r.source_key||"").split(":")[0]; srcs[s] = (srcs[s]??0)+1; }
console.log(srcs);
console.log("sample listed+dishes+addr:");
for (const r of rows.filter(r=>r.listed && Number(r.dishes)>0 && has(r.address)).slice(0,5)) console.log(" ", r.id, r.name, "|", r.address, "|", r.city, "|", r.dishes);
console.log("sample listed no addr:");
for (const r of rows.filter(r=>r.listed && !has(r.address)).slice(0,5)) console.log(" ", r.id, r.name, "|", r.city, "|", r.dishes);
