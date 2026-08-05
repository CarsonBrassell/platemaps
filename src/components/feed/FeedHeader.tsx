"use client";

import { useEffect, useRef, useState } from "react";
import { PinIcon, ChevronIcon } from "@/components/icons";

export function FeedHeader({
  region,
  regions,
  onRegionChange,
}: {
  region: string;
  regions: readonly string[];
  onRegionChange: (region: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">
          Food Feed
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">See what people around you are eating</p>
      </div>

      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-pm-orange-border hover:text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <PinIcon className="h-4 w-4 text-pm-orange" />
          <span className="max-w-[9rem] truncate">Near {region}</span>
          <ChevronIcon
            className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
              open ? "-rotate-90" : "rotate-90"
            }`}
          />
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label="Choose a neighborhood"
            className="absolute right-0 z-30 mt-1.5 max-h-72 w-60 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg"
          >
            {regions.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  role="option"
                  aria-selected={r === region}
                  onClick={() => {
                    onRegionChange(r);
                    setOpen(false);
                  }}
                  className={`flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm transition-colors ${
                    r === region
                      ? "bg-pm-orange-tint font-medium text-pm-orange-text"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
