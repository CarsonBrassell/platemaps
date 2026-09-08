"use client";

import { FEED_SORTS, type FeedSort } from "@/lib/feedSort";
import { FlameIcon } from "@/components/icons";

/** The same brick-red `RestaurantMap.tsx`'s `heatColorForPercent` gives a
    hot rating percent — reused here rather than invented fresh, so
    "Trending" reads with the same warmth the app already uses for a
    scorching number instead of a second, unrelated red. */
const HEAT_RED = "#9a2c10";

/**
 * Trending / New, for the Discover feed.
 *
 * **Rank 3 in DESIGN.md's control hierarchy** — a segmented control on a tan
 * track, selected segment white with ink text, mono labels. That rank is the
 * whole reason it does not look like the tabs directly above it: those are
 * rank 2 (plain text, orange underline) and pick *which feed you are reading*;
 * this picks how that one feed is ordered. Three ranks of control must never
 * wear the same clothes, and a sort that looked like a tab would read as a
 * fourth feed.
 *
 * Shared by `/feed` and `/m/feed` rather than written twice: the two surfaces
 * duplicate layout on purpose, but an ordering they disagree about is a bug,
 * not a phone shape. It is sized to the labels rather than stretched full
 * width — this is a modifier on the feed, not the feed's own navigation.
 *
 * Only ever rendered on Discover. The Friends feed is chronological by
 * specification, so there is nothing there to switch between.
 */
export function FeedSortSwitch({
  active,
  onChange,
}: {
  active: FeedSort;
  onChange: (sort: FeedSort) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Feed order"
      className="inline-flex rounded-full bg-pm-grey-tint p-1"
    >
      {FEED_SORTS.map((sort) => {
        const on = sort.value === active;
        const trending = sort.value === "trending";
        return (
          <button
            key={sort.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(sort.value)}
            style={trending && on ? { color: HEAT_RED } : undefined}
            className={`flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full px-3.5 font-mono text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
              trending
                ? on
                  ? "bg-white"
                  : "text-pm-orange-text/80 hover:text-pm-orange-text"
                : on
                  ? "bg-white text-zinc-900"
                  : "text-pm-grey-text hover:text-zinc-900"
            }`}
          >
            {/* The flame's fills are its own fixed orange-to-red gradient
                (see FlameIcon) — it isn't recolored here, it's why "Trending"
                gets one at all. */}
            {trending && <FlameIcon className="h-3 w-3" />}
            {sort.label}
          </button>
        );
      })}
    </div>
  );
}
