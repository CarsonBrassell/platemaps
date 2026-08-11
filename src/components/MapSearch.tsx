"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RestaurantView } from "@/data/restaurants";
import { rank } from "@/lib/restaurantRank";
import { StarIcon } from "@/components/icons";

/**
 * Find a restaurant and fly the camera to it.
 *
 * ## It moves the camera; it never touches the corpus
 *
 * The obvious implementation — filter the map down to what matches — is the
 * one thing this must not do. RestaurantMap refits the camera whenever the set
 * of restaurants changes (`fitKey`, guarded by `fittedToRef`), so narrowing the
 * list would snap a reader who had zoomed into a block back out to the county
 * frame on every keystroke. The map keeps showing the whole city; searching
 * only decides where the camera is pointed.
 *
 * For the same reason the query lives here and not in RestaurantMap: the marker
 * effect there rebuilds every bubble it renders when its deps change, so a
 * `query` anywhere in that dependency list would tear down and re-place the
 * whole map's worth of bubbles once per typed character. This component reaches
 * the map through the ref instead, the way the vote callbacks already do.
 *
 * ## Two search fields, and they answer different questions
 *
 * The header's field hands its term to Discover and leaves the page. This one
 * stays put and flies. They must not look alike, or the second one reads as a
 * relocated copy of the first — hence a bare rule on the night map rather than
 * the header's white pill.
 */

/** No row highlighted — the state every fresh keystroke returns to. */
const NONE = -1;

/**
 * Close enough to read the block: the restaurant's own name sign and its
 * neighbours are legible, and the extruded buildings are fully in (they fade
 * over 14.5–15.5), so the arrival lands on the skyline view rather than a flat
 * plan. `transformCameraUpdate` supplies the matching pitch on its own — pitch
 * is a function of zoom on this map, so passing one here would only fight it.
 * Well inside the map's `maxZoom` of 19.
 */
const RESULT_ZOOM = 16.5;

/** Long enough to read as travel across the city rather than a cut, inside the
 *  300ms-for-UI budget's spirit: this is a camera move over miles, and the
 *  point of animating it at all is keeping the reader oriented about where the
 *  spot is relative to where they were. Skipped outright under reduced motion. */
const FLIGHT_MS = 1600;

/*
 * Night chrome, not cream — and from here down these three name the DROPDOWN
 * only. The fill and hairline are lifted from `.map-fun-tiles
 * .maplibregl-ctrl-group` in globals.css, the zoom stack in the opposite corner
 * of this same map, so the panel reads as a sibling of chrome the map already
 * has. A results list needs a surface to sit on even where the field does not:
 * rows of names over moving tiles would be unreadable in a way one line of
 * placeholder text is not.
 *
 * Contrast against the #1d2126 fill: cream #F7F4EC 14.7:1, muted #a7b0ba
 * 7.4:1, the ember accent #ffb07a 9.1:1. On the highlighted row — the fill with
 * #e8875a laid over it at 22%, i.e. #4a3731 — cream is 10.2:1 and #a7b0ba is
 * 5.1:1, so the muted line still clears 4.5:1 where it is dimmest. #8b939c (the
 * attribution's muted step) was the first pick and fails that row at 3.6:1.
 */
const CHROME_FILL = "bg-[#1d2126]";
const CHROME_EDGE = "border border-[rgba(232,135,90,0.4)]";
const CHROME_MUTED = "text-[#a7b0ba]";

