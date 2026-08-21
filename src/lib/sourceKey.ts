/**
 * A restaurant's identity across data refreshes, independent of who supplied it.
 *
 * The merge key used to be the Yelp business alias parsed out of `yelpUrl`.
 * That was already an improvement on array position — see the header of
 * `scripts/fetch-restaurants.mjs` for what renumbering did to
 * `posts.restaurant_id` — but it assumes every restaurant came from Yelp, and
 * that assumption is about to stop holding. Yelp's free tier is gone, so new
 * restaurants arrive from OpenStreetMap (no alias, no Yelp URL, nothing to
 * parse) and are enriched from Google Places (a `place_id`, also not an alias).
 *
 * A row whose source key cannot be computed is invisible to the merge: it
 * matches nothing, so a re-run appends a second copy of a restaurant that is
 * already in the file, and the two copies then split that restaurant's posts
 * between them. That is the failure this module exists to prevent, and it is
 * silent — the corpus just quietly grows duplicates.
 *
 * The format is `<source>:<id within that source>`:
 *
 *   yelp:tacos-el-gordo-chula-vista
 *   osm:node/1234567890
 *   google:ChIJN1t_tDeuEmsRUsoyG83frY4
 *
 * The prefix matters. Yelp and OSM can hold the same restaurant under ids that
 * happen to collide as bare strings, and a namespaced key cannot confuse them.
 *
 * Nothing here reaches the network or the database, so both the app and the
 * plain-Node scripts under `scripts/` can import it.
 */

/** A restaurant carries at least enough to derive its identity. */
type Identifiable = {
  sourceKey?: string;
  yelpUrl?: string;
};

/**
 * Yelp's business alias, off the end of a business URL:
 * `https://www.yelp.com/biz/tacos-el-gordo-chula-vista` -> the last segment.
 */
export function yelpAliasFrom(yelpUrl: string | null | undefined): string | null {
  if (typeof yelpUrl !== "string") return null;
  const match = yelpUrl.match(/\/biz\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function yelpSourceKey(yelpUrl: string | null | undefined): string | null {
  const alias = yelpAliasFrom(yelpUrl);
  return alias ? `yelp:${alias}` : null;
}

/**
 * OSM identity is the element type plus its id — a node and a way can both be
 * numbered 1234567890 and be different places, so the type is not optional.
 */
export function osmSourceKey(
  type: "node" | "way" | "relation",
  id: number | string,
): string {
  return `osm:${type}/${id}`;
}

export function googleSourceKey(placeId: string): string {
  return `google:${placeId}`;
}

/**
 * The key to merge a restaurant on, preferring the stored one.
 *
 * The fallback to `yelpUrl` is not a transitional convenience to delete later:
 * `scripts/fetch-photos.mjs` rewrites rows by regex and both serializers write
 * the array from scratch, so a row can lose fields in ways the type system
 * cannot see. Deriving the old key when the new one is missing means the worst
 * case is an unchanged merge rather than a duplicated restaurant.
 *
 * Returns null only when a row has neither, which for now means a row that was
 * hand-written. Callers must treat null as "cannot be matched" and refuse to
 * merge it, never as "no match found" — those lead to opposite actions.
 */
export function sourceKeyFor(restaurant: Identifiable): string | null {
  if (typeof restaurant.sourceKey === "string" && restaurant.sourceKey.length > 0) {
    return restaurant.sourceKey;
  }
  return yelpSourceKey(restaurant.yelpUrl);
}

/** The originating service, for reporting and for source-specific refresh rules. */
export function sourceOf(sourceKey: string | null): string | null {
  if (!sourceKey) return null;
  const colon = sourceKey.indexOf(":");
  return colon === -1 ? null : sourceKey.slice(0, colon);
}
