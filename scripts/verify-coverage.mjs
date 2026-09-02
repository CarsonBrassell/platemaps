/**
 * Measures the corpus against the County of San Diego's food-facility permits.
 *
 *   node --env-file=.env.local scripts/verify-coverage.mjs
 *   node --env-file=.env.local scripts/verify-coverage.mjs --refetch
 *   node --env-file=.env.local scripts/verify-coverage.mjs --profile
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
 *
 * ## --profile, and why this file grew a second job
 *
 * MISSING is 7,166 permits, and a permit is not a restaurant. Before any of it
 * can be resolved against Google, the list has to be triaged: expired permits
 * are not businesses, the same business often holds two permits at one address,
 * and several hundred names are churches, lodges, jails and school cafeterias
 * that no consumer directory should carry.
 *
 * That triage lives here rather than in its own script because it needs this
 * file's normalisers - `nameTokens` and `address` - and a second copy of those
 * would be a second definition of what counts as the same business. The two
 * would drift, and the drift would show up as duplicate restaurants.
 *
 * `--profile` prints the triage and writes `data/deh-queue.json`, which
 * `scripts/resolve-places.mjs` reads. Everything below the "main" divider is
 * exported so both jobs, and the resolver, share one set of rules.
 */

import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const RESOURCE = "1c4c99de-5825-4c4b-81a3-3fb05c498106";
export const CACHE = "data/deh-facilities.json";
export const QUEUE_PATH = "data/deh-queue.json";

/* Permit types that describe somewhere a person eats. Excludes warehouses,
 * vending machines, school auxiliaries and commissaries. */
export const EATABLE =
  /Restaurant Food Facility|Retail Market with Deli|Low Risk Food Facility|Microenterprise Home Kitchen|Restricted Food Service|Single Operating Site|Satellite Food Service/i;

/* A permit is a regulatory unit, not a restaurant: a zoo holds six, a hotel one
 * per kitchen. These never belong in a consumer corpus. */
export const BACK_OF_HOUSE =
  / - |\b(COMMISSARY|BANQUET|CONCESSION|WAREHOUSE|PREP UNIT|PRODUCTION|AUXILIARY|ROOM SERVICE|EMPLOYEE|CATERING KITCHEN)\b/i;

/**
 * The permit type that is unambiguously a restaurant, and the ones that are
 * somewhere a person eats without being one.
 *
 * A "Retail Market with Deli" is a corner store with a hot case; a "Low Risk
 * Food Facility" is usually a coffee counter. There are 1,146 and 582 of them
 * missing, and whether they belong in a restaurant directory is a product
 * question nobody has answered. They go into the queue tagged `other` so the
 * answer can be applied later without re-deriving the list - and so a month of
 * free Google calls is never spent on them by accident.
 */
export const RESTAURANT_TYPE = /^Restaurant Food Facility$/i;
export const OTHER_EATABLE_TYPE =
  /^(Retail Market with Deli|Low Risk Food Facility|Single Operating Site)$/i;

/**
 * Names that are an institution rather than a restaurant open to the public.
 *
 * ONE constant, because this list is the whole judgement and splitting it
 * across the profile and the resolver would let the two disagree. A hit here
 * is a *flag*, not a verdict: "COLLEGE BILLIARDS & CAFE" and "ICHIBAN
 * UNIVERSITY" both match and are both real restaurants, and so is the taqueria
 * inside a hospital's lobby. The queue carries `institutional: true` and lets
 * Google's `primaryType` decide, which is a better judge of "can I eat here"
 * than a regex over a legal name will ever be.
 *
 * `INSTITUTIONAL_EXCLUDED` below is the subset where no primaryType could
 * change the answer, and those are dropped outright.
 */
