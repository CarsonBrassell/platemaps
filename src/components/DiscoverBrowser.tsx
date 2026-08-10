"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FilterControls, FilterRail, QuickFilterChips } from "@/components/DiscoverFilters";
import { RestaurantCard } from "@/components/RestaurantCard";
import { OurPicks } from "@/components/OurPicks";
import { Dialog } from "@/components/feed/Dialog";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock";
import { useNearby } from "@/lib/nearby";
import {
  NO_FILTERS,
  activeFilterCount,
  applyFilters,
  aspectOptions,
  countFacets,
  cuisineOptions,
  filtersFromSearch,
  neighborhoodOptions,
  priceOptions,
  searchFromFilters,
  strongAspectStars,
  strongAspectsFrom,
  type AspectTally,
  type DiscoverFilters,
  type FilterContext,
  type QuickFilter,
  type StrongAspects,
} from "@/lib/discoverFilters";
import type { PriceBand } from "@/data/priceBands";
import type { RestaurantView } from "@/data/restaurants";

/**
 * Whether hydration has happened, read as an external store.
 *
 * The snapshot is `false` on the server and through the hydration render, then
 * `true` — which is how a component reads something that only exists in the
 * browser without diverging from the prerendered HTML. The value can only
 * change once and React is the thing that changes it, so there is nothing to
 * subscribe to and the unsubscribe is a no-op.
 */
const subscribeToNothing = () => () => {};
const hydratedOnClient = () => true;
const hydratedOnServer = () => false;

/**
 * Owns Discover's filter state and applies it to the grid.
 *
 * The rail used to keep this state internally and never filter anything —
 * picking a neighbourhood changed the label and nothing else.
 */
