import { distanceLabel, type Coords } from "@/lib/geo";

/**
 * The distance a taste pick or an Our Picks card prints, for the accounts on
 * lib/forMeGate.ts (every caller is already behind that gate; the others pass
 * null coords and never get here).
 *
 * This is a plain module, not part of TastePickCard (a "use client" file), so
 * OurPicks and any future server-side caller can import it as a real function.
 *
 * The grid shows the server's figure: inside 3 mi that is a routed walk, or an
 * estimate with a leading `~` when ORS can't answer. Taste picks and Our Picks
 * come from requests with no position, so they carry no such figure. `served`,
 * when the caller has it, maps a restaurant id to the label the grid card for
 * that restaurant printed, and wins, so the two read identically. Without it
 * this stays the straight-line figure from `distanceLabel`: re-deriving the
 * server's `~` estimate here would copy its radius and multiplier and drift
 * from the grid, and would print a figure no surface shows when routing works.
 */
export function pickDistanceLabel(
  restaurant: Parameters<typeof distanceLabel>[0] & { id: string },
  coords: Coords | null,
  served?: ReadonlyMap<string, string>,
): string | null {
  return served?.get(restaurant.id) || distanceLabel(restaurant, coords);
}

/**
 * The `served` map above, built from a page of grid results: each row that
 * carries the server's own figure (`milesAway` is set only beside a distance
 * measured from the reader) maps its id to the label its card prints.
 */
export function servedDistances(
  results: readonly { id: string; milesAway?: number; distance?: string | null }[],
): ReadonlyMap<string, string> {
  const served = new Map<string, string>();
  for (const r of results) if (r.milesAway !== undefined && r.distance) served.set(r.id, r.distance);
  return served;
}
