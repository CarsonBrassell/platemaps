/*
 * One /maps call, to answer one question: does Google's Maps listing carry a
 * `website` for a restaurant whose site organic /search could not find? The
 * 1,230 rows find-websites.mjs gives up on are all already cached from the
 * free tier, so re-running that script buys nothing - the only open question
 * is whether a different endpoint holds the answer. Costs 1 credit.
 */
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const key = process.env.SERPER_API_KEY;
if (!key) { console.error("no key"); process.exit(1); }

const [r] = await sql`SELECT id, name, address FROM restaurants WHERE id = '205'`;
console.log(`probe: ${r.name} / ${r.address}`);

const res = await fetch("https://google.serper.dev/maps", {
  method: "POST",
  headers: { "X-API-KEY": key, "Content-Type": "application/json" },
  body: JSON.stringify({ q: `${r.name} ${r.address}`, gl: "us", hl: "en" }),
});
const j = await res.json();
const top = (j.places ?? [])[0];
if (!top) { console.log("no places in response; keys:", Object.keys(j)); process.exit(0); }
console.log("result keys:", Object.keys(top).join(", "));
for (const k of ["title", "address", "website", "phoneNumber", "placeId", "cid", "rating", "ratingCount"])
  console.log(`  ${k}: ${String(top[k] ?? "").slice(0, 60)}`);
console.log("credits this call: 1");
