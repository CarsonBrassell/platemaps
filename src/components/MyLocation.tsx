"use client";

/**
 * "You are here" on the night map — the dot, its accuracy halo, and the cone
 * that says which way you are facing.
 *
 * ## Why this is a DOM marker when the restaurants are not
 *
 * AGENTS.md rules out per-restaurant DOM markers, and that rule stands: it
 * exists because 4,650 elements are what made this map lag. This is one
 * element for one person, updated a few times a minute — the cost the rule is
 * about does not arise, and the alternative (a GeoJSON source for a single
 * point) cannot draw a rotating cone or a halo measured in metres.
 *
 * ## The marker lies on the street, not on the glass
 *
 * `pitchAlignment` and `rotationAlignment` are both `"map"`, so as the camera
 * leans into the skyline angle at high zoom the cone lies flat on the road
 * with it. A screen-aligned cone on a pitched map points somewhere the reader
 * is not facing, which is worse than showing no direction at all.
 *
 * ## The halo is real
 *
 * Its radius is the browser's own accuracy figure in metres, projected to
 * pixels through the map's own projection and recomputed as the camera moves,
 * so it shrinks as you zoom out the way a real circle on the ground does. It
 * is clamped at both ends: below the floor it reads as decoration around the
 * dot, and a 2km wifi fix would otherwise wash the whole frame.
 */

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { Marker, type IControl, type Map as MapLibreMap } from "maplibre-gl";
import { headingNeedsPermission, useHeading } from "@/lib/heading";
import { claimOpeningCamera } from "@/lib/mapCamera";
import { useMyLocation, type Fix, type MyLocationState } from "@/lib/myLocation";

/** Where the camera lands when someone asks to be shown. */
const RECENTER_ZOOM = 16;
/** Halo radius bounds, in screen pixels. See the header. */
const MIN_HALO_PX = 13;
const MAX_HALO_PX = 200;
/** Metres per degree of longitude at the equator, for the halo projection. */
const METRES_PER_DEGREE = 111_320;

const LOCATE_ICON = `
<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
     stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
  <circle cx="12" cy="12" r="6.2"/>
  <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
  <path d="M12 1.6v3.2M12 19.2v3.2M22.4 12h-3.2M4.8 12H1.6"/>
</svg>`;

/**
 * The button, as a MapLibre control rather than as JSX.
 *
 * It belongs in the top-left stack under the zoom buttons — it is the same
 * *kind* of control as those, and DESIGN.md's three ranks are explicit that
 * controls of one rank wear one set of clothes. Registering it with MapLibre
 * puts it in that stack and inherits the whole `.maplibregl-ctrl-group`
 * treatment in globals.css for free; a hand-positioned JSX button would have
 * to re-state the styling and re-guess the offset every time the zoom control
 * changed size.
 *
 * The click handler is read through a ref at click time rather than captured
 * at construction, so the control is added to the map exactly once while the
 * handler it calls stays current.
 */
class LocateControl implements IControl {
  private container: HTMLDivElement | null = null;
  button: HTMLButtonElement | null = null;

  constructor(private readonly onPress: () => void) {}

  onAdd() {
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-locate-btn";
    button.innerHTML = LOCATE_ICON;
    button.addEventListener("click", () => this.onPress());

    container.appendChild(button);
    this.container = container;
    this.button = button;
    return container;
  }

  onRemove() {
    this.container?.remove();
    this.container = null;
    this.button = null;
  }

  /** What the glyph's colour and the button's label are currently saying. */
  applyState(state: MyLocationState, label: string) {
    const button = this.button;
    if (!button) return;
    button.dataset.state = state;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.disabled = state === "denied" || state === "unsupported";
  }
}

/** What the button says it will do, per state. */
const BUTTON_LABEL: Record<MyLocationState, string> = {
  idle: "Show my location",
  locating: "Finding you…",
  ready: "Centre on my location",
  denied: "Location is blocked for this site",
  failed: "Couldn't get a location — tap to retry",
  unsupported: "This browser has no location",
};

