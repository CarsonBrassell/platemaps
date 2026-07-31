"use client";

import { useEffect, useState } from "react";
import { initials } from "@/lib/format";
import { PlateStarIcon } from "@/components/icons";

type LeaderboardEntry = {
  id: string;
  name: string;
  avatarUrl?: string;
  monthlyPoints: number;
};

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((res) => res.json())
      .then((data) => setEntries(data.leaderboard));
  }, []);

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="w-56 shrink-0">
      <div className="sticky top-6 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <PlateStarIcon className="h-6 w-8 text-pm-orange" />
          <div>
            <p className="text-sm font-bold text-pm-orange-text">PM Leaderboard</p>
            <p className="text-xs text-zinc-500">{monthLabel}</p>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No PM Points earned yet this month — post, like, or comment on the Feed to
            claim the top spot.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                className={
                  i === 0
                    ? "trending-glow flex items-center gap-2 rounded-lg border-2 border-pm-orange p-2"
                    : "flex items-center gap-2 rounded-lg p-2"
                }
              >
                <span className="w-4 shrink-0 text-center text-xs font-bold text-pm-orange-text">
                  {i + 1}
                </span>
                {entry.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.avatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white">
                    {initials(entry.name)}
                  </div>
                )}
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{entry.name}</p>
                <span className="shrink-0 text-sm font-bold text-pm-orange-text">
                  {entry.monthlyPoints}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
