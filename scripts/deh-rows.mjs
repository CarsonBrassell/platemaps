/**
 * The one place a county permit turns into a `restaurants` row.
 *
 * Factored out of `scripts/import-deh.mjs` when `scripts/geocode-permits.mjs`
 * needed the same row shape for the permits Google could not resolve. The two
 * scripts disagree about almost everything that *decides* a row — one has a
 * Google place and takes its name, the other has a Census centroid and has to
 * clean the county's shouted legal name — and they agree about everything that
 * *writes* one: the id space, the NOT NULL decorative columns, the
 * neighbourhood lookup, the cuisine vocabulary, the provenance columns and the
 * conflict arbiter. Duplicating that second list is how two importers drift
 * into writing two different kinds of row into one table.
 *
 * Nothing here talks to the network or reads a file. `sql` is passed in.
 */

import { regionForCoordinate } from "../src/data/regions.ts";
import { canonicalCuisine, tagsFor } from "../src/data/cuisines.ts";

/**
 * The city out of a formatted address: "162 S Rancho Santa Fe Rd, Encinitas,
 * CA 92024" -> "Encinitas".
 *
 * Preferred over the permit's own City field because the permit shouts
 * ("ENCINITAS") and this column is displayed. Falls back to the permit value
 * title-cased when the address does not parse, and to null when there is
 * neither — `city` is nullable and 573 existing rows are already null, so a
 * guess is worse than nothing.
 */
