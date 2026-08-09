"use client";

import { Dialog } from "./Dialog";
import { PlateStarIcon } from "@/components/icons";
import { POINT_RULE_COPY } from "@/lib/points";

export function PointsInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="How PM Points work" onClose={onClose} variant="sheet">
      <div className="px-5 py-4">
        <p className="mb-4 text-sm leading-relaxed text-zinc-600">
          Points go to the person whose plate earned them. Post what you eat, and every like
          and comment your post picks up adds to your total.
        </p>

        <ul className="divide-y divide-zinc-100 rounded-xl bg-pm-grey-tint/50 px-4">
          {POINT_RULE_COPY.map((rule) => (
            <li key={rule.label} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-zinc-700">{rule.label}</span>
              <span className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-pm-orange-text">
                <PlateStarIcon className="h-3.5 w-[18px]" />
                {rule.value}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          Liking your own post doesn&apos;t earn anything, and un-liking then re-liking
          someone else&apos;s only ever counts once.
        </p>
      </div>
    </Dialog>
  );
}
