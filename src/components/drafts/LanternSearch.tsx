"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { DraftSeed } from "@/components/drafts/DraftMapStage";
import type { Map as MapLibreMap } from "maplibre-gl";
import { StarIcon } from "@/components/icons";
import { DraftSearchStyles } from "@/components/drafts/draftSearchStyles";
import {
  EXIT_MS,
  NONE,
  reducedMotion,
  topRated,
  useCloseOnOutsideClick,
  useMapSearch,
} from "@/components/drafts/searchModel";

/**
 * DRAFT A — "Lantern". Quiet glass; the map stays the hero.
 *
 * At rest the control is a 44px circle and nothing else, so the field costs the
 * map almost nothing until it is wanted. Expanding is a cross-fade between two
 * layers pinned to the same right edge, never a width transition.
 *
 * ## The opacity is 0.82, and that is not a glass-vs-legibility compromise —
 * ## it is what the contrast floor costs over this map
 *
 * Glass is measured against the WORST thing that can be underneath it, not
 * against the charcoal it usually sits on. On this map that worst case is a
 * `#ffb07a` ember or the brightest step of the district heatmap directly under
 * the panel — and `backdrop-filter: blur(16px)` does not help as much as it
 * looks like it should, because a 16px blur over a saturated pool returns
 * roughly the pool's own colour, only smoother.
 *
 * So the fill is `#14171b` at 82%. Composited over a full `#ffb07a` backdrop
 * that lands on `rgb(62,50,44)`, and against that:
 *
 * - `#F7F4EC` (the primary row) — **11.3:1**, clearing the 7:1 aim
 * - `#b8c1cb` (the muted meta row) — **6.8:1**
 * - `#ffb07a` (the mono rating) — **6.9:1**
 * - on the selected row (`rgba(232,135,90,0.22)` over the above, i.e.
 *   `rgb(99,69,54)`): cream **7.9:1**, muted **4.7:1**, ember **4.8:1**
 *
 * Over the ordinary night ground every one of those improves — cream reads
 * ~14:1. The muted step is `#b8c1cb` rather than the `#a7b0ba` the shipped
 * field and the zoom stack use: `#a7b0ba` holds 5.1:1 over a solid `#1d2126`
 * row, but over the *selected* row on a lit district it falls to 3.9:1 and
 * fails. A glass control has to carry the brighter step; that is part of its
 * price.
 *
 * Two lower opacities were measured and rejected rather than guessed at: 0.60
 * puts the muted row at 3.4:1 over a heatmap pool, and 0.70 puts the selected
 * row's muted line at 4.1:1. Both look fine over water, which is exactly why
 * "it looked right when I checked" is not a test.
 *
 * ## Discoverability
 *
 * An icon-only control is the known cost here (`nav-label-icon`). It is paid
 * for three ways, none of them optional: a real `aria-label`, a visible text
 * hint that comes forward on hover AND on keyboard focus (`.dms-hint` — a
 * pointer is never the only way to learn what the button is), and the fact that
 * the circle carries the ember hairline the rest of the map's chrome carries,
 * so it reads as a control rather than as decoration. It is still the weakest
 * of the three on first use, and that is the trade being reviewed.
 */

/* The glass. `backdrop-filter` needs the -webkit- prefix for Safari, and the
   two must be set together or Safari renders an unblurred 82% panel — which is
   legible, just not glass. */
const GLASS: React.CSSProperties = {
  background: "rgba(20,23,27,0.82)",
  backdropFilter: "blur(16px) saturate(1.15)",
  WebkitBackdropFilter: "blur(16px) saturate(1.15)",
  border: "1px solid rgba(247,244,236,0.22)",
};

const CREAM = "text-[#F7F4EC]";
const MUTED = "text-[#b8c1cb]";
const LIST_ID = "drafts-lantern-results";

