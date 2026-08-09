"use client";

import { useState } from "react";
import { ArrowUpIcon, ArrowDownIcon } from "@/components/icons";

/**
 * The vertical up/score/down column down the left edge of every post — the
 * shape a community feed is read by. Score is net (up minus down) so a
 * divisive plate reads differently from an ignored one.
 */
export function VoteRail({
  upvotes,
  downvotes,
  myVote,
  canVote,
  onVote,
  onRequireSignIn,
}: {
  upvotes: number;
  downvotes: number;
  /** true = up, false = down, null = neither. */
  myVote: boolean | null;
  canVote: boolean;
  onVote: (vote: boolean) => void;
  onRequireSignIn: () => void;
}) {
  const [kick, setKick] = useState<boolean | null>(null);
  const score = upvotes - downvotes;

  function press(vote: boolean) {
    if (!canVote) {
      onRequireSignIn();
      return;
    }
    setKick(vote);
    setTimeout(() => setKick(null), 420);
    onVote(vote);
  }

  const button = (vote: boolean) => {
    const active = myVote === vote;
    const Icon = vote ? ArrowUpIcon : ArrowDownIcon;
    return (
      <button
        type="button"
        onClick={() => press(vote)}
        aria-pressed={active}
        aria-label={vote ? "Would eat this" : "Would not eat this"}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:scale-110 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          active
            ? vote
              ? "bg-emerald-50 text-emerald-600"
              : "bg-zinc-100 text-zinc-700"
            : "text-zinc-300 hover:text-zinc-500"
        }`}
      >
        <Icon
          className={`h-[18px] w-[18px] ${
            kick === vote ? (vote ? "thumb-slam" : "thumb-slam-down") : ""
          }`}
        />
      </button>
    );
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
      {button(true)}
      <span
        className={`min-w-[2ch] text-center text-sm font-bold tabular-nums ${
          myVote === true
            ? "text-emerald-600"
            : myVote === false
              ? "text-zinc-500"
              : score > 0
                ? "text-zinc-700"
                : "text-zinc-400"
        }`}
      >
        {score}
      </span>
      {button(false)}
    </div>
  );
}
