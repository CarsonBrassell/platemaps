"use client";

import { initials, avatarPalette } from "@/lib/format";
import { formatPoints } from "@/lib/points";
import type { LeaderboardEntry } from "./types";

/** Kitchen titles for the top three; everyone below is just a number. */
const STATIONS: Record<number, string> = {
  1: "Head chef",
  2: "Sous chef",
  3: "Line cook",
};

/** Rank as a machine value: mono numeral, tan coin for the podium. */
function Rank({ rank }: { rank: number }) {
  if (!STATIONS[rank]) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center font-mono text-xs tabular-nums text-zinc-500">
        {rank}
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-xs font-semibold tabular-nums text-zinc-900">
      {rank}
    </span>
  );
}

function RankDelta({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="font-mono text-[10px] text-zinc-500">new</span>;
  }
  if (change === 0) {
    return (
      <span className="font-mono text-[10px] text-zinc-400" aria-label="No change in rank">
        —
      </span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={`font-mono text-[10px] font-medium tabular-nums ${
        up ? "text-emerald-700" : "text-zinc-500"
      }`}
      aria-label={`${up ? "Up" : "Down"} ${Math.abs(change)} ${
        Math.abs(change) === 1 ? "place" : "places"
      }`}
    >
      {up ? "▲" : "▽"} {Math.abs(change)}
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
        isCurrentUser ? "bg-pm-orange-tint/60" : ""
      } ${entry.rankChange !== null && entry.rankChange > 0 ? "animate-rank-rise" : ""}`}
    >
      <Rank rank={entry.rank} />

      {entry.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.avatarUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${palette.avatarBg} font-mono text-xs font-semibold text-white`}
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
            {isCurrentUser && <span className="ml-1 font-mono text-xs text-zinc-600">(you)</span>}
          </span>
          <span className="block truncate font-mono text-[11px] text-zinc-500">
            {station ? `${station} · ${plates}` : plates}
          </span>
        </span>
        <span
          className="mb-[7px] h-px flex-1 border-b border-dotted border-zinc-300"
          aria-hidden="true"
        />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-zinc-900">
          {formatPoints(entry.points)}
          <span className="sr-only"> PM Points</span>
        </span>
        <RankDelta change={entry.rankChange} />
      </div>
    </li>
  );
}
