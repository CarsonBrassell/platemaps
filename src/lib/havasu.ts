/**
 * Lake Havasu City (Arizona) rows sort after everything else in the feeds.
 *
 * Havasu was added for one event and the app is San Diego-centred, so its
 * restaurants and their posts are never hidden, only ordered last (Calvin,
 * 2026-11-17), keeping their relative order among themselves.
 *
 * How a Havasu row is recognised, most to least specific:
 *   - `sourceKey` starting `havasu:` (havasu/load.mjs writes this; database ids
 *     are plain numbers, so the `hav-` ids in the havasu/ files never reach
 *     the app),
 *   - `id` starting `hav-` (cheap insurance should those ids ever surface),
 *   - `neighborhood` / `city` of "Lake Havasu City",
 *   - coordinates inside a box around the city (San Diego is ~32.7, -117.1).
 *
 * Pure and dependency-free so server ordering and client re-sorting share it.
 * The SQL twin for post queries is `HAVASU_POST_SQL`.
 */

const HAVASU_NAME = "lake havasu city";

/** Generous box around Lake Havasu City (34.48, -114.32). */
export const HAVASU_BOX = { latMin: 34.2, latMax: 34.8, lngMin: -114.7, lngMax: -113.9 } as const;

export type HavasuCandidate = {
  id?: string | null;
  sourceKey?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  restaurantId?: string | null;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
};

export function inHavasuBox(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= HAVASU_BOX.latMin &&
    lat <= HAVASU_BOX.latMax &&
    lng >= HAVASU_BOX.lngMin &&
    lng <= HAVASU_BOX.lngMax
  );
}

/** True for a restaurant, or a post about one (post fields are `restaurant*`). */
export function isHavasu(x: HavasuCandidate | null | undefined): boolean {
  if (!x) return false;
  if (x.sourceKey?.startsWith("havasu:")) return true;
  if (x.id?.startsWith("hav-") || x.restaurantId?.startsWith("hav-")) return true;
  if (x.neighborhood?.toLowerCase() === HAVASU_NAME || x.city?.toLowerCase() === HAVASU_NAME) {
    return true;
  }
  return inHavasuBox(x.lat, x.lng) || inHavasuBox(x.restaurantLat, x.restaurantLng);
}

/** Stable partition: non-Havasu first, Havasu last, relative order kept. */
export function havasuLast<T>(items: readonly T[], is: (item: T) => boolean): T[] {
  const rest: T[] = [];
  const hav: T[] = [];
  for (const item of items) (is(item) ? hav : rest).push(item);
  return hav.length === 0 ? rest : [...rest, ...hav];
}

/**
 * SQL twin of `isHavasu` for a posts row aliased `p` (restaurant id, coords).
 * Used as a boolean column so keyset pagination can order on it.
 */
export const HAVASU_POST_SQL = `(
  EXISTS (SELECT 1 FROM restaurants hr WHERE hr.id = p.restaurant_id AND hr.source_key LIKE 'havasu:%')
  OR (p.restaurant_lat BETWEEN ${HAVASU_BOX.latMin} AND ${HAVASU_BOX.latMax}
      AND p.restaurant_lng BETWEEN ${HAVASU_BOX.lngMin} AND ${HAVASU_BOX.lngMax})
)`;
