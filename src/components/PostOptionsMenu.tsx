"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreIcon } from "@/components/icons";

/**
 * A post's own options menu — three dots that open a one-row "Delete post"
 * menu with a second confirm step. Lives only on the opened plate's photo
 * (bottom-left corner, opposite the hearts cluster), never on the profile
 * grid tile — the tile stays a plain thumbnail and the menu appears once
 * you've opened your own post. The one caller, `PlateDetailSheet`, is given
 * `onDelete` only for the viewer's own posts, so delete is the only item —
 * see the callers for why a feed card's menu runs deeper than this.
 *
 * Delete asks twice, and the second tap stays inside the same menu rather
 * than opening a dialog over whatever is behind it — a mis-tap on a dense
 * thumbnail or a photo costs a post permanently and nothing behind it is
 * undoable.
 *
 * Positioned as a sibling of whatever it decorates rather than a descendant:
 * both the grid tile and the sheet's photo frame are either a button or
 * `overflow-hidden`, and a popped-open menu inside either is invalid or
 * clipped. Callers own the wrapper's placement via `wrapperClassName`;
 * this component only decides which corner the menu itself opens toward.
 */
export function PostOptionsMenu({
  name,
  onDelete,
  wrapperClassName,
  openUp = false,
  alignRight = false,
}: {
  name: string;
  onDelete: () => void;
  /** Positions the button itself — e.g. `"absolute left-1.5 top-1.5 z-20"`
      for the grid tile, `"absolute bottom-2 right-2 z-20"` for the photo. */
  wrapperClassName: string;
  /** Menu grows upward off the button instead of down. Use this where the
      button sits at the bottom edge of what it decorates and there is
      nothing above it to open over except that same thing. */
  openUp?: boolean;
  /** Menu's own right edge lines up with the button's right edge instead of
      its left, so it grows leftward. Use this where the button sits near
      the right edge of its container. */
  alignRight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  /** Second step of delete. Reset on every close, so a menu never reopens
      already armed. */
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /**
   * How far the open menu has to slide to stay on screen.
   *
   * A 176px menu can overrun the viewport at either edge depending on where
   * its wrapper lands, and on the grid that wrapper's position is not knowable
   * at render time (the column count is `auto-fill`). Measuring once on open
   * and nudging is the only version of this that is correct at every width.
   * Reset to 0 on close so the next open measures clean.
   */
  const [shift, setShift] = useState(0);

  const close = () => {
    setOpen(false);
    setConfirming(false);
  };

  /* Outside click and Escape — the same pair the feed card's menu listens
     for, so the gesture that dismisses one dismisses the other. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Measure on mount rather than in an effect — a ref callback, so this runs
   * once as the menu attaches and never again while it is open. The two steps
   * are the same width, so nothing about `confirming` changes the answer, and
   * a re-measure after the transform landed would read its own output back.
   */
  const measure = useCallback((el: HTMLDivElement | null) => {
    menuRef.current = el;
    if (!el) {
      setShift(0);
      return;
    }
    const margin = 8;
    const rect = el.getBoundingClientRect();
    /* Clamp to whatever actually clips the menu, not to the window. On the
       phone route that is the 390px phone shell, which on a desktop browser
       sits in the middle of a much wider window — measuring against the
       window there finds no overflow and lets the menu run under the shell's
       edge. On a real phone the two are the same box, and everywhere else
       nothing clips, so the window is the fallback. */
    let left = margin;
    let right = window.innerWidth - margin;
    for (let node = el.parentElement; node; node = node.parentElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "visible") continue;
      const box = node.getBoundingClientRect();
      left = Math.max(left, box.left + margin);
      right = Math.min(right, box.right - margin);
      break;
    }
    let dx = 0;
    if (rect.right > right) dx = right - rect.right;
    if (rect.left + dx < left) dx = left - rect.left;
    setShift(dx);
  }, []);

  return (
    <div ref={ref} className={wrapperClassName}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={`Options for ${name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        /* Scrimmed rather than tinted. This sits on a photo that can be any
           colour, and the feed card's zinc-400 glyph — which has a white card
           under it there — disappears on half of them. */
        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-[2px] transition-colors hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <MoreIcon className="h-3.5 w-3.5" />
      </button>
      {open && (
        /* An overlay edge, not a grouping border — the one place DESIGN.md
           allows a ring, and for the same reason the feed card's menu carries
           one: it floats over whatever is behind it. */
        <div
          ref={measure}
          role="menu"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          className={
            "absolute z-20 w-44 overflow-hidden rounded-xl bg-white p-1 text-left ring-1 ring-zinc-200 " +
            (openUp ? "bottom-full mb-1" : "top-full mt-1") +
            " " +
            (alignRight ? "right-0" : "left-0")
          }
        >
          {confirming ? (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  close();
                  onDelete();
                }}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                Delete for good
              </button>
              <button
                role="menuitem"
                onClick={close}
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              role="menuitem"
              onClick={() => setConfirming(true)}
              className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-red-700 transition-colors hover:bg-red-50"
            >
              Delete post
            </button>
          )}
        </div>
      )}
    </div>
  );
}
