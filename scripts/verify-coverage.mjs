/**
 * Measures the corpus against the County of San Diego's food-facility permits.
 *
 *   node --env-file=.env.local scripts/verify-coverage.mjs
 *   node --env-file=.env.local scripts/verify-coverage.mjs --refetch
 *
 * ## Why this exists
 *
 * "5,695 restaurants" was never a validated number. It is the union of one
 * OpenStreetMap snapshot and a Yelp ranked search, and nobody had checked it
 * against reality. Two different questions were being answered with the same
 * figure:
 *
 *   - how much of San Diego do we cover?   (are we INCOMPLETE)
 *   - is what we hold actually open?       (are we WRONG)
 *
 * The second matters more. A missing restaurant makes a visitor shrug; a
 * confidently-priced menu for a place that closed sends them on a wasted trip,
 * which is the failure this project cares about most.
 *
 * Every legal food business in the county holds a DEH permit, so the permit
 * list is the only complete enumeration available. It has no coordinates and
 * uses legal names ("JACK IN THE BOX #6"), so matching has to be fuzzy on both
 * sides.
 *
 * ## What it reports
 *
 *   VERIFIED     matched a permit by address, or by name within the same city
 *   PROBABLE     name matches a permit elsewhere - real business, address differs
 *   UNTESTABLE   no usable address on our record, so nothing can be concluded
 *   UNVERIFIED   we have an address, no permit is at it, and the name is absent
 *                from the whole county list - the bucket that may contain
 *                closed businesses
 *   MISSING      permits with no corpus record - the import backlog
 *
 * An earlier exact-string version put 1,170 records in UNVERIFIED, including
 * Anthony's Fish Grotto and Mitch's Seafood - both long open. Treat a big
 * UNVERIFIED count as a bug in the matcher before believing it about the world.
 */

import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const RESOURCE = "1c4c99de-5825-4c4b-81a3-3fb05c498106";
const CACHE = "data/deh-facilities.json";
const REFETCH = process.argv.includes("--refetch");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

/* Permit types that describe somewhere a person eats. Excludes warehouses,
 * vending machines, school auxiliaries and commissaries. */
const EATABLE =
  /Restaurant Food Facility|Retail Market with Deli|Low Risk Food Facility|Microenterprise Home Kitchen|Restricted Food Service|Single Operating Site|Satellite Food Service/i;

/* A permit is a regulatory unit, not a restaurant: a zoo holds six, a hotel one
 * per kitchen. These never belong in a consumer corpus. */
const BACK_OF_HOUSE =
  / - |\b(COMMISSARY|BANQUET|CONCESSION|WAREHOUSE|PREP UNIT|PRODUCTION|AUXILIARY|ROOM SERVICE|EMPLOYEE|CATERING KITCHEN)\b/i;

