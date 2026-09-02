"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RestaurantView } from "@/data/restaurants";
import type { PlateScore } from "@/lib/plateScore";

/**
 * Everything map search DOES, with nothing about how it looks.
 *
 * Extracted from `MapSearch` when the phone map needed the same behaviour in
 * different clothes — the web field is a pill in the map's top-right, the
 * phone's is a capsule in the bottom-right that grows into its own field, and
 * neither shape survives being a prop on the other. This is the same split
 * `usePostFeed` already draws between `/feed` and `PhoneFeedScreen`: one data
 * layer, two skins. If the two ever disagree about what a search does to the
 * map, the bug is that someone forked the hook.
 *
 * What a search does, in one place so both skins inherit it:
 *
 * - **The corpus is never narrowed.** RestaurantMap refits its camera whenever
 *   the set of restaurants changes, so handing it a shorter array would snap a
 *   reader who had zoomed into a block back out to the county frame on every
 *   keystroke — and the embers of everywhere else are the map's picture of the
 *   city, which a search has no business deleting.
 * - **What a search DOES take over is the bubble budget.** The map normally
 *   rations bubbles by zoom and then fights over the leftovers with a collision
 *   pass, which is right when nobody has asked for anything in particular and
 *   wrong the moment somebody has. So the matches go up through
 *   `onMatchesChange`, and while a search is live they get the whole budget:
 *   every match signs its name, every comment it has is a candidate, and
 *   nothing that doesn't match takes a slot. Everything that didn't match keeps
 *   its ember and loses the glow, the inner light and the ring — see `dim` in
 *   RestaurantMap's `buildPinData`.
 * - **The query lives here rather than in RestaurantMap**, and for the original
 *   reason: the marker effect there rebuilds every bubble it renders when its
 *   deps change, so a `query` in that dependency list would tear down and
 *   re-place the whole map's worth of bubbles once per typed character. The
 *   matches reach it through a ref and a re-render call, the way the vote
 *   callbacks already do.
 *
 * ## There is no dropdown, on either surface
 *
 * This hook used to carry one: a ranked six, a highlighted row, arrow keys, and
 * a `goTo` that flew to the chosen one. Both skins dropped it — the matches are
 * already lit and named on the map, and a list is a shorter, worse copy of that
 * drawn over the top of it. What is left is the pair of things a field on a map
 * actually needs: `matches`, and a camera move that frames them.
 */

/**
 * A row as /api/restaurants sends it: the projection plus the plate score that
 * route attaches. Declared here rather than imported from lib/db.ts, which is
 * server-only — the same local-mirror rule the friends page follows.
 */
export type MapSearchRow = RestaurantView & { plateScore?: PlateScore };

/**
 * What the field asks the map to light up: the term, and every restaurant the
 * server matched on it. `null` means no search is running and the map should go
 * back to choosing bubbles for itself.
 *
 * Ids rather than rows, because the map already holds the corpus and only needs
 * to know which of it the reader is asking about.
 */
export type MapMatches = { query: string; ids: string[] };

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

export function useMapSearch({
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
  const [candidates, setCandidates] = useState<MapSearchRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * One request per settled query, not per keystroke — the same discipline the
   * header field uses. 150ms is below the point a typist notices and above the
   * gap between characters, so a word typed at speed costs one request instead
   * of six. The cleanup both cancels the pending timer and marks the in-flight
   * response stale, which is what stops a slow "th" from landing after a fast
   * "thai" and repopulating the map with the wrong matches.
   */
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      /* An empty field has to give the map back: its bubbles are still lit for
         a term that no longer exists. */
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
        onMatchesChange?.({ query: q, ids: data.restaurants.map((r) => r.id) });
      } catch {
        // A dropped search request leaves the previous matches on screen, which
        // is a better answer than dropping the map back to its unsearched state
        // mid-typing.
      }
    }, 150);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, onMatchesChange]);

  /**
   * Everything the CURRENT term matches — what "show me all of these" acts on.
   *
   * `candidates` is the last *settled* query's response, so between a keystroke
   * and the debounce firing it is one or two letters behind. Re-applying the
   * predicate here (the same fields `/api/restaurants?q=` narrows on)
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
        (r.cuisine ?? "").toLowerCase().includes(q) ||
        (r.cuisineTags ?? "").toLowerCase().includes(q) ||
        r.neighborhood.toLowerCase().includes(q),
    );
  }, [query, candidates]);

  /* MapLibre would also short-circuit the flight under this query on its own
     (it honours it unless a move is marked `essential`), but the branch is
     written out because relying on that would leave the file with no visible
     sign that reduced motion was considered — and `essential` is one careless
     prop away from silently overriding it. Same query the opening dive in
     RestaurantMap reads. */
  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /**
   * Frame every match at once — the whole answer, since the matches on the map
   * are the only answer either field gives.
   *
   * The bubbles are already lit by the time this runs; this is only the camera
   * catching up to them, because a reader zoomed into one block cannot see an
   * answer spread across the county. A single match degrades to a flight to
   * that one place: `maxZoom` is RESULT_ZOOM, so a degenerate one-point bounds
   * arrives at exactly the frame a "fly to this restaurant" would have.
   *
   * The keyboard goes back to the map on the way — arrow keys pan from here,
   * which is what someone who has just arrived somewhere wants next. The term
   * stays, so a second search is an edit of the first rather than a retype, and
   * the matches stay lit while it happens.
   *
   * The padding is lopsided on purpose. A bubble stack and its neon sign are
   * drawn ABOVE the ember they belong to, tall enough to run off the top of the
   * frame while the dot itself sits comfortably inside it, so the top edge is
   * given roughly a stack's worth of room and the other three the map's usual
   * inset.
   */
  const showAll = useCallback(
    (rows: MapSearchRow[]) => {
      const map = mapRef.current;
      if (!map || rows.length === 0) return;
      inputRef.current?.blur();

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
    },
    [mapRef],
  );

  /** Back to no search at all: the field empties, and the debounce effect's
   *  empty-term branch hands the map's bubbles back on the next tick. */
  const clear = useCallback(() => setQuery(""), []);

  return {
    query,
    setQuery,
    /** Everything the term matches — what `showAll` acts on. */
    matches,
    inputRef,
    showAll,
    clear,
  };
}