function buildMarkerElement(coneGradientId: string) {
  const element = document.createElement("div");
  element.className = "map-me";
  /* The cone is SVG rather than a masked conic-gradient div. The CSS version
     renders as a hard-edged wedge in some stacking contexts — the mask is
     silently dropped and the shape squares off — and a location marker that
     occasionally turns into a pale rectangle is not shippable. A path with a
     radial fill has no such failure mode. */
  element.innerHTML = `
    <div class="map-me-halo"></div>
    <svg class="map-me-cone" viewBox="-100 -100 200 200" width="200" height="200" aria-hidden="true">
      <defs>
        <!-- userSpaceOnUse, centred on the apex, radius equal to the arc's.
             The default objectBoundingBox units measure against the wedge's
             bounding box, which is not square — the fade finished well before
             the arc and left a cone so washed out it was invisible on real
             tiles even at double these opacities. The r here and the 58 in the path
             below are the same number and have to move together.

             The stops run near-white at the apex to blue at the arc, so the
             cone reads as a beam leaving the dot rather than as a second
             wash of the halo colour. Set against the night style at street
             zoom, not picked: at the mockup's flat 0.4 the wedge was
             invisible on lit tiles, because the halo it sits inside is the
             same blue. -->
        <radialGradient id="${coneGradientId}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="58">
          <stop offset="0%" stop-color="#e6f6ff" stop-opacity="0.85"/>
          <stop offset="62%" stop-color="#96d6ff" stop-opacity="0.38"/>
          <stop offset="100%" stop-color="#96d6ff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <path d="M0 0 L-38.8 -43.1 A 58 58 0 0 1 38.8 -43.1 Z" fill="url(#${coneGradientId})"/>
    </svg>
    <div class="map-me-core"></div>`;
  return element;
}

/** The accuracy radius in screen pixels, through the map's own projection. */
function haloPixels(map: MapLibreMap, fix: Fix) {
  const degrees = fix.accuracy / (METRES_PER_DEGREE * Math.cos((fix.lat * Math.PI) / 180));
  const centre = map.project([fix.lng, fix.lat]);
  const edge = map.project([fix.lng + degrees, fix.lat]);
  const radius = Math.abs(edge.x - centre.x);
  return Math.min(MAX_HALO_PX, Math.max(MIN_HALO_PX, radius));
}

