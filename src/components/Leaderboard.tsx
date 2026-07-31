"use client";

import { useEffect, useState } from "react";
import { initials, avatarPalette } from "@/lib/format";
import { PlateStarIcon, StarIcon } from "@/components/icons";

type LeaderboardEntry = {
  id: string;
  name: string;
  avatarUrl?: string;
  monthlyPoints: number;
  isDemo?: boolean;
};

const DEMO_ENTRIES: LeaderboardEntry[] = [
  { id: "demo-1", name: "Diego Alvarez", monthlyPoints: 340, isDemo: true },
  { id: "demo-2", name: "Jordan Ellis", monthlyPoints: 285, isDemo: true },
  { id: "demo-3", name: "Priya Nair", monthlyPoints: 210, isDemo: true },
  { id: "demo-4", name: "Maya R.", monthlyPoints: 150, isDemo: true },
  { id: "demo-5", name: "Chris P.", monthlyPoints: 95, isDemo: true },
  { id: "demo-6", name: "Taylor B.", monthlyPoints: 60, isDemo: true },
  { id: "demo-7", name: "Sam K.", monthlyPoints: 40, isDemo: true },
];

const MEDALS = [
  {
    row: "trending-glow border-2 border-amber-400 bg-amber-50",
    badge: "bg-amber-400 text-amber-900",
    points: "text-amber-700",
    avatarSize: "h-10 w-10 text-sm",
  },
  {
    row: "border-2 border-zinc-300 bg-zinc-50",
    badge: "bg-zinc-300 text-zinc-800",
    points: "text-zinc-700",
    avatarSize: "h-9 w-9 text-sm",
  },
  {
    row: "border-2 border-[#c98a4b] bg-[#fdf1e6]",
    badge: "bg-[#c98a4b] text-white",
    points: "text-[#8a5a26]",
    avatarSize: "h-9 w-9 text-sm",
  },
];

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((res) => res.json())
      .then((data) => setEntries(data.leaderboard));
  }, []);

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long" });
  const ranked = [...entries, ...DEMO_ENTRIES]
    .sort((a, b) => b.monthlyPoints - a.monthlyPoints)
    .slice(0, 8);

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

        <div className="flex flex-col gap-2">
          {ranked.map((entry, i) => {
            const medal = MEDALS[i];
            const palette = avatarPalette(entry.name);

            return (
              <div
                key={entry.id}
                className={
                  medal
                    ? `flex items-center gap-2 rounded-lg p-2 ${medal.row}`
                    : "flex items-center gap-2 rounded-lg p-2"
                }
              >
                <span
                  className={
                    medal
                      ? `flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${medal.badge}`
                      : "w-5 shrink-0 text-center text-xs font-bold text-pm-orange-text"
                  }
                >
                  {i + 1}
                </span>

                {entry.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.avatarUrl}
                    alt=""
                    className={`shrink-0 rounded-full object-cover ${medal ? medal.avatarSize : "h-8 w-8"}`}
                  />
                ) : (
                  <div
                    className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${palette.avatarBg} ${
                      medal ? medal.avatarSize : "h-8 w-8 text-xs"
                    }`}
                  >
                    {initials(entry.name)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-medium">
                    {entry.name}
                    {i === 0 && <StarIcon className="h-3 w-3 shrink-0 text-amber-500" />}
                  </p>
                  {entry.isDemo && (
                    <span className="text-xs text-zinc-400">Example</span>
                  )}
                </div>

                <span
                  className={`shrink-0 text-sm font-bold ${medal ? medal.points : "text-pm-orange-text"}`}
                >
                  {entry.monthlyPoints}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
