/**
 * Which way the phone is pointing, for the map marker's heading cone.
 *
 * Three things make this harder than "read `alpha` off the event", and all
 * three are load-bearing:
 *
 * 1. **Only an *absolute* orientation is a compass.** `deviceorientation`
 *    fires on every device, but on many of them `alpha` is measured from
 *    wherever the page happened to start rather than from north — a reading
 *    that looks perfectly plausible and points somewhere arbitrary. A heading
 *    is taken only from Safari's `webkitCompassHeading` or from an event that
 *    says `absolute`; anything else is dropped rather than drawn.
 * 2. **The reading is relative to the top of the *device*, not the screen.**
 *    Turn the phone sideways and the same physical heading arrives 90° out, so
 *    `screen.orientation.angle` is added back.
 * 3. **Raw compass output jitters several degrees.** Fed straight to the
 *    marker it twitches constantly, which reads as a fault rather than as a
 *    live sensor. Readings are smoothed as unit vectors (averaging degrees
 *    directly breaks across the 359°/0° seam) and only published when the
 *    smoothed value has actually moved.
 *
 * `request()` must be called **from a user gesture**: iOS gates the sensor
 * behind `DeviceOrientationEvent.requestPermission()`, which throws if it is
 * called from anywhere else. It is invoked from the map's locate button, which
 * is a tap by construction.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type HeadingState =
  /** Never asked, or asked and no usable reading has arrived. */
  | "idle"
  /** Subscribed and publishing headings. */
  | "live"
  /** iOS said no. There is no second prompt. */
  | "denied"
  /** No orientation API here at all — every desktop without a compass. */
  | "unsupported";

export type Heading = {
  /** Degrees clockwise from true north, or null when unknown. */
  heading: number | null;
  state: HeadingState;
  request: () => void;
};

/** Safari reports a true-north heading directly; nothing else does. */
type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

/** iOS 13+ only. Absent everywhere else, which is the feature detection. */
type PermissionGate = { requestPermission?: () => Promise<"granted" | "denied" | "default"> };

/** Weight given to each new reading. Lower is calmer and laggier. */
const SMOOTHING = 0.25;
/** Degrees the smoothed heading must move before the marker is told. */
const PUBLISH_STEP = 1.5;

/**
 * Whether asking for a heading here will raise a permission dialog — which is
 * iOS and nowhere else.
 *
 * Callers use it to decide whether they may subscribe without a tap. Where
 * there is no gate the sensor is simply readable, so a map that opens on the
 * reader can show the cone straight away; where there is one, `request()` has
 * to wait for a gesture or it throws.
 */
export function headingNeedsPermission() {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  return typeof (DeviceOrientationEvent as unknown as PermissionGate).requestPermission === "function";
}

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** How far apart two headings are, the short way round the circle. */
const angleGap = (a: number, b: number) => {
  const raw = Math.abs(norm(a) - norm(b));
  return raw > 180 ? 360 - raw : raw;
};

const screenAngle = () => {
  if (typeof screen === "undefined") return 0;
  const angle = screen.orientation?.angle;
  return typeof angle === "number" ? angle : 0;
};

export function useHeading(): Heading {
  const [heading, setHeading] = useState<number | null>(null);
  const [state, setState] = useState<HeadingState>("idle");
  /* The smoothed heading as a unit vector, and what was last published. Refs
     rather than state: they change on every sensor event (tens per second) and
     nothing renders from them — only the published degrees do. */
  const vectorRef = useRef<{ x: number; y: number } | null>(null);
  const publishedRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const subscribe = useCallback(() => {
    if (cleanupRef.current) return;

    /* Chrome fires the absolute variant; Safari fires the plain one and hangs
       webkitCompassHeading off it. Listening to both would mix two conventions
       on any browser that grew support for the pair, so pick one. */
    const eventName =
      "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";

    const onReading = (event: Event) => {
      const orientation = event as CompassEvent;
      let degrees: number;

      if (
        typeof orientation.webkitCompassHeading === "number" &&
        !Number.isNaN(orientation.webkitCompassHeading)
      ) {
        degrees = orientation.webkitCompassHeading;
      } else if (orientation.absolute && typeof orientation.alpha === "number") {
        // alpha counts anticlockwise from north; a compass counts clockwise.
        degrees = 360 - orientation.alpha;
      } else {
        // Point 1 in the header: a relative alpha is not a heading. Drop it.
        return;
      }

      degrees = norm(degrees + screenAngle());

      const radians = (degrees * Math.PI) / 180;
      const next = { x: Math.cos(radians), y: Math.sin(radians) };
      const previous = vectorRef.current;
      const blended = previous
        ? {
            x: previous.x + (next.x - previous.x) * SMOOTHING,
            y: previous.y + (next.y - previous.y) * SMOOTHING,
          }
        : next;
      vectorRef.current = blended;

      const smoothed = norm((Math.atan2(blended.y, blended.x) * 180) / Math.PI);
      const published = publishedRef.current;
      if (published !== null && angleGap(published, smoothed) < PUBLISH_STEP) return;

      publishedRef.current = smoothed;
      setHeading(smoothed);
      setState("live");
    };

    window.addEventListener(eventName, onReading);
    cleanupRef.current = () => {
      window.removeEventListener(eventName, onReading);
      cleanupRef.current = null;
    };
  }, []);

  const request = useCallback(() => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setState("unsupported");
      return;
    }

    const gate = DeviceOrientationEvent as unknown as PermissionGate;
    if (typeof gate.requestPermission !== "function") {
      // Everything that is not iOS: no gate, just listen. Whether a compass
      // actually exists shows up as readings arriving or not.
      subscribe();
      return;
    }

    gate
      .requestPermission()
      .then((result) => {
        if (result === "granted") subscribe();
        else setState("denied");
      })
      /* Thrown when the call did not come from a user gesture, and by
         WKWebView builds where the gate exists but the sensor does not. Both
         mean the same thing here: no cone. */
      .catch(() => setState("denied"));
  }, [subscribe]);

  useEffect(() => () => cleanupRef.current?.(), []);

  return { heading, state, request };
}
