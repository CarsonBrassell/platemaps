"use client";

import { PointsBadge } from "./PointsBadge";
import { initials, avatarPalette } from "@/lib/format";
import type { LeaderboardEntry } from "./types";

/** Top three get a metal treatment; everyone else gets a plain numeral. */
const MEDALS: Record<number, { ring: string; chip: string; label: string }> = {
  1: {
    ring: "ring-2 ring-amber-300",
    chip: "bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-sm",
    label: "1st place",
  },
  2: {
    ring: "ring-2 ring-zinc-300",
    chip: "bg-gradient-to-br from-zinc-300 to-zinc-400 text-white shadow-sm",
    label: "2nd place",
  },
  3: {
    ring: "ring-2 ring-orange-300",
    chip: "bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-sm",
    label: "3rd place",
  },
};

function RankDelta({ change }: { change: number | null }) {
  if (change === null) {
    return (
      <span className="text-[10px] font-medium text-zinc-400" title="New on the board">
        new
      </span>
    );
  }
  if (change === 0) {
    return (
      <span className="text-[10px] text-zinc-300" aria-label="No change in rank">
        —
      </span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-[10px] font-semibold ${
        up ? "text-emerald-600" : "text-zinc-400"
      }`}
      aria-label={`${up ? "Up" : "Down"} ${Math.abs(change)} ${
        Math.abs(change) === 1 ? "place" : "places"
      }`}
    >
      <svg
        viewBox="0 0 12 12"
        className={`h-2.5 w-2.5 ${up ? "" : "rotate-180"}`}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6 2 10 8H2z" />
      </svg>
      {Math.abs(change)}
    </span>
  );
}

export function LeaderboardRow({
  entry,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
}) {
  const medal = MEDALS[entry.rank];
  const palette = avatarPalette(entry.name);

  return (
    <li
      className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors ${
        isCurrentUser ? "bg-pm-orange-tint/60 ring-1 ring-inset ring-pm-orange-border" : ""
      } ${entry.rankChange !== null && entry.rankChange > 0 ? "animate-rank-rise" : ""}`}
    >
      <span className="w-6 shrink-0 text-center">
        {medal ? (
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${medal.chip}`}
            aria-label={medal.label}
          >
            {entry.rank}
          </span>
        ) : (
          <span className="text-xs font-semibold text-zinc-400">{entry.rank}</span>
        )}
      </span>

      {entry.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.avatarUrl}
          alt=""
          className={`h-9 w-9 shrink-0 rounded-full object-cover ${medal?.ring ?? ""}`}
        />
      ) : (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${palette.avatarBg} text-xs font-semibold text-white ${medal?.ring ?? ""}`}
        >
          {initials(entry.name)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-800">
          {entry.name}
          {isCurrentUser && <span className="ml-1 text-xs text-pm-orange-text">(you)</span>}
        </p>
        <p className="text-[11px] text-zinc-500">
          {entry.postCount} {entry.postCount === 1 ? "post" : "posts"}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <PointsBadge points={entry.points} />
        <RankDelta change={entry.rankChange} />
      </div>
    </li>
  );
}