/*
 * The field itself has no fill at all. It is a rule with text sitting on it.
 *
 * ## Why the panel went away
 *
 * Every candidate this field has worn, and all nine shapes in the draft gallery
 * (`src/components/drafts/fieldShapes.tsx`), kept an opaque #1d2126 panel —
 * chosen precisely so map content underneath could never reach the text. This
 * gives that guarantee up on purpose. The field shares the map's top row with
 * the Discover/Friends switch, and two filled panels bracketing the frame read
 * as a toolbar bolted over the city; one filled switch and one rule read as a
 * caption on it. The map is the hero, and this is the version that spends the
 * least of it.
 *
 * ## What replaces the fill, because something has to
 *
 * The tiles are neo-noir and dark nearly everywhere, so the ground under this
 * corner runs roughly #101317 to #3a2a1e. The placeholder #c8d0d8 measures
 * ~12:1 against plain night and ~9:1 over a lit arterial, both well clear of
 * 4.5:1. What it cannot survive is landing directly on a bright ember or a neon
 * sign (#ffb07a is 1.15:1 against it — the two luminances nearly meet). Three
 * things answer that, in order of how much work they do:
 *
 *  1. The field keeps the top-RIGHT corner. The aura pools warm light over the
 *     dense districts and the arterials carry the glow, but the frame's top
 *     right is the quiet side of this style far more often than not.
 *  2. Every glyph and both text runs carry a dark shadow halo, so a character's
 *     edge stays defined even when the tile behind it is warm. That is what
 *     makes the difference on the bad tile, not the colour choice.
 *  3. The placeholder sits at #c8d0d8 rather than the panel-era #a7b0ba, which
 *     had a solid fill doing this work for it.
 *
 * If it ever proves unreadable in the wild, lift the rule and the text a step —
 * do NOT put the panel back. The panel is the thing this design is spending,
 * and half a panel is worse than either whole answer.
 */
const FIELD_TEXT = "text-[#F7F4EC]";
const FIELD_MUTED = "text-[#c8d0d8]";
/** A dark halo, since there is no fill separating the text from the city. */
const FIELD_HALO = "[text-shadow:0_1px_7px_rgba(0,0,0,0.95),0_0_3px_rgba(0,0,0,0.7)]";
/** The same halo for stroked SVG, which text-shadow cannot reach. */
const GLYPH_HALO = "[filter:drop-shadow(0_1px_5px_rgba(0,0,0,0.95))]";

