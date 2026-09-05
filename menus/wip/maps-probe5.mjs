/* Five restaurants that almost certainly have a website, drawn from the 1,230
 * find-websites.mjs gave up on. Five credits, to see whether /maps carries the
 * field at all or whether the first probe was just a cash-only taco stand. */
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const key = process.env.SERPER_API_KEY;
const ids = ["407", "4408", "1700", "1493", "292"];
const rows = await sql`SELECT id, name, address FROM restaurants WHERE id = ANY(${ids})`;
let withSite = 0;
for (const r of rows) {
  const res = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: `${r.name} ${r.address}`, gl: "us", hl: "en" }),
  });
  const top = ((await res.json()).places ?? [])[0];
  const site = top?.website ?? "";
  if (site) withSite++;
  console.log(`${r.id.padEnd(6)} ${r.name.slice(0, 28).padEnd(30)} ${site || "(no website field)"}`);
}
console.log(`\n${withSite}/${rows.length} carried a website. 5 credits spent.`);
