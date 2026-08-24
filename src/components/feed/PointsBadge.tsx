"use client";

import { PlateStarIcon } from "@/components/icons";
import { formatPoints } from "@/lib/points";

/**
 * The points chip that appears next to a name. Deliberately quiet — points
 * are context on a post card, not the headline, so `sm` is the default and
 * only the leaderboard and profile use `md`.
 *
 * `tone` is where it is sitting, not how loud it is. On a card it is a tinted
 * chip like every other; on a photo the tint would be a second bubble next to
 * the handle, so the fill comes off and a dark halo does the separating
 * instead — the same trade FoodPostCard's overlay handle makes, and MapSearch
 * over the map before it. The halo is a filter rather than a text-shadow
 * because it has to reach the star glyph too.
 *
 * `orange` is the one exception to "quiet" — DESIGN.md's single accent is
 * meant for exactly this: the number the whole leaderboard screen exists to
 * compare. It stays opt-in per call site (nothing switches to it by default)
 * so a post card's badge stays deliberately muted, per the paragraph above.
 */
export function PointsBadge({
  points,
  size = "sm",
  tone = "chip",
  className = "",
}: {
  points: number;
  size?: "sm" | "md";
  tone?: "chip" | "photo" | "orange";
  className?: string;
}) {
  const sm = size === "sm";
  const skin =
    tone === "photo"
      ? "text-[#F7F4EC] [filter:drop-shadow(0_1px_5px_rgba(0,0,0,0.9))]"
      : tone === "orange"
        ? "rounded-full bg-pm-orange-tint px-2.5 py-1 text-pm-orange-text font-semibold"
        : "rounded-full bg-pm-grey-tint px-2 py-0.5 text-pm-grey-text";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap font-mono font-medium tabular-nums ${
        sm ? "text-[11px]" : "text-xs"
      } ${skin} ${className}`}
    >
      <PlateStarIcon className={sm ? "h-3 w-4" : tone === "orange" ? "h-4 w-5" : "h-3.5 w-[18px]"} />
      {formatPoints(points)}
      <span className="sr-only"> Plate Points</span>
    </span>
  );
}
