"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type PhoneLayoutOption = {
  cols: "1" | "3" | "5";
  label: string;
  selected: boolean;
  href: string;
};

/**
 * How many cards a row of Discover shows — 1 (the full directory-entry card),
 * 3 (the same grid card the web version uses) or 5 (a thumbnail wall for
 * browsing by photo). Purely a display choice, not a filter: it never changes
 * which restaurants match, so it rides the URL the same way `nav` does — see
 * `hrefWith` in m/page.tsx — rather than resetting `shown` or touching
 * `getDiscoverPage`'s predicate.
 *
 * Handed URLs, not a callback, for the same reason every other control on this
 * screen is: the page decides what a selection means, this button just opens
 * and closes.
 */
export function PhoneLayoutToggle({ options }: { options: PhoneLayoutOption[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change how many places show per row"
        className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 transition-colors active:scale-95 hover:bg-pm-grey-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl bg-white p-1 ring-1 ring-zinc-200"
        >
          {options.map((option) => (
            <Link
              key={option.cols}
              href={option.href}
              role="menuitem"
              scroll={false}
              onClick={() => setOpen(false)}
              className={`flex min-h-11 items-center justify-between rounded-lg px-3 text-sm transition-colors ${
                option.selected
                  ? "font-medium text-pm-orange-text"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {option.label}
              {option.selected && (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
