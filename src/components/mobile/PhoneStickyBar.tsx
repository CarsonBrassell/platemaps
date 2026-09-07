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
 * bar / Dynamic Island. That padding is also what positions this bar once it
 * sticks: a sticky `top` is measured from the scroll container's **content**
 * edge, not its padding edge — WebKit and Chromium both subtract the
 * scroller's padding when they build the constraining rectangle (a scroller
 * with `padding-top: 50px` pins a `top: 0` child 50px down; measured in Chrome
 * 2026-09-05). So `top: 0` here already sits exactly under the clock, and the
 * shown/hidden pair is plain `0` / `-height`.
 *
 * It did not always read that way. This bar shipped for a day with
 * `top: env(safe-area-inset-top)` on the theory that `0` was the scrollport's
 * physical edge and needed pushing down. On the phone that spent the inset
 * twice — padding *and* offset — and the bar came back on every upward
 * scroll a full inset below where it rests, with a band of feed showing
 * through above it. That was the "awkward gap" reported twice. Do not add the
 * inset to `top` again; the padding is the inset.
 *
 * What the padding does **not** do is cover the band it reserved once the page
 * has scrolled past it: the strip from `0..inset` is under the clock, the bar
 * sticks just below it, and whatever card is scrolled to that height paints
 * straight through, visibly sliding under the status bar. The `slab` below is
 * what stops that: a `position: fixed` strip the exact height of the inset,
 * cream, sitting above the bar (z-30) and below `PhoneNav` (z-40) so a
 * full-screen sheet can still cover it. It only needs to exist while the bar
 * is `stuck` — at rest nothing has scrolled into that band yet, the padding
 * is still doing the job.
 *
 * On desktop the inset is 0: the slab is a 0-height strip, inert, and nothing
 * else changes.
 *
 * ## `pinned`
 *
 * The hide-on-scroll behaviour above is the default and stays the default for
 * discover, where the bar is search plus filters and reading the wall is the
 * point. The feed asks for the opposite: its bar is the tab picker, the sort
 * switch and the search field — three controls that answer "which feed am I
 * even looking at", which is a question you ask *while* scrolling, not before
 * you start. `pinned` keeps the row on screen the whole way down.
 *
 * ### Pinned is `fixed`, not `sticky`
 *
 * A pinned bar is not a sticky bar with the hiding switched off — it is a
 * different element, and the first build got that wrong. Holding `top: 0` on a
 * `position: sticky` row looks identical in a desktop browser and is visibly
 * unstable on the phone: it drifted a few points up and down all the way through
 * a scroll, and settled back only when the finger came off.
 *
 * Sticky is a *scroll-driven* position — the row's offset is recomputed against
 * the scrollport on every frame — and this scroller is the one place in the app
 * where that computation cannot stay on the scrolling thread. It carries a
 * non-passive `touchmove` listener (PhonePullToRefresh has to be able to
 * `preventDefault` the first pixel of a drag) plus a `scroll` listener of this
 * component's own, so while a finger is down WebKit drives the scroll from the
 * main thread and the sticky offset lands a frame late. Every late frame is a
 * few points of travel, applied and then corrected: the shift.
 *
 * `position: fixed` is not scroll-driven. The bar is taken out of the flow, a
 * spacer of the same height is left in its place so the first card still starts
 * below it, and the row is then welded to the top of the phone frame — it does
 * not move because there is no per-frame position to get wrong. The same escape
 * also makes it immune to a rubber-band at the top, which a sticky row rides
 * down with the content because sticky may never lift above its flow position.
 *
 * The offsets invert with the switch, and this is the one place the safe-area
 * warning above is reversed: a sticky `top` was measured from the scroller's
 * content edge, where `.pm-phone-content`'s padding had already spent the
 * inset. `fixed` pins to the frame, above that padding — so the fixed bar
 * carries `padding-top: env(safe-area-inset-top)` itself. That padding is also
 * the slab: the band under the clock is part of the bar's own opaque ground
 * now, so there is nothing for a card to paint through and no separate strip to
 * fade in.
 *
 * Discover keeps the sticky build. Its bar hides, which needs an offset that
 * animates against the flow, and it has no pull-to-refresh listener making the
 * scroll main-thread in the first place.
 */
