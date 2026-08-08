"use client";

import { StarIcon, ChatIcon, ChevronIcon } from "@/components/icons";

export type PostKind = "restaurant" | "dish" | "comment";

const row =
  "group flex w-full items-center gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-pm-orange hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * The fork every post goes through, whether it started with a photo or with
 * "just leave a comment".
 *
 * Each choice shows the instrument it leads to rather than an icon standing in
 * for one — the stars you will fill, the meter you will drag — so the decision is
 * made on the actual work, not on a label.
 */
export function KindChooser({ onChoose }: { onChoose: (kind: PostKind) => void }) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => onChoose("restaurant")} className={row}>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-lg font-semibold leading-tight text-zinc-900">
            Review a restaurant
          </span>
          <span className="mt-1 block text-sm text-zinc-500">
            Five stars for the place as a whole — the room, the service, the night.
          </span>
        </span>
        <span className="flex shrink-0 gap-0.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <StarIcon
              key={i}
              className={`h-5 w-5 transition-colors duration-200 ${
                i < 4 ? "text-pm-orange" : "text-zinc-300 group-hover:text-pm-orange"
              }`}
            />
          ))}
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-pm-orange-text" />
      </button>

      <button type="button" onClick={() => onChoose("dish")} className={row}>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-lg font-semibold leading-tight text-zinc-900">
            Review a dish
          </span>
          <span className="mt-1 block text-sm text-zinc-500">
            Pick it off the menu, then set how hard you&apos;d push it on someone else.
          </span>
        </span>
        <span className="w-20 shrink-0" aria-hidden="true">
          <span className="block h-2.5 overflow-hidden rounded-full bg-pm-grey-tint">
            <span className="block h-full w-[85%] rounded-full bg-pm-orange transition-all duration-300 group-hover:w-full" />
          </span>
          <span className="mt-1 block text-right text-[11px] font-semibold text-pm-orange-text">
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
        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-dashed border-zinc-300 bg-white/50 px-4 py-3 text-left text-sm text-zinc-600 transition-colors hover:border-pm-orange hover:bg-white hover:text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
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
