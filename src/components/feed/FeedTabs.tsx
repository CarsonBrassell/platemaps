"use client";

import type { FeedTab } from "./types";

/**
 * Three feeds, named as feeds. The friend feed is a separate feed and not a
 * filter on the first one: its own query (getFriendsFeed), its own order
 * (chronological, nothing buried) and its own reaction (a like, with no count
 * and no points). The map feed is the same two audiences drawn as pins, picked
 * with the switch inside the map card.
 */
const TABS: ReadonlyArray<{ value: FeedTab; label: string }> = [
  { value: "discover", label: "Feed" },
  { value: "friends", label: "Friend feed" },
  { value: "map", label: "Map feed" },
];

export function FeedTabs({
  active,
  onChange,
}: {
  active: FeedTab;
  onChange: (tab: FeedTab) => void;
}) {
  return (
    /* Plain text tabs (design swapped with the global header nav): the active
       tab is marked by weight and a short orange underline, not a pill. */
    <div role="tablist" aria-label="Feed filter" className="mb-5 flex items-center gap-5 text-sm">
      {TABS.map((tab) => {
        const on = tab.value === active;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.value)}
            className={`relative inline-flex min-h-11 items-center whitespace-nowrap rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange ${
              on
                ? "font-semibold text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {tab.label}
            {on && (
              <span
                className="absolute bottom-2 left-0 h-[2px] w-5 rounded-full bg-pm-orange"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
