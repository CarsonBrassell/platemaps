"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

/** Two taps closer together than this are one gesture. */
const DOUBLE_TAP_MS = 320;
/** How long the pop stays mounted — matches `heart-pop` in globals.css. */
const POP_MS = 800;

/**
 * Double-tap-to-react for a feed card. Hand it the reaction; it returns the
 * click handler for the card body and a key that is non-zero while the pop
 * should be showing (and changes on every fire, so a second double-tap
 * restarts the animation instead of being swallowed by the first).
 *
 * Timed by hand rather than via `onDoubleClick`: iOS Safari only fires
 * `dblclick` on elements that have opted out of double-tap zoom, and even
 * then not consistently, while `click` fires everywhere. The card sets
 * `touch-action: manipulation` so the second tap isn't eaten as a zoom.
 *
 * Anything interactive inside the card is left alone: two fast presses on
 * Share, a carousel arrow or the options menu do exactly what two presses
 * on them always did, and never react. That check is here, once, rather
 * than in each card.
 *
 * `onDoubleTap` returns whether to show the pop — false when the tap was
 * turned into a sign-in prompt instead.
 */
export function useDoubleTap(onDoubleTap: () => boolean) {
  const lastTap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popKey, setPopKey] = useState(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select, [role='menu'], [role='dialog']")) return;

      const now = Date.now();
      const isSecond = now - lastTap.current < DOUBLE_TAP_MS;
      // A third tap starts a fresh pair rather than chaining off the second.
      lastTap.current = isSecond ? 0 : now;
      if (!isSecond) return;

      // On a desktop, the second click of a double-click also selects the
      // word under the cursor. That highlight is noise next to the pop.
      window.getSelection()?.removeAllRanges();

      if (!onDoubleTap()) return;

      setPopKey(now);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPopKey(0), POP_MS);
    },
    [onDoubleTap],
  );

  return { onClick, popKey };
}
