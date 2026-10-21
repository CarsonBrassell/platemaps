"use client";

import { useCallback, useEffect, useState } from "react";
import { FREE_FOOD_WINNERS, freeFoodVisible } from "@/lib/freeFoodEvent";
import { FreeFoodPopup } from "./FreeFoodPopup";
import "./freefood.css";

/**
 * "Claim free food": the feed's way into the Plate-Off board, top left above
 * the tabs while the event runs.
 *
 * A charcoal pill rather than an orange one so it does not read as the
 * primary action — the + in the nav still is — and the pulsing orange dot is
 * what says something is happening right now. It scrolls away with the
 * header rather than joining the sticky bar, which has no room to spare.
 *
 * It renders nothing until mounted: whether the event is still on depends on
 * the clock, and the server's clock and the phone's need not agree on the
 * second the window closes.
 */
export function ClaimFreeFoodButton() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const check = () => setVisible(freeFoodVisible(Date.now()));
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;

  return (
    <>
      <div className="ff-root px-4 pb-1 pt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-pm-charcoal pl-3 pr-3.5 text-sm font-semibold text-white transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <span className="ff-dot h-2 w-2 rounded-full bg-pm-orange" aria-hidden="true" />
          <SliceMark />
          Claim free food
          <span className="border-l border-zinc-700 pl-2 font-mono text-[10px] font-medium tracking-[0.12em] text-[#e8a77f]">
            TOP {FREE_FOOD_WINNERS}
          </span>
        </button>
      </div>
      {open && <FreeFoodPopup onClose={close} />}
    </>
  );
}

function SliceMark() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
      <path d="M12 22 3 5.5C8.5 2.2 15.5 2.2 21 5.5z" fill="#e9b15a" />
      <path d="M12 19.5 5.2 6.8c4.4-2.3 9.2-2.3 13.6 0z" fill="#d9572a" />
      <circle cx="10" cy="9" r="1.6" fill="#9e2f1c" />
      <circle cx="14.5" cy="11" r="1.5" fill="#9e2f1c" />
      <circle cx="12" cy="15" r="1.3" fill="#9e2f1c" />
    </svg>
  );
}
