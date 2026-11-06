"use client";

import type { ReactNode } from "react";
import { FREE_FOOD_DATE_LINE, FREE_FOOD_KICKER, FREE_FOOD_PLACE, doorsClock } from "@/lib/freeFoodEvent";
import "./freefood.css";

/**
 * The ticket card, shared by the claim popup and the Profile's activate card.
 * Event on top, the perforation, then the holder and `children` (the part that
 * changes: claim button, countdown, live clock). `tone="used"` greys it out.
 */
export function TicketCard({
  handle,
  number,
  tone = "default",
  live = false,
  children,
}: {
  handle: string;
  number: string;
  tone?: "default" | "used";
  /** Pulsing border and shimmer, so a screenshot reads as a running ticket. */
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative w-full max-w-sm rounded-2xl border text-pm-charcoal ${
        tone === "used" ? "border-zinc-200 bg-zinc-100 opacity-70" : "border-zinc-200 bg-pm-orange-tint"
      } ${live ? "ff-live" : ""}`}
    >
      {/* Notches: white discs biting into the card at the perforation. */}
      <span
        className="absolute -left-3 top-[62%] h-6 w-6 -translate-y-1/2 rounded-full border-r border-zinc-200 bg-white"
        aria-hidden="true"
      />
      <span
        className="absolute -right-3 top-[62%] h-6 w-6 -translate-y-1/2 rounded-full border-l border-zinc-200 bg-white"
        aria-hidden="true"
      />

      <div className="px-5 pb-6 pt-5">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-pm-orange-text">
          {FREE_FOOD_KICKER}
        </p>
        <p className="mt-2 font-display text-2xl font-bold leading-tight">{FREE_FOOD_DATE_LINE}</p>
        <p className="mt-1 text-sm text-zinc-600">{FREE_FOOD_PLACE}</p>
      </div>

      <div className="mx-4 border-t-2 border-dashed border-zinc-300" aria-hidden="true" />

      <div className="px-5 pb-5 pt-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Admit</p>
            <p className="truncate font-mono text-base font-semibold">{handle}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Ticket</p>
            <p className="font-mono text-base font-semibold tabular-nums">{number}</p>
          </div>
        </div>
        <div className="mt-5 text-center">{children}</div>
      </div>
    </div>
  );
}

/** Flip-clock tiles counting down to doors. */
export function DoorsCountdown({ msLeft }: { msLeft: number }) {
  const clock = doorsClock(msLeft);
  return (
    <div role="timer" aria-label={`${clock} until doors`}>
      <div className="flex items-center justify-center font-mono text-[20px] font-semibold tabular-nums">
        {clock.split("").map((c, i) =>
          c === ":" ? (
            <span key={i} className="px-0.5 text-zinc-400" aria-hidden="true">
              :
            </span>
          ) : (
            <span
              key={i}
              aria-hidden="true"
              className="ff-tile relative mx-[1.5px] h-10 w-[26px] overflow-hidden rounded-lg bg-pm-charcoal leading-10 text-white"
            >
              <span key={c} className="ff-digit">
                {c}
              </span>
            </span>
          ),
        )}
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Until doors</p>
    </div>
  );
}

/** The big orange action button used inside the card. */
export function TicketAction({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 w-full items-center justify-center rounded-full bg-pm-orange px-5 font-mono text-sm font-semibold uppercase tracking-[0.1em] text-white transition-transform active:scale-[0.98] disabled:bg-zinc-300 disabled:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
    >
      {children}
    </button>
  );
}
