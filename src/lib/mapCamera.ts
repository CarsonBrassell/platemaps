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
 * The rule: **the reader's own position outranks the corpus.** Once the camera
 * is claimed, RestaurantMap's automatic fits stand down — every one of them,
 * not merely the first. Scoping it to the first fit is what shipped the bug
 * this file was written to prevent: the feed arrives as an empty pass followed
 * by the real list, so the "first" fit was spent on the empty array and the
 * pass that actually flew to the downtown core sailed straight past the guard.
 *
 * Explicit fits are untouched — the search field flies the camera through its
 * own `fitBounds`, because that one is the reader asking.
 *
 * A WeakSet keyed by the map keeps this out of both components' props and lets
 * the entry die with the map instance.
 */

import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * How close the map sits when it is showing you where you are — block level,
 * near enough to read the street you are standing on. Shared because two
 * places open the camera there: RestaurantMap when it opens on a remembered
 * position, and MyLocation when a live fix arrives or the locate button is
 * pressed. They must agree, or pressing locate would visibly re-zoom a map
 * that was already in the right place.
 */
export const MY_LOCATION_ZOOM = 16;

const claimed = new WeakSet<MapLibreMap>();

/** Called by whoever moved the camera to somewhere the reader asked for. */
export function claimOpeningCamera(map: MapLibreMap) {
  claimed.add(map);
}

export function openingCameraClaimed(map: MapLibreMap) {
  return claimed.has(map);
}