export function LanternSearch({
  mapRef,
  seeds,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  seeds: DraftSeed[];
}) {
  /* Quiet by nature, so the resting offer is the quietest useful one: the
     city's best-rated, no state kept and nothing to explain. Variants B and C
     answer this differently on purpose. */
  const offer = topRated(seeds);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blur = useCallback(() => inputRef.current?.blur(), []);
  const search = useMapSearch({ mapRef, seeds, offer, onCommit: blur });
  useCloseOnOutsideClick(wrapRef, search.mounted, search.close);

  /** rest = the 44px circle; open = the field; closing covers its exit. */
  const [panel, setPanel] = useState<"rest" | "open" | "closing">("rest");
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when expanding by pointer, so focus lands after the field mounts. */
  const wantFocus = useRef(false);

  const expand = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    wantFocus.current = true;
    setPanel("open");
    search.open();
  }, [search]);

  const collapse = useCallback(() => {
    search.close();
    setPanel((current) => {
      if (current !== "open") return current;
      if (reducedMotion()) return "rest";
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
      collapseTimer.current = setTimeout(() => setPanel("rest"), EXIT_MS);
      return "closing";
    });
  }, [search]);

  useEffect(() => {
    if (panel === "open" && wantFocus.current) {
      wantFocus.current = false;
      inputRef.current?.focus();
    }
  }, [panel]);

  useEffect(() => () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
  }, []);

  /* Click-outside collapses the whole control, but only when there is nothing
     in it. A term someone typed is work; throwing it away because they touched
     the map is the kind of "tidy" that costs a retype. */
  useEffect(() => {
    if (panel !== "open") return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (search.query.trim()) return;
      collapse();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [panel, search.query, collapse]);

  const showList = search.mounted;

  return (
    <>
      <DraftSearchStyles />
      {/* Same inset and same mobile drop as the shipped field, so the two are
          comparable: top-right on desktop, and below MapLibre's control stack
          at 390px where the stack reaches 41px in. `pointer-events-none` on the
          box means the map still drags through the empty space the expanded
          field will occupy. */}
      <div
        ref={wrapRef}
        className="pointer-events-none absolute left-16 right-2.5 top-16 z-10 sm:left-auto sm:top-2.5 sm:w-64"
      >
        <div className="relative flex min-h-11 justify-end">
          {panel === "rest" ? (
            <button
              type="button"
              onClick={expand}
              /* No onFocus handler: tabbing to the circle reveals the hint
                 (`.dms-hint` answers `:focus-visible`) and Enter or Space opens
                 it. Expanding on focus alone would move focus into a field the
                 reader was only tabbing past. */
              aria-label="Find a restaurant on the map"
              aria-expanded={false}
              className="dms-lantern-rest dms-fade-in pointer-events-auto relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              style={GLASS}
            >
              {/* The affordance the icon alone cannot carry. Real text, in the
                  DOM at all times, revealed on hover and on keyboard focus. */}
              <span
                aria-hidden="true"
                className={`dms-hint mono-label absolute right-full mr-2 whitespace-nowrap rounded-full px-2.5 py-1.5 ${MUTED}`}
                style={GLASS}
              >
                Find a spot
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={CREAM}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          ) : (
            <div
              className={`pointer-events-auto flex min-h-11 w-full items-center gap-2.5 rounded-full px-4 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange ${
                panel === "closing" ? "dms-grow-out" : "dms-grow-in"
              }`}
              style={GLASS}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`shrink-0 ${MUTED}`}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search.query}
                onChange={(e) => search.setQuery(e.target.value)}
                onFocus={search.open}
                onKeyDown={(e) => {
                  /* Escape has two jobs and they are ordered: close the list
                     first, and only a second press puts the lantern away. One
                     key never does two things at once. */
                  if (e.key === "Escape" && !search.mounted) {
                    collapse();
                    return;
                  }
                  search.onKeyDown(e);
                }}
                placeholder="Fly to a spot"
                aria-label="Find a restaurant on the map"
                aria-expanded={search.mounted}
                aria-controls={LIST_ID}
                aria-activedescendant={
                  search.active === NONE ? undefined : `${LIST_ID}-${search.active}`
                }
                role="combobox"
                autoComplete="off"
                className={`w-full min-w-0 bg-transparent text-sm placeholder:text-[#b8c1cb] focus:outline-none ${CREAM}`}
              />
              {search.query && (
                <button
                  type="button"
                  onClick={() => {
                    search.setQuery("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear map search"
                  className={`shrink-0 transition-colors hover:text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${MUTED}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {showList && panel !== "rest" && (
          <div
            id={LIST_ID}
            className={`pointer-events-auto absolute right-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl ${
              search.closing ? "dms-list-out" : "dms-list-in"
            }`}
            style={GLASS}
          >
            {!search.query.trim() && search.results.length > 0 && (
              <p className={`mono-label px-4 pb-1 pt-3 ${MUTED}`}>Top rated</p>
            )}

            {search.emptyResult ? (
              <div className="px-4 pb-3 pt-3">
                <p className={`text-sm ${CREAM}`}>
                  Nothing here called &ldquo;{search.query.trim()}&rdquo;.
                </p>
                {search.suggestion.terms.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {search.suggestion.terms.map((term) => (
                      <button
                        key={term.label}
                        type="button"
                        onClick={() => search.setQuery(term.label)}
                        className={`min-h-11 rounded-full border border-[rgba(247,244,236,0.22)] px-3 text-xs transition-colors hover:border-[rgba(232,135,90,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${CREAM}`}
                      >
                        {term.label}
                      </button>
                    ))}
                  </div>
                )}
                {search.suggestion.nearMiss.length > 0 && (
                  /* mt-2, not mt-1: the chips above are targets too, and two
                     adjacent targets owe each other 8px. */
                  <ul className="mt-2">
                    {search.suggestion.nearMiss.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => search.goTo(r)}
                          className={`flex min-h-11 w-full items-center gap-2 text-left text-sm transition-colors hover:text-[#ffb07a] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${MUTED}`}
                        >
                          <span className="truncate">{r.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <ul role="listbox" aria-label="Restaurant results" className="py-1.5">
                {search.results.map((r, i) => (
                  <li key={r.id} id={`${LIST_ID}-${i}`} role="option" aria-selected={i === search.active}>
                    <button
                      type="button"
                      onClick={() => search.goTo(r)}
                      onMouseEnter={() => search.setActive(i)}
                      className={`flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${
                        i === search.active ? "bg-[rgba(232,135,90,0.22)]" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-medium ${CREAM}`}>
                          {r.name}
                        </span>
                        <span className={`block truncate text-xs ${MUTED}`}>
                          {r.cuisine} · {r.neighborhood}
                        </span>
                      </span>
                      {/* Machine value: mono, tabular, the map's own ember
                          rather than the cream world's --pm-orange-text. */}
                      <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-medium tabular-nums text-[#ffb07a]">
                        <StarIcon className="h-3 w-3" />
                        {r.rating.toFixed(1)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  );
}
