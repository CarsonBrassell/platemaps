"use client";

import { useSyncExternalStore } from "react";
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

  /* Everything in this strip is machine-derived, so the whole line sets in the
     small uppercase mono, quiet on the cream.
   *
   * The "N open now / N spots / N closing soon" counts used to sit on the right
   * of this row. They were removed deliberately — see PRODUCT.md on invented
   * volume/wait figures. `openStateFor` still labels each restaurant card
   * individually, which is where open/closed actually belongs; nothing else
   * consumed these totals.
   *
   * No top padding: the header above already sets the row's air, and this strip
   * is a caption hanging off it rather than a band of its own. */
  return (
    <div className="mono-label flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-2 text-zinc-500 sm:px-6">
      {/* lg:hidden, because the header carries the city from lg up and would
          otherwise repeat it directly above this line. Below lg the header
          hides it, so this is the only place it appears — the two are
          complementary, never both and never neither. */}
      <span className="flex items-center gap-1.5 lg:hidden">
        <LocationIcon />
        San Diego, CA
      </span>
      {time && (
        /* tabular-nums so the bar doesn't shimmy a pixel when 9:59 ticks over
           to 10:00. */
        <span className="flex items-center gap-1.5 tabular-nums">
          <ClockIcon />
          {time}
        </span>
      )}
    </div>
  );
}
