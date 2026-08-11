"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RestaurantView } from "@/data/restaurants";
import { rank } from "@/lib/restaurantRank";

/**
 * DRAFT SURFACE — shared behaviour behind the three `/drafts/map-search`
 * variants. Nothing under `src/components/drafts/` is rendered by `/feed`; the
 * shipped field is `src/components/MapSearch.tsx` and stays untouched until a
 * direction is picked. Deleting this folder plus `src/app/drafts/` removes the
 * whole experiment.
 *
 * The three variants differ in dress and in what they offer before you type.
 * Everything a reader could notice as *inconsistent* between them — the debounce,
 * the ranking, the camera flight, the combobox keyboard model, the close rules —
 * lives here, so a review compares designs rather than three accidental
 * behaviours. It is a copy of the shipped model rather than a refactor of it for
 * the same reason: a draft must not be able to change `/feed`.
 */

/** No row highlighted — the state every fresh keystroke returns to. */
export const NONE = -1;

/** Close enough to read the block, same as the shipped field. */
const RESULT_ZOOM = 16.5;

/** A camera move across miles; skipped outright under reduced motion. */
const FLIGHT_MS = 1600;

/**
 * The dropdown's enter and exit. 200ms in sits mid-band of the 150–300ms
 * micro-interaction budget; 130ms out is 65% of it — leaving is never the part
 * worth watching. Both are `transform`/`opacity` only (see draftSearchStyles),
 * never width or height, so nothing reflows mid-animation.
 */
export const ENTER_MS = 200;
export const EXIT_MS = 130;

/** Read at event time, never during render — `matchMedia` doesn't exist on the server. */
export function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ------------------------------------------------------------------------ */
/* Suggestions                                                               */
/* ------------------------------------------------------------------------ */

export type SuggestedTerm = { label: string; kind: "cuisine" | "neighbourhood" };

export type SearchSuggestion = {
  /** The closest real names to what was typed — "did you mean". */
  nearMiss: RestaurantView[];
  /** Cuisines and neighbourhoods that DO exist, closest to the term. */
  terms: SuggestedTerm[];
};

/**
 * Bigram sets, for a similarity that survives a typo. Dice over character
 * bigrams is the cheapest measure that gets "vietnemese" to "Vietnamese" and
 * "gaslmap" to "Gaslamp" without shipping an edit-distance table — a
 * `.includes()` test, which is all the ranking above does, answers nothing at
 * all once a letter is wrong, and a wrong letter is exactly when the empty
 * state appears.
 */
function bigrams(value: string) {
  const flat = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i < flat.length - 1; i++) out.add(flat.slice(i, i + 2));
  return out;
}

function dice(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const gram of a) if (b.has(gram)) hits++;
  return (2 * hits) / (a.size + b.size);
}

/** Below this, two strings have nothing to do with each other. Measured against
 *  the real corpus rather than guessed: "vietnemese" → Vietnamese scores 0.78
 *  and "gaslmap" → Gaslamp 0.50, so the floor has plenty of room above the real
 *  typos — while pure keyboard mash ("zzzqqq") reaches 0.29 against "Pizza" on
 *  a single shared bigram and has to be refused, or the empty state answers a
 *  nonsense query with a confident wrong guess. Anything under the floor falls
 *  through to the best-rated list below, which is honest about being a fallback. */
const SIMILAR_ENOUGH = 0.34;

/**
 * What to say instead of "no results".
 *
 * UX guideline #90: an empty state that only reports is a dead end. This
 * returns the nearest real names AND a cuisine or neighbourhood that genuinely
 * exists in the corpus, so every empty state has somewhere to click. When
 * nothing is even remotely close it falls back to the best-rated places rather
 * than returning nothing — a reader who mistyped badly still gets a way out.
 */
export function suggestFor(
  query: string,
  seeds: readonly RestaurantView[],
): SearchSuggestion {
  const q = query.trim();
  if (!q || seeds.length === 0) return { nearMiss: [], terms: [] };
  const target = bigrams(q);

  const nearMiss = seeds
    .map((r) => ({ r, score: dice(target, bigrams(r.name)) }))
    .filter((x) => x.score >= SIMILAR_ENOUGH)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.r);

  const vocabulary = new Map<string, SuggestedTerm>();
  for (const r of seeds) {
    if (r.cuisine) vocabulary.set(r.cuisine.toLowerCase(), { label: r.cuisine, kind: "cuisine" });
    if (r.neighborhood)
      vocabulary.set(r.neighborhood.toLowerCase(), {
        label: r.neighborhood,
        kind: "neighbourhood",
      });
  }
  const terms = [...vocabulary.values()]
    .map((term) => ({ term, score: dice(target, bigrams(term.label)) }))
    .filter((x) => x.score >= SIMILAR_ENOUGH)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.term);

  if (nearMiss.length === 0 && terms.length === 0) {
    return {
      nearMiss: [...seeds].sort((a, b) => b.rating - a.rating).slice(0, 3),
      terms: [],
    };
  }
  return { nearMiss, terms };
}

