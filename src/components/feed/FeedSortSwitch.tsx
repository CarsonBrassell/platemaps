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
 * not a phone shape. By default it is sized to the labels rather than
 * stretched — this is a modifier on the feed, not the feed's own navigation,
 * and on the web there is a whole column beside it for the rest of the row to
 * do something with.
 *
 * `fill` is the phone's exception, and it is a layout answer rather than a
 * change of rank. There the row holds exactly two things — this and the search
 * glyph, which is anchored right so it does not move when you change tabs
 * (PhoneFeedSearch) — and at label width that left ~186pt of a 390pt column
 * empty in a bar that is now permanently on screen. Reported as exactly that.
 * The two segments split the free width instead; the track is still a tan pill
 * with a white selected segment and mono labels, so it still reads as rank 3
 * and not as the tabs above it.
 *
 * Only ever rendered on Discover. The Friends feed is chronological by
 * specification, so there is nothing there to switch between.
 */
export function FeedSortSwitch({
  active,
  onChange,
  fill = false,
}: {
  active: FeedSort;
  onChange: (sort: FeedSort) => void;
  /** Span the width offered instead of the labels', splitting it evenly
      between the segments. The phone's feed bar sets it; see the header. */
  fill?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Feed order"
      className={`rounded-full bg-pm-grey-tint p-1 ${fill ? "flex w-full" : "inline-flex"}`}
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
              fill ? "flex-1 justify-center" : ""
            } ${
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
