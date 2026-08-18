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
 * **The feed leads, and it is the screen's launch view** (PhoneFeedScreen's
 * initial tab). The order is the web's, in the same sequence, which is the
 * point: two surfaces showing the same three feeds should not disagree about
 * which one is first.
 *
 * This has been both ways. The map led for a while on the argument that the
 * map is what the feed is *for* on a phone — you are standing somewhere — and
 * that reversed the web's order deliberately. It is back to feed-first, and
 * the reversal took its cost with it: MapLibre is the largest battery and jank
 * expense in the product, and with the map behind a tap, only a visitor who
 * asks for it downloads the chunk and boots a WebGL context. `next/dynamic` in
 * PhoneFeedMapPanel is what scopes that download to the map's own mount, so
 * this ordering is the difference between everyone paying once and only the
 * people who want a map paying at all. Moving the map back to the front is a
 * product call that is allowed to be made again — just make it knowing that is
 * what it buys and spends.
 *
 * Still a separate component from the web's `FeedTabs` rather than a prop on
 * it: the hit area differs (min-h-11 thumb targets) and so does the muted
 * colour (`--pm-grey-text` on the cream ground, where the web uses zinc-500).
 * The `FeedTab` values are the web's, deliberately — the two versions must not
 * disagree about which query backs which tab.
 */
const TABS: ReadonlyArray<{ value: FeedTab; label: string }> = [
  { value: "discover", label: "Feed" },
  { value: "friends", label: "Friends feed" },
  { value: "map", label: "Map" },
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
               the bottom of that 44px box rather than off the text.

               It was shaved to min-h-10 while the map was the launch view, on
               the argument that this row sat directly above a full-screen map
               and every point of height counted. The feed leads now, so the
               row usually sits above scrolling cards, and there is nothing
               left buying that 4px back from the AGENTS.md floor. */
            className={`relative inline-flex min-h-11 items-center whitespace-nowrap rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange ${
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