export function MapSearch({ mapRef }: { mapRef: RefObject<MapLibreMap | null> }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(NONE);
  const [candidates, setCandidates] = useState<RestaurantView[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * One request per settled query, not per keystroke — the same discipline the
   * header field uses. 150ms is below the point a typist notices and above the
   * gap between characters, so a word typed at speed costs one request instead
   * of six. The cleanup both cancels the pending timer and marks the in-flight
   * response stale, which is what stops a slow "th" from landing after a fast
   * "thai" and repopulating the list with the wrong matches.
   */
  useEffect(() => {
    const q = query.trim();
    // Nothing to clear: `rank` returns [] for an empty query, so whatever the
    // last search left in state is already unreachable.
    if (!q) return;

    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/restaurants?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data: { restaurants: RestaurantView[] } = await res.json();
        if (!stale) setCandidates(data.restaurants);
      } catch {
        // A dropped search request leaves the previous matches on screen,
        // which is a better answer than emptying the list.
      }
    }, 150);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const results = useMemo(() => rank(query, candidates), [query, candidates]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const showing = open && query.trim().length > 0;

  function goTo(restaurant: RestaurantView) {
    const map = mapRef.current;
    if (!map) return;
    setOpen(false);
    setActive(NONE);
    // Hands the keyboard back to the map: arrow keys pan from here, which is
    // what someone who has just arrived somewhere wants next. The text stays,
    // so a second search is an edit of the first rather than a retype.
    inputRef.current?.blur();

    const camera = { center: [restaurant.lng, restaurant.lat] as [number, number], zoom: RESULT_ZOOM };
    /* MapLibre would also short-circuit the animation under this media query
       on its own (it honours it unless a move is marked `essential`), but the
       branch is written out because relying on that would leave the file with
       no visible sign that reduced motion was considered — and `essential` is
       one careless prop away from silently overriding it. Same query the
       opening dive in RestaurantMap reads. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) map.jumpTo(camera);
    else map.flyTo({ ...camera, duration: FLIGHT_MS });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      /* Unlike the header field, Enter on nothing still picks a restaurant —
         the top one. There is no second, broader answer to reserve it for:
         this field cannot send the term anywhere, so refusing to act would
         just be a dead key. */
      if (showing) {
        const chosen = results[active] ?? results[0];
        if (chosen) goTo(chosen);
      }
      return;
    }
    if (!showing) return;
    if (e.key === "Escape") {
      setOpen(false);
      setActive(NONE);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      // Back past the first row lands on NONE rather than sticking, so there is
      // a way out of the list without deleting a letter.
      e.preventDefault();
      setActive((i) => Math.max(i - 1, NONE));
    }
  }

  /* The field and the Discover/Friends switch are one row, held together by
     alignment rather than by a shared container — the switch keeps its
     `left-5 top-5` in `/feed`'s map host and this takes the opposite end at the
     same 10px inset from the map's own edge (the switch's `top-5` is measured
     from outside the host's p-2.5, so the two numbers meet).

     Top-RIGHT is load-bearing twice over: the zoom stack is pushed down the
     left edge to clear the switch, and the right side is the quieter half of
     the tile style, which a field with no fill needs (see FIELD_MUTED above).

     Under `sm` the map is only ~340px wide and the switch alone eats 190 of it,
     so the field wraps to the row below and spans the full width — which it can
     now do only because it has no panel: a filled box under a filled switch
     read as two stacked slabs, where a rule under a switch reads as one line of
     text below a control. `/feed` pushes the zoom stack clear of BOTH rows at
     this breakpoint; that padding and this `top-16` change together. */
  return (
    <div
      ref={wrapRef}
      className="absolute left-2.5 right-2.5 top-16 z-10 sm:left-auto sm:top-2.5 sm:w-64"
    >
      {/* `group` so the rule below can answer focus — the standard
          `outline-2 outline-pm-orange` ring cannot be used here without drawing
          back the very box this design removed. See the rule's own note. */}
      <div className="group relative flex min-h-11 items-center gap-2.5 pb-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 ${FIELD_MUTED} ${GLYPH_HALO}`}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(NONE);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Fly to a spot"
          aria-label="Find a restaurant on the map"
          aria-expanded={showing}
          aria-controls="map-search-results"
          role="combobox"
          autoComplete="off"
          className={`w-full min-w-0 bg-transparent text-sm ${FIELD_TEXT} placeholder:text-[#c8d0d8] focus:outline-none ${FIELD_HALO}`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
              setActive(NONE);
              inputRef.current?.focus();
            }}
            aria-label="Clear map search"
            className={`shrink-0 transition-colors hover:text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${FIELD_MUTED} ${GLYPH_HALO}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* The whole control, drawn. Two stacked rules cross-fading on OPACITY
            rather than one rule changing height: the lit state is 2px where the
            resting state is 1px, and animating that difference would animate a
            layout property on every keystroke. Both are out of flow, so neither
            can move the text above them.

            The lit rule is the focus indicator as well as the has-a-query
            indicator. #ffb07a against the tile ground is far past the 3:1 a
            non-text indicator owes, and it changes thickness as well as colour,
            so it does not rely on hue alone. It is still a deliberate departure
            from "orange ring everywhere" — the ring would re-draw the box. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[rgba(255,255,255,0.32)]"
        />
        <span
          aria-hidden="true"
          style={{ boxShadow: "0 0 8px rgba(255,176,122,0.55)" }}
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[#ffb07a] transition-opacity duration-150 motion-reduce:transition-none group-focus-within:opacity-100 ${
            query ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      {showing && (
        <ul
          id="map-search-results"
          role="listbox"
          className={`absolute right-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl py-1.5 ${CHROME_FILL} ${CHROME_EDGE}`}
        >
          {results.length === 0 ? (
            <li className={`px-4 pb-1 pt-3 text-sm ${CHROME_MUTED}`}>
              No restaurant named &ldquo;{query.trim()}&rdquo;
            </li>
          ) : (
            results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => goTo(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${
                    i === active ? "bg-[rgba(232,135,90,0.22)]" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#F7F4EC]">
                      {r.name}
                    </span>
                    <span className={`block truncate text-xs ${CHROME_MUTED}`}>
                      {r.cuisine} · {r.neighborhood}
                    </span>
                  </span>
                  {/* A rating is a machine value, so mono and tabular — and it
                      prints without its denominator only because the row above
                      it is a restaurant name, never a dish percent. The ember
                      orange is the map's own accent rather than the cream
                      world's --pm-orange-text, which is a colour tuned for
                      light grounds and reads muddy here. */}
                  <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-medium tabular-nums text-[#ffb07a]">
                    <StarIcon className="h-3 w-3" />
                    {r.rating.toFixed(1)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
