"use client";

import { useState, type ReactNode } from "react";
import { neighborhoods, cuisines } from "@/data/restaurantFacets";

export type QuickFilter = "open-now" | "top-rated" | "trending";

export const QUICK_FILTERS: ReadonlyArray<{ value: QuickFilter; label: string }> = [
  { value: "open-now", label: "Open now" },
  { value: "top-rated", label: "Top rated" },
  { value: "trending", label: "Promoted" },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-pm-grey-text">
      {icon}
      {children}
    </p>
  );
}

/** Collapsible select styled as a listbox rather than a native <select>. */
function FilterSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: readonly string[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 text-sm font-medium shadow-sm transition-all hover:-translate-y-px hover:border-pm-orange hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          value ? "border-pm-orange text-pm-orange-text" : "border-zinc-200 text-zinc-600"
        }`}
      >
        <span className="truncate">{value ?? placeholder}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-md">
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-100"
          >
            {placeholder}
          </button>
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                option === value
                  ? "bg-pm-orange-tint font-medium text-pm-orange-text"
                  : "text-zinc-600 hover:bg-pm-orange-tint/50 hover:text-pm-orange-text"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Discover's filter rail. Purely controlled — every value lives in
 * DiscoverBrowser, which is what actually narrows the grid. Previously these
 * controls held their own state and filtered nothing.
 */
export function Sidebar({
  neighborhood,
  cuisine,
  quick,
  onNeighborhood,
  onCuisine,
  onQuick,
  onClear,
  hasFilters,
}: {
  neighborhood: string | null;
  cuisine: string | null;
  quick: QuickFilter[];
  onNeighborhood: (v: string | null) => void;
  onCuisine: (v: string | null) => void;
  onQuick: (v: QuickFilter) => void;
  onClear: () => void;
  hasFilters: boolean;
}) {
  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:h-fit lg:w-[210px]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight text-zinc-900">
          Filters
        </h2>
        {hasFilters && (
          <button
            onClick={onClear}
            className="text-xs font-medium text-pm-orange-text transition-colors hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <SectionLabel
        icon={
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pm-orange" aria-hidden="true">
            <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        }
      >
        Neighborhood
      </SectionLabel>
      <FilterSelect
        label="Filter by neighborhood"
        placeholder="All neighborhoods"
        options={neighborhoods}
        value={neighborhood}
        onChange={onNeighborhood}
      />

      <SectionLabel
        icon={
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="shrink-0 text-pm-orange" aria-hidden="true">
            <path d="M3 2v7a2 2 0 0 0 2 2v11" />
            <path d="M7 2v9" />
            <path d="M5 2v9" />
            <path d="M19 2c-1.7 0-3 2-3 4.5S17.3 11 19 11v11" />
          </svg>
        }
      >
        Cuisine
      </SectionLabel>
      <FilterSelect
        label="Filter by cuisine"
        placeholder="All cuisines"
        options={cuisines}
        value={cuisine}
        onChange={onCuisine}
      />

      <SectionLabel
        icon={
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pm-orange" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        }
      >
        Quick filters
      </SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map((f) => {
          const on = quick.includes(f.value);
          return (
            <button
              key={f.value}
              onClick={() => onQuick(f.value)}
              aria-pressed={on}
              className={`min-h-9 rounded-full px-3 text-xs font-medium ring-1 ring-inset transition-all hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                on
                  ? "bg-pm-charcoal text-white ring-pm-charcoal"
                  : "bg-white text-zinc-600 ring-zinc-200 hover:border-pm-orange hover:text-pm-orange-text"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
