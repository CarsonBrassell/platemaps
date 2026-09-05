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
 * ## Why the content does not move
 *
 * Every other pull-to-refresh drags the list down behind the spinner. That is
 * off the table here, and for a documented reason rather than taste: a
 * transformed element becomes the containing block for every `position: fixed`
 * descendant, which is the trick `phone.css` uses deliberately on the shell and
 * the trap `PhoneStickyBar` avoids. Translating `.pm-phone-content` would
 * re-anchor the nav, the comments screen, the filter sheet and the post flash
 * to the scroller for the length of the gesture — the exact failure that file
 * describes, on every drag.
 *
 * So only the dial travels. It is `position: fixed`, which inside
 * `.pm-phone-shell` means the phone frame on a desktop and the viewport on a
 * handset (the same call `.post-flash` makes), and it slides out from behind
 * the top edge as the finger pulls.
 *
 * ## The gesture
 *
 * Armed only when the scroller is already at the top when the finger lands,
 * and only for a downward drag past a few pixels of slop — an upward flick from
 * the top is a normal scroll and must stay one. Once armed, every move is
 * `preventDefault`ed (hence a non-passive listener): that is what stops iOS
 * rubber-banding the scroller underneath the pull, so the finger is moving one
 * thing rather than two.
 */

/** Finger travel is halved on the way to the dial, so the pull feels weighted. */
const RESISTANCE = 0.5;
/** Ignore the first few pixels: a tap with a wobble is not a pull. */
const SLOP = 8;
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

    let startY = 0;
    /* A finger is down and started at the top — a candidate, not yet a pull. */
    let tracking = false;
    /* It has since moved down past the slop, so this gesture is ours. */
    let engaged = false;
    let travelled = 0;

    const release = () => {
      tracking = false;
      engaged = false;
      travelled = 0;
    };

    const onStart = (e: TouchEvent) => {
      if (disabledRef.current || phaseRef.current === "refreshing") return;
      /* A second finger means a pinch or a two-finger scroll; neither is this. */
      if (e.touches.length !== 1) return;
      if (scroller.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      tracking = true;
      engaged = false;
      travelled = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;

      if (!engaged) {
        /* Downward past the slop claims the gesture. Anything upward first is
           someone scrolling the feed, and we get out of the way for the rest of
           this touch rather than fighting them for it. */
        if (dy < 0) return release();
        if (dy < SLOP) return;
        engaged = true;
      }

      /* The scroller can only be at the top for this to be a pull; if content
         got under it somehow, hand the gesture back. */
      if (scroller.scrollTop > 0) {
        setPull(0);
        setPhase("idle");
        return release();
      }

      /* Owning the gesture is what stops iOS rubber-banding the list at the
         same time — see the header note. The listener is registered non-passive
         precisely so this call is allowed to do anything. */
      e.preventDefault();
      travelled = Math.min((dy - SLOP) * RESISTANCE, MAX_PULL);
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
          inside the tree rather than querying the document for it. */}
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
