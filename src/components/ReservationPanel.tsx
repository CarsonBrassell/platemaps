"use client";

import { useState, useSyncExternalStore } from "react";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock";
import { localMinutes, openStateFor } from "@/lib/openState";
import {
  EVENING_START,
  PARTY_SIZES,
  formatClock,
  reservationBoard,
  waitEstimate,
  type PartySize,
} from "@/lib/reservations";
import { CheckIcon } from "@/components/icons";

/**
 * Walk-in wait and a table booked here rather than handed off to OpenTable.
 *
 * ⚠ Both numbers are mocked — see the warning at the top of
 * `src/lib/reservations.ts`. The footnote at the bottom of the card is the
 * user-facing half of that disclosure and stays until real availability is
 * wired in.
 *
 * Sized for the side rail, alongside the comments: a wait figure, three times
 * and a party size, and nothing else. The dishes are the page, so this stays
 * out of their way — an earlier full-width version of this card pushed the
 * hits below the fold.
 *
 * Client-only for the same reason `OpenStatePill` is: the wait, the slot times
 * and even which *day* the board shows all depend on the current clock, and
 * this page is prerendered. Reading the shared minute clock through
 * `useSyncExternalStore` means one timer for the whole page rather than one per
 * time-dependent component, and `getServerClockSnapshot` returning null keeps
 * build time out of the static output.
 */
export function ReservationPanel({
  restaurantId,
  closingTime,
}: {
  restaurantId: string;
  closingTime: string;
}) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const [party, setParty] = useState<PartySize>(2);
  const [pickedSlot, setPickedSlot] = useState<number | null>(null);
  const [booked, setBooked] = useState<{ slot: number; party: PartySize; day: string } | null>(null);

  // Pre-mount placeholder. Holds the card's rough height so the rail below it
  // doesn't jump once the clock arrives.
  if (!now) {
    return <div className="h-56 rounded-2xl bg-white" aria-hidden="true" />;
  }

  const openState = openStateFor(closingTime, now);
  const isOpen = openState.kind === "open" || openState.kind === "soon";
  const wait = waitEstimate(restaurantId, now, isOpen);
  const board = reservationBoard(closingTime, now);
  // "Tonight" over a board of 2pm tables would be wrong, so the evening wording
  // is earned by the times themselves rather than assumed from the day.
  const dayLabel =
    board.day === "tomorrow"
      ? "Tomorrow"
      : board.slots[0] >= EVENING_START
        ? "Tonight"
        : "Today";

  // Derived rather than stored, so a clock tick that retires the selected time
  // falls back to a real one instead of leaving a slot selected that is gone.
  const activeSlot =
    pickedSlot !== null && board.slots.includes(pickedSlot) ? pickedSlot : board.slots[0];

  // Three cases, not two: a restaurant whose hours we can't parse is "Hours
  // vary", never "Closed now" — claiming a place is shut on the strength of a
  // string we failed to read is the same fabrication the wait numbers are
  // standing in for.
  const headline = wait
    ? wait.minutes === 0
      ? "No wait"
      : `${wait.minutes} min wait`
    : openState.kind === "unknown"
      ? "Hours vary"
      : "Closed now";

  return (
    <section
      aria-label="Wait time and reservations"
      className="rounded-2xl bg-white px-5 py-5 sm:px-6"
    >
      <p className="mono-label mb-3.5 text-zinc-500">Wait &amp; tables</p>

      {/* The wait, on one line with the reading's own time. Small: the figure
          is context for the booking below it, not the headline of the page. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={
              !wait
                ? "h-2 w-2 shrink-0 rounded-full bg-zinc-400"
                : wait.tone === "urgent"
                  ? "h-2 w-2 shrink-0 rounded-full bg-pm-orange"
                  : "h-2 w-2 shrink-0 rounded-full bg-emerald-600"
            }
            aria-hidden="true"
          />
          <p className="truncate font-mono text-base font-semibold tabular-nums text-zinc-900">
            {headline}
          </p>
        </div>
        {/* San Diego local, via localMinutes — never the viewer's own clock,
            which would disagree with the slot times right beside it. */}
        <p className="mono-label shrink-0 text-zinc-500">{formatClock(localMinutes(now))}</p>
      </div>

      {booked ? (
        <div role="status" className="mt-4 motion-safe:animate-dialog-in">
          <div className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4 shrink-0 text-pm-orange-text" />
            <p className="font-mono text-base font-semibold tabular-nums text-zinc-900">
              {formatClock(booked.slot)} · Party of {booked.party}
            </p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Table held {booked.day.toLowerCase()}. Nothing charged.
          </p>
          <button
            type="button"
            onClick={() => setBooked(null)}
            className="mono-label mt-3 inline-flex min-h-11 items-center rounded-full text-zinc-700 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange"
          >
            Change →
          </button>
        </div>
      ) : (
        <>
          <p className="mono-label mt-4 text-zinc-500" id={`slots-${restaurantId}`}>
            {dayLabel}
          </p>
          <div
            role="radiogroup"
            aria-labelledby={`slots-${restaurantId}`}
            className="mt-2 grid grid-cols-3 gap-2"
          >
            {board.slots.map((slot) => (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={activeSlot === slot}
                onClick={() => setPickedSlot(slot)}
                className={`min-h-11 rounded-full px-2 font-mono text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                  activeSlot === slot
                    ? "bg-pm-orange text-[#F7F4EC]"
                    : "bg-pm-grey-tint text-pm-grey-text hover:text-zinc-900"
                }`}
              >
                {formatClock(slot)}
              </button>
            ))}
          </div>

          {/* Party size switches between a fixed handful of values, so it wears
              the segmented control — tan track, white selected segment — and
              not the pills the times use. Two adjacent single-choice controls
              in the same clothes would read as one. Unlabelled on purpose: the
              button underneath names the party back to you. */}
          <div
            role="radiogroup"
            aria-label="Party size"
            className="mt-2 flex rounded-full bg-pm-grey-tint p-1"
          >
            {PARTY_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={party === size}
                onClick={() => setParty(size)}
                className={`min-h-11 flex-1 rounded-full font-mono text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                  party === size ? "bg-white text-zinc-900" : "text-pm-grey-text hover:text-zinc-900"
                }`}
              >
                {size === PARTY_SIZES[PARTY_SIZES.length - 1] ? `${size}+` : size}
              </button>
            ))}
          </div>

          {/* The one primary action on this card, so it takes the accent as a
              fill and names the whole choice rather than just "Reserve". */}
          <button
            type="button"
            onClick={() => setBooked({ slot: activeSlot, party, day: dayLabel })}
            className="mt-2 min-h-11 w-full rounded-full bg-pm-orange px-3 text-sm font-medium text-[#F7F4EC] transition-[filter,scale] duration-200 ease-out hover:brightness-105 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Reserve {formatClock(activeSlot)} for {party}
          </button>
        </>
      )}

      {/* Honest footnote: the figures above are a prototype, not a feed.
          Delete this line the day real availability lands. */}
      <p className="mono-label mt-3.5 text-zinc-500">Preview · not live yet</p>
    </section>
  );
}
