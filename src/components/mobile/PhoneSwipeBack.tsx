"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * How far in from the left edge the gesture has to start, in px.
 *
 * iOS uses roughly this, and the number is doing real work: any wider and a
 * thumb reaching for the first item in a row starts dragging the page instead
 * of pressing the thing it landed on.
 */
const EDGE = 28;
/**
 * Travel before the direction of a gesture can be read at all, in px.
 *
 * Deliberately tiny — see the note on the same constant in `Dialog`. The
 * browser settles whether a touch is a scroll on the first `touchmove` it
 * keeps, so a decision made after ten clean pixels is a decision made too
 * late to act on.
 */
const DECIDE_AT = 4;
/** Share of the screen it has to cross to count as a back. */
const BACK_FRACTION = 0.3;
/** px/ms that goes back whatever the distance — a flick, not a shove. */
const BACK_VELOCITY = 0.5;
/** How often the velocity mark is re-taken, so a flick at the end still reads. */
const VELOCITY_WINDOW = 60;
/** The slide-off before the route change is asked for, in ms. */
const EXIT_MS = 170;
/**
 * How long the screen is allowed to stay slid off waiting for the new route.
 *
 * The transform is normally cleared by the arrival of the next path. This is
 * the promise that it is cleared even if that never comes — without it, a
 * `back()` that goes nowhere leaves the user staring at an empty screen with
 * their page parked off the right-hand edge.
 */
const EXIT_BAILOUT_MS = 700;

/** History state as the App Router leaves it, plus the depth we add. */
type DepthState = Record<string, unknown> & { __pmDepth?: number };

/**
 * Edge-swipe to go back, for the pushed screens under /m.
 *
 * The app is a WebView pointed at the live site, so it gets none of the
 * gestures a native navigation controller would come with: a restaurant page
 * or a profile could only be left through the back arrow in its top-left
 * corner, which on a large phone is the one corner a thumb cannot reach. This
 * is that gesture, in the layer that can ship without an App Store build.
 *
 * Overlays are deliberately not its business — `Dialog` carries its own swipe
 * and knows things this cannot, like whether the thread underneath is scrolled
 * away from the top. While one is open this stands down entirely.
 */
