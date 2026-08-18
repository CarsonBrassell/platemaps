"use client";

import Link from "next/link";
import { useState } from "react";
import { PhoneFilterSheet, type PhoneFilterModel } from "@/components/mobile/PhoneFilterSheet";

/**
 * The one filter row on the discover screen: the way into every dimension,
 * plus whatever is currently on.
 *
 * Every dimension — neighbourhood, cuisine, price, rated-well-for — lives
 * behind the "Filters" button, in PhoneFilterSheet. Cuisine used to also ride
 * this row as its own scrolling chip strip (PhoneCuisineRail), promoted out
 * of the sheet as a "browse" fast path; in practice that meant the same
 * dimension was chosen from two different places, and a phone screen this
 * narrow can't afford to spend a whole row on a filter that also lives one
 * tap away. One way in now, same as every other dimension.
 *
 * Everything here is a `Link` except the Filters button itself — filtering is
 * a navigation (lib/discover.ts), and the hrefs were all built by `hrefWith`
 * in m/page.tsx, which is what keeps `?nav=` alive through every tap.
 *
 * The sheet is rendered as a sibling of the scroller rather than inside it. It
 * is `position: fixed`, so it pins to the phone frame either way (see the
 * device-frame block in m/phone.css), but a full-screen overlay parented to a
 * horizontally scrolling strip is a trap waiting for the first ancestor that
 * clips.
 */
export function PhoneFilterBar({ model }: { model: PhoneFilterModel }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        /* Same edge-to-edge scroll trick PhoneCuisineRail used to own — the
           row of active chips can still run past the button, and the last one
           should run off the screen rather than stop at a gutter. */
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max gap-2 pb-1">
          {/* Tan: this opens something, it is not a value you can be inside.
              That is the unselected-pill fill from DESIGN.md doing exactly
              the job it is specified for. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={model.active > 0 ? `Filters, ${model.active} applied` : "Filters"}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-pm-grey-tint px-4 text-[13px] font-medium text-pm-grey-text transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M7 12h10M10 17h4" />
            </svg>
            Filters
            {model.active > 0 && (
              <span className="font-mono text-xs tabular-nums text-pm-orange-text">
                {model.active}
              </span>
            )}
          </button>

          {/* Removable, and the × says so. An active filter that only exists
              inside a closed sheet is state the visitor cannot see, which is
              how a phone ends up showing eleven results and no reason why. */}
          {model.chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.removeHref}
              scroll={false}
              prefetch={false}
              aria-label={`Remove ${chip.label} filter`}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-pm-orange px-4 text-[13px] font-medium text-[#F7F4EC] transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              <span className={chip.mono ? "font-mono tracking-tight" : ""}>{chip.label}</span>
              <span aria-hidden="true" className="text-[15px] leading-none opacity-80">
                ×
              </span>
            </Link>
          ))}
        </div>
      </div>

      {open && <PhoneFilterSheet model={model} onClose={() => setOpen(false)} />}
    </>
  );
}
