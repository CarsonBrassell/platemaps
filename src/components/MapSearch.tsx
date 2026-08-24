"use client";

import { type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useMapSearch, type MapMatches } from "@/components/useMapSearch";

export type { MapMatches } from "@/components/useMapSearch";

/**
 * Find restaurants and light them up on the map — the web map's skin on
 * `useMapSearch`.
 *
 * **Everything this DOES lives in that hook**, including what a search takes
 * over on the map and why the corpus is never narrowed. Read it before changing
 * behaviour here; this file owns the chrome and nothing else. The phone map
 * wears the same hook in different clothes (`PhoneMapSearch`) — a capsule in
 * the bottom-right that grows into its own field, because a control in a top
 * corner is not one a thumb finds.
 *
 * ## The map is the result. There is no list.
 *
 * This field used to drop a panel of six ranked names under itself, with the
 * blend's stars, our percent, and a "show all N on the map" door at the bottom.
 * All of it is gone, and what replaced it was already there: every match is lit
 * on the map behind this field, signing its name in neon over its own ember,
 * with everything that didn't match dropped to a bare dot. A ranked six over
 * the top of that is a second, shorter, worse copy of the answer — and the one
 * it covers is the one the reader came to the map for.
 *
 * So: typing narrows the map, Enter frames what is left, and nothing is drawn
 * over the city. `PhoneMapSearch` made this call first; the two surfaces agree
 * about what search means here.
 *
 * Enter is handled locally rather than through the hook's `onKeyDown` — that
 * one also walks a highlighted row with the arrow keys, and with no rows on
 * screen it would fly to a selection nobody could see.
 *
 * ## Two search fields, and they answer different questions
 *
 * The header's field hands its term to Discover and leaves the page. This one
 * stays put and flies. They must not read as the same control relocated —
 * which here is a difference of palette rather than of shape: the header wears
 * a white pill on cream, this wears the map's night chrome on the tiles. The
 * two never share a screen, so the ground each sits on is the whole tell.
 */

/*
 * Night chrome, not cream. The fill and hairline are lifted from `.map-fun-tiles
 * .maplibregl-ctrl-group` in globals.css, the zoom stack in the opposite corner
 * of this same map, so the field reads as a sibling of chrome the map already
 * has.
 *
 * Contrast against the #1d2126 fill: cream #F7F4EC 14.7:1 for the typed value,
 * muted #a7b0ba 7.4:1 for the placeholder and the glyphs. #8b939c (the
 * attribution's muted step) was the first pick and is too dim to spend here.
 */
const CHROME_FILL = "bg-[#1d2126]";
const CHROME_EDGE = "border border-[rgba(232,135,90,0.4)]";
const CHROME_MUTED = "text-[#a7b0ba]";

/*
 * The field is a pill in that chrome.
 *
 * ## Why a pill, where a bare rule used to be
 *
 * The rule spent nothing on the map — one line of text sitting straight on the
 * city — and paid for it everywhere else. With no fill, the tiles reach the
 * text: every glyph needed a shadow halo, the placeholder had to be lifted to
 * #c8d0d8, and the whole thing rested on the top-right corner of these tiles
 * usually being dark. On a bright ember or a neon sign it had no answer at all
 * (#ffb07a against #c8d0d8 is 1.15:1 — the two luminances nearly meet). A fill
 * makes that class of tile a non-question, and gives the control an edge you
 * can aim a cursor at instead of a line you have to already know is a field.
 *
 * `rounded-full` rather than the zoom stack's 8px because this is a control you
 * type into, and DESIGN.md gives every one of those a capsule. It does not
 * collide with the map's other control: the Discover/Friends switch is bare
 * labels under an orange bar, so the top row is one filled thing and one
 * unfilled thing rather than two of either.
 */
const FIELD_SHELL = `rounded-full ${CHROME_FILL} ${CHROME_EDGE}`;
const FIELD_TEXT = "text-[#F7F4EC]";
const FIELD_MUTED = CHROME_MUTED;

export function MapSearch({
  mapRef,
  onMatchesChange,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  /**
   * Which restaurants the map should give its bubbles to, or `null` for none in
   * particular. Called on every settled query — including the one that empties
   * the field, which is what puts the map back the way it was.
   *
   * **Must be stable across renders.** It sits in the debounce effect's
   * dependency list, so a fresh identity each render would restart the timer on
   * every keystroke's re-render and the request would never fire. RestaurantMap
   * supplies a `useCallback` with no deps.
   */
  onMatchesChange?: (matches: MapMatches | null) => void;
}) {
  const { query, setQuery, matches, showAll, inputRef, clear } = useMapSearch({
    mapRef,
    onMatchesChange,
  });

  /* The field and the Discover/Friends switch are one row, held together by
     alignment rather than by a shared container — the switch keeps its
     `left-5 top-5` in `/feed`'s map host and this takes the opposite end at the
     same 10px inset from the map's own edge (the switch's `top-5` is measured
     from outside the host's p-2.5, so the two numbers meet).

     Top-RIGHT stays where it was: the zoom stack is pushed down the left edge
     to clear the switch, so the opposite corner is the one free end of the
     frame.

     Under `sm` the map is only ~340px wide and the switch alone eats 190 of it,
     so the field wraps to the row below and spans the full width — a full-width
     capsule under bare labels, which is one control below another rather than
     two stacked slabs. `/feed` pushes the zoom stack clear of BOTH rows at this
     breakpoint; that padding and this `top-16` change together. */
  return (
    <div
      role="search"
      className="absolute left-2.5 right-2.5 top-16 z-10 sm:left-auto sm:top-2.5 sm:w-64"
    >
      {/* The pill has an edge to hang a ring on, so focus is the standard orange
          `focus-within` ring every other field in the app wears rather than the
          bespoke lit rule this control used to need. */}
      <div
        className={`flex min-h-11 items-center gap-2.5 px-4 ${FIELD_SHELL} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 ${FIELD_MUTED}`}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          /* Enter frames every match at once, which is the only answer this
             field gives now — and with a single match `showAll` lands on
             exactly the frame flying to that one place used to. Escape hands
             the keyboard back to the map without touching the term, since the
             matches it lit are still the map's whole state. */
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              showAll(matches);
            } else if (e.key === "Escape") {
              inputRef.current?.blur();
            }
          }}
          placeholder="Fly to a spot"
          aria-label="Find restaurants on the map"
          role="searchbox"
          autoComplete="off"
          className={`w-full min-w-0 bg-transparent text-sm ${FIELD_TEXT} placeholder:text-[#a7b0ba] focus:outline-none`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
            aria-label="Clear map search"
            className={`shrink-0 rounded-full transition-colors hover:text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${FIELD_MUTED}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
