"use client";

import { useEffect, useState, type ReactNode } from "react";
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

/** Menu-card kicker under the title, so the window is legible at a glance. */
const SERVICE: Record<LeaderboardWindow, string> = {
  today: "Today's service",
  week: "This week's service",
  month: "This month's service",
  all: "All time",
};

/** Hairline rule with an optional centred ornament, as a menu sets sections. */
function Rule({ children, tone = "muted" }: { children?: ReactNode; tone?: "muted" | "warm" }) {
  const line = tone === "warm" ? "bg-pm-orange-border/70" : "bg-zinc-200";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-px flex-1 ${line}`} aria-hidden="true" />
      {children}
      <span className={`h-px flex-1 ${line}`} aria-hidden="true" />
    </div>
  );
}

function Course({ label }: { label: string }) {
  return (
    <div className="px-2 pb-1 pt-3">
      <Rule>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          {label}
        </span>
      </Rule>
    </div>
  );
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

  // Two courses: the plated top three, then everyone else as a straight list.
  const chefsTable = entries?.filter((e) => e.rank <= 3) ?? [];
  const theLine = entries?.filter((e) => e.rank > 3) ?? [];

  return (
    <section
      aria-labelledby="leaderboard-heading"
      /* Double border — the outer ring plus the inset one read as the printed
         rule around a menu card. */
      className="overflow-hidden rounded-2xl border-2 border-pm-orange-border/50 bg-gradient-to-b from-orange-50/80 via-white to-white p-1 shadow-sm"
    >
      <div className="rounded-xl border border-pm-orange-border/40">
        <header className="px-4 pb-3 pt-4 text-center">
          <Rule tone="warm">
            {/* Fork and knife as the header ornament. */}
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 text-pm-orange"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 3v6a2 2 0 0 0 2 2v10" />
              <path d="M8 3v8M6 3v8" />
              <path d="M18 3c-1.4 0-2.5 1.7-2.5 3.8S16.6 11 18 11v10" />
            </svg>
          </Rule>

          <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-pm-orange-text/75">
            {SERVICE[window]}
          </p>
          <h2
            id="leaderboard-heading"
            className="font-display mt-0.5 text-xl font-semibold tracking-[0.02em] text-zinc-900"
          >
            Top Eaters
          </h2>
          <p className="mt-0.5 text-[11px] italic text-zinc-500">
            Served daily, ranked by PM Points
          </p>
        </header>

        <div
          role="tablist"
          aria-label="Leaderboard period"
          className="flex gap-1 border-y border-dashed border-pm-orange-border/50 px-3 py-2"
        >
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              role="tab"
              aria-selected={window === w.value}
              onClick={() => setWindow(w.value)}
              className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                window === w.value
                  ? "bg-pm-charcoal text-white"
                  : "text-zinc-500 hover:bg-white hover:text-zinc-800"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="px-2 pb-2">
          {entries === null ? (
            <div className="pt-2">
              <LeaderboardSkeleton />
            </div>
          ) : failed ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm italic text-zinc-500">The kitchen didn&apos;t answer.</p>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="mt-2 min-h-11 rounded-full px-3 text-sm font-medium text-pm-orange-text transition-colors hover:bg-pm-orange-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Try again
              </button>
            </div>
          ) : entries.length === 0 ? (
            <p className="px-3 py-7 text-center text-sm italic leading-relaxed text-zinc-500">
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
          <div className="border-t border-dashed border-pm-orange-border/70 bg-orange-50/50 px-4 py-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-pm-orange-text/75">
              Your table
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-zinc-500">Your seat</span>
              <span
                className="mb-1 h-px flex-1 border-b border-dotted border-zinc-300"
                aria-hidden="true"
              />
              <span className="font-display text-sm font-semibold tabular-nums text-zinc-900">
                {you.rank ? `#${you.rank}` : "Unranked"}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xs text-zinc-500">Your points</span>
              <span
                className="mb-1 h-px flex-1 border-b border-dotted border-zinc-300"
                aria-hidden="true"
              />
              <span className="text-sm font-bold tabular-nums text-pm-orange-text">
                {formatPoints(you.points)}
              </span>
            </div>
            {you.pointsToNext !== null && you.pointsToNext > 0 && (
              <p className="mt-2 text-[11px] italic leading-relaxed text-zinc-500">
                {formatPoints(you.pointsToNext)} more to take the next seat.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 border-t border-pm-orange-border/30 px-4 py-2">
          <p className="text-[10px] italic text-zinc-400">
            Points settle overnight · no substitutions
          </p>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="How PM Points work"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white hover:text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <InfoIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {infoOpen && <PointsInfoModal onClose={() => setInfoOpen(false)} />}
    </section>
  );
}
