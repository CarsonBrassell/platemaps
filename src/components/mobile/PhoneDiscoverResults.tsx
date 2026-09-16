"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PhoneRestaurantCardGrid } from "@/components/mobile/PhoneRestaurantCardGrid";
import { useNearby } from "@/lib/nearby";
import { fromWire } from "@/lib/discoverWire";
import { activeFilterCount, matchMarksFor, searchFromFilters } from "@/lib/discoverFilters";
import type { DiscoverPage } from "@/lib/discover";
import { packColumns } from "@/lib/photoShape";

/**
 * Discover's results on the phone: the wall, its empty state, and Show more.
 *
 * Split out of m/page.tsx for one reason — the page is a server component and
 * cannot know where the visitor is. This does what `DiscoverBrowser` does on
 * the web: once coordinates are in hand, the same query is re-answered by
 * POST /api/restaurants/discover against that position, and the located
 * answer replaces the server's. That is what puts a real distance on each
 * card and, on a search, puts the nearest one first (lib/discover.ts). The
 * server-rendered page stays on screen until then, so nothing is blank while
 * the browser thinks about it.
 *
 * Same functionality as the web version by construction — both call the same
 * route with the same canonical search string — and a different card, which
 * is the one thing that is allowed to differ.
 */
export function PhoneDiscoverResults({
  page,
  clearHref,
  moreHref,
}: {
  page: DiscoverPage;
  /** Built on the server, because both need `nav` carried across. */
  clearHref: string;
  moreHref: string;
}) {
  // The prompt goes up on a search, not on load — see lib/nearby.ts and the
  // matching effect in DiscoverBrowser.
  const nearby = useNearby();
  const [located, setLocated] = useState<{ key: string; page: DiscoverPage } | null>(null);

  // Canonical rather than the URL: exactly what the web sends, so the two
  // versions cannot be answered differently for the same filters. Computed
  // from `page` — the server-authoritative prop — before it is used below.
  const pageSearch = searchFromFilters("", page.filters);
  const locatedKey = `${pageSearch}::${page.shown}`;

  // Derived, not cleared: the located answer is only ever shown while the
  // coordinates it was answered against are still in hand *and* it was
  // answered for the page currently on screen. Without the key check, tapping
  // Show more left this pinned to the previous, smaller `located` snapshot —
  // built for the old `shown` — until its own refetch caught up, so the tap
  // looked like it did nothing (the fresh, bigger `page` was masked) and a
  // second tap then jumped two pages at once. Keying it means a navigation
  // falls back to the fresh `page` immediately, the same fix applied to
  // DiscoverBrowser on web.
  const view = nearby.coords && located && located.key === locatedKey ? located.page : page;
  const { filters } = view;

  // Any filter and not only `q`, for the reason spelled out at the matching
  // effect in DiscoverBrowser: a typed cuisine is promoted out of `q` before
  // this ever sees it, so gating on `q` left the commonest search unlocated.
  const active = activeFilterCount(filters);
  const requestLocation = nearby.request;
  useEffect(() => {
    if (active > 0 && !nearby.coords && nearby.state === "idle") requestLocation();
  }, [active, nearby.coords, nearby.state, requestLocation]);

  useEffect(() => {
    if (!nearby.coords) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/restaurants/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ search: pageSearch, shown: page.shown, coords: nearby.coords }),
        });
        if (!res.ok) return;
        const next = fromWire(await res.json());
        if (!cancelled) setLocated({ key: locatedKey, page: next });
      } catch {
        // The server's unlocated answer stays on screen — the same grid, in
        // corpus order, with no distance on it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nearby.coords, pageSearch, page.shown, locatedKey]);

  /*
   * Move focus to the results region once a navigation actually lands — the
   * same fix as DiscoverBrowser on web, for the same reason. A tap on a
   * cuisine link, a quick filter, or Show more is a `<Link>` navigation here
   * rather than `router.replace`, but this component stays mounted across it
   * just the same, so nothing moves focus off wherever the tap happened on
   * its own. Keyed on `pageSearch`/`page.shown` so this fires once per
   * completed navigation, not on the background `located` fetch resolving.
   * Skipped on mount for the same reason as web: a page load is not a
   * navigation.
   */
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const skipNextFocus = useRef(true);
  useEffect(() => {
    if (skipNextFocus.current) {
      skipNextFocus.current = false;
      return;
    }
    resultsRef.current?.focus();
  }, [pageSearch, page.shown]);

  if (view.results.length === 0) {
    return (
      <div
        ref={resultsRef}
        tabIndex={-1}
        className="px-4 py-16 text-center outline-none focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
      >
        {/* A dish names itself, because with one on there is no guessing which
            filter emptied the grid — `?dish=` is an equality on menu wording
            (dishesNamedExactly in lib/db.ts), so nothing else got a vote. */}
        <p className="font-display text-lg text-zinc-900">
          {filters.dish ? `No menus list “${filters.dish}”` : "Nothing matches that"}
        </p>
        {/* Otherwise points at the sheet rather than guessing: every row in
            there prints what it would return, and the ones reading 0 are the
            ones ruling everything out. */}
        <p className="mx-auto mt-1 max-w-[15rem] text-sm leading-snug text-pm-grey-text">
          {filters.dish
            ? "That is matched on menu wording exactly. Searching the words instead reaches places that spell it differently."
            : "Every row under Filters shows how many places it would return."}
        </p>
        <Link
          href={clearHref}
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Clear filters
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Two across, and uneven — each photo keeps its own proportions and the
          columns are packed shortest-first (lib/photoShape.ts).

          This was three across with every photo squared off. Three fit more on
          screen and made all of them small and identical, which on a screen
          that is mostly photograph is the wrong thing to optimise: at two the
          food is legible and the ragged column edges give the eye somewhere to
          land. The column count is fixed rather than a media query, so the
          packing needs nothing from the viewport. */}
      <div
        ref={resultsRef}
        tabIndex={-1}
        className="grid grid-cols-2 items-start gap-2 px-4 outline-none focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
      >
        {packColumns(view.results, 2).map((column, i) => (
          // A column is a position, not a thing — see the same note in
          // DiscoverBrowser. Index is its identity.
          <div key={i} className="grid auto-rows-min content-start gap-2">
            {column.map((restaurant, index) => (
              <PhoneRestaurantCardGrid
                key={restaurant.id}
                restaurant={restaurant}
                score={restaurant.plateScore}
                priority={index < 2}
                matchedCuisine={matchMarksFor(restaurant, filters).cuisine}
                /* Only the live number. `distance` alone is the seeded
                   downtown-origin string on an unlocated page, and this card
                   has never printed that — `milesAway` is only ever set beside
                   a distance measured from the reader. */
                distance={restaurant.milesAway !== undefined ? restaurant.distance : null}
                /* Only while a category filter is on, and only for a
                   restaurant that actually scored in it — `getDiscoverPage`
                   attaches `aspectScore` under exactly those conditions, so
                   the two halves of this check are the same condition read
                   twice rather than two guesses. */
                aspect={
                  filters.aspect && restaurant.aspectScore !== undefined
                    ? {
                        aspect: filters.aspect,
                        score: restaurant.aspectScore.score,
                        praised: restaurant.aspectScore.praised,
                      }
                    : null
                }
              />
            ))}
          </div>
        ))}
      </div>

      {view.total > view.shown && (
        <div className="px-4 pt-4">
          <Link
            href={moreHref}
            /* Full width and 48px tall: at the bottom of a long scroll this is
               a thumb target, not a text link. */
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-white text-sm font-medium text-zinc-900 transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Show more
            <span className="ml-1.5 font-mono text-xs tabular-nums text-zinc-500">
              {view.shown} / {view.total}
            </span>
          </Link>
        </div>
      )}
    </>
  );
}
