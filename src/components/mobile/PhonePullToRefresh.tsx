"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag down at the top of the feed to re-read it, with a wheel that says so.
 *
 * ## What this is replacing: nothing
 *
 * It is worth writing down, because the obvious assumption is wrong and it
 * changes the design. Dragging down from the top of the app **did not refresh
 * anything** — there was no handler here and there is no native one either.
 * Capacitor's `CAPBridgeViewController` sets `webView.scrollView.bounces =
 * false` and never installs a `UIRefreshControl`, so the WebView itself cannot
 * reload on a gesture; the only thing that moved was `.pm-phone-content`
 * rubber-banding under the finger and the sticky tab row sliding back in
 * (PhoneStickyBar), which together read convincingly like a page that had just
 * come back. So this is the gesture being *built*, not an existing reload
 * being decorated — the spinner and the refetch arrive together, and the
 * spinner is honest because it is waiting on a real request.
 *
 * ## Why a gap opens instead of the list being translated
 *
 * Every other pull-to-refresh drags the list down behind the spinner, and the
 * obvious way to build that — `translateY` on the scroller — is off the table
 * here for a documented reason rather than taste: a transformed element becomes
 * the containing block for every `position: fixed` descendant, which is the
 * trick `phone.css` uses deliberately on the shell and the trap
 * `PhoneStickyBar` avoids. Translating `.pm-phone-content` would re-anchor the
 * nav, the comments screen, the filter sheet and the post flash to the scroller
 * for the length of the gesture — the exact failure that file describes, on
 * every drag.
 *
 * So the list does move, but nothing is transformed to move it: this component
 * is an in-flow block whose *height* is the pull. Growing it opens a real gap
 * and pushes the cards below down by exactly that much — the gesture everyone
 * expects, paid for with a layout rather than with a re-anchored app.
 *
 * It is mounted immediately under the pinned control bar (PhoneFeedScreen), so
 * the gap opens below the tabs and the search field and the dial slides down
 * out from behind them. The bar itself never moves; it is the thing you are
 * pulling away from.
 *
 * The height only ever changes while the scroller sits at `scrollTop: 0` — the
 * gesture is armed nowhere else — so growing it cannot shove a reading position
 * around.
 *
 * ## A scroll that runs out of list becomes the pull
 *
 * The touch does not have to *begin* at the top. Reading down the feed and then
 * dragging back up is one continuous downward drag, and it arrives at the top
 * with the finger still moving — which is the moment every phone in the world
 * starts showing a spinner. Arming only on `touchstart` missed all of it: the
 * gesture was refused for the whole touch, so scrolling home from card twenty
 * got the platform's bare rubber-band and no wheel, while the identical drag
 * started from rest got the gap. Same motion, two different behaviours.
 *
 * So a touch is tracked wherever it starts and the baseline (`startY`) is
 * rewritten on every frame the scroller is still moving. The pull is therefore
 * measured from where the finger was when the list ran out, not from where the
 * touch began ten cards ago — otherwise the gap would snap open by the whole
 * scroll distance the instant the top arrived.
 *
 * ## The gesture
 *
 * Armed only when the scroller is already at the top when the finger lands, and
 * only while the drag is downward — an upward flick from the top is a normal
 * scroll and must stay one. From the first downward pixel every move is
 * `preventDefault`ed (hence a non-passive listener): that is what stops iOS
 * rubber-banding the scroller underneath the pull, so the finger is moving one
 * thing rather than two. See `onMove` for why the claim cannot wait for the
 * drag to prove itself first.
 */

/** Finger travel is halved on the way to the dial, so the pull feels weighted. */
const RESISTANCE = 0.5;
/** Ignore the first few pixels: a tap with a wobble is not a pull. */
const SLOP = 8;
/*
 * How far a finger that arrived at the top *mid-scroll* has to keep going down
 * before any gap opens. Much larger than SLOP, and it is what keeps ordinary
 * scrolling near the top from twitching.
 *
 * A touch that starts at rest is unambiguous: there was nothing to scroll, so
 * the only thing it can mean is a pull. A touch that starts twenty cards down
 * is a scroll that *may or may not* turn into one — and it reaches the end of
 * the list at whatever speed it was already travelling, with the finger still
 * wandering a few points either way as it slows. At SLOP that wander is a gap
 * opening and shutting under the bar on every frame: a few points of shift, up
 * and down, for the whole tail of the gesture. Reported as exactly that.
 *
 * 28pt is past anything a hand does by accident and still well short of the
 * 60pt trigger, so the pull it hands over still has most of its travel left to
 * show for itself.
 */
const PICKUP = 28;
/** Where the dial stops being dragged, however far the finger goes. */
const MAX_PULL = 96;
/** Pull past this and letting go refreshes. Below it, the dial just goes home. */
const TRIGGER = 60;
/** Where the dial parks while the request is out. */
const REST = 60;
/**
 * The wheel is on screen for at least this long.
 *
 * A warm feed comes back in well under 100ms, and a spinner that appears and
 * vanishes inside two frames reads as a glitch rather than as a refresh — the
 * one thing this whole component exists to communicate. Long enough to be seen,
 * short enough that it is never the reason you are waiting.
 */
const MIN_SPIN_MS = 500;

type Phase = "idle" | "pulling" | "refreshing";

export function PhonePullToRefresh({
  onRefresh,
  disabled = false,
}: {
  /**
   * Re-read whatever this screen shows. Awaited, so the wheel spins for exactly
   * as long as the request takes — resolve it when the data has landed, not
   * when the fetch was kicked off.
   */
  onRefresh: () => Promise<unknown> | void;
  /** Suppress the gesture while something is over the feed (comments, a sheet). */
  disabled?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pull, setPull] = useState(0);

  /* The listeners are attached once and read the live values through refs:
     re-binding a non-passive touchmove every time `pull` changes would mean
     tearing down and re-adding a listener on every frame of the drag.

     Written in an effect rather than straight through in the body — a ref
     assigned during render is a render side effect, and the touch handlers
     only ever read these after a commit anyway. */
  const phaseRef = useRef<Phase>("idle");
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    phaseRef.current = phase;
    disabledRef.current = disabled;
    onRefreshRef.current = onRefresh;
  });

  /* Guards the async tail: a tab change can unmount this while a refresh is
     still in flight, and the timer below must not resurrect state afterwards. */
  const alive = useRef(true);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  const runRefresh = useCallback(async () => {
    setPhase("refreshing");
    setPull(REST);
    const started = Date.now();
    try {
      await onRefreshRef.current();
    } finally {
      /* `finally`, not `then`: a refresh that throws still has to put the wheel
         away, or the feed is left spinning forever over a list that is simply
         the one it already had. */
      const held = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
      settleTimer.current = setTimeout(() => {
        if (!alive.current) return;
        setPhase("idle");
        setPull(0);
      }, held);
    }
  }, []);

  useEffect(() => {
    /* Same lookup PhoneStickyBar makes, and for the same reason: the document
       does not scroll under /m, `.pm-phone-content` does (phone.css). */
    const scroller = anchorRef.current?.closest<HTMLElement>(".pm-phone-content");
    if (!scroller) return;

    /* The point the pull is measured from. Not where the touch began: while
       the scroller is still moving this is rewritten every frame, so it ends up
       being where the finger was at the moment the list ran out. */
    let startY = 0;
    /* A finger is down and the gesture is still available to us. */
    let tracking = false;
    /* It has since pulled down against the top, so this gesture is ours. */
    let engaged = false;
    /* Whether the scroller was already home on the previous frame — the flag
       that separates "still scrolling" from "pulling past the end". */
    let atTop = false;
    /* How much downward travel this touch owes before it opens anything: SLOP
       if it began at rest, PICKUP if it arrived at the top off a scroll. */
    let owed = SLOP;
    let travelled = 0;

    const release = () => {
      tracking = false;
      engaged = false;
      atTop = false;
      travelled = 0;
    };

    const onStart = (e: TouchEvent) => {
      if (disabledRef.current || phaseRef.current === "refreshing") return;
      /* A second finger means a pinch or a two-finger scroll; neither is this. */
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      tracking = true;
      engaged = false;
      travelled = 0;
      /* A touch that begins at the top can claim its very first pixel (see the
         note in onMove about why that timing matters). One that begins mid-list
         is a scroll for now, and inherits the pull only if it reaches the end. */
      atTop = scroller.scrollTop <= 0;
      owed = atTop ? SLOP : PICKUP;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;

      /* Still list left to travel: this frame belongs to the scroller. Keep the
         baseline pinned to the finger so that if the top does arrive the pull
         starts from zero, and stay out of the way otherwise — no preventDefault
         while there is scrolling to do. */
      if (scroller.scrollTop > 0) {
        startY = y;
        atTop = false;
        engaged = false;
        /* This touch has now scrolled, so whatever it started as it is the
           slow-to-arm kind for the rest of its life. */
        owed = PICKUP;
        if (travelled > 0) {
          travelled = 0;
          setPull(0);
          setPhase("idle");
        }
        return;
      }

      /* The frame the list ran out on. Take the baseline here and spend the
         next frame onwards pulling; claiming this one would count the last
         scrolling frame's travel as pull. */
      if (!atTop) {
        atTop = true;
        startY = y;
        return;
      }

      const dy = y - startY;

      if (dy <= 0) {
        /* Ours already, and being taken back: someone has changed their mind
           mid-pull. Close the gap on the way out — handing the gesture back
           sets `engaged` false, which is exactly what makes `onEnd` do nothing
           when the finger finally lifts, so a gap left open here is left open
           for good: pull down forty pixels, reverse, and the feed keeps a band
           of empty cream under the bar until the screen is remounted. */
        if (engaged || travelled > 0) {
          if (travelled > 0) {
            setPull(0);
            setPhase("idle");
          }
          return release();
        }

        /* Not ours yet — this is a finger that has come to the end of a scroll
           and is settling, not one refusing a pull it never started. Killing
           the touch here is what made the pickup distance below unreachable in
           practice: a decelerating drag crosses back over its own baseline
           once or twice before it stops, and the first crossing ended the
           gesture for good.

           Re-baseline instead, which parks the origin at the highest point the
           finger has reached. The pickup is then measured from the turn, so a
           deliberate drag pays it in one motion and a wobble never accumulates
           it at all. */
        startY = y;
        return;
      }

      /*
       * Claimed on the FIRST downward pixel, not on the first one past the
       * slop — and that ordering is the whole gesture on iOS.
       *
       * WebKit decides on the opening moves of a touch whether it is scrolling
       * that element, and once it has, every later `touchmove` arrives with
       * `cancelable: false`: the rubber-band is already running and cannot be
       * called off. Letting the first few pixels through to "see if they mean
       * it" is exactly long enough to lose the gesture, so the pull would fight
       * the bounce instead of replacing it.
       *
       * The slop has not gone anywhere — it moved into `travelled` below, so
       * the dial still ignores the first few pixels. What it no longer does is
       * decide who owns the drag.
       */
      /* Below the pickup distance there is nothing to show and nothing to
         claim: leave the frame alone rather than re-rendering a zero. A touch
         that began at rest owes only SLOP, so this is one frame for it and the
         claim below still lands on the first downward pixel. */
      const next = Math.max(0, Math.min((dy - owed) * RESISTANCE, MAX_PULL));
      if (next <= 0 && travelled <= 0 && owed > SLOP) return;

      engaged = true;

      /* Owning the gesture is what stops iOS rubber-banding the list at the
         same time — see above. The listener is registered non-passive precisely
         so this call is allowed to do anything, and the guard is for the case
         where the platform has taken the gesture anyway: preventing an
         uncancelable event only earns a console warning. */
      if (e.cancelable) e.preventDefault();
      travelled = next;
      setPhase("pulling");
      setPull(travelled);
    };

    const onEnd = () => {
      if (!engaged) return release();
      const armed = travelled >= TRIGGER;
      release();
      if (armed) {
        void runRefresh();
      } else {
        setPhase("idle");
        setPull(0);
      }
    };

    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd);
    scroller.addEventListener("touchcancel", onEnd);
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
    };
  }, [runRefresh]);

  /* How far along the pull is, 0-1: the dial fades and grows into place on it,
     and turns a half rotation over the same distance so the wheel is already
     moving under the finger before the release spins it. */
  const progress = Math.min(pull / TRIGGER, 1);

  return (
    <>
      {/* Zero height, and only here so the effect can find the scroller from
          inside the tree rather than querying the document for it. Kept
          separate from the block below, whose height is the pull itself. */}
      <div ref={anchorRef} aria-hidden="true" className="h-0" />

      <div
        className="phone-refresh"
        data-phase={phase}
        style={
          {
            "--pm-pull": `${pull}px`,
            "--pm-pull-lead": progress,
            "--pm-pull-turn": `${progress * 180}deg`,
          } as React.CSSProperties
        }
      >
        {/* Parked at the bottom of the gap, so it arrives from behind the
            control bar rather than fading in mid-air — phone.css. */}
        <span className="phone-refresh-dial">
          {/* A stroked SVG arc rather than a bordered div: DESIGN.md's
              no-borders rule is about the shape language of the UI, and a
              border-based spinner is exactly the "ring drawn with a border"
              this app does not use anywhere. The track is the same warm tint
              the skeletons sit on, so the wheel belongs to the cream world
              rather than being a stock grey loader dropped into it. */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="var(--pm-grey-tint)"
              strokeWidth="2.5"
            />
            {/* A quarter of the circumference (2πr ≈ 56.5), so the gap reads as
                a gap at every size the dial scales through. */}
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="var(--pm-orange)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="14 43"
            />
          </svg>
        </span>
      </div>

      {/* The wheel is decoration to a screen reader — the feed changing under it
          is the actual event — so the graphic is hidden and this says the one
          thing it means. Rendered empty rather than unmounted so the live
          region is already in the tree when it gets something to announce. */}
      <span role="status" aria-live="polite" className="sr-only">
        {phase === "refreshing" ? "Refreshing the feed" : ""}
      </span>
    </>
  );
}
