// 50 hand-picked San Diego restaurants -> what the DB knows about each.
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const picks = [
  ["Las Cuatro Milpas","cuatro milpas"],["Hodad's","hodad"],["Phil's BBQ","phil's bbq|phils bbq"],
  ["Lucha Libre Taco Shop","lucha libre"],["Oscar's Mexican Seafood","oscar's mexican|oscars mexican"],
  ["Tacos El Gordo","tacos el gordo"],["Juniper & Ivy","juniper"],["Born and Raised","born and raised|born & raised"],
  ["Addison","addison"],["Callie","callie"],["Cesarina","cesarina"],["Buona Forchetta","buona forchetta"],
  ["Kettner Exchange","kettner exchange"],["Ironside Fish & Oyster","ironside"],["The Crack Shack","crack shack"],
  ["Sushi Ota","sushi ota"],["Wrench and Rodent","wrench"],["Tahona","tahona"],["El Indio","el indio"],
  ["The Mission","the mission"],["Snooze","snooze"],["Hash House A Go Go","hash house"],
  ["Morning Glory","morning glory"],["Underbelly","underbelly"],["Tajima Ramen","tajima"],
  ["Menya Ultra","menya ultra"],["Steamy Piggy","steamy piggy"],["Pho Ca Dao","pho ca dao"],
  ["Punjabi Tandoor","punjabi tandoor"],["Sab-E-Lee","sab-e-lee|sab e lee"],["Supannee House of Thai","supannee"],
  ["Mama's Bakery & Lebanese Deli","mama's bakery|mamas bakery"],["Kous Kous","kous kous"],
  ["Blue Water Seafood","blue water seafood|bluewater seafood"],["Pacific Beach Fish Shop","fish shop"],
  ["Cucina Urbana","cucina urbana"],["Mister A's","mister a"],["Herb & Wood","herb & wood|herb and wood"],
  ["Animae","animae"],["Puesto","puesto"],["George's at the Cove","george's at the cove|georges at the cove"],
  ["El Pescador Fish Market","el pescador"],["Barbarella","barbarella"],["Carnitas' Snack Shack","carnitas"],
  ["Rocky's Crown Pub","rocky's crown|rockys crown"],["Kono's Cafe","kono"],["The Taco Stand","taco stand"],
  ["Filippi's Pizza Grotto","filippi"],["Bronx Pizza","bronx pizza"],["Extraordinary Desserts","extraordinary desserts"],
];
const out = [];
for (const [label, pat] of picks) {
  const alts = pat.split("|");
  const rows = await sql`
    SELECT r.id, r.name, r.address, r.city, r.neighborhood, r.listed, r.hold_reason, r.lat, r.lng,
           r.website, r.source_key, (r.hours IS NOT NULL) AS has_hours, r.rating, r.google_rating, r.yelp_rating,
           (r.photo IS NOT NULL) AS has_photo, r.cuisine, r.price_band,
           (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id)::int AS dishes,
           (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id AND (d.price='' OR d.price='—'))::int AS no_price,
           m.status AS ml_status, m.source_url, m.confidence, m.attempted_at
    FROM restaurants r LEFT JOIN menu_lookups m ON m.restaurant_id = r.id
    WHERE ${alts.map(a => `%${a}%`)}::text[] && ARRAY[r.name]::text[] OR r.name ILIKE ANY(${alts.map(a => `%${a}%`)})
    ORDER BY r.listed DESC, r.hold_reason NULLS FIRST, r.name LIMIT 8`;
  out.push({ label, matches: rows });
  console.log(`\n## ${label}  (${rows.length} match${rows.length===1?"":"es"})`);
  for (const r of rows) {
    console.log(`  [${r.id}] ${r.name} | ${r.address ?? "-"}, ${r.city ?? r.neighborhood} | listed=${r.listed} hold=${r.hold_reason ?? "-"} | dishes=${r.dishes} (no_price ${r.no_price}) | ml=${r.ml_status ?? "-"}/${r.confidence ?? "-"} | hours=${r.has_hours} photo=${r.has_photo} | src=${r.source_key} | web=${r.website ?? "-"} | menu=${r.source_url ?? "-"}`);
  }
}
import { writeFileSync } from "node:fs";
writeFileSync("probe/spot-check/lookup.json", JSON.stringify(out, null, 1));
