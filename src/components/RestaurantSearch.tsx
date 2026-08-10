"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Restaurant } from "@/data/restaurants";
import { StarIcon } from "@/components/icons";

/**
 * Header search over the restaurant list.
 *
 * Matches name, cuisine and neighbourhood so "thai", "little italy" and
 * "landini" all land somewhere. Ranked so a name match beats a cuisine match
 * — typing "pizza" should reach Bronx Pizza before every pizzeria in the city.
 *
 * Ranks whatever the server sent for this query rather than the whole city.
 * `/api/restaurants?q=` narrows on the same three fields, so the ordering below
 * is unchanged — it just never needs the corpus in the browser to produce it.
 */
function rank(query: string, candidates: readonly Restaurant[]) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return candidates
    .map((r) => {
      const name = r.name.toLowerCase();
      const cuisine = r.cuisine.toLowerCase();
      const hood = r.neighborhood.toLowerCase();

      let score = 0;
      if (name.startsWith(q)) score = 100;
      else if (name.includes(q)) score = 80;
      else if (cuisine.startsWith(q)) score = 60;
      else if (cuisine.includes(q)) score = 50;
      else if (hood.startsWith(q)) score = 40;
      else if (hood.includes(q)) score = 30;

      // Rating breaks ties so the better-reviewed place surfaces first.
      return { r, score: score === 0 ? 0 : score + r.rating };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.r);
}

export function RestaurantSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [candidates, setCandidates] = useState<Restaurant[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

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
        const data: { restaurants: Restaurant[] } = await res.json();
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

  function onKeyDown(e: React.KeyboardEvent) {
    if (!showing) return;
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      // Anchors are rendered below; following the href directly keeps this
      // working without a router import.
      window.location.href = `/restaurant/${results[active].id}`;
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
  return (
    <div ref={wrapRef} className="relative hidden w-40 min-w-0 sm:block lg:w-56">
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
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search restaurants..."
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
            <li className="px-4 py-3 text-sm text-zinc-500">
              Nothing matching &ldquo;{query.trim()}&rdquo;
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
                  <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-medium tabular-nums text-zinc-600">
                    <StarIcon className="h-3 w-3 text-zinc-400" />
                    {r.rating.toFixed(1)}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
