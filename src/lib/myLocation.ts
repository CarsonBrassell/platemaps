/**
 * Where the visitor is, for the map's "you are here" marker.
 *
 * ## Why this is not `useNearby`
 *
 * `lib/nearby.ts` answers a different question with the same API. Discover's
 * Nearby filter wants **one** fix, good to a few hundred metres, to test
 * against a five-mile radius — so it takes a single low-accuracy reading and
 * happily accepts one up to five minutes old. A dot drawn on a street wants
 * the opposite: a high-accuracy fix that keeps arriving as you walk, because a
 * marker that lands half a block off, or that stays where you were five
 * minutes ago, is worse than no marker at all.
 *
 * The two hooks therefore differ in exactly three options and in
 * `watchPosition` vs `getCurrentPosition`. They deliberately do not share an
 * implementation: collapsing them would mean one of the two surfaces silently
 * paying for the other's accuracy or staleness. They do share the doctrine in
 * nearby.ts's header, which is the part that matters — **location is requested
 * only on a tap that explains why**, never on load, because a denial is sticky
 * per origin and there is only ever one chance at the prompt.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** A position fix, with the radius the browser thinks it is good to. */
export type Fix = {
  lat: number;
  lng: number;
  /** Metres. The browser's own 68%-confidence radius, drawn as the halo. */
  accuracy: number;
};

export type MyLocationState =
  /** Never asked. The control is offered and no prompt has been raised. */
  | "idle"
  /** Prompt is up, or the first fix is still being taken. */
  | "locating"
  /** A fix is in hand and the watch is running. */
  | "ready"
  /** The visitor said no, or the origin is already blocked. */
  | "denied"
  /** Position unavailable or timed out — worth retrying, unlike a denial. */
  | "failed"
  /** No geolocation API at all; the control never renders. */
  | "unsupported";

export type MyLocation = {
  state: MyLocationState;
  fix: Fix | null;
  /** Raises the prompt and starts the watch. A no-op once the watch runs. */
  request: () => void;
};

/* Same shape and same reasoning as nearby.ts: support cannot change while the
   page is open, so there is nothing to subscribe to, and the server snapshot
   answers "yes" so the control is in the prerendered HTML. */
const subscribeToNothing = () => () => {};
const geolocationSupported = () =>
  typeof navigator !== "undefined" && "geolocation" in navigator;
const geolocationSupportedOnServer = () => true;

export function useMyLocation(): MyLocation {
  const [state, setState] = useState<Exclude<MyLocationState, "unsupported">>("idle");
  const [fix, setFix] = useState<Fix | null>(null);
  const watchRef = useRef<number | null>(null);

  const supported = useSyncExternalStore(
    subscribeToNothing,
    geolocationSupported,
    geolocationSupportedOnServer,
  );

  const stop = useCallback(() => {
    if (watchRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    // Already watching: the button's job from here is recentring, not asking
    // the browser a second time.
    if (watchRef.current !== null) return;

    setState("locating");
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setFix({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setState("ready");
      },
      (error) => {
        /* A denial is final for this origin, so stop asking — leaving the watch
           running would have the browser re-attempt a fix it can never get. A
           timeout or an unavailable position is not final, so that watch stays
           up and may still deliver. */
        if (error.code === error.PERMISSION_DENIED) {
          stop();
          setState("denied");
          return;
        }
        setState((current) => (current === "ready" ? current : "failed"));
      },
      {
        // The opposite of nearby.ts's three, and see this file's header for
        // why: a marker on a street is exactly the case that needs the GPS
        // path and a fix from seconds rather than minutes ago.
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 5_000,
      },
    );
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { state: supported ? state : "unsupported", fix, request };
}
