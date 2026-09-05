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
  const [hidden, setHidden] = useState(false);
  /* Drawn only once something has actually scrolled under the bar. At rest the
     row sits on the same cream as the screen and a line across it would be a
     border around nothing. */
  const [stuck, setStuck] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const bar = barRef.current;
    const anchor = anchorRef.current;
    if (!bar || !anchor) return;

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

    let last = readTop();
    let frame = 0;

    const settle = () => {
      frame = 0;
      const y = readTop();
      /* How far the bar's flow position has gone above the top of the frame:
         0 while it is still travelling with the content, growing once it
         sticks. See the header note for why this is not `offsetTop`. */
      const depth = frameTop() - anchor.getBoundingClientRect().top;

      setStuck(depth > 0);

      /* Not stuck far enough to hide into. Hiding at depth 0 would be legal —
         the bar is exactly at the top edge — but it puts the whole animation
         on screen at the moment the first card reaches the bar, which reads as
         the row flinching. A bar-height of travel first. */
      if (depth < bar.offsetHeight) {
        setHidden(false);
        last = y;
        return;
      }

      /* A 4px deadband. Momentum scrolling on iOS reports the odd pixel of
         backwards travel at the end of a flick, and without this the bar
         drops back down every time a scroll comes to rest. */
      const delta = y - last;
      if (Math.abs(delta) < 4) return;

      setHidden(delta > 0);
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
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      {/* Stays in the flow so the bar's own travel can be measured against it.
          Zero height, so it costs the layout nothing. */}
      <div ref={anchorRef} aria-hidden="true" className="h-0" />
      <div
        ref={barRef}
        /* z-30, under the nav and well under the filter sheet's z-50: this is a
           row of the page that happens to hold still, not an overlay. */
        className={`sticky z-30 bg-background transition-[top,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
          stuck ? "shadow-[0_1px_0_0_rgba(35,32,25,0.08)]" : ""
        } ${className}`}
        /* `height` is 0 until the effect measures, which is one paint on a bar
           that starts visible anyway — `hidden` cannot be true before then. */
        style={{ top: hidden ? -height : 0 }}
      >
        {children}
      </div>
    </>
  );
}
