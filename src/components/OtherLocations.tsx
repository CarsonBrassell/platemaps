"use client";

import { useState } from "react";
import Link from "next/link";
import type { SiblingLocation } from "@/lib/db";
import { formatMiles } from "@/lib/geo";

/**
 * How many branches show before the list collapses.
 *
 * Luna Grill has sixteen. Rendered flat that is fifteen cards standing between
 * the header and the menu — the section stops being a cross-reference and
 * becomes the page. Five is enough that the nearest branch is always visible
 * without opening anything, which is the question this section answers.
 */
const COLLAPSED_COUNT = 5;

/**
 * The other branches of this restaurant.
 *
 * Every branch in this corpus is its own row with its own page, and until this
 * existed there was nothing on any of them saying so. A reader standing on
 * Poké Chop Hillcrest had no way to learn there were three more, and searching
 * the name was not that way either — two of the four are spelled with the
 * accent and two without, so the search returned whichever pair matched how the
 * reader happened to type it. That is the bug this section closes from the
 * other end: even if the search has already sent someone to the wrong branch,
 * the right one is one line down the page.
 *
 * ## It links, it does not merge
 *
 * A branch keeps its own page, its own menu, its own plates and its own
 * comments, because those are genuinely per-branch: prices differ between the
 * Broken Yolk in University Heights and the one in Pacific Beach, and a rating
 * of the Hillcrest kitchen is not a rating of the Encinitas one. So this is a
 * row of links, not a location switcher on one merged listing.
 *
 * ## Nearest first, and the distance is from *here*
 *
 * The reader is on a branch, not at their own coordinates — a server component
 * has no geolocation and asking for it to render a list of links would be a
 * permission prompt for nothing. "1.4 mi" here means from the branch on screen,
 * which is the honest reading of a list titled "other locations" and is what
 * the label under the heading says.
 *
 * ## A branch with no menu still appears
 *
 * 3,700-odd listed restaurants have no menu loaded yet, and a reader looking
 * for the nearest branch of something is asking where it *is*. Hiding the ones
 * whose menu hasn't been extracted would answer a different question and would
 * make the count wrong. They are marked instead.
 */
export function OtherLocations({ locations }: { locations: SiblingLocation[] }) {
  const [expanded, setExpanded] = useState(false);
  if (locations.length === 0) return null;

  const shown = expanded ? locations : locations.slice(0, COLLAPSED_COUNT);
  const hidden = locations.length - shown.length;

  return (
    <section aria-labelledby="other-locations">
      {/* Label on the cream ground, cards below it — the same grouping idiom as
          The Hits. */}
      {/* `zinc-500` is the muted grey on white; on the cream ground it is
          4.28:1 and fails, so labels sitting on the page take
          `--pm-grey-text` (AGENTS.md). The card interiors below are white and
          keep zinc-500. */}
      <h2 id="other-locations" className="mono-label px-1 text-pm-grey-text">
        {locations.length === 1 ? "One other location" : `${locations.length} other locations`}
      </h2>

      <div className="mt-3 flex flex-col gap-2.5">
        {shown.map((location) => (
          <Link
            key={location.id}
            href={`/restaurant/${location.id}`}
            className="card-lift group flex w-full items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <span className="min-w-0 flex-1">
              {/* The neighbourhood is what distinguishes one branch from
                  another, so it leads. The name is already at the top of the
                  page the reader is standing on; repeating it in bold on every
                  row would make the list read as four restaurants rather than
                  four addresses of one. */}
              <span className="block truncate text-sm font-medium leading-snug text-zinc-900 transition-colors group-hover:text-pm-orange-text">
                {location.neighborhood}
              </span>
              {location.address && (
                <span className="mt-0.5 block truncate text-xs leading-snug text-zinc-500">
                  {location.address}
                </span>
              )}
              {!location.hasMenu && (
                <span className="mono-label mt-1 block text-zinc-500">Menu not loaded yet</span>
              )}
            </span>
            {/* A machine value, so mono — the type split in AGENTS.md. */}
            <span className="mono-label shrink-0 text-zinc-500">
              {formatMiles(location.miles)}
            </span>
          </Link>
        ))}
      </div>

      {/* The row below the list carries both the disclosure and the caveat, so
          the section ends on one line rather than two stacked ones. The button
          is a local control, so it takes the segmented-track family's tan fill
          rather than the orange primary — it isn't the action on this page. */}
      <div className="mt-3.5 flex items-center justify-between gap-3 px-1">
        <p className="mono-label text-pm-grey-text">Distance from this branch</p>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mono-label -my-2 -mr-1 min-h-11 rounded-full px-3 text-pm-orange-text transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Show {hidden} more
          </button>
        )}
      </div>
    </section>
  );
}
