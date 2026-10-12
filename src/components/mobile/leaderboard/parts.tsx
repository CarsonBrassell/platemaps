import type { CSSProperties } from "react";
import { avatarPalette, initials } from "@/lib/format";
import { firstName } from "@/lib/friendRivals";
import { POINT_RULES } from "@/lib/points";
import { nextRankFor, rankFor } from "@/lib/ranks";
import type { Seat } from "./types";

/**
 * Plates it takes to go strictly ahead of someone `gap` points up — a tie is
 * a catch, not a pass, hence the +1. Same arithmetic as `computeFriendRivals`
 * (lib/friendRivals.ts), so the toast after posting and this board agree.
 */
export function platesToPass(gap: number) {
  return Math.max(1, Math.ceil((Math.max(0, gap) + 1) / POINT_RULES.createPost));
}

export function plates(n: number) {
  return n === 1 ? "1 plate" : `${n} plates`;
}

/** How a seat is named in a sentence. */
export function who(seat: Seat, capital = false) {
  if (seat.isYou) return capital ? "You" : "you";
  return firstName(seat.entry.name);
}

export function Avatar({
  entry,
  size,
  className = "",
}: {
  entry: { name: string; avatarUrl?: string };
  size: number;
  className?: string;
}) {
  const style: CSSProperties = { width: size, height: size };
  return entry.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={entry.avatarUrl}
      alt=""
      style={style}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  ) : (
    <span
      style={{ ...style, fontSize: Math.round(size * 0.34) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-mono font-medium text-white ${avatarPalette(entry.name).avatarBg} ${className}`}
    >
      {initials(entry.name)}
    </span>
  );
}

export function Crown({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 22" aria-hidden="true" className={className}>
      <path
        d="M2 6.5 9 12 16 2l7 10 7-5.5L27.5 20h-23Z"
        fill="var(--pm-orange)"
        stroke="var(--pm-charcoal)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="2.6" r="2" fill="var(--pm-charcoal)" />
      <circle cx="2.4" cy="6.4" r="1.7" fill="var(--pm-charcoal)" />
      <circle cx="29.6" cy="6.4" r="1.7" fill="var(--pm-charcoal)" />
    </svg>
  );
}

const SPARK_COLORS = [
  "var(--pm-orange)",
  "var(--pm-charcoal)",
  "var(--pm-orange-border)",
  "var(--pm-orange-text)",
];

/**
 * A one-shot burst of confetti from the centre of its positioned parent.
 * Angles and distances come from the index, not Math.random, so render stays
 * pure and every burst looks the same — which is fine, nobody sees two at once.
 */
export function Sparks({ count = 18, spread = 70, delay = 0 }: { count?: number; spread?: number; delay?: number }) {
  return (
    <span aria-hidden="true" className="lb-sparks">
      {Array.from({ length: count }, (_, i) => {
        const angle = (360 / count) * i + (i % 2 ? 9 : -6);
        const distance = spread * (0.6 + ((i * 37) % 10) / 22);
        return (
          <span
            key={i}
            className={`lb-spark ${i % 3 === 0 ? "lb-spark-dot" : ""}`}
            style={
              {
                "--lb-a": `${angle}deg`,
                "--lb-d": `${distance}px`,
                "--lb-r": `${(i % 2 ? 1 : -1) * (180 + i * 25)}deg`,
                "--lb-delay": `${delay + (i % 4) * 30}ms`,
                background: SPARK_COLORS[i % SPARK_COLORS.length],
              } as CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

/** Title chip plus a track toward the next title on the `ranks.ts` ladder. */
export function RankProgress({ points }: { points: number }) {
  const rank = rankFor(points);
  const next = nextRankFor(points);
  const progress = next ? (points - rank.minPoints) / (next.minPoints - rank.minPoints) : 1;
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 rounded-full bg-pm-grey-tint px-2 py-px font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-pm-grey-text">
        {rank.title}
      </span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-pm-grey-tint" aria-hidden="true">
        <span
          className="lb-bar absolute inset-0 rounded-full bg-pm-orange"
          style={{ "--lb-scale": Math.max(0.04, Math.min(1, progress)) } as CSSProperties}
        />
      </span>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
        {next ? `${(next.minPoints - points).toLocaleString("en-US")} PP to ${next.title}` : "Top rung"}
      </span>
    </div>
  );
}
