"use client";

import { useEffect, useState } from "react";
import { LeaderboardRow } from "./LeaderboardRow";
import { LeaderboardSkeleton } from "./FeedSkeleton";
import { PointsInfoModal } from "./PointsInfoModal";
import { TrophyIcon, InfoIcon } from "@/components/icons";
import { formatPoints } from "@/lib/points";
import type { LeaderboardEntry, LeaderboardWindow, UserRank } from "./types";

const WINDOWS: ReadonlyArray<{ value: LeaderboardWindow; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All time" },
];

export function Leaderboard({
  currentUserId,
  /** Bumped by the page after any points-earning action, to refetch. */
  refreshKey = 0,
}: {
  currentUserId: string | null;
  refreshKey?: number;
}) {
  const [window, setWindow] = useState<LeaderboardWindow>("week");
  const [infoOpen, setInfoOpen] = useState(false);
  // The loaded window is stored alongside the rows so "still loading" is
  // derived from a window mismatch rather than an extra setState in an effect.
  const [data, setData] = useState<{
    window: LeaderboardWindow;
    entries: LeaderboardEntry[];
    you: UserRank | null;
    failed: boolean;
  } | null>(null);

  /** Bumped by "Try again" to re-run the fetch effect. */
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leaderboard?window=${window}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("request failed"))))
      .then((json) => {
        if (cancelled) return;
        setData({ window, entries: json.leaderboard, you: json.you, failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        setData({ window, entries: [], you: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [window, refreshKey, retryKey]);

  const loading = !data || data.window !== window;
  const entries = loading ? null : data.entries;
  const you = loading ? null : data.you;
  const failed = !loading && data.failed;

  // Only surface the "your rank" strip when the user isn't already visible in
  // the list above it.
  const inTopList = entries?.some((e) => e.id === currentUserId) ?? false;

  return (
    <section
      aria-labelledby="leaderboard-heading"
      className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pm-orange-tint text-pm-orange-text">
          <TrophyIcon className="h-4 w-4" />
        </span>
        <h2
          id="leaderboard-heading"
          className="font-display flex-1 text-sm font-semibold text-zinc-900"
        >
          Top eaters
        </h2>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="How PM Points work"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <InfoIcon className="h-4 w-4" />
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Leaderboard period"
        className="flex gap-1 border-b border-zinc-100 px-3 py-2"
      >
        {WINDOWS.map((w) => (
          <button
            key={w.value}
            role="tab"
            aria-selected={window === w.value}
            onClick={() => setWindow(w.value)}
            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
              window === w.value
                ? "bg-pm-charcoal text-white"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="px-2 py-2">
        {entries === null ? (
          <LeaderboardSkeleton />
        ) : failed ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-zinc-500">Couldn&apos;t load the leaderboard.</p>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="mt-2 min-h-11 rounded-full px-3 text-sm font-medium text-pm-orange-text transition-colors hover:bg-pm-orange-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Try again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500">
            No points scored{window === "today" ? " today" : " in this window"} yet. Post a
            plate and take the top spot.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {entries.map((entry) => (
              <LeaderboardRow
                key={entry.id}
                entry={entry}
                isCurrentUser={entry.id === currentUserId}
              />
            ))}
          </ul>
        )}
      </div>

      {you && currentUserId && !inTopList && (
        <div className="border-t border-zinc-100 bg-pm-grey-tint/40 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-zinc-500">Your rank</span>
            <span className="font-display text-sm font-semibold text-zinc-900">
              {you.rank ? `#${you.rank}` : "Unranked"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-xs text-zinc-500">Your points</span>
            <span className="text-sm font-medium text-pm-orange-text">
              {formatPoints(you.points)}
            </span>
          </div>
          {you.pointsToNext !== null && you.pointsToNext > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              <span className="font-semibold text-zinc-700">
                {formatPoints(you.pointsToNext)}
              </span>{" "}
              more to pass the next spot.
            </p>
          )}
        </div>
      )}

      {infoOpen && <PointsInfoModal onClose={() => setInfoOpen(false)} />}
    </section>
  );
}
