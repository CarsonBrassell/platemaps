"use client";

import { useSyncExternalStore } from "react";
import { openStateFor, type Hours } from "@/lib/openState";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock";

/**
 * The hours pill, computed on the client.
 *
 * Shows today's actual hours — "11am – 10pm" — with a dot for whether the place
 * is open right now, rather than the old "Open til 10pm", which could only ever
 * be a claim about closing and so announced dinner-only restaurants as open at
 * breakfast. When shut it says when it opens.
 *
 * The homepage is statically prerendered, so anything time-dependent rendered
 * on the server would be frozen at build time and wrong within the hour. The
 * pill therefore stays neutral until mount, then reflects the real clock and
 * re-checks every minute.
 */
export function OpenStatePill({ hours }: { hours: Hours }) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);

  // Pre-mount placeholder holds the pill's height so the card doesn't reflow.
  if (!now) {
    return <span className="inline-flex h-7 items-center" aria-hidden="true" />;
  }

  const state = openStateFor(hours, now);
  const calm = state.status === "calm";

  /* One tan pill whatever the state — urgency is carried by the dot, not by
     spending the accent color on a status chip. */
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-pm-grey-tint px-3 py-1.5 font-mono text-xs font-medium text-pm-grey-text">
      {/* Grey for closed AND for unknown: a green dot beside "Hours vary" reads
          as "open", which is a claim the data cannot support. Only a restaurant
          known to be open right now earns the green. */}
      <span
        className={
          state.kind === "closed" || state.kind === "unknown"
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
