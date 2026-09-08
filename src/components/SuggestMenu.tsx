"use client";

import Link from "next/link";
import { StarIcon } from "@/components/icons";
import { SHOW_BLEND_STARS, blendLabel } from "@/lib/ratingDisplay";
import { SUGGEST_HEADING, type SuggestScope } from "@/lib/suggestTypes";
import { NONE } from "@/components/useSuggest";

/**
 * The lines of the search dropdown, on both surfaces.
 *
 * `useSuggest` owns the behaviour and this owns the markup, for the same reason
 * they are split: the web header's field and the phone's Discover field must
 * offer the same lines in the same order with the same listbox semantics, and
 * the only thing allowed to differ is how big they are. Two hand-written
 * listboxes would have drifted the first time one of them was touched.
 *
 * There is one line per *reading* — All, then Restaurant, Cuisine, Neighborhood,
 * Dish — and each says how many restaurants picking it returns. Not a list of names:
 * "one selection for dishes, one selection for restaurants and one selection
 * for food or whatever". So there is no grouping to express, no headings over
 * sub-lists, and the flat listbox below is the whole structure.
 *
 * The parent supplies the positioning — the web menu is anchored to the right
 * of a 224px field and is wider than it, the phone's spans the screen — because
 * that genuinely is a per-surface question and nothing else here is.
 */

type Variant = "web" | "phone";

/* Only sizes and hit areas. Every colour, radius and weight is shared, because
   this is one control wearing one set of clothes at two scales. */
const SIZING: Record<Variant, { row: string; label: string; detail: string; heading: string }> = {
  web: {
    row: "gap-3 px-3 py-2",
    label: "text-sm",
    detail: "text-xs",
    heading: "px-3 pb-1 pt-2",
  },
  phone: {
    // 44px rows: this is a thumb target, not a pointer target.
    row: "min-h-11 gap-3 px-3 py-2.5",
    label: "text-[15px]",
    detail: "text-[13px]",
    heading: "px-3 pb-1 pt-2.5",
  },
};

/** "1 result" / "23 results" — restaurants on every line, because every line
 *  lands on a grid of restaurants. */
const countLabel = (n: number) => `${n} ${n === 1 ? "result" : "results"}`;

export function SuggestMenu({
  variant,
  className,
  scopes,
  correcting,
  active,
  setActive,
  listId,
  optionId,
  hrefFor,
  onPick,
  query,
  submitLabel,
  onSubmit,
}: {
  variant: Variant;
  /** Positioning and width, from the surface. */
  className: string;
  scopes: SuggestScope[];
  correcting: boolean;
  active: number;
  setActive: (index: number) => void;
  listId: string;
  optionId: (index: number) => string;
  hrefFor: (scope: SuggestScope) => string;
  onPick: (scope: SuggestScope) => void;
  /** The trimmed term, for the row that hands it to the search. */
  query: string;
  /** What the search row says — the phone and the feed answer differently. */
  submitLabel: string;
  onSubmit: () => void;
}) {
  const size = SIZING[variant];

  return (
    <div id={listId} role="listbox" aria-label="Search suggestions" className={className}>
      {/* One notice, not one per line. Corrections are all-or-nothing across
          the readings (`suggest` in lib/suggest.ts only reaches the similarity
          band when nothing matched literally anywhere), so when this shows,
          everything below it is a guess at what was meant — and saying so once
          is what lets each line stay the plain noun it is. */}
      {correcting && (
        <p className={`${size.heading} ${size.detail} text-zinc-500`}>
          Nothing spelled that way. Did you mean:
        </p>
      )}

      {scopes.map((scope, i) => (
        <Link
          key={scope.kind}
          id={optionId(i)}
          role="option"
          aria-selected={i === active}
          /* The accessible name is the whole line: the term, the reading, and
             the count. A screen reader landing on "Cannonball" alone cannot
             tell the restaurant line from the dish line. */
          aria-label={`${scope.label}, ${SUGGEST_HEADING[scope.kind]}, ${countLabel(scope.count)}`}
          href={hrefFor(scope)}
          /* The href is real so hover and middle-click behave like links, but
             the primary click is routed through the same commit the keyboard
             uses — one path, so a picked correction rewrites the field
             whichever way it was picked. */
          onClick={(event) => {
            event.preventDefault();
            onPick(scope);
          }}
          onMouseEnter={() => setActive(i)}
          className={`flex items-center ${size.row} transition-colors ${
            i === active ? "bg-pm-orange-tint/60" : "hover:bg-zinc-50"
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-medium text-zinc-900 ${size.label}`}>
              {scope.label}
            </span>
            {/* The reading and its size, together, because neither answers the
                visitor's question alone. `.mono-label` uppercases, so this is
                written in normal case and arrives as "DISH · 2 RESULTS".
             *
             * Only the reading is orange — Calvin asked for the labels in the
             * accent and then for "the number and results original color", and
             * the split is the right one: the reading is what the row *is* and
             * what is being chosen between, while the count is the same muted
             * supporting figure it is on every other surface. `--pm-orange-text`
             * rather than `--pm-orange` because this is small text: the fill
             * orange is 3.1:1 on white and fails the body floor (DESIGN.md).
             * The dot stays with the muted run so it divides without reading as
             * a third word. */}
            <span aria-hidden="true" className={`mono-label block truncate text-zinc-500`}>
              <span className="text-pm-orange-text">{SUGGEST_HEADING[scope.kind]}</span>{" "}
              <span className="text-zinc-500/40">·</span> {countLabel(scope.count)}
            </span>
          </span>
          {/* Both numbers where there are both, in the same order as every
              other surface: our percent in the accent, the blend's stars muted
              with their denominator. Only a line naming one restaurant carries
              them — a cuisine is not a place and has no rating of its own. */}
          {(scope.percent != null || (SHOW_BLEND_STARS && scope.rating != null)) && (
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
              {scope.percent != null && (
                <span className="font-semibold text-pm-orange-text">{scope.percent}%</span>
              )}
              {SHOW_BLEND_STARS && scope.rating != null && (
                <span className="flex items-center gap-0.5 font-medium text-zinc-500">
                  <StarIcon className="h-3 w-3 text-zinc-400" />
                  {blendLabel(scope.rating)}
                </span>
              )}
            </span>
          )}
        </Link>
      ))}

      {/* The way out of the readings and into the whole result set. It says what
          Enter already does, because a dropdown of a few lines is otherwise the
          only answer anyone knows this field can give — and it is the row that
          runs the *ranked* search, where names beat cuisines beat dishes.
       *
       * Outside the listbox semantics — no role="option" — since it isn't one of
       * the readings being chosen between, and arrowing past the last line
       * shouldn't land on it. The keyboard reaches it as plain Enter instead,
       * which is what the label promises. */}
      <div className={scopes.length > 0 ? "mt-1 border-t border-zinc-100 pt-1" : ""}>
        <button
          type="button"
          onClick={onSubmit}
          onMouseEnter={() => setActive(NONE)}
          className={`flex w-full items-center text-left transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${size.row}`}
        >
          <span className={`min-w-0 flex-1 truncate text-zinc-700 ${size.label}`}>
            {submitLabel}{" "}
            <span className="font-medium text-zinc-900">&ldquo;{query}&rdquo;</span>
          </span>
          {/* No keyboard to name on a phone — the on-screen key says Search. */}
          {variant === "web" && <span className="mono-label shrink-0 text-zinc-400">Enter</span>}
        </button>
      </div>
    </div>
  );
}