async function loadPermits() {
  if (!REFETCH && existsSync(CACHE)) {
    return JSON.parse(await readFile(CACHE, "utf8"));
  }
  const out = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const url = `https://www.civicdata.com/api/3/action/datastore_search?resource_id=${RESOURCE}&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131" } });
    const json = await res.json();
    if (!json.success) throw new Error("CivicData returned success:false");
    total = json.result.total;
    out.push(...json.result.records);
    offset += 1000;
    process.stdout.write(`\r  fetching permits ${out.length}/${total}`);
  }
  console.log("");
  await mkdir("data", { recursive: true });
  await writeFile(CACHE, JSON.stringify(out), "utf8");
  return out;
}

/* ---------- normalisation ---------- */

const STOP = new Set([
  "THE", "A", "AND", "OF", "LLC", "INC", "CO", "CORP", "LP", "DBA",
  "RESTAURANT", "RESTAURANTE", "CAFE", "CAFÉ", "GRILL", "GRILLE", "BAR",
  "KITCHEN", "SHOP", "EATERY", "LOUNGE", "TAVERN", "PUB", "BISTRO", "DELI",
  "COFFEE", "TEA", "HOUSE", "PIZZERIA", "PIZZA", "TACO", "TACOS", "SAN", "DIEGO",
]);

/** Words that identify the business, minus filler and store numbers. */
function nameTokens(raw) {
  return new Set(
    String(raw || "")
      .toUpperCase()
      .replace(/&/g, " AND ")
      .replace(/#\s*\d+/g, " ")
      .replace(/\b\d{1,4}\b/g, " ")
      .replace(/[^A-Z0-9ÑÁÉÍÓÚ]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

/** Jaccard over the identifying words; 1 means the same set. */
function nameScore(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/** "1234 N Torrey Pines Rd Ste 5" -> { num: "1234", street: "TORREYPINES" } */
function address(addr) {
  const s = String(addr || "").toUpperCase().replace(/[.,#]/g, " ");
  const num = (s.match(/\b(\d{1,6})\b/) || [])[1] ?? null;
  const street = s
    .replace(/\b(STE|SUITE|UNIT|APT|BLDG|SPC|SPACE)\s*[\w-]+/g, " ")
    .replace(/\b(N|S|E|W|NORTH|SOUTH|EAST|WEST)\b/g, " ")
    .replace(/\b(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|WAY|PKWY|PARKWAY|CT|COURT|PL|PLACE|LN|LANE|HWY|HIGHWAY|CIR|CIRCLE|TER|TRL)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^A-Z]/g, "");
  return { num, street: street.slice(0, 14) || null };
}

/* ---------- main ---------- */

const raw = await loadPermits();
const permits = raw
  .filter((p) => String(p["Active Permit"]).toUpperCase() === "Y")
  .filter((p) => EATABLE.test(String(p["Business Type"])))
  .filter((p) => !BACK_OF_HOUSE.test(String(p["Record Name"])))
  .map((p) => ({
    name: p["Record Name"],
    city: String(p.City || "").toUpperCase().trim(),
    addressRaw: p.Address,
    ...address(p.Address),
    tokens: nameTokens(p["Record Name"]),
    type: p["Business Type"],
    zip: p.Zip,
  }));

const ours = (
  await sql`SELECT id::text, name, address, neighborhood, hold_reason, listed,
                   (SELECT count(*)::int FROM dishes d WHERE d.restaurant_id = r.id) dishes
            FROM restaurants r`
).map((r) => ({ ...r, ...address(r.address), tokens: nameTokens(r.name) }));

/* Indexes so this is not 5,695 x 11,000 comparisons. */
const byAddr = new Map();
const byToken = new Map();
for (const p of permits) {
  if (p.num && p.street) {
    const k = `${p.num}|${p.street}`;
    if (!byAddr.has(k)) byAddr.set(k, []);
    byAddr.get(k).push(p);
  }
  for (const t of p.tokens) {
    if (!byToken.has(t)) byToken.set(t, []);
    byToken.get(t).push(p);
  }
}

const NAME_STRONG = 0.5;
const buckets = { VERIFIED: [], PROBABLE: [], UNTESTABLE: [], UNVERIFIED: [] };
const claimed = new Set();

for (const r of ours) {
  /* 1. Same street number and street -> verified, whatever the name says. */
  if (r.num && r.street) {
    const hits = byAddr.get(`${r.num}|${r.street}`) ?? [];
    if (hits.length) {
      buckets.VERIFIED.push(r);
      for (const h of hits) claimed.add(h);
      continue;
    }
  }

  /* 2. Otherwise look for the name anywhere in the county. */
  const seen = new Set();
  let best = null;
  let bestScore = 0;
  for (const t of r.tokens) {
    for (const p of byToken.get(t) ?? []) {
      if (seen.has(p)) continue;
      seen.add(p);
      const score = nameScore(r.tokens, p.tokens);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }

  if (bestScore >= NAME_STRONG) {
    /* Name matches a real permit. Same city means it is almost certainly the
     * same business with an address we wrote differently. */
    buckets[best.city && r.address && String(r.address).toUpperCase().includes(best.city) ? "VERIFIED" : "PROBABLE"].push({ ...r, matchedTo: best.name, score: bestScore });
    claimed.add(best);
    continue;
  }

  if (!r.num || !r.street) buckets.UNTESTABLE.push(r);
  else buckets.UNVERIFIED.push({ ...r, bestGuess: best?.name ?? null, score: Number(bestScore.toFixed(2)) });
}

const missing = permits.filter((p) => !claimed.has(p));

const pct = (n) => `${((100 * n) / ours.length).toFixed(1)}%`;
console.log(`\ncorpus records: ${ours.length}    county permits (eatable, front-of-house): ${permits.length}\n`);
console.log(`  VERIFIED    ${String(buckets.VERIFIED.length).padStart(5)}  ${pct(buckets.VERIFIED.length).padStart(6)}   address or same-city name matches a permit`);
console.log(`  PROBABLE    ${String(buckets.PROBABLE.length).padStart(5)}  ${pct(buckets.PROBABLE.length).padStart(6)}   name matches a permit, address differs`);
console.log(`  UNTESTABLE  ${String(buckets.UNTESTABLE.length).padStart(5)}  ${pct(buckets.UNTESTABLE.length).padStart(6)}   no usable address on our record`);
console.log(`  UNVERIFIED  ${String(buckets.UNVERIFIED.length).padStart(5)}  ${pct(buckets.UNVERIFIED.length).padStart(6)}   has an address, no permit, name unknown to the county`);
console.log(`\n  MISSING     ${String(missing.length).padStart(5)}           permitted places with no record of ours`);

const withMenus = buckets.UNVERIFIED.filter((r) => r.dishes > 0).length;
const listedUnverified = buckets.UNVERIFIED.filter((r) => r.listed).length;
console.log(`\nof the UNVERIFIED: ${listedUnverified} are listed in the app, ${withMenus} carry a menu we extracted`);

await mkdir("data", { recursive: true });
await writeFile("data/coverage-missing.json", JSON.stringify(missing, null, 1), "utf8");
await writeFile("data/coverage-unverified.json", JSON.stringify(buckets.UNVERIFIED, null, 1), "utf8");
console.log(`\nwrote data/coverage-missing.json and data/coverage-unverified.json`);
