/*
 * Asks Overpass for the `website` tag of the OSM-sourced rows that have no
 * website in our own table. Free, keyless, open data (ODbL) - and precise,
 * because source_key already carries the exact element id ("osm:node/365318064"),
 * so this is an id lookup, not a fuzzy name match.
 *
 * Purpose: shrink the Serper bill before paying it. 310 of the 1,139 no-website
 * gap rows came from OSM, and OSM's own `website` / `contact:website` tags were
 * evidently not imported. Any row filled in here is a row Serper never has to
 * search for.
 *
 * READ-ONLY. Writes probe/osm-websites.json and changes nothing in the DB.
 */
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, name, source_key, review_count
  FROM restaurants r
  WHERE r.hold_reason IS NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND r.website IS NULL AND r.source_key LIKE 'osm:%'
    AND NOT EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id::text)`;

const byElement = new Map();
const nodes = [], ways = [], rels = [];
for (const r of rows) {
  const m = String(r.source_key).match(/^osm:(node|way|relation)\/(\d+)$/);
  if (!m) continue;
  byElement.set(`${m[1]}/${m[2]}`, r);
  (m[1] === "node" ? nodes : m[1] === "way" ? ways : rels).push(m[2]);
}
console.log(`${rows.length} rows, ${byElement.size} with a parseable element id (${nodes.length} nodes, ${ways.length} ways, ${rels.length} relations)`);

const parts = [];
if (nodes.length) parts.push(`node(id:${nodes.join(",")});`);
if (ways.length) parts.push(`way(id:${ways.join(",")});`);
if (rels.length) parts.push(`relation(id:${rels.join(",")});`);
const q = `[out:json][timeout:180];(${parts.join("")});out tags;`;

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    // Overpass answers 406 to a request with no User-Agent.
    "User-Agent": "PlateMaps/1.0 (San Diego menu coverage; contact via github)",
    Accept: "application/json",
  },
  body: new URLSearchParams({ data: q }),
});
if (!res.ok) { console.error(`Overpass returned HTTP ${res.status}`); process.exit(1); }
const json = await res.json();
console.log(`Overpass returned ${json.elements?.length ?? 0} elements`);

const found = [];
for (const el of json.elements ?? []) {
  const r = byElement.get(`${el.type}/${el.id}`);
  if (!r) continue;
  const t = el.tags ?? {};
  const site = t.website || t["contact:website"] || t.url || t["contact:url"];
  if (site) found.push({ restaurantId: String(r.id), name: r.name, reviewCount: r.review_count, website: site, osm: `${el.type}/${el.id}` });
}
found.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
writeFileSync("probe/osm-websites.json", JSON.stringify(found, null, 2));
console.log(`\n${found.length} of ${byElement.size} have a website tag in OSM (${(100*found.length/byElement.size).toFixed(1)}%)`);
console.log("top 10:");
found.slice(0, 10).forEach(f => console.log(`   ${f.name} (${f.reviewCount ?? 0} rev) -> ${f.website}`));
console.log("\nwrote probe/osm-websites.json");
