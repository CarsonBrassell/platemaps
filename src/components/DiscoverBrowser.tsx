"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Sidebar, type QuickFilter } from "@/components/Sidebar";
import { RestaurantCard } from "@/components/RestaurantCard";
import { OurPicks } from "@/components/OurPicks";
import { openStateFor } from "@/lib/openState";
import { getClockSnapshot, getServerClockSnapshot, subscribeToClock } from "@/lib/clock";
import type { Restaurant } from "@/data/restaurants";

const TOP_RATED_FROM = 4.5;

/**
 * Owns Discover's filter state and applies it to the grid.
 *
 * The rail used to keep this state internally and never filter anything —
 * picking a neighbourhood changed the label and nothing else.
 */
export function DiscoverBrowser({ restaurants }: { restaurants: Restaurant[] }) {
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickFilter[]>([]);

  // Same clock the open/closed pills use, so "Open now" agrees with them.
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);

  const hasFilters = neighborhood !== null || cuisine !== null || quick.length > 0;

  const results = useMemo(() => {
    return restaurants.filter((r) => {
      if (neighborhood && r.neighborhood !== neighborhood) return false;
      if (cuisine && r.cuisine !== cuisine) return false;
      if (quick.includes("top-rated") && r.rating < TOP_RATED_FROM) return false;
      if (quick.includes("trending") && !r.trending) return false;
      if (quick.includes("open-now")) {
        // Before mount there is no clock, so this filter can't be evaluated
        // yet; leaving everything in beats flashing an empty grid.
        if (!now) return true;
        if (openStateFor(r.closingTime, now).kind === "closed") return false;
      }
      return true;
    });
  }, [restaurants, neighborhood, cuisine, quick, now]);

  function clearAll() {
    setNeighborhood(null);
    setCuisine(null);
    setQuick([]);
  }

  return (
    <div className="flex flex-col gap-6 bg-white px-6 py-6 lg:flex-row lg:gap-8">
      <Sidebar
        neighborhood={neighborhood}
        cuisine={cuisine}
        quick={quick}
        onNeighborhood={setNeighborhood}
        onCuisine={setCuisine}
        onQuick={(v) =>
          setQuick((prev) => (prev.includes(v) ? prev.filter((q) => q !== v) : [...prev, v]))
        }
        onClear={clearAll}
        hasFilters={hasFilters}
      />

      <main className="min-w-0 flex-1">
        {/* Picks are a curated strip, not a search result — they stay put
            while a filter is on rather than disappearing. */}
        {!hasFilters && <OurPicks />}

        <section aria-labelledby="all-restaurants">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2
              id="all-restaurants"
              className="font-display text-lg font-semibold tracking-tight text-zinc-900"
            >
              {hasFilters ? "Matching restaurants" : "All restaurants"}
            </h2>
            <span className="shrink-0 text-xs text-zinc-400">
              {results.length} {results.length === 1 ? "place" : "places"}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-pm-grey-tint/30 px-6 py-14 text-center">
              <p className="font-display text-base font-semibold text-zinc-900">
                Nothing matches those filters
              </p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-500">
                Try widening the neighborhood or cuisine.
              </p>
              <button
                onClick={clearAll}
                className="mt-4 min-h-11 rounded-full bg-pm-orange px-5 text-sm font-medium text-white transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((restaurant) => (
                <RestaurantCard key={restaurant.id} restaurant={restaurant} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
