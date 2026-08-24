"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Restaurant } from "@/data/restaurants";
import { QUERY_PARAM } from "@/lib/discoverFilters";
import { rank } from "@/lib/restaurantRank";
import { StarIcon } from "@/components/icons";
import type { PlateScore } from "@/lib/plateScore";
import { SHOW_BLEND_STARS, blendLabel } from "@/lib/ratingDisplay";

/**
 * A row as /api/restaurants sends it: the full restaurant plus the plate score
 * that route attaches. Mirrored locally rather than imported from lib/db.ts,
 * which is server-only.
 */
type SearchRow = Restaurant & { plateScore?: PlateScore };

/**
 * Header search over the restaurant list.
 *
 * The ordering — name match over cuisine match, rating breaking ties, top six —
 * lives in lib/restaurantRank.ts, since the map's search field offers the same
 * six for the same term.
 *
 * ## Two answers, and Enter picks the broad one
 *
 * The dropdown is a shortcut to *one place*: at most six, ranked, for when you
 * already know what you want. Enter is the other question — "show me everything
 * like this" — and it goes to Discover with the term applied, where the rail,
 * the counts and the grid all narrow to it together. A term naming a filter
 * ("Thai", "North Park", "$$") arrives there as that filter rather than as a
 * text match; lib/discoverFilters.ts does that resolution, because only the
 * server holds the vocabulary to check a term against.
 *
 * So arrowing into the list is what commits to a single restaurant. Enter with
 * nothing highlighted — which is every Enter typed straight after a word — is
 * the search.
 */

/** No row highlighted — the state every fresh keystroke returns to. */
const NONE = -1;

export function RestaurantSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(NONE);
  const [candidates, setCandidates] = useState<SearchRow[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * One request per settled query, not per keystroke.
   *
   * 150ms is below the point a typist notices and above the gap between
   * characters, so a word typed at speed costs one request instead of six. The
   * cleanup both cancels the pending timer and marks the in-flight response
   * stale, which is what stops a slow "th" from landing after a fast "thai"
   * and repopulating the list with the wrong matches.
   */
  useEffect(() => {
    const q = query.trim();
    // Nothing to clear: `rank` returns [] for an empty query, so whatever the
    // last search left in state is already unreachable. Emptying it here would
    // be a setState in an effect body to reach a state the render already has.
    if (!q) return;

    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/restaurants?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data: { restaurants: SearchRow[] } = await res.json();
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

  /**
   * Hand the term to Discover.
   *
   * A soft navigation, so the grid re-renders in place and the field keeps the
   * text that produced it — searching twice in a row shouldn't cost a document
   * load, and the term staying put is what makes the second search an edit of
   * the first.
   *
   * Only `q` goes on the URL: a search from the header is a fresh question, not
   * a narrowing of whatever the last visit to Discover had left switched on.
   */
  function submit() {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    setActive(NONE);
    inputRef.current?.blur();
    router.push(`/?${QUERY_PARAM}=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      // A highlighted row means the visitor arrowed to a specific restaurant
      // and meant that one. Everything else — the common case — is the search.
      e.preventDefault();
      if (showing && results[active]) window.location.href = `/restaurant/${results[active].id}`;
      else submit();
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
      // a way out of the list and back to plain Enter without deleting a letter.
      e.preventDefault();
      setActive((i) => Math.max(i - 1, NONE));
    }
  }

  // The width lives on this wrapper rather than on the input so the field can
  // shrink below its preferred size when the header row is tight, instead of
  // holding its size and running under the nav.
  //
  // Held at 224px deliberately: this field is the bulk of the header's right
  // group, and that group is sized to match the left one (brand + city) so the
  // centred nav oval sits between two equal gaps — 134px and 143px at 1280.
  // Widening it here pulls the header out of symmetry, it does not decentre the
  // nav; the grid in Header.tsx owns the centring.
  //
  // 224px is now the width at every size the field is shown at. It used to step
  // up from `w-40` at `lg`, which left 102px of room for a placeholder that
  // measures 134px — so from 640px to 1023px the field read "Search restaura",
  // cut mid-word with no ellipsis. Nothing was gained by the narrower step:
  // below `xl` the nav row is hidden (see Header.tsx), so the header is a
  // two-end flex with the whole middle empty and the extra 64px costs nothing.
  // The pinned width above still describes `xl`, where it does matter.
  return (
    <div ref={wrapRef} className="relative hidden w-56 min-w-0 sm:block">
      <div className="flex items-center gap-2.5 rounded-full bg-white px-4 py-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-zinc-500"
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
          placeholder="Search restaurants…"
          aria-label="Search restaurants"
          aria-expanded={showing}
          aria-controls="search-results"
          role="combobox"
          autoComplete="off"
          className="w-full min-w-0 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Clear search"
            className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Anchored right, not left: the field now sits in the header's right
          group next to the avatar, and this menu is wider than the field, so a
          left anchor would push it off the right edge of the viewport. */}
      {showing && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl bg-white py-1.5"
        >
          {results.length === 0 ? (
            <li className="px-4 pb-1 pt-3 text-sm text-zinc-500">
              No restaurant named &ldquo;{query.trim()}&rdquo;
            </li>
          ) : (
            results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === active}>
                <Link
                  href={`/restaurant/${r.id}`}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                    i === active ? "bg-pm-orange-tint/60" : "hover:bg-zinc-50"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900">
                      {r.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {r.cuisine} · {r.neighborhood}
                    </span>
                  </span>
                  {/* Both numbers where there are both, in the same order as
                      every other surface: our percent in the accent, the blend's
                      stars muted with their denominator. A row is a shortcut to
                      one place, so this stays to two short runs. */}
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
                    {r.plateScore?.percent != null && (
                      <span className="font-semibold text-pm-orange-text">
                        {r.plateScore.percent}%
                      </span>
                    )}
                    {SHOW_BLEND_STARS && r.rating != null && (
                      <span className="flex items-center gap-0.5 font-medium text-zinc-500">
                        <StarIcon className="h-3 w-3 text-zinc-400" />
                        {blendLabel(r.rating)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))
          )}

          {/* The way out of the shortcut and into the whole result set. It says
              what Enter already does, because a dropdown of six is otherwise
              the only answer anyone knows this field can give.
           *
           * Outside the listbox semantics — role="presentation" and no
           * aria-selected — since it isn't one of the options being chosen
           * between, and arrowing past the last restaurant shouldn't land on
           * it. Keyboard reaches it as plain Enter instead. */}
          <li role="presentation" className={results.length > 0 ? "mt-1 border-t border-zinc-100 pt-1" : ""}>
            <button
              type="button"
              onClick={submit}
              onMouseEnter={() => setActive(NONE)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">
                Search Discover for{" "}
                <span className="font-medium text-zinc-900">
                  &ldquo;{query.trim()}&rdquo;
                </span>
              </span>
              <span className="mono-label shrink-0 text-zinc-400">Enter</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
