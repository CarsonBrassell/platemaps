"use client";

import { Dialog } from "@/components/feed/Dialog";
import { RankInsignia } from "@/components/RankInsignia";
import { formatPoints } from "@/lib/points";
import { RANKS, rankFor } from "@/lib/ranks";

/**
 * Every rung of the ladder, top to bottom, with the lifetime total each one
 * takes. Opens from a tap on the owner's `RankRing` (Calvin, 2026-09: no
 * "51 to Regular" line under the ring — the whole ladder on demand instead).
 *
 * The reader's own rung is picked out; the rungs they've passed are dimmed and
 * the ones ahead show the total still owed, which is where the "to go" number
 * went. Ordered highest first so the thing worth reaching is what you see at
 * the top of the sheet, not the badge everyone starts with.
 */
export function RankLadderModal({ points, onClose }: { points: number; onClose: () => void }) {
  const current = rankFor(points);

  return (
    <Dialog title="The ladder" onClose={onClose} variant="sheet">
      <div className="px-5 py-4">
        <p className="mb-4 text-sm leading-relaxed text-zinc-600">
          Titles are earned on lifetime Plate Points and never lost. You have{" "}
          <span className="font-semibold tabular-nums text-pm-orange-text">{formatPoints(points)}</span>.
        </p>

        <ul className="divide-y divide-zinc-100 rounded-xl bg-pm-grey-tint/50 px-4">
          {[...RANKS].reverse().map((rank) => {
            const isCurrent = rank.key === current.key;
            const earned = points >= rank.minPoints;
            const owed = rank.minPoints - points;
            return (
              <li
                key={rank.key}
                aria-current={isCurrent ? "true" : undefined}
                className={`flex items-center gap-3.5 py-3 ${earned && !isCurrent ? "opacity-55" : ""}`}
              >
                <RankInsignia rank={rank.key} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[17px] font-semibold leading-tight text-pm-charcoal">
                    {rank.title}
                    {isCurrent && (
                      <span className="ml-2 rounded-full bg-pm-orange-tint px-2 py-0.5 align-middle font-sans text-[10px] font-semibold uppercase tracking-wide text-pm-orange-text">
                        you
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] tabular-nums text-pm-grey-text">
                    {rank.minPoints === 0 ? "start here" : `${formatPoints(rank.minPoints)} points`}
                    {!earned && (
                      <span className="text-zinc-400"> · {formatPoints(owed)} to go</span>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
