"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { restaurants } from "@/data/restaurants";
import { StarIcon } from "@/components/icons";

/**
 * Header search over the restaurant list.
 *
 * Matches name, cuisine and neighbourhood so "thai", "little italy" and
 * "landini" all land somewhere. Ranked so a name match beats a cuisine match
 * — typing "pizza" should reach Bronx Pizza before every pizzeria in the city.
 */
function rank(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return restaurants
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
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => rank(query), [query]);

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

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <div className="flex items-center gap-2.5 rounded-full bg-white/10 px-4 py-2 ring-1 ring-inset ring-white/10 transition-all hover:bg-white/[0.14] focus-within:bg-white/[0.14] focus-within:ring-pm-orange/70">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-white/50"
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
          className="w-40 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none lg:w-56"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Clear search"
            className="shrink-0 text-white/50 transition-colors hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showing && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl"
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
                  <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-zinc-600">
                    <StarIcon className="h-3 w-3 text-pm-orange" />
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
