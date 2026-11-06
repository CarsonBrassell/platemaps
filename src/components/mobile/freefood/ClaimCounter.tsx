"use client";

import { FREE_FOOD_TOTAL_SLICES } from "@/lib/freeFoodEvent";

/**
 * Slices left tonight: the total minus tickets activated at the counter, so it
 * drops the moment anyone activates theirs. Renders nothing until the count
 * has loaded. The number remounts on change so it drops in (`ff-count`).
 */
export function ClaimCounter({
  left,
  sim = false,
  ground = "white",
}: {
  left: number | null;
  sim?: boolean;
  /** What it sits on: a cream box on the white popup, a white card on the cream Profile. */
  ground?: "white" | "cream";
}) {
  if (left === null) return null;
  return (
    <div
      className={`mb-4 flex w-full max-w-[340px] items-center justify-between rounded-2xl ${ground === "cream" ? "bg-white" : "bg-[var(--background)]"} px-4 py-3`}
      aria-live="polite"
      aria-label={`${left} of ${FREE_FOOD_TOTAL_SLICES} slices left`}
    >
      <div>
        <p className="mono-label text-[10px] text-pm-grey-text">Slices left</p>
        {sim && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-pm-orange-text">Simulation</p>}
      </div>
      <p className="overflow-hidden font-mono leading-none tabular-nums">
        <span key={left} className="ff-count text-[32px] font-bold text-pm-orange">
          {left}
        </span>
        <span className="text-base font-semibold text-pm-grey-text">/{FREE_FOOD_TOTAL_SLICES}</span>
      </p>
    </div>
  );
}
