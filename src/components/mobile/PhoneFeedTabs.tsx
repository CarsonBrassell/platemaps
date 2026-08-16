"use client";

import type { FeedTab } from "@/components/feed/types";

/**
 * The feed's screen tabs, phone version.
 *
 * Rank 2 in DESIGN.md's control hierarchy: plain text, the active tab marked by
 * weight and a short orange underline. **Never pills** — the phone nav at the
 * bottom is rank 1 and the comment sort inside CommentsScreen is rank 3, so if
 * this wore a pill the three would read as one menu in three places.
 *
 * **Map leads, and it is the screen's launch view** (PhoneFeedScreen's initial
 * tab). That reverses the web's order and the reasoning this component shipped
 * with, which was that MapLibre is the largest battery and jank cost in the
 * product and should therefore be a thing you choose to open. It is a product
 * decision, not a technical one: the phone Food Feed opens on the map because
 * the map is what the feed is *for* on a phone — you are standing somewhere.
 *
 * The cost is real and did not go away. Every visit to /m/feed now downloads
 * the MapLibre chunk and boots a WebGL context, where before only a visitor who
 * asked for the map paid for it. `next/dynamic` in PhoneFeedMapPanel still
 * scopes the download to the map's own mount, so the other two tabs remain
 * cheap once you leave it — but nobody arrives without paying once.
 *
 * Still a separate component from the web's `FeedTabs` rather than a prop on
 * it: the hit area differs (min-h-11 thumb targets) and so does the muted
 * colour (`--pm-grey-text` on the cream ground, where the web uses zinc-500).
 * The `FeedTab` values are the web's, deliberately — the two versions must not
 * disagree about which query backs which tab.
 */
const TABS: ReadonlyArray<{ value: FeedTab; label: string }> = [
  { value: "map", label: "Map" },
  { value: "discover", label: "Feed" },
  { value: "friends", label: "Friends feed" },
];

export function PhoneFeedTabs({
  active,
  onChange,
}: {
  active: FeedTab;
  onChange: (tab: FeedTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Feed filter" className="flex items-center gap-5 text-sm">
      {TABS.map((tab) => {
        const on = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.value)}
            /* min-h-11 rather than the web's padding-free text hit area: the
               tab is a thumb target here, and the underline is positioned off
               the bottom of that 44px box rather than off the text. */
            /* min-h-10 rather than the 44px floor: this row sits directly
               above a full-screen map and every point counts. The tap target
               is still ≥40px tall and the full row width wide, and the labels
               are 4px apart from the header above and the map below. */
            className={`relative inline-flex min-h-10 items-center whitespace-nowrap rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange ${
              on
                ? "font-semibold text-zinc-900"
                : /* On the cream ground, so --pm-grey-text rather than
                     zinc-500, which is only 4.28:1 here. */
                  "text-pm-grey-text"
            }`}
          >
            {tab.label}
            {on && (
              <span
                className="absolute bottom-1 left-0 h-[2px] w-5 rounded-full bg-pm-orange"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