export function DiscoverBrowser({ restaurants }: { restaurants: RestaurantView[] }) {
  /**
   * What the visitor has picked, or null while they haven't picked anything —
   * in which case the URL still speaks for them. See `filters` below.
   *
   * The two are kept separate rather than collapsed into one state seeded from
   * the URL because they can't be seeded: this page is prerendered and the URL
   * isn't readable until hydration, so "no choice yet" and "chose nothing" have
   * to stay distinguishable.
   */
  const [chosen, setChosen] = useState<DiscoverFilters | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [aspects, setAspects] = useState<StrongAspects | null>(null);

  // Same clock the open/closed pills use, so "Open now" agrees with them.
  // Subscribed unconditionally: the rail now prints how many places each
  // filter would return, and "Open now" can't count without knowing the time.
  // This costs nothing extra — every card already mounts an OpenStatePill with
  // its own subscription, so the minute tick was always reaching the grid.
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);

  // The permission prompt goes up on the Nearby tap, not here — see lib/nearby.ts.
  const nearby = useNearby();

  const isHydrated = useSyncExternalStore(
    subscribeToNothing,
    hydratedOnClient,
    hydratedOnServer,
  );

  /**
   * The filters a shared link asked for.
   *
   * Read after hydration rather than during the first render: the homepage is
   * prerendered, so parsing the URL on that pass would render a filtered grid
   * against static HTML holding every restaurant. Reading it through
   * useSearchParams instead would drop the whole grid out of that HTML (Next
   * bails the subtree out of prerendering), which costs more on a phone than
   * one corrective render does.
   *
   * Derived rather than latched into state by an effect: the correction is
   * then a re-render React scheduled for itself when the snapshot flipped,
   * not a second pass triggered by a setState after the first one committed.
   */
  const fromUrl = useMemo(
    () =>
      isHydrated ? filtersFromSearch(window.location.search, restaurants) : NO_FILTERS,
    [isHydrated, restaurants],
  );

  const filters = chosen ?? fromUrl;

  // The one thing the filters need that isn't static. Fetched once on mount
  // rather than lazily when the category facet is first touched: the rail
  // prints a count beside every option from the moment it renders, so there is
  // no interaction to hang the request off. A failure leaves `aspects` null,
  // which the filter model reads as "can't evaluate yet" and lets everything
  // through — the same shape as the clock before it ticks.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/restaurants/aspects");
        if (!res.ok) return;
        const data: { tallies: Record<string, AspectTally> } = await res.json();
        if (!cancelled) setAspects(strongAspectsFrom(data.tallies));
      } catch {
        // Discover still works without category ratings; nothing to say.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const ctx: FilterContext = useMemo(
    () => ({ now, here: nearby.coords, aspects }),
    [now, nearby.coords, aspects],
  );

  // The curated strip above the grid. Two rows out of the list this component
  // already holds — see the note in OurPicks on why it doesn't fetch its own.
  const picks = useMemo(
    () => restaurants.filter((r) => r.trending).slice(0, 2),
    [restaurants],
  );

  const neighborhoods = useMemo(() => neighborhoodOptions(restaurants), [restaurants]);
  const cuisines = useMemo(() => cuisineOptions(restaurants), [restaurants]);
  const prices = useMemo(() => priceOptions(restaurants), [restaurants]);
  const aspectChoices = useMemo(() => aspectOptions(aspects), [aspects]);

  const results = useMemo(
    () => applyFilters(restaurants, filters, ctx),
    [restaurants, filters, ctx],
  );
  const counts = useMemo(
    () => countFacets(restaurants, filters, ctx),
    [restaurants, filters, ctx],
  );

  const active = activeFilterCount(filters);

  /*
   * Every handler builds on `filters` — the current value — rather than on a
   * `setChosen(prev => …)` updater. `prev` is null until the first pick, so an
   * updater would spread null and drop whatever the incoming link asked for.
   * These all run from user events, where `filters` is already the value the
   * visitor is looking at.
   */

  // Neighbourhood and Nearby are one dimension — picking either clears the
  // other, so the "where" question only ever has one answer on screen.
  function setNeighborhood(neighborhood: string | null) {
    setChosen({ ...filters, neighborhood, nearby: false });
  }

  function toggleNearby() {
    const on = !filters.nearby;
    // Asked only on the way on, and only when there's nothing cached — a
    // second tap to turn it off must never raise the prompt again.
    if (on && !nearby.coords) nearby.request();
    setChosen({
      ...filters,
      nearby: on,
      neighborhood: on ? null : filters.neighborhood,
    });
  }

  function setCuisine(cuisine: string | null) {
    setChosen({ ...filters, cuisine });
  }

  function setPrice(price: PriceBand | null) {
    setChosen({ ...filters, price });
  }

  function setAspect(aspect: string | null) {
    setChosen({ ...filters, aspect });
  }

  function toggleQuick(value: QuickFilter) {
    setChosen({
      ...filters,
      quick: filters.quick.includes(value)
        ? filters.quick.filter((q) => q !== value)
        : [...filters.quick, value],
    });
  }

  function clearAll() {
    setChosen(NO_FILTERS);
  }

  // Mirroring state out to an external system — the address bar — which is
  // what an effect is actually for.
  //
  // replaceState, not pushState: the URL stays shareable and survives a
  // reload, but Back still leaves the page instead of unwinding filters one
  // tap at a time. Native history calls are wired into the Next router.
  //
  // Guarded on hydration so it can't run against the prerender's empty
  // filters and wipe the parameters the visitor arrived with.
  useEffect(() => {
    if (!isHydrated) return;
    const search = searchFromFilters(window.location.search, filters);
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
  }, [isHydrated, filters]);

  const nearbyProps = { state: nearby.state, count: counts.nearby };

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
          neighborhoods={neighborhoods}
          cuisines={cuisines}
          prices={prices}
          aspects={aspectChoices}
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
            <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
              <h2
                id="all-restaurants"
                className="font-display text-lg font-semibold tracking-tight text-zinc-900"
              >
                {active > 0 ? "Matching restaurants" : "All restaurants"}
              </h2>
              {/* Announced rather than silent: on a phone the grid change can
                  be entirely below the fold. */}
              <p
                role="status"
                className="mono-label shrink-0 tabular-nums text-zinc-500"
              >
                {results.length} {results.length === 1 ? "place" : "places"}
              </p>
            </div>

            {results.length === 0 ? (
              <div className="rounded-2xl bg-white px-6 py-12 text-center">
                <p className="text-sm font-medium text-zinc-900">
                  Nothing matches those filters
                </p>
                <p className="mx-auto mt-1 max-w-xs text-[13px] text-zinc-500">
                  Every option in the rail shows how many places it would return — the
                  ones reading 0 are the ones ruling everything out.
                </p>
                <button
                  type="button"
                  onClick={clearAll}
                  className="mt-4 min-h-11 rounded-full bg-pm-orange px-5 text-[13px] font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((restaurant) => {
                  // Only while a category filter is on, and only from the
                  // tallies the filter itself matched against — so the number
                  // on the card is the number that put the card here.
                  const stars = strongAspectStars(aspects, restaurant.id, filters.aspect);
                  return (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      highlight={
                        filters.aspect && stars !== null
                          ? { aspect: filters.aspect, stars }
                          : null
                      }
                    />
                  );
                })}
              </div>
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
                Show {results.length} {results.length === 1 ? "place" : "places"}
              </button>
            </div>
          }
        >
          <div className="px-5 py-4">
            <FilterControls
              filters={filters}
              counts={counts}
              neighborhoods={neighborhoods}
              cuisines={cuisines}
              prices={prices}
              aspects={aspectChoices}
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
