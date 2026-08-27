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
  /**
   * True while `fix` is the position remembered from a previous visit rather
   * than something the browser just measured. The marker is drawn either way —
   * a map that opens on your block and shows nothing standing there reads as
   * broken — but a remembered dot must not claim to be a live one.
   */
  stale: boolean;
  /** Raises the prompt and starts the watch. A no-op once the watch runs. */
  request: () => void;
};

/**
 * The last place a fix put you, remembered on this device.
 *
 * A fix takes anywhere from tens of milliseconds to several seconds, and the
 * map cannot wait for it — so without this it opens on the county frame and
 * then flies, and every visit begins with a second of being somewhere you are
 * not. Remembering where you were last lets the map *open* on you and correct
 * itself quietly when the live fix lands.
 *
 * It stays on the device and is never sent anywhere: the same reasoning that
 * keeps coordinates out of the URL in lib/discover.ts, which is about where a
 * position can be read from, not about whether it may be kept.
 *
 * Stale entries are dropped rather than trusted. Opening on the block you
 * stood on this morning is the whole point; opening on a city you visited last
 * month is a bug that looks like a broken map.
 */
const LAST_FIX_KEY = "platemaps:last-fix";
const LAST_FIX_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type StoredFix = Fix & { at: number };

export function readLastFix(): Fix | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_FIX_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredFix>;
    if (
      typeof stored.lat !== "number" ||
      typeof stored.lng !== "number" ||
      typeof stored.at !== "number" ||
      Date.now() - stored.at > LAST_FIX_MAX_AGE_MS
    ) {
      return null;
    }
    return {
      lat: stored.lat,
      lng: stored.lng,
      accuracy: typeof stored.accuracy === "number" ? stored.accuracy : 0,
    };
  } catch {
    // Unparseable, or storage is unavailable (Safari private mode throws on
    // read). Either way there is simply no remembered position.
    return null;
  }
}

function writeLastFix(fix: Fix) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_FIX_KEY, JSON.stringify({ ...fix, at: Date.now() }));
  } catch {
    // Quota or a blocked store. Remembering is an optimisation, not a feature.
  }
}

/* Same shape and same reasoning as nearby.ts: support cannot change while the
   page is open, so there is nothing to subscribe to, and the server snapshot
   answers "yes" so the control is in the prerendered HTML. */
const subscribeToNothing = () => () => {};
const geolocationSupported = () =>
  typeof navigator !== "undefined" && "geolocation" in navigator;
const geolocationSupportedOnServer = () => true;

export function useMyLocation(): MyLocation {
  const [state, setState] = useState<Exclude<MyLocationState, "unsupported">>("idle");
  /* Seeded from the remembered position so the marker is on the map in the
     first frame, standing where the map just opened, instead of appearing
     seconds later — or never, when the browser cannot get a fix at all. */
  const [fix, setFix] = useState<Fix | null>(readLastFix);
  const [stale, setStale] = useState(() => readLastFix() !== null);
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

    const accept = (position: GeolocationPosition) => {
      const next: Fix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      setFix(next);
      setStale(false);
      writeLastFix(next);
      setState("ready");
    };

    /* Stage one: whatever the browser can answer *fastest*, cached readings
       included. High accuracy is the expensive path — it wants a GPS or wifi
       scan, takes seconds, and on a desktop it frequently just times out — so
       asking for it first means the map sits there doing nothing in exactly
       the case where a coarse answer was available immediately. Its failures
       are ignored on purpose: stage two is the one that reports. */
    navigator.geolocation.getCurrentPosition(accept, () => {}, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 300_000,
    });

    /* Stage two: the precise reading, and the one that keeps arriving as you
       move. See this file's header for why a marker on a street wants this
       where Discover's radius filter does not. */
    watchRef.current = navigator.geolocation.watchPosition(accept, (error) => {
      /* A denial is final for this origin, so stop asking. Anything else is
         worth another go — but the watch has to be torn down for that to be
         possible, because `request()` above refuses to start a second one
         while the first is live. Leaving it up made the retry the button
         offers do nothing at all. */
      stop();
      setState((current) => {
        if (error.code === error.PERMISSION_DENIED) return "denied";
        // A stage-one fix may already have landed; a late watch timeout must
        // not overwrite a position that is on screen and correct.
        return current === "ready" ? current : "failed";
      });
    }, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 5_000,
    });
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { state: supported ? state : "unsupported", fix, stale, request };
}
