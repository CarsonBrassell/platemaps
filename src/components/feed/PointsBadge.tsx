"use client";

import { PlateStarIcon } from "@/components/icons";
import { formatPoints } from "@/lib/points";

/**
 * The points chip that appears next to a name. Deliberately quiet — points
 * are context on a post card, not the headline, so `sm` is the default and
 * only the leaderboard and profile use `md`.
 */
export function PointsBadge({
  points,
  size = "sm",
  className = "",
}: {
  points: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const sm = size === "sm";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pm-grey-tint px-2 py-0.5 font-mono font-medium tabular-nums text-pm-grey-text ${
        sm ? "text-[11px]" : "text-xs"
      } ${className}`}
    >
      <PlateStarIcon className={sm ? "h-3 w-4" : "h-3.5 w-[18px]"} />
      {formatPoints(points)}
      <span className="sr-only"> PM Points</span>
    </span>
  );
}
