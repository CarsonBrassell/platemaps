import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Cuisine as a horizontally scrolling chip rail, behind whatever controls the
 * caller puts in `lead`.
 *
 * The web version puts this dimension in a 230px sidebar as a vertical list
 * with counts, alongside neighbourhood, price and category. That rail has no
 * phone equivalent — a 390px screen cannot spend 230px on filters, and stacking
 * four vertical lists above the results pushes the first restaurant below the
 * fold, which defeats the page.
 *
 * So the phone version promotes exactly one dimension into the scroll flow and
 * puts the rest in a sheet (PhoneFilterSheet). Cuisine is the one worth
 * promoting: it is the dimension people arrive with an answer to ("I want
 * tacos"), where neighbourhood and price are ones they narrow down to
 * afterwards.
 *
 * Counts are dropped on purpose. On the sidebar a count tells you whether a row
 * is worth clicking before you spend a navigation; on a chip it doubles the
 * width of every item to say something you find out by tapping. The count still
 * exists — it orders this list, and it prints on every row in the sheet — it
 * just doesn't ride the chips.
 *
 * Chips are links, not buttons: filtering is a navigation in this app (the URL
 * is the query, see lib/discover.ts), so these should be long-pressable and
 * open-in-new-tab-able like any other link. The hrefs are built by `hrefWith`
 * in m/page.tsx so that `?nav=` survives; nothing here knows a parameter name.
 */

export type PhoneRailChip = {
  label: string;
  href: string;
  /** Tapping the current chip clears the filter, the way the web rail's rows do. */
  current: boolean;
};

export function PhoneCuisineRail({
  chips,
  lead,
}: {
  /** "All" first, then one per cuisine in the order the facet came in. */
  chips: PhoneRailChip[];
  /** Rides ahead of the cuisines in the same scroller — Filters, active chips. */
  lead?: ReactNode;
}) {
  return (
    <div
      /* Negative margin then matching padding: the rail scrolls edge to edge so
         the last chip runs off the screen rather than stopping at a gutter,
         which is what tells you there is more to the right. The padding keeps
         the first and last chips off the bezel while it does that. */
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-2 pb-1">
        {lead}
        {chips.map((chip) => (
          <Link
            key={chip.label}
            href={chip.href}
            aria-current={chip.current ? "true" : undefined}
            /* min-h-11 is the accessibility floor from AGENTS.md; `shrink-0` is
               what makes the row scroll instead of squashing every cuisine in
               the city to fit. */
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
              chip.current ? "bg-pm-orange text-[#F7F4EC]" : "bg-white text-zinc-700"
            }`}
          >
            {chip.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
