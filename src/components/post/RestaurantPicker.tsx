"use client";

import { useMemo, useState } from "react";
import { placeLine } from "@/lib/placeLine";
import { tapFlash } from "@/lib/tapFlash";

/**
 * What this picker needs of a restaurant, and nothing else.
 *
 * A local mirror of `RestaurantIndexRow` in `lib/db.ts` — that module imports
 * the Neon client at module scope, so a client component importing it would
 * pull the driver into the browser bundle (see the note in db.ts). Keep the two
 * in step.
 *
 * It used to be the full `Restaurant`, which meant the composer fetched all
 * fourteen columns of every listed restaurant — 2.8 MB, including a JSONB
 * `hours` blob and two photo URLs — so that this list could print a name, a
 * cuisine and a neighbourhood. Narrowing the type is what let the fetch narrow;
 * the wide one gave callers no reason to ask for less.
 */
export type PickableRestaurant = {
  id: string;
  name: string;
  /**
   * Null for the ~400 restaurants that never carried one — see
   * `RestaurantView` in data/restaurants.ts.
   *
   * Deliberately without the search tags the other surfaces carry. This list
   * is picked from by name, and the note above about narrowing the payload
   * applies to a column added as much as to one kept.
   */
  cuisine: string | null;
  neighborhood: string;
  distance: string;
  lat: number;
  lng: number;
};

/*
 * What the list draws when nobody has typed: the restaurants that are near
 * you, and no others.
 *
 * It used to draw all of them. There are 9,043 listed restaurants, so picking
 * where you ate mounted 9,043 buttons and 54,000 DOM nodes in one commit — a
 * slow blink on a laptop, and in the phone app a five-second freeze between
 * tapping Next on the photo and the step arriving, which reads exactly like a
 * dead button.
 *
 * A radius rather than a fixed count, because the question this step asks is
 * "where are you", and a restaurant nine miles away is not an answer to it —
 * counting to forty would pad the list with places you cannot be standing in.
 * The floor and the ceiling are both there for the shapes a radius alone
 * handles badly: NEARBY_FLOOR keeps the list from being empty out in the
 * county, or when the browser refused a location and every distance parses to
 * Infinity, and NEARBY_CEILING keeps a dense block downtown from mounting six
 * hundred rows. Search is not bounded by distance at all — typing a name means
 * you know the place and are not asking what is around you — only capped, so
 * one number still covers the worst case.
 */
const NEARBY_MI = 3;
const NEARBY_FLOOR = 12;
const NEARBY_CEILING = 40;

/** "1.0 mi" → 1.0. Anything unparseable sorts to the end rather than to zero. */
function miles(r: PickableRestaurant) {
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
  restaurants: readonly PickableRestaurant[];
  selectedId: string | null;
  onSelect: (restaurant: PickableRestaurant) => void;
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
      `${r.name} ${r.cuisine ?? ""} ${r.neighborhood}`.toLowerCase().includes(q),
    );
  }, [query, byDistance]);

  const shown = useMemo(() => {
    if (query.trim()) return matches.slice(0, NEARBY_CEILING);
    const near = matches.filter((r) => miles(r) <= NEARBY_MI).length;
    return matches.slice(0, Math.min(Math.max(near, NEARBY_FLOOR), NEARBY_CEILING));
  }, [matches, query]);
  const hidden = matches.length - shown.length;

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
          ? "Near you, closest first"
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
          {shown.map((r) => {
            const on = r.id === selectedId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={(e) => tapFlash(e.currentTarget, () => onSelect(r))}
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
                      {placeLine(r.cuisine, r.neighborhood)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-zinc-400">{r.distance}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* The way to the rest of them, said where you run out of them. It does
          not call the remainder "nearby" — the whole point of the cut above is
          that they are not. Mono for the count, as DESIGN.md asks of every
          number. */}
      {hidden > 0 && (
        <p className="mt-3 px-3 text-xs text-pm-grey-text">
          <span className="font-mono tabular-nums">{hidden.toLocaleString()}</span>{" "}
          {query.trim() ? "more match" : "farther away"} — search by name, cuisine or
          neighborhood to reach them.
        </p>
      )}

      {onSkip && (
        <button
          type="button"
          onClick={(e) => tapFlash(e.currentTarget, onSkip)}
          className="mt-4 min-h-11 w-full rounded-full bg-pm-grey-tint/60 px-4 text-sm text-pm-grey-text transition-colors hover:bg-pm-grey-tint hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Not about a particular place
        </button>
      )}
    </div>
  );
}
