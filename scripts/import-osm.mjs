/**
 * Imports every food venue in San Diego County from OpenStreetMap.
 *
 *   node --env-file=.env.local scripts/import-osm.mjs --dry
 *   node --env-file=.env.local scripts/import-osm.mjs
 *   node --env-file=.env.local scripts/import-osm.mjs --include-ice-cream
 *
 * ## Why OpenStreetMap
 *
 * Yelp's search endpoint returns a ranked sample and then stops. It will not
 * enumerate a city however many calls it is given, which is why the Yelp side
 * of the corpus flattened out around 680 restaurants no matter how far the
 * thresholds were loosened. OSM will enumerate: one Overpass query returns
 * about 5,600 named venues across the county, free, with no key and no quota.
 *
 * What it does NOT return is everything else. An OSM venue arrives as a name,
 * a cuisine and a pair of coordinates. Measured across the county:
 *
 *     website         47%
 *     opening_hours   34%
 *     phone           43%
 *     image            0.1%   (6 venues out of 5,587)
 *
 * So this script is the cheap half of the job. It fills the table with real
 * restaurants that are not ready to show, and every row it writes is
 * `listed = false` by construction - see the readiness gate in migrate.mjs.
 * Photos and ratings come from somewhere else; nothing here invents them.
 *
 * ## Identity, and not duplicating the Yelp rows
 *
 * `source_key` (`osm:node/123`) is the identity, so re-running updates rather
 * than inserting. But the same restaurant is often already in the table under
 * a Yelp key, and the two sources agree on neither spelling nor coordinates -
 * "Phil's BBQ" against "Phils BBQ", pins forty metres apart. A second pass
 * therefore matches on normalised name within MATCH_METRES and skips, so the
 * Yelp row (which has the rating and the photo) survives and the OSM duplicate
 * is never created.
 *
 * Nothing here deletes or overwrites a Yelp row. An OSM venue that matches one
 * contributes only its website tag, and only where the Yelp row has none.
 */

import { neon } from "@neondatabase/serverless";
import { regions } from "../src/data/regions.ts";
import { canonicalCuisine, tagsFor } from "../src/data/cuisines.ts";

const sql = neon(process.env.DATABASE_URL);
const OVERPASS = "https://overpass-api.de/api/interpreter";

const DRY_RUN = process.argv.includes("--dry");
const INCLUDE_ICE_CREAM = process.argv.includes("--include-ice-cream");

/** How close two pins must be before one name match means one restaurant. */
const MATCH_METRES = 200;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

/* --- Overpass ------------------------------------------------------------ */

const AMENITIES = ["restaurant", "fast_food", "cafe", "bar", "pub"];
if (INCLUDE_ICE_CREAM) AMENITIES.push("ice_cream");

