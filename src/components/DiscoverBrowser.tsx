"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilterControls, FilterRail, QuickFilterChips } from "@/components/DiscoverFilters";
import { RestaurantCard } from "@/components/RestaurantCard";
import { OurPicks } from "@/components/OurPicks";
import { Dialog } from "@/components/feed/Dialog";
import { useNearby } from "@/lib/nearby";
import {
  NO_FILTERS,
  activeFilterCount,
  matchMarksFor,
  searchFromFilters,
  type DiscoverFilters,
  type QuickFilter,
} from "@/lib/discoverFilters";
import type { DiscoverPage } from "@/lib/discover";
import type { PriceBand } from "@/data/priceBands";

/** Kept in step with PAGE_SIZE in lib/discover.ts, which owns the real value. */
const PAGE_SIZE = 24;

/**
 * Discover's controls and grid.
 *
 * This component used to own the filter state, hold every restaurant, and do
 * the filtering and facet counting itself. All of that is on the server now
 * (lib/discover.ts) and it renders what it is handed — which is what keeps the
 * page a constant size no matter how many restaurants exist.
 *
 * What it still owns is the *interaction*: the URL is the query, so changing a
 * filter means navigating, and navigating is what this manages.
 */
export function DiscoverBrowser({ page }: { page: DiscoverPage }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  /*
   * The cost of moving filtering to the server is a round trip per click, and
   * a transition is what stops that reading as jank.
   *
   * Inside one, React keeps the current grid mounted while the next render is
   * in flight instead of blanking it, and `isPending` drives the dimming below.
   * So a filter click looks like the previous answer fading rather than an
   * empty page — which, on a fast connection, is most of what the old instant
   * client-side filtering actually felt like.
   */
  const [isPending, startTransition] = useTransition();

  // The permission prompt goes up on the Nearby tap, not here — see lib/nearby.ts.
  const nearby = useNearby();

  /**
   * Results for the Nearby case, which cannot come from the URL.
   *
   * Coordinates are personal data and have no business in a query string that
   * gets shared, logged and kept in history, so the URL carries only the intent
   * (`nearby=1`) and the coordinates go to /api/restaurants/discover in a POST
   * body. What comes back replaces the server-rendered page until Nearby is
   * switched off. Everything else on screen is driven by the URL exactly as it
   * looks like it is.
   */
  const [located, setLocated] = useState<DiscoverPage | null>(null);

  /*
   * Whether the located answer is the one to show, derived rather than cleared.
   *
   * Switching Nearby off has to drop these results immediately — a grid still
   * filtered to five miles under a rail that says otherwise is a lie. Deriving
   * it means that happens in the same render as the toggle, with no effect
   * racing the navigation, and nothing to reset. While a new position-aware
   * answer is in flight the previous one stays on screen, which is the same
   * thing the transition dimming does everywhere else here.
   */
  const view = page.filters.nearby && nearby.coords && located ? located : page;
  const { filters, results, counts, options, picks, total, shown } = view;
  const active = activeFilterCount(filters);

  /**
   * Navigate to a new set of filters.
   *
   * `shown` is deliberately dropped: after changing what you are looking for,
   * "show me more of the last thing" is not a request anyone made, and keeping
   * it would silently make the next query heavier than a first page.
   */
  const apply = useCallback(
    (next: DiscoverFilters) => {
      const search = searchFromFilters(window.location.search, next);
      const params = new URLSearchParams(search);
      params.delete("shown");
      const query = params.toString();
      startTransition(() => router.replace(query ? `/?${query}` : "/", { scroll: false }));
    },
    [router],
  );

  const showMore = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("shown", String(shown + PAGE_SIZE));
    startTransition(() => router.replace(`/?${params.toString()}`, { scroll: false }));
  }, [router, shown]);

  /*
   * Fetch the located view whenever Nearby is on and there are coordinates to
   * measure from — and drop it the moment either stops being true, so turning
   * Nearby off cannot leave a stale distance-filtered grid on screen.
   *
   * Keyed on the URL as well as the coordinates: with Nearby on, every other
   * filter change still has to be re-answered against the visitor's position,
   * and the server-rendered page arriving from that navigation is the wrong
   * answer to show.
   */
  const search = searchFromFilters("", filters);
  useEffect(() => {
    if (!filters.nearby || !nearby.coords) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/restaurants/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ search, shown, coords: nearby.coords }),
        });
        if (!res.ok) return;
        const next: DiscoverPage = await res.json();
        if (!cancelled) setLocated(next);
      } catch {
        // Leaves the server's unlocated answer on screen — a wider result set
        // than asked for, which is the same thing the filter model does with a
        // null position anywhere else.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filters.nearby, nearby.coords, search, shown]);

  /*
   * Every handler builds on `filters` — what is currently in effect, as
   * resolved by the server — rather than on a state updater, because there is
   * no local filter state left to update.
   */

  // Neighbourhood and Nearby are one dimension — picking either clears the
  // other, so the "where" question only ever has one answer on screen.
  function setNeighborhood(neighborhood: string | null) {
    apply({ ...filters, neighborhood, nearby: false });
  }

  function toggleNearby() {
    const on = !filters.nearby;
    // Asked only on the way on, and only when there's nothing cached — a
    // second tap to turn it off must never raise the prompt again.
    if (on && !nearby.coords) nearby.request();
    apply({
      ...filters,
      nearby: on,
      neighborhood: on ? null : filters.neighborhood,
    });
  }

  function setCuisine(cuisine: string | null) {
    apply({ ...filters, cuisine });
  }

  function setPrice(price: PriceBand | null) {
    apply({ ...filters, price });
  }

  function setAspect(aspect: string | null) {
    apply({ ...filters, aspect });
  }

  function toggleQuick(value: QuickFilter) {
    apply({
      ...filters,
      quick: filters.quick.includes(value)
        ? filters.quick.filter((q) => q !== value)
        : [...filters.quick, value],
    });
  }

  function clearAll() {
    apply(NO_FILTERS);
  }

  // Drops the text term and keeps every filter — the two are separate choices
  // and a search made inside a cuisine shouldn't take the cuisine with it when
  // it goes.
  function clearQuery() {
    apply({ ...filters, q: null });
  }

  const nearbyProps = { state: nearby.state, count: counts.nearby };

  const emptyHint = !filters.q
    ? "Every option in the rail shows how many places it would return — the ones reading 0 are the ones ruling everything out."
    : active > 1
      ? "Search covers names, cuisines and neighborhoods, and the filters still apply on top of it."
      : "Search covers names, cuisines and neighborhoods. A shorter term will reach more places.";

  return (
    <div>
      {/* Under `lg` the rail would stack full-width and push every result off
          the first screen. This is what replaces it: one line holding the
          toggles people reach for most, with the rest a tap away. */}
      <div className="flex items-center gap-2 overflow-x-auto py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-label={active > 0 ? `Filters, ${active} applied` : "Filters"}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] text-zinc-700 transition-colors hover:text-zinc-900 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Filters
          {active > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-zinc-500">
              {active}
            </span>
          )}
        </button>

        <QuickFilterChips
          quick={filters.quick}
          counts={counts.quick}
          onQuick={toggleQuick}
        />
      </div>

      <div className="flex flex-col gap-6 py-4 lg:flex-row lg:gap-8">
        <FilterRail
          filters={filters}
          counts={counts}
          neighborhoods={options.neighborhoods}
          cuisines={options.cuisines}
          prices={options.prices}
          aspects={options.aspects}
          nearby={nearbyProps}
          onNeighborhood={setNeighborhood}
          onNearby={toggleNearby}
          onCuisine={setCuisine}
          onPrice={setPrice}
          onAspect={setAspect}
          onQuick={toggleQuick}
          onClear={clearAll}
        />

        {/* Lifted so the top of the first row of restaurant cards is level with
            the top of the FILTERS card — white edge to white edge, which is the
            alignment you actually read.
         *
         * 25.2px is exactly what sits above those cards inside this column: the
         * "Our picks" label's 13.2px line box + the 12px mb-3 under it. That
         * puts the label itself up in the band between the header and the rail,
         * which is empty at this x — the clock is far left at x≤104, the cards
         * start at x=290.
         *
         * Aligning box edges rather than text needs no optical fudge, unlike
         * the label-to-edge version this replaces.
         *
         * lg only — below lg the rail is `hidden` and there is no edge to align
         * to. */}
        <main className="min-w-0 flex-1 lg:-mt-[25.2px]">
          {/* Picks are a curated strip, not a search result — they stay put
              while a filter is on rather than disappearing. */}
          {active === 0 && <OurPicks picks={picks} />}

          <section aria-labelledby="all-restaurants">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
              {/* A searched term becomes the heading, because it is what the
                  page is now about. Terms the rail could express never reach
                  here — "Thai" arrives as the cuisine filter (see `promote` in
                  lib/discoverFilters.ts), so this only ever holds the free text
                  that is genuinely a search: a restaurant's name, a word. */}
              <div className="flex min-w-0 items-baseline gap-2">
                <h2
                  id="all-restaurants"
                  className="truncate font-display text-lg font-semibold tracking-tight text-zinc-900"
                >
                  {filters.q
                    ? `Results for “${filters.q}”`
                    : active > 0
                      ? "Matching restaurants"
                      : "All restaurants"}
                </h2>
                {/* Same underlined-text treatment as the rail's Clear, because
                    it is the same rank of control — the quiet way out of a
                    choice, not something competing with the results. */}
                {filters.q && (
                  <button
                    type="button"
                    onClick={clearQuery}
                    className="shrink-0 rounded-full px-1 py-0.5 text-xs text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                  >
                    Clear search
                  </button>
                )}
              </div>
              {/* Announced rather than silent: on a phone the grid change can
                  be entirely below the fold. */}
              <p
                role="status"
                className="mono-label shrink-0 tabular-nums text-zinc-500"
              >
                {total} {total === 1 ? "place" : "places"}
              </p>
            </div>

            {results.length === 0 ? (
              <div className="rounded-2xl bg-white px-6 py-12 text-center">
                <p className="text-sm font-medium text-zinc-900">
                  {filters.q
                    ? `Nothing matches “${filters.q}”`
                    : "Nothing matches those filters"}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-[13px] text-zinc-500">
                  {emptyHint}
                </p>
                {/* Clears the narrower thing. With a filter also on it is
                    genuinely ambiguous which of the two emptied the grid, and
                    dropping the search first leaves the visitor inside the
                    filter they chose deliberately rather than back at the top
                    of the city. */}
                <button
                  type="button"
                  onClick={filters.q ? clearQuery : clearAll}
                  className="mt-4 min-h-11 rounded-full bg-pm-orange px-5 text-[13px] font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  {filters.q ? "Clear search" : "Clear filters"}
                </button>
              </div>
            ) : (
              <>
                {/* Dimmed, not replaced. The previous answer staying legible
                    under a pending one is the whole reason a filter click still
                    feels immediate now that it costs a request. */}
                <div
                  className={`grid auto-rows-min grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 xl:grid-cols-3 ${
                    isPending ? "opacity-60" : "opacity-100"
                  }`}
                  aria-busy={isPending}
                >
                  {results.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      score={restaurant.plateScore}
                      match={{
                        ...matchMarksFor(restaurant, filters),
                        aspect:
                          filters.aspect && restaurant.aspectScore !== undefined
                            ? {
                                aspect: filters.aspect,
                                score: restaurant.aspectScore.score,
                                praised: restaurant.aspectScore.praised,
                              }
                            : null,
                      }}
                    />
                  ))}
                </div>

                {/* Only when there is genuinely more. The count beside it is
                    what makes this a decision rather than a guess. */}
                {total > shown && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={showMore}
                      disabled={isPending}
                      className="min-h-11 rounded-full bg-white px-6 text-[13px] font-medium text-zinc-700 transition-colors hover:text-zinc-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                    >
                      {isPending ? "Loading…" : `Show more (${total - shown} left)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </main>
      </div>

      {sheetOpen && (
        <Dialog
          title="Filters"
          variant="sheet"
          onClose={() => setSheetOpen(false)}
          footer={
            <div className="flex items-center gap-3">
              {active > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="min-h-11 shrink-0 rounded-full px-2 text-[13px] text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="min-h-11 flex-1 rounded-full bg-pm-orange px-4 text-[13px] font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Show {total} {total === 1 ? "place" : "places"}
              </button>
            </div>
          }
        >
          <div className="px-5 py-4">
            <FilterControls
              filters={filters}
              counts={counts}
              neighborhoods={options.neighborhoods}
              cuisines={options.cuisines}
              prices={options.prices}
              aspects={options.aspects}
              nearby={nearbyProps}
              onNeighborhood={setNeighborhood}
              onNearby={toggleNearby}
              onCuisine={setCuisine}
              onPrice={setPrice}
              onAspect={setAspect}
              onQuick={toggleQuick}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
