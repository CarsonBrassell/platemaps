"use client";

import { useSyncExternalStore } from "react";
import { openStateFor } from "@/lib/openState";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock";

/**
 * Open/closed pill, computed on the client.
 *
 * The homepage is statically prerendered, so anything time-dependent rendered
 * on the server would be frozen at build time and wrong within the hour. The
 * pill therefore stays neutral until mount, then reflects the real clock and
 * re-checks every minute.
 */
export function OpenStatePill({ closingTime }: { closingTime: string }) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);

  // Pre-mount placeholder holds the pill's height so the card doesn't reflow.
  if (!now) {
    return <span className="inline-flex h-7 items-center" aria-hidden="true" />;
  }

  const state = openStateFor(closingTime, now);
  const calm = state.status === "calm";

  /* One tan pill whatever the state — urgency is carried by the dot, not by
     spending the accent color on a status chip. */
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-pm-grey-tint px-3 py-1.5 font-mono text-xs font-medium text-pm-grey-text">
      <span
        className={
          state.kind === "closed"
            ? "h-1.5 w-1.5 rounded-full bg-zinc-400"
            : calm
              ? "h-1.5 w-1.5 rounded-full bg-emerald-600"
              : "h-1.5 w-1.5 rounded-full bg-pm-orange"
        }
        aria-hidden="true"
      />
      {state.label}
    </span>
  );
}