export function PhoneSwipeBack() {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * How many screens deep this history entry is.
   *
   * `history.length` cannot answer that — it counts entries from before the
   * app was opened as readily as ones from inside it, so trusting it would let
   * a swipe on the first screen throw the user out to whatever the WebView had
   * loaded before. Counting navigations in a ref cannot answer it either: a
   * ref has no way to tell a back from a push, so it climbs by one on every
   * round trip until the root screen believes it is deep.
   *
   * So the depth rides in the history entry itself, which is the only thing
   * that already knows which screen it is. Going back finds the number that
   * was written when that entry was made.
   */
  const depth = useRef(0);
  /** The element being dragged, shared with the effect that clears it. */
  const contentRef = useRef<HTMLElement | null>(null);
  const bailoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const state = window.history.state as DepthState | null;
    if (typeof state?.__pmDepth === "number") {
      depth.current = state.__pmDepth;
    } else {
      depth.current += 1;
      // Merged, never replaced: the App Router keeps its own cache key in
      // here, and dropping it breaks its back/forward restore.
      window.history.replaceState({ ...state, __pmDepth: depth.current }, "");
    }

    // The new screen has arrived, so the old one can stop being held off the
    // edge. Clearing it here rather than next to `router.back()` is the whole
    // reason the exit does not flicker: releasing before the route changes
    // snaps the page you are leaving back into place first.
    if (bailoutRef.current) {
      clearTimeout(bailoutRef.current);
      bailoutRef.current = null;
    }
    const content = contentRef.current;
    if (content) {
      content.style.transition = "";
      content.style.transform = "";
    }
  }, [pathname]);

  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".pm-phone-content");
    if (!content) return;
    contentRef.current = content;

    let gesture:
      | {
          id: number;
          x: number;
          y: number;
          markAt: number;
          markTravel: number;
          settled: boolean;
          owned: boolean;
        }
      | null = null;
    let leaving = false;

    /** Hands the screen back without navigating. */
    function release() {
      const dragging = gesture?.owned;
      gesture = null;
      if (!dragging || !content) return;
      content.style.transition = `transform ${EXIT_MS}ms cubic-bezier(0.2,0,0,1)`;
      content.style.transform = "translateX(0px)";
    }

    function onStart(e: TouchEvent) {
      if (leaving) return;
      if (e.touches.length !== 1) {
        release();
        return;
      }
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      // The first screen has nothing behind it; a swipe there would leave the
      // app rather than the page.
      if (depth.current <= 1) return;
      // An open overlay does its own dismissing — see the note above.
      if (document.querySelector('[role="dialog"]')) return;
      // The map owns every drag inside it, edge or not.
      if ((e.target as HTMLElement).closest?.(".maplibregl-map,[data-no-swipe-back]")) return;

      gesture = {
        id: t.identifier,
        x: t.clientX,
        y: t.clientY,
        markAt: e.timeStamp,
        markTravel: 0,
        settled: false,
        owned: false,
      };
    }

    function onMove(e: TouchEvent) {
      const g = gesture;
      if (!g) return;
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t || t.identifier !== g.id) {
        release();
        return;
      }

      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;

      if (!g.settled) {
        if (Math.abs(dx) < DECIDE_AT && Math.abs(dy) < DECIDE_AT) return;
        g.settled = true;
        // `e.cancelable` is false once the page has started scrolling, and a
        // drag we cannot stop the scroll under is one we should not start.
        g.owned = dx > 0 && dx >= Math.abs(dy) && e.cancelable;
      }
      if (!g.owned) return;

      // Every move. A passive listener here — which is what a pointer handler
      // on `document` amounted to — let the WebView take the gesture the
      // instant the thumb arced downward, and cancel the swipe with it.
      e.preventDefault();

      const offset = Math.max(0, dx);
      if (e.timeStamp - g.markAt > VELOCITY_WINDOW) {
        g.markAt = e.timeStamp;
        g.markTravel = offset;
      }
      content!.style.transition = "none";
      content!.style.transform = `translateX(${offset}px)`;
    }

    function onEnd(e: TouchEvent) {
      const g = gesture;
      const t = e.changedTouches[0];
      if (!g || !g.owned || !t || t.identifier !== g.id) {
        release();
        return;
      }
      gesture = null;

      const offset = Math.max(0, t.clientX - g.x);
      const span = content!.clientWidth || 1;
      const speed = (offset - g.markTravel) / Math.max(1, e.timeStamp - g.markAt);

      content!.style.transition = `transform ${EXIT_MS}ms cubic-bezier(0.2,0,0,1)`;

      if (offset > span * BACK_FRACTION || speed > BACK_VELOCITY) {
        // Off the edge first, then the route change — going back on the same
        // frame swaps the screen while the old one is still mid-slide, which
        // reads as a glitch rather than a navigation. The transform is left
        // in place for the pathname effect above to clear on arrival.
        leaving = true;
        content!.style.transform = `translateX(${span}px)`;
        setTimeout(() => {
          leaving = false;
          router.back();
        }, EXIT_MS);
        bailoutRef.current = setTimeout(() => {
          bailoutRef.current = null;
          content!.style.transition = "";
          content!.style.transform = "";
        }, EXIT_BAILOUT_MS);
        return;
      }

      content!.style.transform = "translateX(0px)";
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    // A cancel is never a navigation — it means something else took the
    // finger, and a screen that goes back on it goes back at random.
    document.addEventListener("touchcancel", release);

    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", release);
      content.style.transition = "";
      content.style.transform = "";
      contentRef.current = null;
    };
  }, [router]);

  return null;
}
