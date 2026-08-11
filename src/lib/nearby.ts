/**
 * Where the visitor is, for Discover's "Nearby" filter.
 *
 * PRODUCT.md puts proximity at the centre of the decision this app serves —
 * "what should I eat tonight" is answered from places you could actually reach
 * — but nothing in the app had ever asked the browser where the phone is. The
 * `distance` strings on each restaurant are seeded relative to a fixed
 * downtown origin, so they can't answer it either.
 *
 * Location is requested only when the visitor taps Nearby, never on load. A
 * permission prompt that appears before anyone asked for it gets denied out of
 * reflex, and a denial is sticky per origin — so the one chance at the prompt
 * is spent on the tap that explains why it's being asked.
 */

import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * The geometry moved to lib/geo.ts so the server can filter on distance without
 * importing a module that calls `useState` — see the note there. Re-exported
 * because these were part of this file's surface first.
 */
export { NEARBY_RADIUS_MI, milesBetween, type Coords } from "@/lib/geo";

// A re-export does not put the name in this file's own scope, and `Nearby`
// below is written in terms of it.
import type { Coords } from "@/lib/geo";

export type NearbyState =
  /** Never asked. The row is offered and the prompt hasn't been raised. */
  | "idle"
  /** Prompt is up, or the fix is still being taken. */
  | "locating"
  /** We have coordinates. */
  | "ready"
  /** The visitor said no, or the origin is already blocked. */
  | "denied"
  /** Position unavailable or timed out — worth retrying, unlike a denial. */
  | "failed"
  /** No geolocation API at all; the row never renders. */
  | "unsupported";

export type Nearby = {
  state: NearbyState;
  coords: Coords | null;
  /** Raises the permission prompt. A no-op once coordinates are in hand. */
  request: () => void;
};

/**
 * Whether the browser has a geolocation API, read as an external store rather
 * than latched into state by an effect — same reason and same shape as
 * lib/clock.ts. `navigator` doesn't exist while the page is prerendered, so
 * the server snapshot answers "yes" and the row renders in the static HTML;
 * the client corrects it on the first read, which only ever removes a row on
 * the handful of browsers without the API.
 *
 * Support can't change while the page is open, so there is nothing to
 * subscribe to and the unsubscribe is a no-op.
 */
const subscribeToNothing = () => () => {};
const geolocationSupported = () =>
  typeof navigator !== "undefined" && "geolocation" in navigator;
const geolocationSupportedOnServer = () => true;

export function useNearby(): Nearby {
  const [state, setState] = useState<Exclude<NearbyState, "unsupported">>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);

  const supported = useSyncExternalStore(
    subscribeToNothing,
    geolocationSupported,
    geolocationSupportedOnServer,
  );

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setState("ready");
      },
      (error) => {
        setState(error.code === error.PERMISSION_DENIED ? "denied" : "failed");
      },
      {
        // Street-level accuracy is pointless against a 5-mile radius, and the
        // high-accuracy path costs a GPS fix and seconds of waiting. A fix from
        // the last five minutes is just as good for this question.
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 300_000,
      },
    );
  }, []);

  return { state: supported ? state : "unsupported", coords, request };
}