export const INSTITUTIONAL =
  new RegExp(
    [
      // Places of worship. The lookahead spares Church's Chicken, which is a
      // fast-food chain and matched \bCHURCH\b on the apostrophe.
      String.raw`\bCHURCH(?!'?S?\s+CHICKEN)\b`,
      String.raw`\bCATHEDRAL\b|\bPARISH\b|\bCHAPEL\b|\bSYNAGOGUE\b|\bMOSQUE\b|\bMINISTRIES\b`,
      // Fraternal and veterans' halls - members only, no public menu.
      String.raw`\bVFW\b|VETERANS OF FOREIGN WARS|AMERICAN LEGION|\bELKS\b`,
      String.raw`MOOSE LODGE|LOYAL ORDER OF (THE )?MOOSE`,
      // Custody.
      String.raw`\bDETENTION\b|\bCORRECTIONAL\b|\bJAIL\b`,
      // Education.
      String.raw`\bSCHOOL\b|\bELEMENTARY\b|\bHIGH SCHOOL\b|\bCOLLEGE\b|\bUNIVERSITY\b|\bACADEMY\b`,
      // Care.
      String.raw`\bHOSPITAL\b|\bMEDICAL\b|\bSENIOR\b|\bCONVALESCENT\b|\bNURSING\b|ASSISTED LIVING`,
      // Staff and institutional dining rooms.
      String.raw`\bCAFETERIA\b`,
      // Civic.
      String.raw`\bYMCA\b|\bYWCA\b|COMMUNITY CENTER|COMMUNITY CTR|\bSENIOR CTR\b`,
      // The sushi counter inside a grocery store: "ACE SUSHI AT VONS 2859",
      // "AFC SUSHI @ RALPHS". It is a concession, not a restaurant, and there
      // are 35 of them under nearly identical names.
      String.raw`\bSUSHI\s*(?:@|AT)\s`,
      // Airside concessions. Nobody browses a restaurant directory for these
      // and none of them can be visited without a boarding pass.
      String.raw`\bAIRPORT\b|\bTERMINAL\s*\d|\bTERMINAL\s+(?:EAST|WEST|NORTH|SOUTH)\b`,
    ].join("|"),
    "i",
  );

/**
 * The clear-cut institutional set: excluded outright, never queued.
 *
 * The test for membership is "could a Google primaryType of `restaurant`
 * plausibly be right here?" For a church hall, a VFW post, a lodge, a jail or
 * a hospital's own cafeteria the answer is no under any circumstances. For a
 * school or a senior center it is sometimes yes - a charter school's street-
 * facing cafe, a senior center running a public lunch - so those stay in the
 * queue with the flag on.
 */
export const INSTITUTIONAL_EXCLUDED =
  new RegExp(
    [
      String.raw`\bCHURCH(?!'?S?\s+CHICKEN)\b|\bCATHEDRAL\b|\bPARISH\b|\bCHAPEL\b|\bSYNAGOGUE\b|\bMOSQUE\b`,
      String.raw`\bVFW\b|VETERANS OF FOREIGN WARS|AMERICAN LEGION|\bELKS\b`,
      String.raw`MOOSE LODGE|LOYAL ORDER OF (THE )?MOOSE`,
      String.raw`\bDETENTION\b|\bCORRECTIONAL\b|\bJAIL\b`,
      // Hospital *cafeteria* specifically - a hospital with a food-court
      // taqueria in it is a different thing and keeps its flag instead.
      String.raw`\bHOSPITAL\b(?=.*\bCAFETERIA\b)|\bCAFETERIA\b(?=.*\bHOSPITAL\b)`,
    ].join("|"),
    "i",
  );

/** Permit statuses that describe a business that is still trading. */
export const LIVE_STATUS = /^(Permit Renewed|Issued)$/i;

