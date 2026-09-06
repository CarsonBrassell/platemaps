"use client";

import { useState } from "react";
import { PlateStarIcon, InfoIcon } from "@/components/icons";
import { PointsInfoModal } from "@/components/feed/PointsInfoModal";
import { POINT_RULES, formatPoints } from "@/lib/points";
import { RankRing } from "@/components/RankRing";

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
   * Renders the rung you are on under the rules row as a `RankRing`: your
   * crest on a white disc, an orange arc for how far along the rung you are,
   * your title and how far is left. It animates — the arc follows the
   * roll-call's count-up and a threshold crossing gets a full sequence
   * (see RankRing.tsx). It replaced a crest + 6px track row (2026-09).
   *
   * Deliberately the *step*, not the ladder. The whole six-rung ladder was
   * the other candidate and it loses here — the panel's job is the total and
   * what it is worth next, and a full ladder turns a four-line panel into the
   * tallest thing on the profile to answer a question nobody asked at their
   * own total. The rules row above already says how to climb.
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

  /* No "post" row — publishing pays 0 now, and a "+0 post" chip in a row of
     rewards reads as a penalty rather than as "points come from what a post
     earns". The two that remain are both other-people-acted rules, which is
     the whole shape of the economy. See lib/points.ts. */
  const rules = [
    { label: "upvote", value: POINT_RULES.receiveUpvote },
    { label: "comment", value: POINT_RULES.receiveComment },
  ];

  if (showRank) {
    /* The owner's view is the ring and nothing else: crest, arc, title, total
       and distance, centred, straight on the cream — no card, no tint (Calvin,
       2026-09: "the same color as the background"). The tint panel below
       stays for every bare-total caller. The info button is the one control,
       parked in the corner. */
    return (
      <>
        <div className={`relative pb-2 pt-3 ${className}`}>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="How Plate Points work"
            className="absolute -right-2 -top-1 flex h-11 w-11 items-center justify-center rounded-full text-pm-grey-text transition-colors hover:bg-pm-grey-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <InfoIcon className="h-3.5 w-3.5" />
          </button>
          <RankRing points={points} size={116} />
        </div>
        {infoOpen && <PointsInfoModal onClose={() => setInfoOpen(false)} />}
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
