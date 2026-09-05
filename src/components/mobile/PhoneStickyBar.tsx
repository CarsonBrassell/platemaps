"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A control row that stays at the top of the screen and gets out of the way:
 * it rides up off the top as you scroll down into the content, and comes back
 * the instant you scroll up — without you having to flick all the way back to
 * the top of the list to reach it.
 *
 * The feed's tabs and the discover screen's search both used to scroll away
 * for good, on the argument this file's callers still carry: a 390px screen has
 * roughly 640 usable points of height and the nav already owns the bottom ~96,
 * so a permanently pinned row is a row of plates you never see. That argument
 * is about the *resting* state, and it still holds — the row is gone while you
 * are reading. What it never answered is the cost of getting back: on a feed
 * that pages, switching from Feed to Friends feed after twenty cards meant
 * scrolling through all twenty in reverse. This keeps the resting state and
 * removes the round trip.
 *
 * ## Why the sticky `top` offset moves, and not a transform
 *
 * The obvious build is `sticky top-0` plus `translateY(-100%)`, and it is
 * wrong here for a concrete reason: a transformed element becomes the
 * containing block for every `position: fixed` descendant. `PhoneFilterBar`
 * sits inside this bar on discover and it renders `PhoneFilterSheet`, which is
 * `fixed inset-0` and expects to pin to the phone frame (see the note in
 * PhoneFilterBar). Under a transform it would pin to a 90px-tall strip instead
 * — a full-screen sheet clipped to the height of the row that opened it.
 *
 * So the element stays untransformed and the sticky offset itself animates
 * between `0` and `-height`. Sticky clamps to the flow position going down, so
 * a negative `top` cannot lift the bar off the content above it while the page
 * is at rest — it only takes effect once the bar would otherwise have stuck.
 * That is also what makes the hidden state honest: the bar scrolls away exactly
 * as it always did, and "hidden" just means it declines to catch.
 *
 * ## The anchor, and why `offsetTop` cannot do its job
 *
 * Hiding is only allowed once the bar is genuinely stuck — otherwise a negative
 * `top` would be pulling at a row still sitting in the flow, under the content
 * above it. The obvious test is `scrollTop > bar.offsetTop + height`, and it is
 * silently wrong: **`offsetTop` on a stuck element reports where it is being
 * painted, not where it belongs in the flow.** Measured on /m/feed at
 * `scrollTop: 800`, the bar reported `offsetTop: 800` — the stuck position,
 * tracking the scroll exactly — so the comparison read `800 <= 890` at every
 * depth and the bar never hid once. It looked like the scroll handler was dead.
 *
 * The zero-height `anchor` below is a static element, so it stays where it
 * belongs and its client rect is the flow position the bar left behind. How far
 * it has travelled above the scroller's own top edge is the stick depth, which
 * is the real question, and it needs no stored measurements to survive a resize
 * or a change of screen.
 *
 * The bar carries its own opaque ground because content passes underneath it.
 *
 * ## Pinning under the clock, not under it
 *
 * `.pm-phone-content` (phone.css) carries `padding-top: env(safe-area-inset-top)`
 * so the *resting* position of every /m screen's first row clears the status
 * bar / Dynamic Island. That padding only buys the first paint, though —
 * `top: 0` is the scrollport's physical top edge, which on a real iPhone is
 * under the clock, and pinning this bar there put it right back under the
 * thing the padding was spent avoiding. On reveal it slid back in at `top: 0`
 * too, so the same gap reappeared on the first upward scroll.
 *
 * The offset this bar sticks at is `env(safe-area-inset-top, 0px)`, not `0` —
 * shown is `top: inset`, hidden is `top: calc(inset - height)`. That is one
 * spend of the inset, not two: the scroller's own padding still reserves it
 * once for the page at rest, and this only changes *where the sticky offset
 * measures from*, not a second padding stacked on top.
 *
 * That still leaves a gap for content to show through. Sticking `inset` px
 * down from the scrollport's edge means the bar covers `inset..(inset+height)`
 * while the band from `0..inset` — where the padding no longer reserves
 * anything, because scrolling has carried the page past it — is uncovered.
 * Whatever card is scrolled to that position paints straight through it,
 * visibly sliding under the clock. The `slab` below is what stops that: a
 * `position: fixed` strip the exact height of the inset, cream, sitting above
 * the bar (z-30) and below `PhoneNav` (z-40) so a full-screen sheet can still
 * cover it. It only needs to exist while the bar is `stuck` — at rest nothing
 * has scrolled into that band yet, the padding is still doing the job.
 *
 * On desktop the inset is 0: the slab is a 0-height strip, inert, and the top
 * offset resolves to plain `0`/`-height` — today's behaviour, unchanged.
 */
