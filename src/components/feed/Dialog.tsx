"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronIcon, CloseIcon } from "@/components/icons";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Variant =
  /** Centred card on every breakpoint. */
  | "modal"
  /** Centred on desktop, full-width bottom sheet under sm. */
  | "sheet"
  /** Right-hand side panel on desktop, bottom sheet under sm. */
  | "panel"
  /**
   * The whole viewport, at every breakpoint — a destination rather than an
   * overlay on one. Cream ground like a page, not a white card, so the cards
   * inside it read as cards (the same reason the dish sheet is cream).
   */
  | "screen";

const PANEL_CLASS: Record<Variant, string> = {
  modal:
    "w-full max-w-lg rounded-2xl bg-white animate-dialog-in max-h-[90dvh] flex flex-col",
  sheet:
    "w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl bg-white animate-sheet-in sm:animate-dialog-in max-h-[92dvh] flex flex-col",
  panel:
    "w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white animate-sheet-in sm:animate-dialog-in max-h-[85dvh] sm:max-h-[80dvh] flex flex-col",
  screen: "h-dvh w-full bg-[#F7F4EC] animate-sheet-in flex flex-col",
};

const WRAP_CLASS: Record<Variant, string> = {
  modal: "items-center justify-center p-4",
  sheet: "items-end justify-center sm:items-center sm:p-4",
  panel: "items-end justify-center sm:items-center sm:justify-end sm:p-4",
  screen: "items-stretch justify-center",
};

/**
 * Which way a finger throws each variant away.
 *
 * A thing leaves the way it arrived: a screen is a pushed page, so it goes
 * back to the right the way every other pushed page on a phone does, and the
 * rest came up off the bottom edge, so they go back down. One universal
 * direction would put three of the four at odds with the edge they animated
 * in from.
 */
const SWIPE_AXIS: Record<Variant, "x" | "y"> = {
  modal: "y",
  sheet: "y",
  panel: "y",
  screen: "x",
};

/** Travel before a gesture is read as a drag rather than a tap, in px. */
const SLOP = 10;
/** Share of the panel it has to cross to count as thrown away. */
const DISMISS_FRACTION = 0.26;
/** px/ms that dismisses whatever the distance — a flick, not a shove. */
const DISMISS_VELOCITY = 0.5;
/** How often the velocity mark is re-taken, so a flick at the end still reads. */
const VELOCITY_WINDOW = 60;

/**
 * Whether a drag starting on `node` is the dialog's to take, or belongs to
 * something inside it that scrolls the same way.
 *
 * The nearest scroller on that axis decides: a thread scrolled halfway down
 * has to come back to the top before a downward pull means "close", and a
 * media strip keeps its own sideways swipes. Without this the first flick
 * past the end of a photo row closes the plate you were looking at.
 */
function ownsGesture(axis: "x" | "y", node: EventTarget | null, panel: HTMLElement | null) {
  for (let el = node as HTMLElement | null; el && el !== panel; el = el.parentElement) {
    // Overflow first, and not as an optimisation: `truncate` is
    // `overflow: hidden`, and a clipped element reports a scrollWidth past
    // its clientWidth exactly the way a scroller does. Measuring without
    // this check hands every sideways swipe to the dialog's own truncated
    // title, and nothing ever moves.
    const overflow = getComputedStyle(el)[axis === "x" ? "overflowX" : "overflowY"];
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (axis === "x" && el.scrollWidth > el.clientWidth + 1) return false;
    if (axis === "y" && el.scrollHeight > el.clientHeight + 1) return el.scrollTop <= 0;
  }
  return true;
}

/**
 * Shared shell for every overlay in the feed. Owns the behaviour that is easy
 * to get wrong per-component: Escape to close, focus moved in on open and
 * restored on close, Tab cycling kept inside, and background scroll locked.
 */