export function PhoneStickyBar({
  children,
  className = "",
  pinned = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Never ride up out of the way; hold the top for the life of the screen. */
  pinned?: boolean;
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
  /* The hide distance for a sticky bar, and the spacer's height for a pinned
     one — the same number either way: how much room this row takes. */
  const [height, setHeight] = useState(0);

  /* Read inside `settle`, which is bound once — see the ref block in
     PhonePullToRefresh for the same reason. */
  const pinnedRef = useRef(pinned);
  useEffect(() => {
    pinnedRef.current = pinned;
  });

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

      /* The sticky origin is the scroller's content edge, `insetPx` below the
         frame's top (see the header note), so the bar catches its flow
         position that much earlier than depth 0: it sticks once the anchor
         would sit `insetPx` above the frame, which is `depth > -insetPx`. On
         desktop `insetPx` is 0 and this is exactly the old comparison. */
      setStuck(depth > -insetPx);

      /* A pinned bar has nowhere to go, so everything below is dead weight —
         and the early return also keeps `hidden` false, which matters if the
         flag is ever flipped back off mid-screen. */
      if (pinnedRef.current) {
        setHidden(false);
        last = y;
        return;
      }

      /* Not stuck far enough to hide into. Hiding right at the stick point
         would be legal but puts the whole animation on screen at the moment
         the first card reaches the bar, which reads as the row flinching. A
         bar-height of travel first — measured from the stick point, which is
         `-insetPx` rather than `0`, so the threshold shifts by the same
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

  /* Zero-width, height equal to the resolved inset — see the header note on
     why `env()` needs a laid-out probe rather than a read. Kept out of flow so
     it cannot affect the row's own layout. Rendered by both builds; the sticky
     one measures the stick point with it, the pinned one only keeps it so the
     shared effect has something to observe. */
  const insetProbe = (
    <div
      ref={insetProbeRef}
      aria-hidden="true"
      className="h-0 w-0 overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    />
  );

  if (pinned) {
    return (
      <>
        {/* Still here, and still in the flow: `settle` measures `stuck` off it
            to decide when the hairline arrives. */}
        <div ref={anchorRef} aria-hidden="true" className="h-0" />
        {insetProbe}
        {/*
          Out of the flow and welded to the frame — see the header note on why a
          pinned row cannot be sticky. `fixed` here pins to `.pm-phone-shell`
          rather than the window whenever the shell is transformed (>=480px,
          phone.css), which is the same containing block `.post-flash` and the
          slab rely on, and the viewport on a handset where the shell is the
          screen anyway.

          z-30 to match the sticky build: above the feed, under PhoneNav's z-40
          and well under the filter sheet, because this is a row of the page
          that holds still and not an overlay.

          The padding is the inset, and it is the reason this build needs no
          separate slab: the strip under the clock is the bar's own ground.
        */}
        <div
          className={`fixed inset-x-0 top-0 z-30 bg-background transition-[box-shadow] duration-200 ease-out motion-reduce:transition-none ${
            stuck ? "shadow-[0_1px_0_0_rgba(35,32,25,0.08)]" : ""
          }`}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div ref={barRef} className={className}>
            {children}
          </div>
        </div>
        {/* What the bar used to occupy. Measured rather than guessed: the row's
            height changes with the sort switch and with a long search value,
            and a hardcoded number would put the first card under the bar the
            first time it wrapped. Only the row itself — the scroller's own
            `padding-top` has already reserved the inset above it. */}
        <div aria-hidden="true" style={{ height }} />
      </>
    );
  }

  return (
    <>
      {/* Stays in the flow so the bar's own travel can be measured against it.
          Zero height, so it costs the layout nothing. */}
      <div ref={anchorRef} aria-hidden="true" className="h-0" />
      {insetProbe}
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
           Plain `0`, not the safe-area inset: the scroller's padding already
           places the sticky origin under the clock — see the header note on
           why adding the inset here doubled it. */
        style={{ top: hidden ? `-${height}px` : 0 }}
      >
        {children}
      </div>
    </>
  );
}