export function PhoneStickyBar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /* A zero-size probe rather than a stored number: `env()` has no JS-readable
     value, so the only way to learn the resolved inset is to lay it out and
     measure it, the same trick the anchor plays for stick depth. Kept in a
     plain ref, not state — nothing needs to re-render off it, `settle()` just
     wants the latest number when it runs. */
  const insetProbeRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  /* Drawn only once something has actually scrolled under the bar. At rest the
     row sits on the same cream as the screen and a line across it would be a
     border around nothing. */
  const [stuck, setStuck] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const bar = barRef.current;
    const anchor = anchorRef.current;
    const insetProbe = insetProbeRef.current;
    if (!bar || !anchor || !insetProbe) return;

    /* The document does not scroll under /m — `.pm-phone-content` is the
       scroller (phone.css). Falling back to the window keeps this component
       usable if it is ever rendered outside the phone shell. */
    const scroller = bar.closest<HTMLElement>(".pm-phone-content");
    const target: HTMLElement | Window = scroller ?? window;
    const readTop = () => (scroller ? scroller.scrollTop : window.scrollY);
    /* Where the top of the visible area is, in client coordinates. The frame is
       inset from the window on a desktop preview (phone.css), so this is not
       always 0. */
    const frameTop = () => (scroller ? scroller.getBoundingClientRect().top : 0);

    const measure = () => setHeight(bar.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);

    let insetPx = 0;
    const measureInset = () => {
      insetPx = insetProbe.getBoundingClientRect().height;
    };
    measureInset();
    const insetObserver = new ResizeObserver(measureInset);
    insetObserver.observe(insetProbe);

    let last = readTop();
    let frame = 0;

    const settle = () => {
      frame = 0;
      const y = readTop();
      /* How far the bar's flow position has gone above the top of the frame:
         0 while it is still travelling with the content, growing once it
         sticks. See the header note for why this is not `offsetTop`. */
      const depth = frameTop() - anchor.getBoundingClientRect().top;

      /* The bar's sticky offset is `insetPx`, not 0, so it catches the flow
         position that much earlier than depth 0 — a sticky `top: insetPx`
         sticks once the element's flow position would sit `insetPx` above the
         frame, which is `depth > -insetPx`, not `depth > 0`. On desktop
         `insetPx` is 0 and this is exactly the old comparison. */
      setStuck(depth > -insetPx);

      /* Not stuck far enough to hide into. Hiding right at the stick point
         would be legal but puts the whole animation on screen at the moment
         the first card reaches the bar, which reads as the row flinching. A
         bar-height of travel first — measured from the stick point, which is
         now `-insetPx` rather than `0`, so the threshold shifts by the same
         amount and the actual travel distance is unchanged. */
      if (depth < bar.offsetHeight - insetPx) {
        setHidden(false);
        last = y;
        return;
      }

      const delta = y - last;

      /* Revealing is not deadbanded: any upward movement, even one pixel,
         drops the bar back in on the spot. The deadband below exists for the
         opposite direction only — without it, momentum scrolling on iOS
         reports the odd pixel of backwards travel at the end of a downward
         flick, and the bar would flinch back down every time a scroll comes
         to rest. Applying that same tolerance to upward motion is what used
         to swallow the first few pixels of a reveal and made it feel
         delayed instead of instant. */
      if (delta < 0) {
        setHidden(false);
        last = y;
        return;
      }

      if (delta < 4) return;

      setHidden(true);
      last = y;
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(settle);
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    settle();

    return () => {
      target.removeEventListener("scroll", onScroll);
      observer.disconnect();
      insetObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      {/* Stays in the flow so the bar's own travel can be measured against it.
          Zero height, so it costs the layout nothing. */}
      <div ref={anchorRef} aria-hidden="true" className="h-0" />
      {/* Zero-width, height equal to the resolved inset — see the header note
          on why `env()` needs a laid-out probe rather than a read. Kept out of
          flow so it cannot affect this row's own layout. */}
      <div
        ref={insetProbeRef}
        aria-hidden="true"
        className="h-0 w-0 overflow-hidden"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      />
      {/* Painted only while stuck — see the header note. `fixed` here pins to
          `.pm-phone-shell`, not the window: the shell picks up
          `transform: translateZ(0)` at >=480px (phone.css) precisely so
          `position: fixed` descendants stay confined to the 390px column
          instead of spanning the whole desktop viewport. z-[35]: above this
          bar (z-30) so the hidden bar sits behind it, below PhoneNav (z-40)
          so a full-screen sheet still draws over it. */}
      {stuck && (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 top-0 z-[35] bg-background"
          style={{ height: "env(safe-area-inset-top, 0px)" }}
        />
      )}
      <div
        ref={barRef}
        /* z-30, under the nav and well under the filter sheet's z-50: this is a
           row of the page that happens to hold still, not an overlay. */
        className={`sticky z-30 bg-background transition-[top,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
          stuck ? "shadow-[0_1px_0_0_rgba(35,32,25,0.08)]" : ""
        } ${className}`}
        /* `height` is 0 until the effect measures, which is one paint on a bar
           that starts visible anyway — `hidden` cannot be true before then.
           Pinned at the safe-area inset rather than 0 — see the header note —
           so the shown position always sits just below the clock and the
           hidden position is that same offset minus the bar's height, not the
           scrollport's bare top edge. */
        style={{
          top: hidden
            ? `calc(env(safe-area-inset-top, 0px) - ${height}px)`
            : "env(safe-area-inset-top, 0px)",
        }}
      >
        {children}
      </div>
    </>
  );
}
