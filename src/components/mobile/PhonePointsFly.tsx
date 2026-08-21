"use client";

import { useEffect, useRef, useState } from "react";
import { PlateStarIcon } from "@/components/icons";
import { landAward, usePointsAward, usePostFlash } from "@/lib/postCelebration";

/**
 * The +10 that flies from the plate you just posted into your points chip.
 *
 * Rendered from `PhoneShell` alongside `PostFlash`, and for the same reason:
 * it travels between two components — the card in the feed and the chip in the
 * header — that have no relationship to each other, so it belongs above both.
 * It reads the award out of `lib/postCelebration`; the feed only announces.
 *
 * ## Why it waits for the flash
 *
 * The feed announces the award as soon as the plate is in the list, which is
 * routinely a second or two before the white screen comes down — the flash has
 * a 3.5s floor so the mark can be eaten. Flying then would play the whole thing
 * behind the curtain. So the flight is gated on the flash being *down*, and
 * then delayed again past the spit's own landing, so the token leaves a card
 * that has stopped moving.
 *
 * ## Coordinates, and the one trap in them
 *
 * `getBoundingClientRect` is viewport-relative, but a `position: fixed` child
 * of `.pm-phone-shell` is **not** always viewport-positioned: at >=480px the
 * shell is transformed, which makes it the containing block, so fixed means
 * "the 390px frame" (see phone.css). On a handset it means the viewport. Rather
 * than branch on the breakpoint, the layer measures *itself* — it is the
 * coordinate system, so every rect is converted by subtracting the layer's own
 * origin and the same code is correct in both.
 */

/** After the flash is down: long enough for the spit (0.9s) to have settled. */
const APPEAR_DELAY = 780;

/** Kept in step with the `points-fly` animation in phone.css. */
const FLY_MS = 900;

type Flight = { x: number; y: number; dx: number; dy: number };

export function PhonePointsFly() {
  const award = usePointsAward();
  const flashOpen = usePostFlash();
  const layerRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<Flight | null>(null);

  const waiting = !!award && !award.arrived;

  useEffect(() => {
    if (!waiting || flashOpen) return;

    const start = setTimeout(() => {
      const layer = layerRef.current?.getBoundingClientRect();
      const from = document.querySelector("[data-pm-landed]")?.getBoundingClientRect();
      const to = document.querySelector("[data-pm-points]")?.getBoundingClientRect();

      /* No card or no chip — signed out, scrolled away, a post that never came
         back. Bank it without the animation rather than leaving the header
         holding a total that is quietly wrong. */
      if (!layer || !from || !to) {
        landAward();
        return;
      }

      const x = from.left + from.width / 2 - layer.left;
      /* Not the card's centre: a featured card is most of the screen tall and
         the token would launch from below the fold. Just inside its top edge is
         where the eye already is when it lands. */
      const y = from.top + 48 - layer.top;
      setFlight({
        x,
        y,
        dx: to.left + to.width / 2 - layer.left - x,
        dy: to.top + to.height / 2 - layer.top - y,
      });
    }, APPEAR_DELAY);

    return () => clearTimeout(start);
  }, [waiting, flashOpen]);

  /* The arrival is timed rather than taken from `animationend`, which does not
     fire if the tab is backgrounded mid-flight — and a token that never lands
     leaves the header showing the pre-award total for good. */
  useEffect(() => {
    if (!flight) return;
    const done = setTimeout(landAward, FLY_MS);
    return () => clearTimeout(done);
  }, [flight]);

  /* Cleared for the next post, so a second plate flies from scratch. */
  useEffect(() => {
    if (award) return;
    const reset = setTimeout(() => setFlight(null), 0);
    return () => clearTimeout(reset);
  }, [award]);

  return (
    <div ref={layerRef} className="points-fly-layer" aria-hidden={!flight}>
      {flight && award && !award.arrived && (
        <span
          className="points-fly"
          style={
            {
              left: `${flight.x}px`,
              top: `${flight.y}px`,
              "--fly-dx": `${flight.dx}px`,
              "--fly-dy": `${flight.dy}px`,
            } as React.CSSProperties
          }
        >
          <PlateStarIcon className="h-4 w-5" />+{award.earned}
        </span>
      )}

      {/* The award said out loud, for anyone who is not watching it fly. */}
      <p role="status" className="sr-only">
        {award ? `Earned ${award.earned} PM Points` : ""}
      </p>
    </div>
  );
}