/** The city's best, for the variants whose resting offer is a standing list. */
export function topRated(seeds: readonly RestaurantView[], count = 5) {
  return [...seeds].sort((a, b) => b.rating - a.rating).slice(0, count);
}

/* ------------------------------------------------------------------------ */
/* The model                                                                 */
/* ------------------------------------------------------------------------ */

export type MapSearchModel = {
  query: string;
  setQuery: (value: string) => void;
  /** Rows the listbox is showing — the ranked matches, or the resting offer. */
  results: RestaurantView[];
  /** True while the typed term matched nothing; the empty state's cue. */
  emptyResult: boolean;
  suggestion: SearchSuggestion;
  active: number;
  setActive: (index: number) => void;
  /** The list is in the DOM (covers the exit animation). */
  mounted: boolean;
  /** The list is on its way out — drives the exit class. */
  closing: boolean;
  open: () => void;
  close: () => void;
  goTo: (restaurant: RestaurantView) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
};

/**
 * No DOM ref crosses this boundary, and that is deliberate rather than
 * stylistic: `react-hooks/refs` treats anything reachable from a value that
 * holds a ref as a render-time ref read, so a model object carrying `inputRef`
 * makes every `model.query` in the JSX an error. The variants keep their own
 * refs — exactly as the shipped field does — and hand the model the two things
 * it needs to do about them as callbacks.
 */
export function useMapSearch({
  mapRef,
  seeds,
  offer,
  onPick,
  onCommit,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  /** The list the map is already drawing. Used only for suggestions and for the
   *  resting offer — never to answer a typed query, which still goes to
   *  `/api/restaurants?q=` so the field keeps working without the corpus. */
  seeds: readonly RestaurantView[];
  /** What this variant shows before anything is typed. Each one differs here on
   *  purpose; that axis is part of what is being compared. */
  offer: readonly RestaurantView[];
  onPick?: (restaurant: RestaurantView) => void;
  /** Fired once the camera is on its way — where a variant blurs its input, to
   *  hand the arrow keys back to the map. */
  onCommit?: () => void;
}): MapSearchModel {
  const [query, setQueryState] = useState("");
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const [active, setActive] = useState(NONE);
  const [candidates, setCandidates] = useState<RestaurantView[]>([]);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* One request per settled query rather than per keystroke, and the cleanup
     marks the in-flight response stale so a slow "th" can't land after a fast
     "thai". Lifted verbatim from the shipped field — the drafts are a design
     comparison, and a different network shape would muddy it. */
  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/restaurants?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data: { restaurants: RestaurantView[] } = await res.json();
        if (!stale) setCandidates(data.restaurants);
      } catch {
        // A dropped request leaves the previous matches up, which beats
        // emptying the list under someone mid-read.
      }
    }, 150);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const matches = useMemo(() => rank(query, candidates), [query, candidates]);
  const typed = query.trim().length > 0;
  const results = useMemo(
    () => (typed ? matches : offer.slice(0, 6)),
    [typed, matches, offer],
  );
  const emptyResult = typed && matches.length === 0;
  const suggestion = useMemo(
    () => (emptyResult ? suggestFor(query, seeds) : { nearMiss: [], terms: [] }),
    [emptyResult, query, seeds],
  );

  const close = useCallback(() => {
    setActive(NONE);
    setPhase((current) => {
      if (current !== "open") return current;
      if (reducedMotion()) return "closed";
      if (exitTimer.current) clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => setPhase("closed"), EXIT_MS);
      return "closing";
    });
  }, []);

  const open = useCallback(() => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    setPhase("open");
  }, []);

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  const setQuery = useCallback(
    (value: string) => {
      setQueryState(value);
      setActive(NONE);
      open();
    },
    [open],
  );

  const goTo = useCallback(
    (restaurant: RestaurantView) => {
      const map = mapRef.current;
      if (!map) return;
      close();
      /* Hands the keyboard back to the map — arrow keys pan from here, which is
         what someone who just arrived wants next. The text stays, so a second
         search edits the first rather than retyping it. */
      onCommit?.();
      onPick?.(restaurant);

      const camera = {
        center: [restaurant.lng, restaurant.lat] as [number, number],
        zoom: RESULT_ZOOM,
      };
      /* MapLibre would short-circuit this itself, but the branch is written out
         so the file carries visible evidence that reduced motion was considered
         — `essential: true` is one careless prop away from overriding it. */
      if (reducedMotion()) map.jumpTo(camera);
      else map.flyTo({ ...camera, duration: FLIGHT_MS });
    },
    [mapRef, close, onPick, onCommit],
  );

  const showing = phase === "open";

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        /* Enter on nothing still picks the top row: this field cannot hand the
           term anywhere else, so refusing to act would just be a dead key. */
        if (showing) {
          const chosen = results[active] ?? results[0];
          if (chosen) goTo(chosen);
        }
        return;
      }
      if (!showing) return;
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        // Back past the first row lands on NONE rather than sticking, so the
        // list can be left without deleting a letter.
        e.preventDefault();
        setActive((i) => Math.max(i - 1, NONE));
      }
    },
    [showing, results, active, goTo, close],
  );

  return {
    query,
    setQuery,
    results,
    emptyResult,
    suggestion,
    active,
    setActive,
    mounted: phase !== "closed",
    closing: phase === "closing",
    open,
    close,
    goTo,
    onKeyDown,
  };
}

