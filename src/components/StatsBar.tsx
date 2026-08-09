"use client";

import { useSyncExternalStore } from "react";
import { restaurants } from "@/data/restaurants";
import { openStateFor } from "@/lib/openState";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock";

function LocationIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export function StatsBar() {
  // Shared clock: null until mounted, which also avoids a hydration mismatch
  // on the time string. See lib/clock.ts.
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);

  const time = now?.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });

  const states = now ? restaurants.map((r) => openStateFor(r.closingTime, now)) : [];
  const openCount = states.filter((s) => s.kind === "open" || s.kind === "soon").length;
  const closingSoonCount = states.filter((s) => s.kind === "soon").length;

  /* Everything in this strip is machine-derived — clock, counts — so the
     whole line sets in the small uppercase mono, quiet on the cream. */
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-5 py-1.5 sm:px-6">
      <div className="mono-label flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500">
        <span className="flex items-center gap-1.5">
          <LocationIcon />
          San Diego, CA
        </span>
        {time && (
          /* tabular-nums so the bar doesn't shimmy a pixel when 9:59 ticks
             over to 10:00. */
          <span className="flex items-center gap-1.5 tabular-nums">
            <ClockIcon />
            {time}
          </span>
        )}
      </div>

      {/* Counts are derived from the restaurant list and each place's real
          closing time. They previously read "142 spots open / 18 with no wait
          / 6 closing soon" — fixed strings, invented alongside the placeholder
          restaurants they described. Rendered only once the clock exists, for
          the same hydration reason as the time above. */}
      {now && (
        <div className="mono-label flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-600/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
            </span>
            {openCount} open now
          </span>
          <span className="tabular-nums">{restaurants.length} spots</span>
          <span className="tabular-nums">{closingSoonCount} closing soon</span>
        </div>
      )}
    </div>
  );
}
