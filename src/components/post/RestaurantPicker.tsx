"use client";

import { useMemo, useState } from "react";
import type { Restaurant } from "@/data/restaurants";

/** "1.0 mi" → 1.0. Anything unparseable sorts to the end rather than to zero. */
function miles(r: Restaurant) {
  const n = Number.parseFloat(r.distance);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

/**
 * Which San Diego restaurant this post is about.
 *
 * Closest first, because someone posting a plate is usually still sitting in the
 * place they are posting about. Search covers cuisine and neighborhood as well
 * as the name — "north park" and "tacos" are how people actually remember where
 * they ate.
 *
 * The list arrives as a prop rather than being imported. The composer owns
 * fetching it once for both pickers; this component owns ordering and matching.
 */
export function RestaurantPicker({
  restaurants,
  selectedId,
  onSelect,
  onSkip,
}: {
  restaurants: readonly Restaurant[];
  selectedId: string | null;
  onSelect: (restaurant: Restaurant) => void;
  /** Offered on the comment path, where a place is optional. */
  onSkip?: () => void;
}) {
  const [query, setQuery] = useState("");

  const byDistance = useMemo(
    () => [...restaurants].sort((a, b) => miles(a) - miles(b)),
    [restaurants],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return byDistance;
    return byDistance.filter((r) =>
      `${r.name} ${r.cuisine} ${r.neighborhood}`.toLowerCase().includes(q),
    );
  }, [query, byDistance]);

  return (
    <div>
      <label htmlFor="restaurant-search" className="sr-only">
        Search restaurants
      </label>
      <input
        id="restaurant-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, cuisine or neighborhood"
        autoComplete="off"
        className="min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
      />

      <p className="mt-2 text-xs text-zinc-400" role="status">
        {matches.length === restaurants.length
          ? "Closest first"
          : `${matches.length} ${matches.length === 1 ? "place" : "places"}`}
      </p>

      {matches.length === 0 ? (
        <div className="mt-3 rounded-xl bg-pm-grey-tint/50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-zinc-700">No match for “{query.trim()}”</p>
          <p className="mt-1 text-sm text-zinc-500">
            PlateMaps covers San Diego County so far — try a nearby neighborhood.
          </p>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-zinc-100">
          {matches.map((r) => {
            const on = r.id === selectedId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  aria-pressed={on}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pm-orange ${
                    on ? "bg-pm-orange-tint/60" : "hover:bg-pm-grey-tint/60"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`font-display block truncate text-base font-semibold leading-tight ${
                        on ? "text-pm-orange-text" : "text-zinc-900"
                      }`}
                    >
                      {r.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">
                      {r.cuisine} · {r.neighborhood}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-zinc-400">{r.distance}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-4 min-h-11 w-full rounded-full bg-pm-grey-tint/60 px-4 text-sm text-pm-grey-text transition-colors hover:bg-pm-grey-tint hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Not about a particular place
        </button>
      )}
    </div>
  );
}