/**
 * Close when the pointer goes down anywhere outside `element`. The ref belongs
 * to the calling component (see the note on useMapSearch) and is only ever read
 * from inside the listener, never during render.
 */
export function useCloseOnOutsideClick(
  element: RefObject<HTMLElement | null>,
  active: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!active) return;
    function onDown(e: MouseEvent) {
      if (element.current && !element.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [element, active, close]);
}

/**
 * The restaurants currently inside the map's frame, recomputed on `moveend`.
 * Variant C's resting offer: the field answers "what am I looking at" before it
 * is asked anything, which is the one thing a map search knows that a header
 * search cannot.
 */
export function useInView(
  mapRef: RefObject<MapLibreMap | null>,
  seeds: readonly RestaurantView[],
) {
  const [inView, setInView] = useState<RestaurantView[]>([]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    /* Computed in a map callback rather than in a memo, for two reasons that
       happen to agree: the bounds live on an object React cannot watch, and
       reading a ref during render is exactly what the ref rule forbids.
       `idle` covers both the first frame (after the opening dive settles) and
       every camera move that follows, so there is no synchronous first call
       cascading a render out of the effect body. */
    const recompute = () => {
      const bounds = map.getBounds();
      const next = seeds
        .filter((r) => bounds.contains([r.lng, r.lat]))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 6);
      // `idle` fires often; only a genuinely different frame is worth a render.
      setInView((prev) =>
        prev.length === next.length && prev.every((r, i) => r.id === next[i].id)
          ? prev
          : next,
      );
    };

    map.on("idle", recompute);
    map.on("moveend", recompute);
    return () => {
      map.off("idle", recompute);
      map.off("moveend", recompute);
    };
  }, [mapRef, seeds]);

  return inView;
}

/**
 * Restaurants this browser has flown to before, most recent first — variant B's
 * resting offer, `search-accessible`'s "recent queries" in the form that is
 * actually useful on a map: the places, not the strings that found them.
 * Stored as ids and re-resolved against the live corpus, so a renamed or
 * removed restaurant simply drops out instead of offering a dead row.
 */
const RECENT_KEY = "platemaps.drafts.map-search.recent";
const RECENT_MAX = 5;

function readRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // Private mode, quota, or a hand-edited value — an empty history is a fine
    // answer, and the variant falls back to its top-rated list.
    return [];
  }
}

export function useRecent(seeds: readonly RestaurantView[]) {
  /* Read in the lazy initialiser, not an effect: the field only ever renders
     inside the map, which is loaded with `ssr: false`, so there is no server
     pass to mismatch against — and an effect that seeds state is the cascading
     render `react-hooks/set-state-in-effect` is about. */
  const [ids, setIds] = useState<string[]>(readRecentIds);

  const remember = useCallback((restaurant: RestaurantView) => {
    setIds((prev) => {
      const next = [restaurant.id, ...prev.filter((id) => id !== restaurant.id)].slice(
        0,
        RECENT_MAX,
      );
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Same as above: history is a convenience, never a requirement.
      }
      return next;
    });
  }, []);

  const recent = useMemo(() => {
    const byId = new Map(seeds.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is RestaurantView => Boolean(r));
  }, [ids, seeds]);

  return { recent, remember };
}
