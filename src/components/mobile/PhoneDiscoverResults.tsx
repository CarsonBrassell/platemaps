"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PhoneRestaurantCardGrid } from "@/components/mobile/PhoneRestaurantCardGrid";
import { matchMarksFor } from "@/lib/discoverFilters";
import type { DiscoverPage } from "@/lib/discover";
import { packColumns } from "@/lib/photoShape";
import { useNearby } from "@/lib/nearby";

/**
 * The wall of cards, its empty state and Show more. The page it shows is
 * whatever `useDiscoverQuery` has resolved (see lib/useDiscoverQuery.ts):
 * the server's shell, or the answer to the URL, or — once the browser knows
 * where the reader is — the same query re-answered against that position,
 * with a distance on every card. `pending` dims the grid while a new answer
 * is in flight so the old one never blanks out.
 */
export function PhoneDiscoverResults({
  view,
  pending,
  viewKey,
  clearHref,
  moreHref,
}: {
  view: DiscoverPage;
  pending: boolean;
  viewKey: string;
  clearHref: string;
  moreHref: string;
}) {
  const { filters } = view;
  const nearby = useNearby();

  /* Ask for a position once the reader has narrowed the grid at all: a
     "Nearby" filter needs it outright, and any other filter is a sign they
     are choosing, which is when a distance on each card earns its place. Not
     on a bare landing — a permission prompt before the visitor has done
     anything is the wrong first impression. */
  const active = Object.values(filters).filter((v) => (Array.isArray(v) ? v.length : v)).length;
  const requestLocation = nearby.request;
  useEffect(() => {
    if (active > 0 && !nearby.coords && nearby.state === "idle") requestLocation();
  }, [active, nearby.coords, nearby.state, requestLocation]);

  /* Move focus to the results once a navigation lands (not on mount), so a
     screen reader announces the new grid rather than staying on the chip. */
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const skipNextFocus = useRef(true);
  useEffect(() => {
    if (skipNextFocus.current) {
      skipNextFocus.current = false;
      return;
    }
    resultsRef.current?.focus();
  }, [viewKey]);

  if (view.results.length === 0) {
    return (
      <div
        ref={resultsRef}
        tabIndex={-1}
        aria-busy={pending}
        className={`px-4 py-16 text-center outline-none transition-opacity focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange ${
          pending ? "opacity-60" : ""
        }`}
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
          columns are packed shortest-first (lib/photoShape.ts). Three across
          fit more and made all of them small and identical, which on a screen
          that is mostly photograph is the wrong thing to optimise. The column
          count is fixed rather than a media query, so the packing needs
          nothing from the viewport. */}
      <div
        ref={resultsRef}
        tabIndex={-1}
        aria-busy={pending}
        className={`grid grid-cols-2 items-start gap-2 px-4 outline-none transition-opacity focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange ${
          pending ? "opacity-60" : ""
        }`}
      >
        {packColumns(view.results, 2).map((column, i) => (
          <div key={i} className="grid auto-rows-min content-start gap-2">
            {column.map((restaurant, index) => (
              <PhoneRestaurantCardGrid
                key={restaurant.id}
                restaurant={restaurant}
                score={restaurant.plateScore}
                priority={index < 2}
                matchedCuisine={matchMarksFor(restaurant, filters).cuisine}
                /* `distance` is the downtown-origin string on an unlocated
                   page, and this card has never printed that — `milesAway` is
                   only ever set beside a distance measured from the reader. */
                distance={restaurant.milesAway !== undefined ? restaurant.distance : null}
                /* Only a restaurant that actually scored in the filtered
                   category — `getDiscoverPage` attaches `aspectScore` under
                   exactly those conditions. */
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
            /* A full-width white pill: a thumb target, not a text link. */
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
