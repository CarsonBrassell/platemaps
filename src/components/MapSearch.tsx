"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RestaurantView } from "@/data/restaurants";
import { rank } from "@/lib/restaurantRank";
import { StarIcon } from "@/components/icons";
import type { PlateScore } from "@/lib/plateScore";
import { SHOW_BLEND_STARS, blendLabel } from "@/lib/ratingDisplay";

/**
 * A row as /api/restaurants sends it: the projection plus the plate score that
 * route attaches. Declared here rather than imported from lib/db.ts, which is
 * server-only — the same local-mirror rule the friends page follows.
 */
type MapSearchRow = RestaurantView & { plateScore?: PlateScore };

/**
 * What the field asks the map to light up: the term, and every restaurant the
 * server matched on it — not the six the dropdown shows. `null` means no search
 * is running and the map should go back to choosing bubbles for itself.
 *
 * Ids rather than rows, because the map already holds the corpus and only needs
 * to know which of it the reader is asking about.
 */
export type MapMatches = { query: string; ids: string[] };

/**
 * Find restaurants, light them up on the map, and fly the camera to them.
 *
 * ## It moves the camera, and it decides which bubbles get drawn
 *
 * The corpus itself is still never narrowed. RestaurantMap refits the camera
 * whenever the set of restaurants changes (`fitKey`, guarded by `fittedToRef`),
 * so handing it a shorter `restaurants` array would snap a reader who had
 * zoomed into a block back out to the county frame on every keystroke — and the
 * embers of everywhere else are the map's picture of the city, which a search
 * has no business deleting. Every restaurant stays on the map and stays lit.
 *
 * What a search does take over is the bubble budget. The map normally rations
 * bubbles by zoom (`bubbleCoverageForZoom`, `bubbleLimitForZoom`) and then
 * fights over the leftovers with a collision pass, which is right when nobody
 * has asked for anything in particular and wrong the moment somebody has: on
 * the old behaviour, typing "mexican" left the map exactly as it was and the
 * reader had to hunt for the answer among bubbles about everywhere else. So the
 * matches are handed up through `onMatchesChange`, and while a search is live
 * they get the whole budget — every match signs its name, every comment it has
 * is a candidate, and nothing that doesn't match takes a slot.
 *
 * The query still lives here rather than in RestaurantMap, and for the original
 * reason: the marker effect there rebuilds every bubble it renders when its
 * deps change, so a `query` in that dependency list would tear down and
 * re-place the whole map's worth of bubbles once per typed character. The
 * matches reach it through a ref and a re-render call, the way the vote
 * callbacks already do — see `onMatchesChange`'s note in RestaurantMap.
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(NONE);
  const [candidates, setCandidates] = useState<MapSearchRow[]>([]);
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
    if (!q) {
      /* The dropdown needs nothing done here — `rank` returns [] for an empty
         query, so whatever the last search left in `candidates` is already
         unreachable. The MAP does: its bubbles are still lit for a term that no
         longer exists, and an empty field has to give them back. */
      onMatchesChange?.(null);
      return;
    }

    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/restaurants?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data: { restaurants: MapSearchRow[] } = await res.json();
        if (stale) return;
        setCandidates(data.restaurants);
        /* Everything that matched, not the six `rank` keeps. The dropdown is a
           shortcut to one place and six is the right length for that; the map
           is being asked about a whole cuisine, and a "show me the Mexican
           places" that lit six of them would be a worse answer than the one
           the reader already had. */
        onMatchesChange?.({ query: q, ids: data.restaurants.map((r) => r.id) });
      } catch {
        // A dropped search request leaves the previous matches on screen,
        // which is a better answer than emptying the list — and, now, than
        // dropping the map back to its unsearched state mid-typing.
      }
    }, 150);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, onMatchesChange]);

  const results = useMemo(() => rank(query, candidates), [query, candidates]);

  /**
   * Everything the CURRENT term matches, unranked and uncapped — what "show me
   * all of these" acts on, and what the footer counts.
   *
   * `candidates` is the last *settled* query's response, so between a keystroke
   * and the debounce firing it is one or two letters behind. Re-applying the
   * predicate here (the same three fields `/api/restaurants?q=` narrows on)
   * keeps that stale set from being framed as if it answered the term on
   * screen: the in-flight response only ever widens this list back out, it
   * never contradicts it. It is also what makes the guard honest — a term with
   * no matches leaves this empty, so Enter does nothing rather than flying to
   * the previous search's results.
   */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return candidates.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        r.neighborhood.toLowerCase().includes(q),
    );
  }, [query, candidates]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const showing = open && query.trim().length > 0;

  /* Both camera moves below read this. MapLibre would also short-circuit their
     animation under the query on its own (it honours it unless a move is marked
     `essential`), but the branches are written out because relying on that would
     leave the file with no visible sign that reduced motion was considered — and
     `essential` is one careless prop away from silently overriding it. Same
     query the opening dive in RestaurantMap reads. */
  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /** Shared by both: close the list, and hand the keyboard back to the map so
   *  arrow keys pan from here — what someone who has just arrived somewhere
   *  wants next. The text stays, so a second search is an edit of the first
   *  rather than a retype, and the matches stay lit while it does. */
  function commit() {
    setOpen(false);
    setActive(NONE);
    inputRef.current?.blur();
  }

  function goTo(restaurant: MapSearchRow) {
    const map = mapRef.current;
    if (!map) return;
    commit();

    const camera = { center: [restaurant.lng, restaurant.lat] as [number, number], zoom: RESULT_ZOOM };
    if (reduceMotion()) map.jumpTo(camera);
    else map.flyTo({ ...camera, duration: FLIGHT_MS });
  }

  /**
   * Frame every match at once — the broad answer, for a term like "mexican"
   * that names a kind of place rather than a place.
   *
   * The bubbles are already lit by the time this runs; this is only the camera
   * catching up to them, because a reader zoomed into one block cannot see an
   * answer spread across the county. A single match degrades to exactly what
   * `goTo` would have done: `maxZoom` is RESULT_ZOOM, so a degenerate one-point
   * bounds arrives at the same frame.
   *
   * The padding is lopsided on purpose. A bubble stack and its neon sign are
   * drawn ABOVE the ember they belong to, tall enough to run off the top of the
   * frame while the dot itself sits comfortably inside it, so the top edge is
   * given roughly a stack's worth of room and the other three the map's usual
   * inset.
   */
  function showAll(rows: MapSearchRow[]) {
    const map = mapRef.current;
    if (!map || rows.length === 0) return;
    commit();

    const lngs = rows.map((r) => r.lng);
    const lats = rows.map((r) => r.lat);
    const bounds: [number, number, number, number] = [
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ];
    map.fitBounds(bounds, {
      padding: { top: 130, bottom: 28, left: 28, right: 28 },
      maxZoom: RESULT_ZOOM,
      ...(reduceMotion() ? { animate: false } : { duration: FLIGHT_MS }),
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      /* There IS a second, broader answer now, and Enter is where it goes.
         Arrowing to a row and pressing Enter means that place, so it flies
         there. Enter on nothing means the term itself — every match framed at
         once — which is what the field is for once a term can name a cuisine
         rather than a restaurant. It used to pick the top result in that case,
         on the reasoning that there was nothing broader to reserve the key for;
         with a single match the two are the same move anyway (see showAll), so
         nothing about typing a restaurant's name and hitting Enter changed. */
      if (showing) {
        const chosen = active === NONE ? null : results[active];
        if (chosen) goTo(chosen);
        else showAll(matches);
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
        <div
          className={`absolute right-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl ${CHROME_FILL} ${CHROME_EDGE}`}
        >
        <ul id="map-search-results" role="listbox" className="py-1.5">
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
                  {/* Both numbers — machine values, so mono and tabular. Our
                      percent takes the ember orange, the map's own accent rather
                      than the cream world's --pm-orange-text (a colour tuned for
                      light grounds, which reads muddy here); the blend's stars
                      follow in the muted chrome step with their denominator, so
                      the pair can't be read as one scale. A restaurant with too
                      few rated plates simply has no percent here. */}
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
                    {r.plateScore?.percent != null && (
                      <span className="font-semibold text-[#ffb07a]">
                        {r.plateScore.percent}%
                      </span>
                    )}
                    {SHOW_BLEND_STARS && (
                      <span className={`flex items-center gap-0.5 ${CHROME_MUTED}`}>
                        <StarIcon className="h-3 w-3" />
                        {blendLabel(r.rating)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        {/* The broad answer, given a door of its own.

            Enter already does this, but a shortcut nobody can see is not a
            feature — and this is the half of the field that is new, so it is the
            half that has to announce itself. It sits OUTSIDE the listbox rather
            than as a seventh row: it is not one of the options, arrowing must
            not land on it, and a `role="listbox"` whose children aren't all
            options is a lie told to a screen reader. Tab reaches it; the divider
            above says it belongs to the panel without being of the list.

            Only worth offering for a term that names more than one place —
            "show all 1 on the map" is the row above it with extra steps. */}
        {matches.length > 1 && (
          <button
            type="button"
            onClick={() => showAll(matches)}
            className={`flex min-h-11 w-full items-center gap-2 border-t border-[rgba(255,255,255,0.1)] px-3 text-left font-mono text-[11px] uppercase tracking-[0.1em] transition-colors hover:text-[#ffb07a] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${CHROME_MUTED}`}
          >
            {/* The count is a machine value, so it keeps the accent and the
                tabular figures the dropdown's other numbers wear. */}
            <span>Show all</span>
            <span className="font-semibold tabular-nums text-[#ffb07a]">{matches.length}</span>
            <span>on the map</span>
          </button>
        )}
        </div>
      )}
    </div>
  );
}