export function cityFrom(formattedAddress, permitCity) {
  const parts = String(formattedAddress || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // [street, city, "CA 92024", "USA"] - the city is the one before the state.
  const stateIndex = parts.findIndex((p) => /^[A-Z]{2}\b/.test(p) && /\d/.test(p));
  if (stateIndex > 0) return parts[stateIndex - 1];
  if (!permitCity) return null;
  return permitCity.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Google's place types mapped into this repo's cuisine vocabulary.
 *
 * `canonicalCuisine` is the only thing allowed to write the `cuisine` column
 * (see src/data/cuisines.ts), so anything it does not recognise becomes null
 * rather than a new one-row facet. Google's names are the same words with a
 * category suffix - `mexican_restaurant`, `sandwich_shop`, `steak_house` - so
 * the suffix is stripped and the stem is looked up. `primaryType` first, then
 * the rest of `types` in order, then null.
 *
 * A permit with no Google place has no types at all, so `geocode-permits.mjs`
 * calls this with nothing and gets the all-null triple. That is deliberate: the
 * county's `businessType` is "Restaurant Food Facility" for a taqueria and for
 * a Hilton banquet kitchen alike, and it is not a cuisine.
 */
const TYPE_SUFFIX = /_(restaurant|shop|store|house|place)$/;

export function cuisineFrom(place) {
  const candidates = [place?.primaryType, ...(place?.types ?? [])].filter(Boolean);
  for (const t of candidates) {
    const hit = canonicalCuisine(t) ?? canonicalCuisine(t.replace(TYPE_SUFFIX, ""));
    if (hit) {
      return {
        cuisine: hit,
        cuisineRaw: t,
        cuisineTags: tagsFor(t.replace(TYPE_SUFFIX, "")).join(" ") || null,
      };
    }
  }
  const raw = place?.primaryType ?? null;
  return {
    cuisine: null,
    cuisineRaw: raw,
    cuisineTags: raw ? tagsFor(raw.replace(TYPE_SUFFIX, "")).join(" ") || null : null,
  };
}

/**
 * The id space, continued.
 *
 * Ids follow import-osm.mjs exactly: the next integer above the highest numeric
 * id in the table, assigned in order, and `sort_order` the same. The column is
 * TEXT and ordering by it puts "10" before "2", which is what `sort_order` is
 * for. Ids are never reused and never renumbered — `posts.restaurant_id` is a
 * soft reference and renumbering would silently repoint everybody's reviews.
 */
export function idAllocator(existing) {
  let nextId = Math.max(0, ...existing.map((r) => Number(r.id)).filter(Number.isFinite)) + 1;
  let nextSort =
    Math.max(0, ...existing.map((r) => Number(r.sort_order ?? 0)).filter(Number.isFinite)) + 1;
  return () => ({ id: String(nextId++), sortOrder: nextSort++ });
}

/**
 * The row itself. Everything the caller decided goes in; everything the table
 * requires comes out.
 *
 * `holdReason` is the only field the two importers disagree about at write
 * time. `import-deh.mjs` leaves it null because a Google-resolved permit needs
 * no operator judgement beyond the `listed = false` every import already gets.
 * `geocode-permits.mjs` always sets one, because a Census centroid is an
 * address that exists, not a business anybody has confirmed is open under that
 * name — the row has to be visible to an operator and invisible to a visitor.
 */
export function buildRow(fields, allocate) {
  const { id, sortOrder } = allocate();
  return {
    id,
    sortOrder,
    sourceKey: fields.sourceKey,
    dehRecordId: fields.dehRecordId,
    name: fields.name,
    address: fields.address,
    city: fields.city,
    lat: fields.lat,
    lng: fields.lng,
    googlePlaceId: fields.googlePlaceId ?? null,
    neighborhood: regionForCoordinate(fields.lat, fields.lng),
    holdReason: fields.holdReason ?? null,
    cuisine: fields.cuisine ?? null,
    cuisineRaw: fields.cuisineRaw ?? null,
    cuisineTags: fields.cuisineTags ?? null,
  };
}

/**
 * One insert.
 *
 * The decorative NOT NULL columns are filled the way `import-osm.mjs` fills
 * them: empty strings and 'calm', not invented mileage. `listed` is FALSE
 * without exception — nothing reaches Discover, the facets or the map until
 * `scripts/publish-check.mjs` confirms a sourced rating and a real menu.
 *
 * `onConflict`:
 *
 *   "update"   the Google importer's re-run behaviour. Refreshes the mutable
 *              fields; never touches id, sort_order or listed, because
 *              re-running an import must not un-publish a restaurant that
 *              publish-check has since listed.
 *   "nothing"  the geocoder's. A row that already exists under this source key
 *              was written by a better-informed pass (or by a human), and a
 *              Census centroid must never overwrite it.
 *
 * The ON CONFLICT predicate repeats idx_restaurants_source_key's verbatim —
 * that text is how Postgres picks a partial unique index for the arbiter.
 */
export async function insertRow(sql, r, verifiedAt, { onConflict } = { onConflict: "nothing" }) {
  if (onConflict === "update") {
    return sql`
      INSERT INTO restaurants
        (id, name, cuisine, cuisine_raw, cuisine_tags, neighborhood, lat, lng,
         source_key, address, city, google_place_id, hold_reason,
         deh_record_id, deh_verified_at,
         sort_order, listed, distance, walk_time, closing_time, status, status_label)
      VALUES
        (${r.id}, ${r.name}, ${r.cuisine}, ${r.cuisineRaw}, ${r.cuisineTags},
         ${r.neighborhood}, ${r.lat}, ${r.lng},
         ${r.sourceKey}, ${r.address}, ${r.city}, ${r.googlePlaceId}, ${r.holdReason},
         ${r.dehRecordId}, ${verifiedAt}::timestamptz,
         ${r.sortOrder}, FALSE, '', '', '', 'calm', '')
      ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO UPDATE SET
        name            = EXCLUDED.name,
        address         = EXCLUDED.address,
        city            = EXCLUDED.city,
        lat             = EXCLUDED.lat,
        lng             = EXCLUDED.lng,
        google_place_id = EXCLUDED.google_place_id,
        neighborhood    = EXCLUDED.neighborhood,
        cuisine         = COALESCE(restaurants.cuisine, EXCLUDED.cuisine),
        cuisine_raw     = COALESCE(restaurants.cuisine_raw, EXCLUDED.cuisine_raw),
        cuisine_tags    = COALESCE(restaurants.cuisine_tags, EXCLUDED.cuisine_tags),
        deh_record_id   = EXCLUDED.deh_record_id,
        deh_verified_at = EXCLUDED.deh_verified_at`;
  }
  return sql`
    INSERT INTO restaurants
      (id, name, cuisine, cuisine_raw, cuisine_tags, neighborhood, lat, lng,
       source_key, address, city, google_place_id, hold_reason,
       deh_record_id, deh_verified_at,
       sort_order, listed, distance, walk_time, closing_time, status, status_label)
    VALUES
      (${r.id}, ${r.name}, ${r.cuisine}, ${r.cuisineRaw}, ${r.cuisineTags},
       ${r.neighborhood}, ${r.lat}, ${r.lng},
       ${r.sourceKey}, ${r.address}, ${r.city}, ${r.googlePlaceId}, ${r.holdReason},
       ${r.dehRecordId}, ${verifiedAt}::timestamptz,
       ${r.sortOrder}, FALSE, '', '', '', 'calm', '')
    ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING`;
}
