/**
 * Coordinates and the distance between them. No React, deliberately.
 *
 * This lived in lib/nearby.ts next to `useNearby`, which was fine while the
 * only thing that measured distance was a client component. Discover filters on
 * the server now (lib/discover.ts), and the filter model it calls needs
 * `milesBetween` — so importing the hook module from the server pulled
 * `useState` into a React Server Component and the build refused it, correctly.
 *
 * Splitting on that line rather than working around it: a module of arithmetic
 * and a module of browser state are different things, and only one of them can
 * run in both places. `nearby.ts` re-exports these so nothing that already
 * imported them from there had to change.
 */

export type Coords = { lat: number; lng: number };

/**
 * How far "nearby" reaches. Wide enough that a filter on it still returns
 * something in a county this spread out, tight enough to still mean "tonight".
 */
export const NEARBY_RADIUS_MI = 5;

const EARTH_RADIUS_MI = 3958.8;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in miles. Haversine — the county is small enough that
    the choice of formula is irrelevant, but the poles aren't its problem. */
export function milesBetween(a: Coords, b: Coords): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Miles as a card prints them: one decimal while the decimal still means
 * something ("0.4 mi", "3.7 mi"), whole miles past ten ("12 mi"). The same
 * shape as the seeded `distance` strings, so a replaced number is
 * indistinguishable in layout from the one it replaced.
 */
export function formatMiles(mi: number): string {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** The digits half of `formatMiles`, without the unit — shared with `formatWalk`
    below so a routed distance and a straight-line one read as the same number
    at the same precision. */
function milesDigits(mi: number): string {
  return mi < 10 ? mi.toFixed(1) : String(Math.round(mi));
}

const METERS_PER_MILE = 1609.34;

/**
 * A routed distance, as a card prints it: "0.7 mi" — metres along the walking
 * route from lib/walking.ts, not the straight line, so a place across a canyon
 * reads as far as it actually is. Time is left off on purpose: the number
 * people wanted on the card is how far, measured along the streets.
 *
 * `estimated` marks a straight-line guess standing in for a routed answer
 * (ORS unreachable, over quota, or this one pair unroutable) with a leading
 * `~`, so a guess never passes for a measured route.
 */
export function formatWalk(meters: number, estimated: boolean): string {
  return `${estimated ? "~" : ""}${milesDigits(meters / METERS_PER_MILE)} mi`;
}
