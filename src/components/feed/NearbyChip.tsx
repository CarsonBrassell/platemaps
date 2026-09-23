"use client";

import { PinIcon } from "@/components/icons";

/**
 * The Nearby filter, for the Discover feed — a toggle beside
 * `FeedSortSwitch`, not a third segment of it. New and Trending are both
 * orderings of *all* of San Diego; this narrows whichever one is already
 * selected to posts within `NEARBY_RADIUS_MI` (see lib/geo.ts), producing
 * "New near me" or "Trending near me" without touching the order itself.
 *
 * Deliberately its own control rather than folded into the switch: a radius
 * is a filter (can be on or off under either ordering), not a rank in "how
 * is this sorted" — see the header comment on `FeedSort` in lib/feedSort.ts.
 *
 * Sized to its own label, never stretched, and its `h-10` matches
 * `FeedSortSwitch`'s track height (`p-1` around a `min-h-8` segment) so the
 * two sit level in the same row. Same 11px mono label voice as the switch's
 * segments — a different rank of control, per DESIGN.md, but the two live
 * side by side and should read as a pair.
 *
 * **Radar pulse, not a chip fill.** There is no background pill here —
 * off is a bare outline pin in `--pm-grey-text`, nothing else, so a visit
 * that never touches Nearby sees no extra chrome next to the sort switch.
 * On, the pin fills solid `--pm-orange` (white cutout dot, same shape as
 * `MyLocation`'s map dot) and two `--pm-orange` rings breathe outward from
 * around it — `.nearby-radar-ring` in globals.css, the same "still
 * receiving" language as the map's `.map-me-pulse`, borrowed rather than
 * invented twice. The rings are sized off the pin, not a circle that isn't
 * there any more, and are `pointer-events-none` so they never steal the tap.
 * `aria-label` carries the off-state's meaning since there is no visible
 * label to read; on, the "Near me" text plus `aria-pressed` does that job.
 *
 * The pin is sized to match the search glyph it shares a row with — 20px,
 * `strokeWidth` 2 — rather than the 12px the old chip's icon used: both
 * `PhoneFeedSearch`'s collapsed disc and the header's `RestaurantSearch`
 * draw their magnifier at that size, and a pin half its neighbor's height
 * read as an afterthought next to it. The ring box scales with it (40px,
 * `h-10` — the same number as the button's own height, not a coincidence).
 */
export function NearbyChip({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? undefined : "Only show plates within 5 mi"}
      onClick={onToggle}
      className={`inline-flex h-10 min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full pl-0 pr-2 font-mono text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
        on ? "text-pm-orange-text" : "text-pm-grey-text hover:text-zinc-900"
      }`}
    >
      {/* 40px (`h-10`) so the rings read as radiating from the pin, not from
          a circle that no longer exists — see the header comment. The rings sit
          inset to 28px and grow to ~39px, so the pulse stays clear of the sort
          pill 2px to the left. */}
      <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center">
        {on && (
          <>
            <span
              aria-hidden="true"
              className="nearby-radar-ring pointer-events-none absolute inset-1.5 rounded-full border-[1.5px] border-pm-orange"
            />
            <span
              aria-hidden="true"
              className="nearby-radar-ring nearby-radar-ring-delay pointer-events-none absolute inset-1.5 rounded-full border-[1.5px] border-pm-orange"
            />
          </>
        )}
        <PinIcon
          filled={on}
          className={`relative h-5 w-5 ${on ? "text-pm-orange" : "text-pm-grey-text"}`}
        />
      </span>
      {on && "Near me"}
    </button>
  );
}