export function MyLocation({ mapRef }: { mapRef: RefObject<MapLibreMap | null> }) {
  const { state, fix, request: requestFix } = useMyLocation();
  const { heading, request: requestHeading } = useHeading();
  const markerRef = useRef<Marker | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<LocateControl | null>(null);
  const pressRef = useRef<() => void>(() => {});
  /** False until the first fix has flown the camera to it. */
  const hasFlownRef = useRef(false);
  /* The cone's gradient needs an id, and `url(#…)` will not resolve one
     containing punctuation — React 19's useId returns `«r0»`, guillemets and
     all, which fails silently: the path renders with no fill and the cone
     simply does not appear. Strip to alphanumerics. */
  const coneGradientId = `map-me-cone-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  /**
   * The map, once it exists.
   *
   * `mapRef` is filled by RestaurantMap's own init effect, and a child's
   * effects run *before* its parent's — so on the first pass the ref is still
   * null and everything below would quietly never run. Watching for it is the
   * price of taking the map as a ref, which is the seam this component was
   * given. A timer rather than `requestAnimationFrame` on purpose: rAF is
   * throttled to a standstill in a background tab, and a map opened in one
   * would come back with no locate button at all.
   */
  const [map, setMap] = useState<MapLibreMap | null>(null);
  useEffect(() => {
    if (mapRef.current) {
      setMap(mapRef.current);
      return;
    }
    const timer = setInterval(() => {
      if (!mapRef.current) return;
      setMap(mapRef.current);
      clearInterval(timer);
    }, 60);
    return () => clearInterval(timer);
  }, [mapRef]);

  const press = useCallback(() => {
    /* Once the watch is running the button's job is recentring — `request()`
       is a no-op by then, so a second tap must do something or the control
       reads as broken. Heading is asked for on every press and not only the
       first: iOS can hand back a denial that a later tap is allowed to retry,
       and re-subscribing when already live costs nothing. */
    if (state === "ready" && fix && map) {
      map.easeTo({
        center: [fix.lng, fix.lat],
        zoom: Math.max(map.getZoom(), RECENTER_ZOOM),
        duration: 900,
      });
    }
    requestFix();
    requestHeading();
  }, [fix, map, requestFix, requestHeading, state]);

  useEffect(() => {
    pressRef.current = press;
  }, [press]);

  // The control, added once the map exists.
  useEffect(() => {
    if (!map || state === "unsupported") return;

    const control = new LocateControl(() => pressRef.current());
    controlRef.current = control;
    map.addControl(control, "top-left");

    return () => {
      controlRef.current = null;
      if (map.hasControl(control)) map.removeControl(control);
    };
  }, [map, state]);

  /**
   * Opening the map already standing on your own marker.
   *
   * nearby.ts's doctrine — never raise the prompt on load, spend the one
   * chance at it on a tap that explains itself — is about the *prompt*, not
   * about the fix. Once permission has been granted for this origin there is
   * no prompt left to raise, so taking a fix costs the reader nothing and the
   * map can open where they actually are. Before that, the button is still the
   * only way in, and it is still the thing that explains itself.
   *
   * The heading rides along only where reading it raises no dialog of its own
   * — everywhere except iOS, which needs the gesture and gets it from the
   * button instead.
   */
  useEffect(() => {
    if (!map || state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;

    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        requestFix();
        if (!headingNeedsPermission()) requestHeading();
      })
      /* Firefox has thrown on this query for a geolocation descriptor before.
         Failing to ask is not an error here — it just leaves the button. */
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [map, requestFix, requestHeading, state]);

  /* What the button looks like and announces. `map` is a dependency because
     the control above is created when the map arrives, which is after this
     component's first pass — without it the button would keep the bare markup
     it was born with until the state happened to change. */
  useEffect(() => {
    controlRef.current?.applyState(state, BUTTON_LABEL[state] ?? BUTTON_LABEL.idle);
  }, [map, state]);

  // The marker itself: created on the first fix, moved by every later one.
  useEffect(() => {
    if (!map || !fix) return;

    if (!markerRef.current) {
      const element = buildMarkerElement(coneGradientId);
      elementRef.current = element;
      markerRef.current = new Marker({
        element,
        pitchAlignment: "map",
        rotationAlignment: "map",
      })
        .setLngLat([fix.lng, fix.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([fix.lng, fix.lat]);
    }

    if (!hasFlownRef.current) {
      hasFlownRef.current = true;
      /* Claimed before the camera moves, not after: RestaurantMap's opening
         dive to the corpus bounds may still be pending, and the claim is what
         tells it to stand down rather than fly the reader away from their own
         marker a second later. See lib/mapCamera.ts. */
      claimOpeningCamera(map);
      /* `maxBounds` is San Diego County, so a visitor outside it keeps the
         camera at the edge and the marker stays off-frame. That is the honest
         outcome for a county-scoped map — the alternative is flying to a place
         this map has nothing to say about. */
      map.easeTo({
        center: [fix.lng, fix.lat],
        zoom: Math.max(map.getZoom(), RECENTER_ZOOM),
        duration: 1200,
      });
    }
  }, [coneGradientId, fix, map]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
      elementRef.current = null;
    },
    [],
  );

  // The cone: shown only while a real compass heading is arriving.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.dataset.heading = heading === null ? "off" : "on";
    markerRef.current?.setRotation(heading ?? 0);
  }, [heading, fix]);

  // The halo, in metres, kept honest as the camera moves.
  useEffect(() => {
    const element = elementRef.current;
    if (!map || !element || !fix) return;

    const resize = () => {
      element.style.setProperty("--map-me-halo", `${haloPixels(map, fix)}px`);
    };
    resize();
    map.on("move", resize);
    return () => {
      map.off("move", resize);
    };
  }, [fix, map]);

  return null;
}
