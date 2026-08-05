"use client";

import type { FeedTab } from "./types";

const TABS: ReadonlyArray<{ value: FeedTab; label: string }> = [
  { value: "for-you", label: "For You" },
  { value: "nearby", label: "Nearby" },
  { value: "following", label: "Following" },
  { value: "trending", label: "Trending" },
];

export function FeedTabs({
  active,
  onChange,
  right,
}: {
  active: FeedTab;
  onChange: (tab: FeedTab) => void;
  /** Optional trailing control (the map toggle lives here). */
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-zinc-200">
      <div role="tablist" aria-label="Feed filter" className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const on = tab.value === active;
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={on}
              onClick={() => onChange(tab.value)}
              className={`relative min-h-11 whitespace-nowrap border-b-2 px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                on
                  ? "border-pm-orange font-semibold text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {right}
    </div>
  );
}
