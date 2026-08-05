"use client";

import { useState } from "react";
import { ThumbUpIcon, ThumbDownIcon } from "@/components/icons";

const SPARK_ANGLES = [0, 60, 120, 180, 240, 300];

/** Sparks thrown from the pressed button; purely decorative. */
function Sparks({ tone }: { tone: string }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {SPARK_ANGLES.map((angle) => (
        <span
          key={angle}
          className={`spark absolute h-1.5 w-1.5 rounded-full ${tone}`}
          style={{ ["--angle" as string]: `${angle}deg` }}
        />
      ))}
    </span>
  );
}

/**
 * "Would you eat this?" — a yes/no verdict that sits between the photo and
 * the action row.
 *
 * Before voting it's a question with two buttons; after voting it becomes a
 * result bar. Both states stay mounted in the same block so the card height
 * doesn't jump when someone answers.
 */
export function WouldYouEat({
  yes,
  no,
  myVote,
  canVote,
  pointsEarned,
  onVote,
  onRequireSignIn,
}: {
  yes: number;
  no: number;
  myVote: boolean | null;
  canVote: boolean;
  /** Set briefly after a first vote so the +1 can be celebrated inline. */
  pointsEarned: number | null;
  onVote: (vote: boolean) => void;
  onRequireSignIn: () => void;
}) {
  const [burst, setBurst] = useState<boolean | null>(null);

  const total = yes + no;
  const yesPct = total === 0 ? 0 : Math.round((yes / total) * 100);
  const voted = myVote !== null;

  function press(vote: boolean) {
    if (!canVote) {
      onRequireSignIn();
      return;
    }
    setBurst(vote);
    setTimeout(() => setBurst(null), 620);
    onVote(vote);
  }

  const button = (vote: boolean) => {
    const active = myVote === vote;
    const Icon = vote ? ThumbUpIcon : ThumbDownIcon;
    const tone = vote
      ? "bg-emerald-600 text-white ring-emerald-600"
      : "bg-pm-charcoal text-white ring-pm-charcoal";
    const idle = vote
      ? "bg-white text-emerald-700 ring-emerald-200 hover:bg-emerald-50"
      : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50";

    return (
      <button
        type="button"
        onClick={() => press(vote)}
        aria-pressed={active}
        aria-label={vote ? "Yes, I'd eat this" : "No, I wouldn't eat this"}
        className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 overflow-visible rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-all duration-200 hover:-translate-y-0.5 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          active ? tone : idle
        }`}
      >
        {burst === vote && (
          <>
            <span
              className={`verdict-ring pointer-events-none absolute inset-0 rounded-full ring-2 ${
                vote ? "ring-emerald-400" : "ring-pm-orange"
              }`}
            />
            <Sparks tone={vote ? "bg-emerald-400" : "bg-pm-orange"} />
          </>
        )}
        <Icon
          className={`h-[18px] w-[18px] ${
            burst === vote ? (vote ? "thumb-slam" : "thumb-slam-down") : ""
          }`}
        />
        {vote ? "Yes" : "Nope"}
      </button>
    );
  };

  return (
    <div className="mx-3 mb-1 mt-3 rounded-2xl bg-gradient-to-br from-pm-grey-tint/70 to-pm-orange-tint/40 p-3 ring-1 ring-inset ring-zinc-200/70">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <p className="font-display text-sm font-semibold text-zinc-900">
          {voted ? "The verdict" : "Would you eat this?"}
        </p>
        {pointsEarned ? (
          <span className="points-float text-[11px] font-bold text-pm-orange-text">
            +{pointsEarned} PM Point
          </span>
        ) : (
          total > 0 && (
            <span className="text-[11px] text-zinc-500">
              {total} {total === 1 ? "vote" : "votes"}
            </span>
          )
        )}
      </div>

      <div className="flex gap-2">
        {button(true)}
        {button(false)}
      </div>

      {voted && total > 0 && (
        <div className="result-in mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-zinc-200">
            <div
              className="bar-grow h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${yesPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-zinc-600">
            <span className="font-bold text-emerald-700">{yesPct}%</span> would eat this
            {yesPct >= 80 && total >= 3 && (
              <span className="ml-1 font-medium text-pm-orange-text">· crowd favourite</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