async function fetchVenues() {
  const query = `
    [out:json][timeout:180];
    area["name"="San Diego County"]["admin_level"="6"]->.sd;
    (
      node["amenity"~"^(${AMENITIES.join("|")})$"](area.sd);
      way["amenity"~"^(${AMENITIES.join("|")})$"](area.sd);
    );
    out tags center;
  `;
  // Overpass answers 406 without a User-Agent, which reads as a malformed
  // query rather than a missing header if you are not expecting it.
  const res = await fetch(OVERPASS, {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "PlateMaps/0.1 (san diego restaurant directory)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).elements;
}

/* --- Field mapping ------------------------------------------------------- */

const subAreas = regions.flatMap((r) => r.subAreas);

/** The nearest named sub-area, which is what the app calls a neighbourhood. */
function neighbourhoodFor(lat, lng) {
  const latRad = (lat * Math.PI) / 180;
  let best = subAreas[0];
  let bestDist = Infinity;
  for (const area of subAreas) {
    const dLat = (lat - area.lat) * 111_320;
    const dLng = (lng - area.lng) * 111_320 * Math.cos(latRad);
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = area;
    }
  }
  return best.name;
}

function metresBetween(a, b) {
  const latRad = (a.lat * Math.PI) / 180;
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos(latRad);
  return Math.hypot(dLat, dLng);
}

const AMENITY_FALLBACK = {
  cafe: "Cafe",
  bar: "Bar",
  pub: "Pub",
  fast_food: "Fast Food",
  ice_cream: "Ice Cream",
  restaurant: "Restaurant",
};

/**
 * OSM cuisine tags are lowercase, semicolon-separated, and occasionally
 * describe a serving style rather than a food ("sandwich;coffee_shop"). The
 * first token wins.
 *
 * It used to be title-cased and written straight to the column. That is what
 * put 162 distinct cuisines in front of a visitor across 4,792 restaurants —
 * a contributor's typo became the filter option "Coffe Shop", `pho` became a
 * two-restaurant "Pho" sitting below a sixty-one-restaurant "Vietnamese", and
 * "middle_eastern" read acceptably while matching nothing else in the corpus.
 * Reading acceptably was never the bar; joining an existing bucket was.
 *
 * Now the tag is mapped through the vocabulary in src/data/cuisines.ts and
 * anything unrecognised becomes null rather than a new one-row category. The
 * raw tag is kept in `cuisine_raw` and its searchable form in `cuisine_tags`,
 * so nothing the tag knew is lost — see that file.
 */
function cuisineFor(tags) {
  const raw = tags.cuisine?.split(";")[0]?.trim() || AMENITY_FALLBACK[tags.amenity] || "restaurant";
  return {
    cuisine: canonicalCuisine(raw),
    cuisineRaw: raw,
    cuisineTags: tagsFor(raw).join(" ") || null,
  };
}

/** "3960 W Point Loma Blvd" — house number and street, or nothing. */
function addressFor(tags) {
  const number = tags["addr:housenumber"];
  const street = tags["addr:street"];
  if (!number || !street) return null;
  const unit = tags["addr:unit"] ? ` #${tags["addr:unit"]}` : "";
  return `${number} ${street}${unit}`;
}

/**
 * The neighbourhood label, preferring the source's own city over geometry.
 *
 * `neighbourhoodFor` picks the nearest entry in regions.ts, which is right
 * inside San Diego proper — "Little Italy" is more useful than "San Diego" —
 * and wrong everywhere regions.ts has no entry. It has none for Escondido, San
 * Marcos, Vista, Fallbrook or Borrego Springs, so restaurants there get filed
 * under whatever happens to be closest: Carmelita's is 18 miles from the
 * "Julian" it was labelled, and 15% of the corpus sits more than 5km from its
 * claimed neighbourhood.
 *
 * So: use OSM's own city when it is a distinct incorporated one, and fall back
 * to nearest-sub-area inside San Diego itself. That keeps the good half of the
 * geometric rule and replaces the half that was guessing.
 */
function neighborhoodFor(tags, lat, lng) {
  const city = tags["addr:city"]?.trim();
  if (city && !/^san diego$/i.test(city)) return city;
  return neighbourhoodFor(lat, lng);
}

function websiteFor(tags) {
  const url = tags.website || tags["contact:website"] || null;
  if (!url) return null;
  // A Facebook or Instagram page is a web presence but not a menu source, and
  // storing it here would make the menu queue believe a site had been found.
  if (/facebook\.com|instagram\.com|twitter\.com|x\.com/i.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

/* --- opening_hours ------------------------------------------------------- */

/**
 * OSM's opening_hours grammar is far larger than this, deliberately.
 *
 * It can express "Mo-Fr 08:00-18:00; PH off", public holidays, sunset offsets,
 * week numbers and month ranges. Parsing all of it correctly is a
 * library-sized job, and parsing it INCORRECTLY is worse than not parsing it:
 * the whole reason hours are stored at all is that "Open now" was making
 * claims the data did not support. So this reads the plain weekday-and-times
 * cases and returns null for everything else, leaving the restaurant to say
 * "Hours vary" until a better source fills it in.
 *
 * Returns the shape fetch-hours.mjs writes - day 0 = Monday.
 */
const DAY_INDEX = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };

/** Grammar this does not handle. Matched before anything else is attempted. */
const TOO_COMPLEX = /\b(ph|eastee?r|sunset|sunrise|week|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|off|closed)\b|\+|"|\[/;

function parseOpeningHours(raw) {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();

  if (text === "24/7") {
    return Array.from({ length: 7 }, (_, day) => ({ day, start: "0000", end: "2359" }));
  }
  if (TOO_COMPLEX.test(text)) return null;

  const slots = [];
  for (const rule of text.split(";")) {
    if (!rule.trim()) continue;
    const parts = rule.trim().match(/^([a-z,\-\s]+?)\s+([\d:,\-\s]+)$/);
    if (!parts) return null;
    const [, dayPart, timePart] = parts;

    const days = [];
    for (const chunk of dayPart.replace(/\s/g, "").split(",")) {
      const range = chunk.split("-");
      if (range.length === 1) {
        const d = DAY_INDEX[range[0]];
        if (d === undefined) return null;
        days.push(d);
      } else if (range.length === 2) {
        const a = DAY_INDEX[range[0]];
        const b = DAY_INDEX[range[1]];
        if (a === undefined || b === undefined) return null;
        // Day ranges wrap: "Fr-Mo" is legal and means Fri, Sat, Sun, Mon.
        for (let d = a; ; d = (d + 1) % 7) {
          days.push(d);
          if (d === b) break;
        }
      } else return null;
    }

    for (const span of timePart.split(",")) {
      const t = span.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (!t) return null;
      const start = `${t[1].padStart(2, "0")}${t[2]}`;
      const endHour = Number(t[3]);
      // "11:00-24:00" is legal OSM and an invalid clock time.
      const end =
        endHour >= 24
          ? `${String(endHour - 24).padStart(2, "0")}${t[4]}`
          : `${t[3].padStart(2, "0")}${t[4]}`;
      const overnight = end <= start;
      for (const day of days) {
        slots.push({ day, start, end, ...(overnight ? { overnight: true } : {}) });
      }
    }
  }
  return slots.length > 0 ? slots : null;
}

/* --- Import -------------------------------------------------------------- */

const elements = await fetchVenues();
const venues = elements
  .filter((e) => e.tags?.name)
  .map((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (lat == null || lng == null) return null;
    return {
      sourceKey: `osm:${e.type}/${e.id}`,
      name: e.tags.name.trim(),
      lat,
      lng,
      ...cuisineFor(e.tags),
      neighborhood: neighborhoodFor(e.tags, lat, lng),
      website: websiteFor(e.tags),
      hours: parseOpeningHours(e.tags.opening_hours),
      address: addressFor(e.tags),
      city: e.tags["addr:city"]?.trim() || null,
      // Whether `neighborhood` above came from OSM's city rather than from
      // nearest-sub-area geometry — the refresh only overwrites in that case.
      usesCityName: Boolean(
        e.tags["addr:city"]?.trim() && !/^san diego$/i.test(e.tags["addr:city"].trim()),
      ),
    };
  })
  .filter(Boolean);

const existing = await sql`
  SELECT id, name, lat, lng, source_key, website, sort_order FROM restaurants
`;
const bySourceKey = new Map(
  existing.filter((r) => r.source_key).map((r) => [r.source_key, r]),
);

const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/*
 * Bucketed by rounded coordinate, so the near-duplicate check is a handful of
 * comparisons per venue instead of 5,600 x 991. Each row is filed into its own
 * cell and the eight around it, so a venue only ever has to look in one.
 */
const grid = new Map();
const cell = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;
for (const r of existing) {
  if (r.lat == null || r.lng == null) continue;
  for (const dLat of [-0.01, 0, 0.01]) {
    for (const dLng of [-0.01, 0, 0.01]) {
      const key = cell(r.lat + dLat, r.lng + dLng);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(r);
    }
  }
}

function duplicateOf(venue) {
  const near = grid.get(cell(venue.lat, venue.lng)) ?? [];
  const target = normalise(venue.name);
  for (const r of near) {
    if (r.source_key === venue.sourceKey) continue;
    const other = normalise(r.name);
    const agrees = other === target || other.includes(target) || target.includes(other);
    if (agrees && metresBetween(venue, { lat: r.lat, lng: r.lng }) <= MATCH_METRES) return r;
  }
  return null;
}

const numericIds = existing.map((r) => Number(r.id)).filter(Number.isFinite);
const sortOrders = existing.map((r) => Number(r.sort_order ?? 0)).filter(Number.isFinite);
let nextId = Math.max(0, ...numericIds) + 1;
let nextSort = Math.max(0, ...sortOrders) + 1;

const inserts = [];
const refreshes = [];
const dupes = [];

for (const v of venues) {
  const known = bySourceKey.get(v.sourceKey);
  if (known) {
    refreshes.push({ ...v, id: known.id });
    continue;
  }
  const dupe = duplicateOf(v);
  if (dupe) {
    dupes.push(v);
    // The one thing an OSM duplicate can still usefully contribute.
    if (v.website && !dupe.website) refreshes.push({ ...v, id: dupe.id });
    continue;
  }
  inserts.push({ ...v, id: String(nextId++), sortOrder: nextSort++ });
}

const withSite = inserts.filter((v) => v.website).length;
const withHours = inserts.filter((v) => v.hours).length;
const pct = (n) => (inserts.length ? Math.round((n / inserts.length) * 100) : 0);

console.log(
  `${venues.length} named venues in San Diego County.\n` +
    `  ${dupes.length} already in the table under another source\n` +
    `  ${refreshes.length} existing rows to refresh\n` +
    `  ${inserts.length} new\n` +
    `      ${withSite} with a website (${pct(withSite)}%)\n` +
    `      ${withHours} with hours this parser can read (${pct(withHours)}%)\n`,
);

if (DRY_RUN) {
  console.log("Dry run - nothing written. A sample of what would be inserted:\n");
  for (const v of inserts.slice(0, 15)) {
    console.log(
      `  ${v.name} - ${v.neighborhood} / ${v.cuisine ?? "(no cuisine)"}` +
        `${v.website ? " / site" : ""}${v.hours ? " / hours" : ""}`,
    );
  }
  process.exit(0);
}

for (const [i, v] of inserts.entries()) {
  await sql`
    INSERT INTO restaurants
      (id, name, cuisine, cuisine_raw, cuisine_tags, neighborhood, lat, lng,
       source_key, website, hours,
       address, city,
       sort_order, listed, distance, walk_time, closing_time, status, status_label)
    VALUES
      (${v.id}, ${v.name}, ${v.cuisine}, ${v.cuisineRaw}, ${v.cuisineTags},
       ${v.neighborhood}, ${v.lat}, ${v.lng},
       ${v.sourceKey}, ${v.website},
       ${v.hours ? JSON.stringify(v.hours) : null}::jsonb,
       ${v.address}, ${v.city},
       ${v.sortOrder}, FALSE, '', '', '', 'calm', '')
    ON CONFLICT (id) DO NOTHING`;
  if (i % 50 === 0) process.stdout.write(`\r  inserting ${i}/${inserts.length}`);
}

// COALESCE so a refresh can only ever fill a gap, never blank a field that a
// better source already filled.
for (const v of refreshes) {
  await sql`
    UPDATE restaurants SET
      website = COALESCE(website, ${v.website}),
      hours   = COALESCE(hours, ${v.hours ? JSON.stringify(v.hours) : null}::jsonb),
      address = COALESCE(address, ${v.address}),
      city    = COALESCE(city, ${v.city}),
      /*
       * Neighbourhood is replaced rather than filled, but only when OSM names
       * a distinct city — the expression is null otherwise, so COALESCE keeps
       * what is already there.
       *
       * The existing value came from nearest-sub-area, which is a guess
       * wherever regions.ts has no entry: Carmelita's was filed under Julian,
       * eighteen miles from the Borrego Springs it is actually in. A real city
       * name beats a near miss. Inside San Diego proper the geometric label
       * stays, because "Little Italy" beats "San Diego".
       */
      neighborhood = COALESCE(${v.usesCityName ? v.neighborhood : null}, neighborhood),
      /*
       * Cuisine fills a gap like the fields above it, and the gap it fills is
       * real: a row whose tag was unmapped when it was imported has a null
       * cuisine, and a later OSM edit — or a later entry in the vocabulary —
       * is exactly what should fill it.
       *
       * cuisine_raw is filled the same way, so a row imported before the
       * vocabulary existed gains the raw tag it was missing and becomes
       * re-mappable by the backfill.
       */
      cuisine     = COALESCE(cuisine, ${v.cuisine}),
      cuisine_raw = COALESCE(cuisine_raw, ${v.cuisineRaw}),
      cuisine_tags = COALESCE(cuisine_tags, ${v.cuisineTags})
    WHERE id = ${v.id}`;
}

const [after] = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE listed)::int AS listed,
         count(*) FILTER (WHERE website IS NOT NULL)::int AS with_site,
         count(*) FILTER (WHERE hours IS NOT NULL AND hours <> '[]'::jsonb)::int AS with_hours
  FROM restaurants`;

console.log(
  `\n\n${inserts.length} inserted, ${refreshes.length} refreshed.\n` +
    `${after.total} restaurants now: ${after.listed} listed, ` +
    `${after.with_site} with a website, ${after.with_hours} with hours.\n` +
    `Everything new is listed = false. Run publish-check.mjs after enrichment.`,
);
