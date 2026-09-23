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

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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
  /** The saved address, if one is set — see `SavedLocation` below. */
  saved: { label: string } | null;
  /** Saves an address as this device's location, taking over from GPS. */
  setSavedLocation: (loc: SavedLocation) => void;
  /** Drops the saved address and returns to ordinary GPS behaviour. */
  clearSavedLocation: () => void;
};

/**
 * A typed address, geocoded once (src/app/api/geocode/route.ts) and kept on
 * this device only — no DB column, no account setting. Desktop Windows rarely
 * has usable GPS, and "where I'm asking from" is a fine thing to just type.
 *
 * Stored the same way `myLocation.ts` stores `readLastFix`: `localStorage`,
 * wrapped in try/catch because Safari private mode throws on read, and never
 * sent anywhere — the address itself never reaches this file at all, only
 * the coordinates and the short label the geocode route already reduced it
 * to.
 */
export type SavedLocation = { lat: number; lng: number; label: string };

const SAVED_LOCATION_KEY = "platemaps:saved-location";

function readSavedLocation(): SavedLocation | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SAVED_LOCATION_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<SavedLocation>;
    if (
      typeof stored.lat !== "number" ||
      typeof stored.lng !== "number" ||
      typeof stored.label !== "string"
    ) {
      return null;
    }
    return { lat: stored.lat, lng: stored.lng, label: stored.label };
  } catch {
    return null;
  }
}

/*
 * A plain module-level external store, not React state: `useNearby` is called
 * from more than one component at once (the filters rail and the results grid
 * each hold their own instance), and setting an address in one has to be seen
 * by all of them on the same render rather than after a prop threaded down
 * from a common ancestor that doesn't exist. `useSyncExternalStore` is the
 * documented way to subscribe a hook to state that lives outside React;
 * the `storage` event is what closes the loop across two tabs open on the
 * same device.
 *
 * `cached` is read lazily rather than at module load — this file is imported
 * by client components that can themselves be evaluated during SSR, where
 * `localStorage` does not exist.
 */
let cached: SavedLocation | null | undefined;
const savedLocationListeners = new Set<() => void>();

function notifySavedLocationChanged() {
  cached = readSavedLocation();
  for (const listener of savedLocationListeners) listener();
}

let storageListenerAttached = false;
function subscribeToSavedLocation(listener: () => void): () => void {
  savedLocationListeners.add(listener);
  if (!storageListenerAttached && typeof window !== "undefined") {
    storageListenerAttached = true;
    // Fires only for a *different* tab's write to this key — this tab's own
    // writes go through `setSavedLocation`/`clearSavedLocation` below, which
    // notify directly.
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key === SAVED_LOCATION_KEY) notifySavedLocationChanged();
    });
  }
  return () => {
    savedLocationListeners.delete(listener);
  };
}

function getSavedLocationSnapshot(): SavedLocation | null {
  if (cached === undefined) cached = readSavedLocation();
  return cached;
}

/** No saved location exists in prerendered HTML — there is no browser yet to
    have saved one — so hydration always starts from "none" and corrects on
    the client's first read, same shape as `geolocationSupportedOnServer`. */
function getSavedLocationServerSnapshot(): SavedLocation | null {
  return null;
}

/** Saves an address as this device's location. Exported standalone (not just
    through the hook) so it stays one function no matter how many components
    call it. */
export function setSavedLocation(loc: SavedLocation): void {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(SAVED_LOCATION_KEY, JSON.stringify(loc));
    } catch {
      // Quota or a blocked store — the tab that just set it still gets the
      // in-memory value below, it just won't survive a reload.
    }
  }
  notifySavedLocationChanged();
}

export function clearSavedLocation(): void {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(SAVED_LOCATION_KEY);
    } catch {
      // See setSavedLocation.
    }
  }
  notifySavedLocationChanged();
}

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

  const saved = useSyncExternalStore(
    subscribeToSavedLocation,
    getSavedLocationSnapshot,
    getSavedLocationServerSnapshot,
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

  /*
   * A permission already granted raises no prompt, so taking a fix on mount
   * costs the visitor nothing and puts a real distance on every card from the
   * first render. The doctrine above is about the *prompt*: while the browser
   * would still ask, nothing here asks — that stays on the tap (or the search)
   * that explains why.
   */
  useEffect(() => {
    // A saved location already answers "where" — taking a GPS fix nobody
    // asked for while one is in effect would be work spent on an answer
    // nothing uses, and could flip `state` to "denied" under a saved address
    // that was never blocked.
    if (!supported || saved) return;
    const permissions = typeof navigator !== "undefined" ? navigator.permissions : undefined;
    if (!permissions || typeof permissions.query !== "function") return;
    let cancelled = false;
    permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (!cancelled && status.state === "granted") request();
      })
      .catch(() => {
        // No permissions API, or a browser that will not say — the tap still
        // works exactly as before.
      });
    return () => {
      cancelled = true;
    };
  }, [supported, saved, request]);

  // A saved location takes precedence over GPS: it answers `coords` directly,
  // in the `"ready"` state, without ever touching the geolocation API or its
  // permission prompt. Clearing it (`clearSavedLocation`) falls straight back
  // to whatever GPS had already resolved, with no re-request needed — `coords`
  // and `state` below are exactly what they were before a location was saved.
  return saved
    ? {
        state: "ready",
        coords: { lat: saved.lat, lng: saved.lng },
        request,
        saved: { label: saved.label },
        setSavedLocation,
        clearSavedLocation,
      }
    : {
        state: supported ? state : "unsupported",
        coords,
        request,
        saved: null,
        setSavedLocation,
        clearSavedLocation,
      };
}
