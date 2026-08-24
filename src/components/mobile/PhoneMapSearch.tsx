"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { CloseIcon } from "@/components/icons";
import { useMapSearch, type MapMatches } from "@/components/useMapSearch";

/**
 * Map search, phone version — one capsule in the bottom-right of the map.
 *
 * **Everything it DOES is `useMapSearch`**, the same hook the web field wears,
 * so the two cannot disagree about what typing "mexican" means: every match
 * keeps its bubbles and signs its name with a leader down to its own ember,
 * everything that didn't match drops to a bare ember, and no comment from
 * anywhere else is drawn. Read that file for the behaviour. This one is a skin,
 * and it differs from the web's in three ways that are all the same decision —
 * **the map is the result** — plus one that is about thumbs.
 *
 * ## One control, two sizes. Never two controls.
 *
 * Tapping the pill does not summon anything: the pill itself is the field. The
 * same box grows to the width of the map and lifts one row, and the × inside it
 * is the only other thing on screen. It used to open a full-width bar on the
 * row above and leave a "Close" capsule behind in the corner, which meant one
 * tap turned one object into two — and the second one was the one you had to
 * find again to get out.
 *
 * It lifts a row rather than growing in place because the Discover/Friends
 * switch owns the bottom-left of this same line (`PhoneFeedMapPanel`), and this
 * glass is translucent enough to read the switch straight through. The move and
 * the widening are one transition on one element, so it stays legible as the
 * thing you tapped.
 *
 * ## There is no results list, on purpose
 *
 * The web field drops a panel of six ranked names under itself. This one shows
 * nothing: every match is already lit on the map behind the field, with its
 * name in neon over its own ember, and a list would be a second, shorter,
 * worse copy of that answer floating over the top of it. So typing narrows the
 * map, the Search key frames what is left (`showAll`), and the reader reads the
 * city rather than a dropdown. The web field came to the same place; the hook
 * no longer carries a list for anyone.
 *
 * ## Bottom-right, and closing keeps the term
 *
 * The corner opposite the switch, because a control at the top of a phone is
 * the furthest point on the screen from the thumb holding it and this is a
 * control you type into.
 *
 * Collapsing is not clearing, and those are two different buttons' jobs: the
 * matches a term lit are the answer the reader asked for and the map is still
 * showing them, so the pill shrinks back wearing the term. The × is the only
 * thing that gives the map back.
 */

/** The switch's own muted ink, so the two controls bracketing the bottom of the
    map agree about what an unpressed label looks like. */
const GLASS_TEXT = "text-[#d3dae1]";

/* The two bottom offsets are one layout and the control moves between them: at
   rest it sits on the source switch's line (`--phone-nav-space` + 4px, the
   number PhoneFeedMapPanel's switch uses), and open it takes the 52px row above
   it plus an 8px gap. */
const RESTING_ROW = "bottom-[calc(var(--phone-nav-space)+0.25rem)]";
const OPEN_ROW = "bottom-[calc(var(--phone-nav-space)+4rem)]";

/** How wide the pill is allowed to be with nothing typed into it. Wide enough
    for the glyph and "Search"; anything longer is a term the reader typed, and
    it truncates rather than growing the resting shape into the switch. */
const RESTING_WIDTH = "max-w-[11rem]";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/** Both sizes are the same object, so they are the same capsule: the switch's
    exact clothes, and 52px tall in either state so the bottom band reads as one
    line rather than two things that nearly agree. */
const SHELL =
  "flex min-h-[3.25rem] w-full items-center gap-2 rounded-full bg-black/45 backdrop-blur-md";

export function PhoneMapSearch({
  mapRef,
  onMatchesChange,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  onMatchesChange?: (matches: MapMatches | null) => void;
}) {
  /**
   * Whether the pill is grown into a field — this component's own state, and
   * deliberately not the hook's `open`, which means "there is a live term".
   * They are different questions here in a way they are not on the web: a
   * collapsed pill must NOT clear the term (see the header comment).
   */
  const [expanded, setExpanded] = useState(false);

  /** The whole control, for the outside-tap listener below. The hook holds no
      ref of its own — it knows nothing about the shape wrapped around it. */
  const wrapRef = useRef<HTMLDivElement>(null);

  const { query, setQuery, matches, showAll, inputRef, clear } = useMapSearch({
    mapRef,
    onMatchesChange,
  });

  /* Focus follows the growth — a field that appears and does not take the caret
     costs a second tap on a phone, where the keyboard is the point.

     An effect rather than a `requestAnimationFrame` in the click handler: the
     input does not exist until the `expanded` render commits, and a frame
     scheduled before that state flushes can land while the ref is still null.
     It did, and the first characters typed went nowhere. */
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded, inputRef]);

  /* A tap on the map puts the field away — `pointerdown` so the collapse
     happens under the finger rather than after the map has already handled a
     click. */
  useEffect(() => {
    if (!expanded) return;
    function onOutside(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setExpanded(false);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [expanded, wrapRef]);

  /* One box, two sizes, one transition. `ml-auto` is what pins the resting
     width to the RIGHT edge: the box is `inset-x-4` in both states, so the
     max-width leaves slack and the auto margin puts all of it on the left. */
  return (
    <div
      ref={wrapRef}
      className={`absolute inset-x-4 z-10 ml-auto transition-[max-width,bottom] duration-200 ease-out motion-reduce:transition-none ${
        expanded ? `max-w-full ${OPEN_ROW}` : `${RESTING_WIDTH} ${RESTING_ROW}`
      }`}
    >
      {expanded ? (
        <div
          role="search"
          className={`${SHELL} py-1 pl-4 pr-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange`}
        >
          <SearchGlyph className={`shrink-0 ${GLASS_TEXT}`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            /* Enter frames every match, and on a phone it is the keyboard's
               Search key. Putting the field away as it fires is the whole point
               of pressing it: the answer is the map, and the map is what the
               field is standing on. */
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              setExpanded(false);
              showAll(matches);
            }}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Mexican, tacos, North Park…"
            aria-label="Find restaurants on the map"
            role="searchbox"
            /* 16px, not the 13 the resting pill wears: iOS Safari zooms the
               whole page in when a focused field sets below 16px, and a screen
               that jumps scale on a tap reads as a bug. */
            className="min-h-11 w-full min-w-0 bg-transparent text-[16px] text-[#F7F4EC] placeholder:text-[#9aa3ac] focus:outline-none"
          />
          {/* One button, and which job it does is the honest reading of a × on
              a field: with a term it empties the field and gives the map back;
              with the field already empty there is nothing to clear and the
              only thing left to close is the field itself. */}
          <button
            type="button"
            onClick={() => {
              if (query) {
                clear();
                inputRef.current?.focus();
              } else {
                setExpanded(false);
              }
            }}
            aria-label={query ? "Clear map search" : "Close search"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${GLASS_TEXT} transition-colors hover:text-[#F7F4EC] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange`}
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Search the map"
          aria-expanded={false}
          className={`${SHELL} px-4 text-[13px] font-medium ${GLASS_TEXT} transition-transform active:scale-95 motion-reduce:transition-none ${FOCUS}`}
        >
          <SearchGlyph className="shrink-0" />
          {/* The term survives a collapse, so the pill has to say so — a map
              still showing only Mexican places under a control that says
              "Search" is a map whose state has no visible cause. */}
          <span className="truncate">{query.trim() || "Search"}</span>
        </button>
      )}
    </div>
  );
}

/** The same glyph PhoneFeedSearch and the web field inline — `components/icons`
    has no magnifier, and adding one there is a change to a shared file this
    component doesn't need to make. */
function SearchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
