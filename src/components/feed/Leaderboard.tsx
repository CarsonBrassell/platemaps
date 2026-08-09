"use client";

import { useEffect, useState } from "react";
import { LeaderboardRow } from "./LeaderboardRow";
import { LeaderboardSkeleton } from "./FeedSkeleton";
import { PointsInfoModal } from "./PointsInfoModal";
import { InfoIcon } from "@/components/icons";
import { formatPoints } from "@/lib/points";
import type { LeaderboardEntry, LeaderboardWindow, UserRank } from "./types";

const WINDOWS: ReadonlyArray<{ value: LeaderboardWindow; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All time" },
];

/** Small mono course label, in the system's one label style. */
function Course({ label }: { label: string }) {
  return <p className="mono-label px-2 pb-1 pt-3 text-zinc-500">{label}</p>;
}

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

  // Only surface the "your table" strip when the user isn't already seated in
  // the list above it.
  const inTopList = entries?.some((e) => e.id === currentUserId) ?? false;

  // Two courses: the top three, then everyone else as a straight list.
  const chefsTable = entries?.filter((e) => e.rank <= 3) ?? [];
  const theLine = entries?.filter((e) => e.rank > 3) ?? [];

  return (
    <section
      aria-labelledby="leaderboard-heading"
      className="overflow-hidden rounded-2xl bg-white"
    >
      <header className="px-4 pb-2 pt-4">
        <p className="mono-label text-zinc-500">Leaderboard</p>
        <h2
          id="leaderboard-heading"
          className="font-display mt-1 text-xl font-semibold text-zinc-900"
        >
          Top Eaters
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">Served daily, ranked by PM Points</p>
      </header>

      {/* A segmented filter on a tan track — same rank as the map's source
          switch, one rank below a screen's own pill tabs. */}
      <div className="px-3 py-2">
        <div
          role="tablist"
          aria-label="Leaderboard period"
          className="flex rounded-full bg-pm-grey-tint p-1"
        >
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              role="tab"
              aria-selected={window === w.value}
              onClick={() => setWindow(w.value)}
              className={`min-h-8 flex-1 whitespace-nowrap rounded-full px-2 font-mono text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                window === w.value
                  ? "bg-white text-zinc-900"
                  : "text-pm-grey-text hover:text-zinc-900"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pb-2">
        {entries === null ? (
          <div className="pt-2">
            <LeaderboardSkeleton />
          </div>
        ) : failed ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-zinc-500">The kitchen didn&apos;t answer.</p>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="mt-2 min-h-11 rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-pm-grey-text transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Try again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="px-3 py-7 text-center text-sm leading-relaxed text-zinc-500">
            Kitchen&apos;s quiet{window === "today" ? " today" : ""}.
            <br />
            Post a plate and take the pass.
          </p>
        ) : (
          <>
            {chefsTable.length > 0 && (
              <>
                <Course label="Chef's table" />
                <ul className="flex flex-col gap-0.5">
                  {chefsTable.map((entry) => (
                    <LeaderboardRow
                      key={entry.id}
                      entry={entry}
                      isCurrentUser={entry.id === currentUserId}
                    />
                  ))}
                </ul>
              </>
            )}

            {theLine.length > 0 && (
              <>
                <Course label="The line" />
                <ul className="flex flex-col gap-0.5">
                  {theLine.map((entry) => (
                    <LeaderboardRow
                      key={entry.id}
                      entry={entry}
                      isCurrentUser={entry.id === currentUserId}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {you && currentUserId && !inTopList && (
        <div className="mx-2 mb-2 rounded-xl bg-pm-grey-tint/50 px-3 py-3">
          <p className="mono-label mb-1.5 text-zinc-500">Your table</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-zinc-500">Your seat</span>
            <span
              className="mb-1 h-px flex-1 border-b border-dotted border-zinc-300"
              aria-hidden="true"
            />
            <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
              {you.rank ? `#${you.rank}` : "Unranked"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xs text-zinc-500">Your points</span>
            <span
              className="mb-1 h-px flex-1 border-b border-dotted border-zinc-300"
              aria-hidden="true"
            />
            <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
              {formatPoints(you.points)}
            </span>
          </div>
          {you.pointsToNext !== null && you.pointsToNext > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              {formatPoints(you.pointsToNext)} more to take the next seat.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 px-4 pb-3 pt-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          Points settle overnight · no substitutions
        </p>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="How PM Points work"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-pm-grey-tint hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <InfoIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {infoOpen && <PointsInfoModal onClose={() => setInfoOpen(false)} />}
    </section>
  );
}
