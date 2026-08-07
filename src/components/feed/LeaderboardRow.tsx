"use client";

import { PlateStarIcon } from "@/components/icons";
import { initials, avatarPalette } from "@/lib/format";
import { formatPoints } from "@/lib/points";
import type { LeaderboardEntry } from "./types";

/**
 * Top three are plated on metal and get a kitchen title; everyone below is a
 * plain numeral. The rim colours stay muted — a full metallic gradient next
 * to the warm paper reads as costume jewellery.
 */
const STATIONS: Record<number, { rim: string; plate: string; title: string }> = {
  1: {
    rim: "ring-amber-300",
    plate: "bg-gradient-to-br from-amber-50 to-amber-200 text-amber-900",
    title: "Head chef",
  },
  2: {
    rim: "ring-zinc-300",
    plate: "bg-gradient-to-br from-zinc-50 to-zinc-200 text-zinc-700",
    title: "Sous chef",
  },
  3: {
    rim: "ring-orange-300",
    plate: "bg-gradient-to-br from-orange-50 to-orange-200 text-orange-900",
    title: "Line cook",
  },
};

/** Rank rendered as a plate: outer rim, inner well, number in the middle. */
function PlateRank({ rank }: { rank: number }) {
  const station = STATIONS[rank];
  if (!station) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-300 text-xs font-semibold text-zinc-400">
        {rank}
      </span>
    );
  }
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 ring-offset-1 ring-offset-transparent ${station.rim} ${station.plate} text-xs font-bold shadow-sm`}
    >
      {rank}
    </span>
  );
}

function RankDelta({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-[10px] font-medium text-zinc-400">new</span>;
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
  const station = STATIONS[entry.rank];
  const palette = avatarPalette(entry.name);
  const plates = `${entry.postCount} ${entry.postCount === 1 ? "plate" : "plates"}`;

  return (
    <li
      className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors ${
        isCurrentUser ? "bg-pm-orange-tint/60 ring-1 ring-inset ring-pm-orange-border" : ""
      } ${entry.rankChange !== null && entry.rankChange > 0 ? "animate-rank-rise" : ""}`}
    >
      <PlateRank rank={entry.rank} />

      {entry.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.avatarUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white"
        />
      ) : (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${palette.avatarBg} text-xs font-semibold text-white ring-2 ring-white`}
        >
          {initials(entry.name)}
        </span>
      )}

      {/* Menu-style layout: name on the left, points on the right, dotted
          leader running between them the way a printed menu sets a price. */}
      <div className="flex min-w-0 flex-1 items-end gap-1.5">
        <span className="min-w-0">
          <span className="font-display block truncate text-sm font-semibold text-zinc-900">
            {entry.name}
            {isCurrentUser && <span className="ml-1 text-xs text-pm-orange-text">(you)</span>}
          </span>
          <span className="block truncate text-[11px] text-zinc-500">
            {station ? `${station.title} · ${plates}` : plates}
          </span>
        </span>
        <span
          className="mb-[7px] h-px flex-1 border-b border-dotted border-zinc-300"
          aria-hidden="true"
        />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="flex items-center gap-1 whitespace-nowrap text-sm font-bold text-pm-orange-text">
          <PlateStarIcon className="h-3.5 w-[18px]" />
          {formatPoints(entry.points)}
          <span className="sr-only"> PM Points</span>
        </span>
        <RankDelta change={entry.rankChange} />
      </div>
    </li>
  );
}
