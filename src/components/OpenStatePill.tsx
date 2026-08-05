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
    return <span className="inline-flex h-[26px] items-center" aria-hidden="true" />;
  }

  const state = openStateFor(closingTime, now);
  const calm = state.status === "calm";

  return (
    <span
      className={
        calm
          ? "inline-flex items-center gap-1 rounded-full bg-pm-grey-tint px-2.5 py-1 text-xs font-medium text-pm-grey-text"
          : "inline-flex items-center gap-1 rounded-full bg-pm-orange-tint px-2.5 py-1 text-xs font-medium text-pm-orange-text"
      }
    >
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
