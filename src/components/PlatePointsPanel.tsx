"use client";

import { useState } from "react";
import { PlateStarIcon, InfoIcon } from "@/components/icons";
import { PointsInfoModal } from "@/components/feed/PointsInfoModal";
import { POINT_RULES, formatPoints } from "@/lib/points";
import { RankInsignia } from "@/components/RankInsignia";
import { RANKS, rankFor } from "@/lib/ranks";

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
   * Renders the rung you are on under the rules row: your crest, your title,
   * a track toward the next rung and how far is left, with the rung you are
   * climbing toward dimmed at the end.
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

  /* Rank reads lifetime points, and `points` here is exactly that — nothing
     in the app ever subtracts from users.points (see lib/ranks.ts). */
  const rank = rankFor(points);
  const next = RANKS[RANKS.findIndex((r) => r.key === rank.key) + 1] ?? null;
  const trackPct = next
    ? Math.max(
        0,
        Math.min(
          100,
          ((points - rank.minPoints) / (next.minPoints - rank.minPoints)) * 100
        )
      )
    : 100;

  /* No "post" row — publishing pays 0 now, and a "+0 post" chip in a row of
     rewards reads as a penalty rather than as "points come from what a post
     earns". The two that remain are both other-people-acted rules, which is
     the whole shape of the economy. See lib/points.ts. */
  const rules = [
    { label: "upvote", value: POINT_RULES.receiveUpvote },
    { label: "comment", value: POINT_RULES.receiveComment },
  ];

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

        {/* The ladder: what the total has earned and how far the next title
            is. The track fill is the accent as a FILL, which the color rules
            allow; both small strings are --pm-orange-text (4.55:1 on this
            tint). At the top rung the right label states the fact instead of
            counting to a rung that doesn't exist. */}
        {showRank && (
          <div className="mt-3 flex items-center gap-3">
            {/* Both crests are decorative here and hidden from assistive tech:
                the component labels itself "<title> rank", and the title is
                already written beside it — announcing both reads "Local rank,
                Local".

                `showCard` is on because this panel is the case the plaque was
                built for. Without it the crest is cutlery in --pm-grey-text
                over a --pm-grey-tint plate ring, and both of those sit within
                a couple of points of --pm-orange-tint — measured on screen,
                the mark all but vanished. The white plaque is the component's
                own answer to a non-white ground, not a box drawn for
                grouping. */}
            <span aria-hidden="true" className="shrink-0">
              <RankInsignia rank={rank.key} size={46} showCard />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-pm-orange-text">
                <span>{rank.title}</span>
                <span className="tabular-nums">
                  {next
                    ? `${formatPoints(next.minPoints - points)} to ${next.title}`
                    : "Top of the ladder"}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/60">
                <div
                  className="h-full rounded-full bg-pm-orange transition-[width] duration-700 ease-out"
                  style={{ width: `${trackPct}%` }}
                />
              </div>
            </div>

            {/* The rung being climbed toward, dimmed because it is not yours
                yet. Absent at the top of the ladder rather than shown as an
                empty slot — there is nothing above Institution to aim at. */}
            {next && (
              <span aria-hidden="true" className="shrink-0">
                <RankInsignia rank={next.key} size={32} showCard className="opacity-45" />
              </span>
            )}
          </div>
        )}
      </div>

      {infoOpen && <PointsInfoModal onClose={() => setInfoOpen(false)} />}
    </>
  );
}
