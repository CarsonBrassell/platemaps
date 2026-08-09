"use client";

import type { FeedTab } from "./types";

const TABS: ReadonlyArray<{ value: FeedTab; label: string }> = [
  { value: "discover", label: "Discover" },
  { value: "friends", label: "Friends" },
  { value: "map", label: "Map" },
];

export function FeedTabs({
  active,
  onChange,
}: {
  active: FeedTab;
  onChange: (tab: FeedTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Feed filter"
      className="mb-5 flex gap-1 border-b border-zinc-200"
    >
      {TABS.map((tab) => {
        const on = tab.value === active;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.value)}
            className={`-mb-px min-h-11 border-b-2 px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
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
  );
}
