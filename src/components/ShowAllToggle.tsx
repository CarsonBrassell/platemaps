"use client";

import { useRef, useState } from "react";
import { ChevronIcon } from "@/components/icons";

/** A list folds once it reaches this many items, and not before. */
const FOLD_AT = 5;

/** The later threshold for the leaderboard and requests sent: ten or more. */
export const LONG_LIST_FOLD_AT = 10;

/** How many plates a folded list keeps: two full rows of the collage. */
export const PLATES_KEPT = 4;

/** How many friends a folded list keeps. */
export const FRIENDS_KEPT = 3;

/**
 * Folds a long list down to its first `keep` items.
 *
 * `paused` shows everything regardless: a search over the friends list has
 * already narrowed it, and hiding a match behind an arrow would read as "no
 * result". The fold is not a filter, so `items` keeps its order and a row
 * disappearing (a removed friend) can drop the list back under `FOLD_AT`, at
 * which point the arrow goes away by itself.
 */
export function useFoldedList<T>(items: T[], keep: number, paused = false, foldAt = FOLD_AT) {
  const [expanded, setExpanded] = useState(false);
  const foldable = !paused && items.length >= foldAt;
  return {
    visible: foldable && !expanded ? items.slice(0, keep) : items,
    foldable,
    expanded,
    setExpanded,
  };
}

/**
 * The arrow under a folded list.
 *
 * The label takes no count, on purpose: this sits under the friends list, and
 * friend counts never display in this product (see `getFriends` in lib/db.ts).
 * A "Show 9 more" here would be that total with a subtraction in front of it.
 *
 * Collapsing removes everything the reader just scrolled past, so the button
 * is brought back into view rather than leaving them in whatever the page
 * happens to have become. `scrollIntoView` without `behavior` jumps, which
 * is also what `prefers-reduced-motion` wants.
 */
export function ShowAllToggle({
  expanded,
  onChange,
  controls,
  background = "bg-white",
}: {
  expanded: boolean;
  onChange: (expanded: boolean) => void;
  /** The id of the list this folds. */
  controls: string;
  /** Inside a white card the default pill vanishes, so pass a tan one there. */
  background?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={() => {
        onChange(!expanded);
        if (expanded) {
          requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "center" }));
        }
      }}
      className={`mx-auto mt-3 flex min-h-11 items-center gap-1.5 rounded-full ${background} pl-5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-900 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange`}
    >
      {expanded ? "Show less" : "Show all"}
      <ChevronIcon
        className={`h-4 w-4 text-zinc-500 transition-transform duration-300 motion-reduce:transition-none ${
          expanded ? "-rotate-90" : "rotate-90"
        }`}
      />
    </button>
  );
}
