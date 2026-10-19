"use client";

import { useState } from "react";
import { PlateStarIcon, InfoIcon } from "@/components/icons";
import { PointsInfoModal } from "@/components/feed/PointsInfoModal";
import { POINT_RULES, formatPoints } from "@/lib/points";
import { RankRing } from "@/components/RankRing";
import { RankLadderModal } from "@/components/RankLadderModal";

/**
 * Your Plate Points, on your own profile — and the one place in the app where
 * the number is the subject rather than context.
 *
 * **This is the sanctioned use of the accent.** DESIGN.md rations orange to
 * percentages and vote counts, selected states, and the primary action, and
 * `PointsBadge` is deliberately quiet everywhere else for exactly that reason:
 * a points chip on every feed card would put the accent on twenty things at
 * once and it would stop meaning anything. That argument does not apply to the
 * profile, where the total is what you came to look at, so here it takes the
 * orange. **Do not** flip `PointsBadge`'s default tone to match this; the two
 * are different jobs.
 *
 * It replaced a `bg-pm-grey-tint` tile whose number was `zinc-900` — the same
 * grey the Posts and Comments tiles beside it wore, so the one figure the
 * screen is about looked like the two that are only counts.
 *
 * Two contrast facts, both measured against `--pm-orange-tint` (#f3e0d3), and
 * both tight enough to break if the tint is darkened:
 *
 * - `--pm-orange-text` on the tint is **4.55:1** — it clears the 4.5 floor for
 *   body-size text by a hair. Every small string here uses it.
 * - `--pm-orange` on the tint is **3.33:1**, which is only valid because the
 *   total is large and bold (34px, semibold — well past the 24px/18.66px-bold
 *   line). The accent must never be used for small type on this panel.
 *
 * The earn rules read from `POINT_RULES`, so the economy is stated in one
 * place: change a number in `lib/points.ts` and this row follows. They are set
 * as type rather than as white pills on purpose — a pill here would wear the
 * rank-3 control costume and read as something you can press.
 */
export function PlatePointsPanel({
  points,
  showRank = false,
  className = "",
}: {
  points: number;
  /**
   * Renders the rank card (`RankRing`) instead of the tint panel: your
   * crest in a progress ring, your title, the total counting up, the six
   * rungs as pips and the distance to the next title. It animates —
   * the ring follows the roll-call's count-up and a threshold crossing gets a
   * full rank-up sequence (see RankRing.tsx). It replaced a bare ring on the
   * cream (2026-09), which replaced a crest + 6px track row (2026-08).
   *
   * The pips put the whole ladder on the card after all — Carson (2026-10)
   * wanted the tracker to read as a progression screen, and the ladder
   * is what makes it one. The sheet behind a tap still has the detail.
   *
   * Own-profile surfaces only — the public profile has its own insignia
   * treatment (bigger, beside the avatar, no track, because a stranger is
   * sizing you up rather than reading their own progress), and
   * every other caller stays a bare total. This is the surface Calvin asked
   * for when he asked why his rank wasn't on his profile (2026-08); the
   * "public profile only" rule in lib/ranks.ts is amended to match.
   */
  showRank?: boolean;
  className?: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [ladderOpen, setLadderOpen] = useState(false);

  /* Three rows, and the order is the order somebody meets them: post first,
     then what other people do to it. See lib/points.ts for the amounts. */
  const rules = [
    { label: "post", value: POINT_RULES.createPost },
    { label: "upvote", value: POINT_RULES.receiveUpvote },
    { label: "comment", value: POINT_RULES.receiveComment },
  ];

  if (showRank) {
    /* The owner's view is the rank card and nothing else: crest, ring,
       title, total, the rungs as pips and the distance to the next title, on
       a plain white card in the house kit (Carson, 2026-10-15). The tint
       panel below stays for every bare-total caller. The card is the ladder
       button; the info button rides in its corner. */
    return (
      <>
        <RankRing
          points={points}
          className={className}
          onOpenLadder={() => setLadderOpen(true)}
          onOpenInfo={() => setInfoOpen(true)}
        />
        {infoOpen && <PointsInfoModal onClose={() => setInfoOpen(false)} />}
        {ladderOpen && <RankLadderModal points={points} onClose={() => setLadderOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <div className={`rounded-xl bg-pm-orange-tint px-4 py-3.5 ${className}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-pm-orange-text">
            <PlateStarIcon className="h-3.5 w-[18px] shrink-0" />
            <span className="mono-label">Plate Points</span>
          </span>
          {/* Pulled into the panel's own padding with a negative margin so a
              44px target doesn't force the header row 44px tall. */}
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="How Plate Points work"
            className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-pm-orange-text transition-colors hover:bg-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <InfoIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* The total and its unit share a baseline: the number is the value,
            "points" is what it counts, and a unit set at the same size as the
            figure competes with it. */}
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-mono text-[34px] font-semibold leading-none tabular-nums text-pm-orange">
            {formatPoints(points)}
          </span>
          <span className="font-mono text-[11px] text-pm-orange-text">points</span>
        </p>

        {/* The leaderboard's dotted leader, in the warm border token rather
            than a neutral grey — everything either side of it is warm. */}
        <div
          aria-hidden="true"
          className="mt-3 h-px border-b border-dotted border-pm-orange-border"
        />

        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-pm-orange-text">
          {rules.map((rule, i) => (
            <span key={rule.label} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden="true" className="text-pm-orange-border">
                  ·
                </span>
              )}
              <span className="tabular-nums">
                +{rule.value} {rule.label}
              </span>
            </span>
          ))}
        </p>
      </div>

      {infoOpen && <PointsInfoModal onClose={() => setInfoOpen(false)} />}
    </>
  );
}
