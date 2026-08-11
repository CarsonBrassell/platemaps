"use client";

import { useCallback, useRef, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RestaurantView } from "@/data/restaurants";
import { StarIcon } from "@/components/icons";
import { DraftSearchStyles } from "@/components/drafts/draftSearchStyles";
import {
  NONE,
  topRated,
  useCloseOnOutsideClick,
  useMapSearch,
  useRecent,
} from "@/components/drafts/searchModel";

/**
 * DRAFT B — "Marquee". Solid, always open, unmistakably app chrome.
 *
 * No glass and nothing to discover: the field is a warm-dark card wearing the
 * exact fill and ember hairline `.map-fun-tiles .maplibregl-ctrl-group` gives
 * the zoom stack in the other corner, so the two read as one family of controls
 * belonging to this map — and neither can be taken for the header's white pill
 * or for the tan segmented switch, which is a different rank of control
 * entirely (DESIGN.md's three ranks).
 *
 * ## Contrast — the lowest-risk of the three, by construction
 *
 * The fill is opaque `#1d2126`, so nothing underneath it can move any of these
 * numbers. Whatever the map is doing, they are the numbers:
 *
 * - `#F7F4EC` (the name, Fraunces) — **14.7:1**
 * - `#a7b0ba` (the `cuisine · neighbourhood` line, and the labels) — **7.4:1**
 * - `#ffb07a` (the mono rating) — **9.1:1**
 * - on the selected row (`rgba(232,135,90,0.22)` over the fill = `#4a3731`):
 *   cream **10.2:1**, muted **5.1:1**, ember — the row's own accent — **6.2:1**
 *
 * `#8b939c`, the attribution's muted step, was the first pick for the secondary
 * line and is wrong: it fails the selected row at 3.6:1.
 *
 * ## Type, by authorship
 *
 * The name is a proper name, so Fraunces. `cuisine · neighbourhood` is prose
 * about the place, so system sans. The rating is a machine value, so mono and
 * `tabular-nums` — which is what lets a column of ratings be read straight down
 * without the decimal points wandering. The placeholder and the section labels
 * take the `.mono-label` voice, the same one `THE HITS` and the nav wear.
 */

const FILL = "bg-[#1d2126]";
const EDGE = "border border-[rgba(232,135,90,0.4)]";
const MUTED = "text-[#a7b0ba]";
const LIST_ID = "drafts-marquee-results";

export function MarqueeSearch({
  mapRef,
  seeds,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  seeds: RestaurantView[];
}) {
  /* The safe variant answers the "offer something before they type" rule the
     safe way — with history. `search-accessible` asks for recent or suggested
     queries; on a map the useful unit is the place, not the string that found
     it, so this remembers what was actually flown to and falls back to the
     city's best-rated on a first visit. Nobody has to be taught either one. */
  const { recent, remember } = useRecent(seeds);
  const best = topRated(seeds);
  const usingRecent = recent.length > 0;
  const offer = usingRecent ? recent : best;

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blur = useCallback(() => inputRef.current?.blur(), []);
  const search = useMapSearch({ mapRef, seeds, offer, onPick: remember, onCommit: blur });
  useCloseOnOutsideClick(wrapRef, search.mounted, search.close);

  const typed = search.query.trim().length > 0;

  return (
    <>
      <DraftSearchStyles />
      {/* Same inset and same 390px drop as the shipped field: below MapLibre's
          control stack on a phone, top-right from `sm` up. */}
      <div
        ref={wrapRef}
        className="absolute left-16 right-2.5 top-16 z-10 sm:left-auto sm:top-2.5 sm:w-72"
      >
        <div
          className={`flex min-h-11 items-center gap-2.5 rounded-full px-4 py-2 ${FILL} ${EDGE} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange`}
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
            onKeyDown={search.onKeyDown}
            /* The placeholder is chrome, not prose — same voice as the section
               labels below it, set through the placeholder variants because a
               pseudo-element cannot take the .mono-label class. */
            placeholder="Find a spot"
            aria-label="Find a restaurant on the map"
            aria-expanded={search.mounted}
            aria-controls={LIST_ID}
            aria-activedescendant={
              search.active === NONE ? undefined : `${LIST_ID}-${search.active}`
            }
            role="combobox"
            autoComplete="off"
            className="w-full min-w-0 bg-transparent text-sm text-[#F7F4EC] placeholder:font-mono placeholder:text-[11px] placeholder:uppercase placeholder:tracking-[0.18em] placeholder:text-[#a7b0ba] focus:outline-none"
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

        {search.mounted && (
          <div
            id={LIST_ID}
            className={`absolute right-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl ${FILL} ${EDGE} ${
              search.closing ? "dms-list-out" : "dms-list-in"
            }`}
          >
            {!typed && search.results.length > 0 && (
              <p className={`mono-label px-4 pb-1 pt-3 ${MUTED}`}>
                {usingRecent ? "Recent" : "Top rated"}
              </p>
            )}

            {search.emptyResult ? (
              <div className="px-4 pb-3 pt-3">
                <p className={`mono-label pb-1.5 ${MUTED}`}>No results</p>
                <p className="text-sm text-[#F7F4EC]">
                  Nothing on the map is called &ldquo;{search.query.trim()}&rdquo;.
                </p>
                {search.suggestion.terms.length > 0 && (
                  <>
                    <p className="mt-2 text-xs text-[#a7b0ba]">These do exist:</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {search.suggestion.terms.map((term) => (
                        <button
                          key={term.label}
                          type="button"
                          onClick={() => search.setQuery(term.label)}
                          className="min-h-11 rounded-full border border-[rgba(232,135,90,0.4)] px-3 text-xs text-[#F7F4EC] transition-colors hover:bg-[rgba(232,135,90,0.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                        >
                          {term.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {search.suggestion.nearMiss.length > 0 && (
                  <>
                    <p className={`mono-label pb-1 pt-3 ${MUTED}`}>Did you mean</p>
                    <ul>
                      {search.suggestion.nearMiss.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => search.goTo(r)}
                            className="flex min-h-11 w-full items-center justify-between gap-3 text-left transition-colors hover:text-[#ffb07a] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange"
                          >
                            <span className="truncate font-display text-sm font-semibold text-[#F7F4EC]">
                              {r.name}
                            </span>
                            {/* Same rating treatment as the rows above it —
                                a "did you mean" is still a row you can fly to,
                                and two shapes for one value inside one panel
                                reads as two different numbers. */}
                            <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-medium tabular-nums text-[#ffb07a]">
                              <StarIcon className="h-3 w-3" />
                              {r.rating.toFixed(1)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
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
                      className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${
                        i === search.active ? "bg-[rgba(232,135,90,0.22)]" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        {/* A proper name, so the display face — the one place
                            this variant differs in voice from the shipped
                            field, which sets the name in sans medium. */}
                        <span className="block truncate font-display text-[15px] font-semibold leading-tight text-[#F7F4EC]">
                          {r.name}
                        </span>
                        <span className={`block truncate text-xs ${MUTED}`}>
                          {r.cuisine} · {r.neighborhood}
                        </span>
                      </span>
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
