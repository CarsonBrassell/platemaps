"use client";

import { useCallback, useEffect, useState } from "react";
import { FREE_FOOD_PARTNER, FREE_FOOD_SEEN_KEY, FREE_FOOD_TITLE, freeFoodVisible } from "@/lib/freeFoodEvent";
import { TicketPopup } from "./TicketPopup";
import "./freefood.css";

/**
 * The free-slice icon: top right of the feed's pinned bar, on the tabs' row,
 * while the event is on. The first time a device opens the feed it also opens
 * the popup by itself; after that it just sits here with its pulsing dot.
 *
 * It renders nothing until mounted: whether the event is still on depends on
 * the clock, and the server's clock and the phone's need not agree on the
 * second the window closes.
 */
export function TicketButton() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  /* Seen is recorded on dismiss, not on auto-open: React can mount this twice
     (dev Strict Mode, a tab remount), and marking it on open would let the
     first mount swallow the popup before anyone saw it. */
  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(FREE_FOOD_SEEN_KEY, "1");
    } catch {}
  }, []);

  useEffect(() => {
    const check = () => setVisible(freeFoodVisible(Date.now()));
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  /* First open on this device, until it is dismissed. If storage throws it
     shows on every page load, which beats never showing. */
  useEffect(() => {
    if (!freeFoodVisible(Date.now())) return;
    let seen = false;
    try {
      seen = localStorage.getItem(FREE_FOOD_SEEN_KEY) === "1";
    } catch {}
    if (!seen) setOpen(true);
  }, []);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${FREE_FOOD_TITLE} \u2014 ${FREE_FOOD_PARTNER}`}
        className="ff-root relative -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-orange text-white transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <TicketGlyph />
        <span
          className="ff-dot absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-pm-charcoal ring-2 ring-[#F7F4EC]"
          aria-hidden="true"
        />
      </button>
      {open && <TicketPopup onClose={close} />}
    </>
  );
}

function TicketGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v0a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v0a2 2 0 0 1 0-4v0a2 2 0 0 0 0-4V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />
      <path d="M14.5 7v2m0 2v2m0 2v2" strokeLinecap="round" />
    </svg>
  );
}