export function Dialog({
  title,
  onClose,
  variant = "modal",
  footer,
  children,
  labelledBy,
  headerAside,
  headerBelow,
}: {
  title: string;
  onClose: () => void;
  variant?: Variant;
  footer?: ReactNode;
  children: ReactNode;
  labelledBy?: string;
  /** Sits between the title and the close control — a sort switch, a count. */
  headerAside?: ReactNode;
  /** A second header row under the title, inside the same sticky band. */
  headerBelow?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const axis = SWIPE_AXIS[variant];
  const gestureRef = useRef<{
    id: number;
    x: number;
    y: number;
    /** Timestamp and travel of the current velocity sample. */
    markAt: number;
    markTravel: number;
    settled: boolean;
    owned: boolean;
  } | null>(null);
  /**
   * `null` until something is dragged, so an untouched dialog leaves its
   * entry keyframes alone rather than being pinned at `translate(0)` by an
   * inline style that outranks them.
   */
  const [drag, setDrag] = useState<{ offset: number; live: boolean } | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  const travelled = (e: { clientX: number; clientY: number }, from: { x: number; y: number }) =>
    Math.max(0, axis === "x" ? e.clientX - from.x : e.clientY - from.y);

  /**
   * Swipe to dismiss. Touch only — a mouse has the back arrow, the backdrop
   * and Escape, and a click-drag across a thread is a text selection.
   */
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || gestureRef.current) return;
    // A field keeps its own caret and selection handles.
    if ((e.target as HTMLElement).closest?.("input,textarea,select,[contenteditable='true']"))
      return;
    gestureRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      markAt: e.timeStamp,
      markTravel: 0,
      settled: false,
      owned: false,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId) return;

    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

    // Settled once, the moment the finger leaves the slop circle, and never
    // revisited: a gesture that starts as a scroll stays a scroll even if it
    // curls sideways later. That is what keeps a thread from sliding away
    // under a thumb that is only reading.
    if (!g.settled) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      g.settled = true;
      const along = axis === "x" ? dx : dy;
      const across = axis === "x" ? dy : dx;
      g.owned =
        along > 0 &&
        Math.abs(along) > Math.abs(across) &&
        ownsGesture(axis, e.target, panelRef.current);
    }
    if (!g.owned) return;

    const offset = travelled(e, g);
    if (e.timeStamp - g.markAt > VELOCITY_WINDOW) {
      g.markAt = e.timeStamp;
      g.markTravel = offset;
    }
    setDrag({ offset, live: true });
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId) return;
    gestureRef.current = null;
    if (!g.owned) return;

    const offset = travelled(e, g);
    const panel = panelRef.current;
    const span = (axis === "x" ? panel?.offsetWidth : panel?.offsetHeight) || 1;
    const speed = (offset - g.markTravel) / Math.max(1, e.timeStamp - g.markAt);

    if (offset > span * DISMISS_FRACTION || speed > DISMISS_VELOCITY) {
      onClose();
      return;
    }
    setDrag({ offset: 0, live: false });
  }

  const headingId = labelledBy ?? `dialog-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-pm-charcoal/45 backdrop-blur-[2px] animate-fade-in ${WRAP_CLASS[variant]}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={PANEL_CLASS[variant]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          /* A screen claims sideways panning; the browser keeps the vertical
             so the thread still scrolls under the gesture. */
          touchAction: axis === "x" ? "pan-y" : undefined,
          ...(drag && {
            transform:
              axis === "x" ? `translateX(${drag.offset}px)` : `translateY(${drag.offset}px)`,
            transition: drag.live ? "none" : "transform 220ms cubic-bezier(0.2,0,0,1)",
          }),
        }}
      >
        {/* A screen is left with a back arrow, the way a pushed page is; an
            overlay is dismissed with an X on the right. Same button, opposite
            ends, because they mean different things — one goes back to where
            you were, the other closes something on top of it. */}
        <div
          className={`shrink-0 border-b px-5 pb-3 ${
            variant === "screen"
              ? /* The panel is `fixed inset-0`, and the native shell draws under
                   the status bar, so without this the back arrow, the title and
                   the comment count all sit behind the clock and the Dynamic
                   Island. `.pm-phone-content` pads the /m scroller for the same
                   reason, but an overlay is not inside that scroller and has to
                   ask for the inset itself. `max()` leaves the plain 12px on
                   anything without a notch — every browser, and the desktop
                   phone frame. */
                "border-zinc-200/70 bg-[#F7F4EC]/95 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm"
              : "border-zinc-100 pt-3"
          }`}
        >
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
            {variant === "screen" && (
              <button
                type="button"
                onClick={onClose}
                aria-label={`Back from ${title}`}
                className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-pm-grey-tint hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                <ChevronIcon className="h-5 w-5 rotate-180" />
              </button>
            )}

            <h2
              id={headingId}
              className="min-w-0 flex-1 truncate font-display text-base font-semibold text-zinc-900"
            >
              {title}
            </h2>

            {headerAside}

            {variant !== "screen" && (
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${title}`}
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {headerBelow && <div className="mx-auto w-full max-w-2xl">{headerBelow}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <div
            className={`shrink-0 border-t px-5 py-3 ${
              variant === "screen"
                ? "border-zinc-200/70 bg-[#F7F4EC] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                : "border-zinc-100 bg-white"
            }`}
          >
            <div className="mx-auto w-full max-w-2xl">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}