export async function loadPermits(refetch = false) {
  if (!refetch && existsSync(CACHE)) {
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

export const STOP = new Set([
  "THE", "A", "AND", "OF", "LLC", "INC", "CO", "CORP", "LP", "DBA",
  "RESTAURANT", "RESTAURANTE", "CAFE", "CAFÉ", "GRILL", "GRILLE", "BAR",
  "KITCHEN", "SHOP", "EATERY", "LOUNGE", "TAVERN", "PUB", "BISTRO", "DELI",
  "COFFEE", "TEA", "HOUSE", "PIZZERIA", "PIZZA", "TACO", "TACOS", "SAN", "DIEGO",
]);

/** Words that identify the business, minus filler and store numbers. */
export function nameTokens(raw) {
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
export function nameScore(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/** "1234 N Torrey Pines Rd Ste 5" -> { num: "1234", street: "TORREYPINES" } */
export function address(addr) {
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

/**
 * A raw CivicData record in the shape the matcher and the queue both want.
 *
 * `recordId` and the owner/status fields ride along because the profile needs
 * them and re-joining the queue back to the raw file on a name would be
 * exactly the fuzzy match this whole file exists to avoid.
 */
export function permitFrom(p) {
  return {
    recordId: p["Record ID"],
    name: p["Record Name"],
    city: String(p.City || "").toUpperCase().trim(),
    addressRaw: p.Address,
    ...address(p.Address),
    tokens: nameTokens(p["Record Name"]),
    type: p["Business Type"],
    zip: p.Zip,
    permitStatus: p["Permit Status"],
    ownerName: p["Permit Owner Full Name"] ?? null,
    phone: p["Permit Owner Business Phone"] ?? null,
    lastUpdated: p["Last Updated"] ?? null,
  };
}

/* ---------- profile ---------- */

/**
 * The key that decides two permits are one business: identifying words plus
 * street number plus street. Deliberately the same three things the matcher
 * uses, so "duplicate permit" and "already in the corpus" cannot mean
 * different amounts of similarity.
 */
export function duplicateKey(p) {
  return `${[...p.tokens].sort().join(" ")}|${p.num ?? ""}|${p.street ?? ""}`;
}

/** Newest wins. Records with no date sort last, so a dated one always beats one. */
function newer(a, b) {
  return String(a.lastUpdated ?? "") >= String(b.lastUpdated ?? "") ? a : b;
}

/**
 * Triages the MISSING permits into a resolvable queue.
 *
 * Returns `{ queue, excluded, stats }`. Nothing is deleted - every permit ends
 * up either in the queue or in `excluded` with a reason, so the counts always
 * add back up to the input and a disputed exclusion can be found again.
 */
export function profileMissing(missing) {
  const eligible = missing.filter(
    (p) => RESTAURANT_TYPE.test(p.type) || OTHER_EATABLE_TYPE.test(p.type),
  );

  const byStatus = {};
  for (const p of eligible) byStatus[p.permitStatus] = (byStatus[p.permitStatus] ?? 0) + 1;

  const excluded = [];
  const live = [];
  for (const p of eligible) {
    if (!LIVE_STATUS.test(String(p.permitStatus))) {
      excluded.push({ ...p, why: `status ${p.permitStatus}` });
    } else if (INSTITUTIONAL_EXCLUDED.test(String(p.name))) {
      excluded.push({ ...p, why: "institutional (clear-cut)" });
    } else {
      live.push(p);
    }
  }

  /* Duplicate permits: same business, two permit records. Keep the one the
   * county touched most recently and carry the others as aliases, so the
   * import can recognise either record id later without a second lookup. */
  const groups = new Map();
  for (const p of live) {
    const k = duplicateKey(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }

  const queue = [];
  let duplicateRecords = 0;
  let duplicateGroups = 0;
  for (const group of groups.values()) {
    let keep = group[0];
    for (const p of group.slice(1)) keep = newer(keep, p);
    if (group.length > 1) {
      duplicateGroups += 1;
      duplicateRecords += group.length - 1;
    }
    const aliases = group.filter((p) => p !== keep).map((p) => p.recordId);
    queue.push({
      sourceKey: `deh:${keep.recordId}`,
      recordId: keep.recordId,
      legalName: keep.name,
      address: keep.addressRaw ?? null,
      city: keep.city || null,
      zip: keep.zip ?? null,
      phone: keep.phone,
      ownerName: keep.ownerName,
      permitStatus: keep.permitStatus,
      businessType: keep.type,
      lastUpdated: keep.lastUpdated,
      aliases,
      institutional: INSTITUTIONAL.test(String(keep.name)),
      permitClass: RESTAURANT_TYPE.test(keep.type) ? "restaurant" : "other",
    });
  }

  queue.sort((a, b) => a.recordId.localeCompare(b.recordId));

  const stats = {
    input: missing.length,
    eligible: eligible.length,
    byStatus,
    excludedByReason: excluded.reduce((acc, e) => {
      acc[e.why] = (acc[e.why] ?? 0) + 1;
      return acc;
    }, {}),
    duplicateGroups,
    duplicateRecords,
    queue: queue.length,
    byClass: queue.reduce((acc, q) => {
      acc[q.permitClass] = (acc[q.permitClass] ?? 0) + 1;
      return acc;
    }, {}),
    institutionalTagged: queue.filter((q) => q.institutional).length,
    institutionalExcluded: excluded.filter((e) => e.why === "institutional (clear-cut)").length,
  };

  return { queue, excluded, stats };
}

/* ---------- main ---------- */

async function main() {
  const REFETCH = process.argv.includes("--refetch");
  const PROFILE = process.argv.includes("--profile");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  const raw = await loadPermits(REFETCH);
  const permits = raw
    .filter((p) => String(p["Active Permit"]).toUpperCase() === "Y")
    .filter((p) => EATABLE.test(String(p["Business Type"])))
    .filter((p) => !BACK_OF_HOUSE.test(String(p["Record Name"])))
    .map(permitFrom);

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

  if (!PROFILE) return;

  /* ---------- --profile ---------- */

  const { queue, excluded, stats } = profileMissing(missing);
  const pad = (n) => String(n).padStart(6);

  console.log(`\n\n=== PROFILE: what the ${missing.length} missing permits are made of ===\n`);

  console.log(`eligible permit types (restaurant + the three "other" eatable ones): ${stats.eligible}`);
  console.log(`the other ${missing.length - stats.eligible} are Microenterprise Home Kitchen,`);
  console.log(`Restricted Food Service and Satellite Food Service - out of scope for this stage.\n`);

  console.log(`by Permit Status`);
  for (const [status, n] of Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1])) {
    const note = LIVE_STATUS.test(status) ? "" : "   <- excluded from the queue";
    console.log(`  ${pad(n)}  ${status}${note}`);
  }

  console.log(`\nexcluded, by reason`);
  for (const [why, n] of Object.entries(stats.excludedByReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(n)}  ${why}`);
  }
  console.log(`  ${pad(excluded.length)}  TOTAL excluded`);

  const hardDrops = excluded.filter((e) => e.why === "institutional (clear-cut)");
  console.log(`\ninstitutional`);
  console.log(`  ${pad(stats.institutionalExcluded)}  excluded outright (church, VFW, Legion, Elks, Moose, custody, hospital cafeteria)`);
  console.log(`  ${pad(stats.institutionalTagged)}  tagged institutional:true and queued - Google's primaryType decides`);
  if (hardDrops.length) {
    console.log(`\n  first 15 of the outright exclusions:`);
    for (const e of hardDrops.slice(0, 15)) console.log(`    ${e.name}`);
  }

  console.log(`\nduplicate permits (same normalised name + street number + street)`);
  console.log(`  ${pad(stats.duplicateGroups)}  businesses holding more than one permit`);
  console.log(`  ${pad(stats.duplicateRecords)}  surplus records folded in as aliases[]`);
  const withAliases = queue.filter((q) => q.aliases.length).slice(0, 10);
  for (const q of withAliases) {
    console.log(`    ${q.legalName} - keeping ${q.recordId}, aliases ${q.aliases.join(", ")}`);
  }

  console.log(`\nqueue, by permitClass`);
  for (const [cls, n] of Object.entries(stats.byClass).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(n)}  ${cls}`);
  }
  console.log(`  ${pad(queue.length)}  TOTAL queued`);

  await writeFile(QUEUE_PATH, JSON.stringify(queue, null, 1), "utf8");
  await writeFile(
    "data/deh-excluded.json",
    JSON.stringify(
      excluded.map(({ tokens: _tokens, ...rest }) => rest),
      null,
      1,
    ),
    "utf8",
  );
  console.log(`\nwrote ${QUEUE_PATH} (${queue.length} entries) and data/deh-excluded.json (${excluded.length})`);
  console.log(`next: node --env-file=.env.local scripts/resolve-places.mjs --max-calls 0`);
}

/* Exports above are imported by resolve-places.mjs and import-deh.mjs, which
 * must not trigger a database connection or a 17,503-record scan just by
 * importing a normaliser. So the script only runs when it is the entry point. */
const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await main();
