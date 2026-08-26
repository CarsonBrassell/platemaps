/**
 * Who owns the map's opening camera.
 *
 * Two things want to move the camera the moment the map appears and they want
 * different places: `RestaurantMap` dives from the county frame down onto the
 * bounds of whatever restaurants it just loaded, and `MyLocation` flies to the
 * reader. Whichever arrives second wins, and which that is depends on how fast
 * the fix and the feed happen to come back — so without a rule the map lands
 * somewhere different on every load, and a reader outside the downtown core
 * watches their own marker get thrown off screen by the dive.
 *
 * The rule: **the reader's own position outranks the corpus.** If a fix landed,
 * the marker claims the opening camera and the dive is skipped. Only the
 * *opening* one — a later refit, when the set of restaurants genuinely changes
 * because the Discover/Friends switch moved, still happens.
 *
 * A WeakSet keyed by the map keeps this out of both components' props and lets
 * the entry die with the map instance.
 */

import type { Map as MapLibreMap } from "maplibre-gl";

const claimed = new WeakSet<MapLibreMap>();

/** Called by whoever moved the camera to somewhere the reader asked for. */
export function claimOpeningCamera(map: MapLibreMap) {
  claimed.add(map);
}

export function openingCameraClaimed(map: MapLibreMap) {
  return claimed.has(map);
}
