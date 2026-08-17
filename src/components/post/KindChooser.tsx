"use client";

import { ChatIcon, ChevronIcon } from "@/components/icons";

export type PostKind = "dish" | "comment";

const row =
  "group flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * The fork every post goes through, whether it started with a photo or with
 * "just leave a comment".
 *
 * Two doors, not three. The five-star restaurant review used to sit above the
 * plate and it is gone: a restaurant's score is now what its plates add up to
 * (lib/plateScore.ts), so there is nothing for a poster to enter at that level
 * and no second scale to choose between. What is left is one rated thing — a
 * plate — and the quiet door past it.
 *
 * The rated choice still shows the instrument it leads to rather than an icon
 * standing in for one, so the decision is made on the actual work.
 */
export function KindChooser({ onChoose }: { onChoose: (kind: PostKind) => void }) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => onChoose("dish")} className={row}>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-lg font-semibold leading-tight text-zinc-900">
            Rate a plate
          </span>
          <span className="mt-1 block text-sm text-zinc-500">
            Pick it off the menu, then give it your number.
          </span>
        </span>
        <span className="w-20 shrink-0" aria-hidden="true">
          <span className="block h-2.5 overflow-hidden rounded-full bg-pm-grey-tint">
            <span className="block h-full w-[85%] rounded-full bg-pm-orange transition-all duration-300 group-hover:w-full" />
          </span>
          <span className="mt-1 block text-right font-mono text-[11px] font-semibold tabular-nums text-pm-orange-text">
            85%
          </span>
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-pm-orange-text" />
      </button>

      {/* The quiet third door. Deliberately not a matching card: no rating means
          no instrument to preview, and dressing it as one would oversell it. */}
      <button
        type="button"
        onClick={() => onChoose("comment")}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-full bg-pm-grey-tint/60 px-4 py-3 text-left text-sm text-pm-grey-text transition-colors hover:bg-pm-grey-tint hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <ChatIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Just leave a comment
          <span className="ml-1.5 text-zinc-400">no rating</span>
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-zinc-300" />
      </button>
    </div>
  );
}
