"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { InfoIcon } from "@/components/icons";
import { RankInsignia } from "@/components/RankInsignia";
import { formatPoints } from "@/lib/points";
import { RANKS, rankFor } from "@/lib/ranks";
import "@/components/rank/rankTracker.css";

/**
 * The owner's rank card on their own profile — "Beads" (Calvin, 2026-11-05).
 *
 * It replaced a tile carousel + pips + tick-marked level bar that Calvin
 * found too boxy and too busy. What is left: the total, your crest big in
 * the middle in a ring that fills orange toward the next rank, the rank
 * either side of it faded and running off the card's edges on an orange line
 * up to you, your title under the crest, and the distance to the next title.
 *
 * The crest row is the ladder button (`RankLadderModal`); the info button opens
 * the earn rules.
 *
 * Motion: the total counts up and the line fills on mount; new points count
 * up and float a "+N". Crossing a threshold pops the new crest, bursts dots
 * off it and shows a "Rank up" chip. `prefers-reduced-motion` gets instant
 * paints.
 */

const fmt = formatPoints;

function model(points: number) {
  const p = Math.max(0, points);
  const rank = rankFor(p);
  const index = RANKS.findIndex((r) => r.key === rank.key);
  const next = RANKS[index + 1] ?? null;
  const span = next ? next.minPoints - rank.minPoints : 1;
  const frac = next ? Math.min(1, (p - rank.minPoints) / span) : 0;
  return { rank, index, next, frac };
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

export function RankRing({
  points,
  className = "",
  onOpenLadder,
  onOpenInfo,
}: {
  points: number;
  className?: string;
  /** The ladder line opens the full ladder (`RankLadderModal`). */
  onOpenLadder?: () => void;
  /** The header info button opens the earn rules (`PointsInfoModal`). */
  onOpenInfo?: () => void;
}) {
  const now = model(points);

  const totalRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef(0);
  const countRef = useRef(0);
  const reducedRef = useRef(false);
  const lastIndexRef = useRef<number | null>(null);
  const settledRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  const [filled, setFilled] = useState(false);
  const [pop, setPop] = useState(0);
  const [rankUp, setRankUp] = useState(0);
  const [gain, setGain] = useState<{ n: number; key: number } | null>(null);

  useEffect(() => {
    reducedRef.current = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const raf = requestAnimationFrame(() => setFilled(true));
    const timers = timersRef.current;
    return () => {
      cancelAnimationFrame(raf);
      countRef.current += 1;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    // The count: from what is on screen to the new total.
    const el = totalRef.current;
    if (el) {
      const from = shownRef.current;
      const to = Math.max(0, points);
      if (reducedRef.current || from === to) {
        el.textContent = fmt(to);
        shownRef.current = to;
      } else {
        const id = ++countRef.current;
        const dur = from === 0 ? 1100 : 600;
        const t0 = performance.now();
        const frame = (t: number) => {
          if (id !== countRef.current) return;
          const k = Math.min(1, (t - t0) / dur);
          const v = Math.round(from + (to - from) * easeOut(k));
          el.textContent = fmt(v);
          shownRef.current = v;
          if (k < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }
    }

    const prevIndex = lastIndexRef.current;
    lastIndexRef.current = now.index;
    if (prevIndex === null) {
      settledRef.current = points;
      return;
    }

    // Points arriving: once the roll-call settles, float the gain once.
    const settle = window.setTimeout(() => {
      const before = settledRef.current ?? points;
      settledRef.current = points;
      if (points > before && !reducedRef.current) setGain({ n: points - before, key: Date.now() });
    }, 320);

    if (now.index > prevIndex) {
      setPop(Date.now());
      setRankUp(Date.now());
      timersRef.current.push(window.setTimeout(() => setRankUp(0), 3200));
    }
    return () => window.clearTimeout(settle);
    // `now` is derived from `points`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const { rank, index: cur, next, frac } = now;
  const prev = RANKS[cur - 1] ?? null;
  // The line runs up to your crest; your progress to the next rank is how
  // far the ring around the crest has filled. At the top rank it is full.
  const reach = prev ? "50%" : "0px";
  const ringFrac = next ? frac : 1;
  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <section
      aria-label={`Plate Points: ${fmt(points)}. ${rank.title}, level ${cur + 1} of ${RANKS.length}.`}
      className={`rounded-[28px] bg-white px-5 pb-4 pt-4 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="mono-label text-pm-orange-text">Plate Points</span>
        <span className="ml-auto flex items-baseline font-mono tabular-nums">
          {gain && (
            <span key={gain.key} aria-hidden="true" className="rk-gain mr-1.5 inline-block text-[12px] font-semibold text-pm-orange-text">
              +{fmt(gain.n)}
            </span>
          )}
          <span ref={totalRef} className="text-[20px] font-semibold leading-none text-pm-orange">
            {fmt(points)}
          </span>
          <span className="ml-1 text-[11px] text-zinc-500">PP</span>
        </span>
        {onOpenInfo && (
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="How Plate Points work"
            className="-my-3 -mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-pm-grey-text transition-colors hover:bg-pm-grey-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <InfoIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Your crest, big and centred in its progress ring; the rank either
          side of it faded and running off the card's edges, so the ladder
          reads as going on without being spelled out. */}
      <button
        type="button"
        onClick={onOpenLadder}
        aria-label={`${rank.title}, level ${cur + 1} of ${RANKS.length}. See the ladder.`}
        className="relative -mx-5 mt-1 block h-[136px] w-[calc(100%+40px)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        style={{ maskImage: "linear-gradient(to right, transparent, #000 22%, #000 78%, transparent)" }}
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-[66px] h-px -translate-y-1/2 bg-pm-grey-tint" />
        <span
          aria-hidden="true"
          className="rk-fill absolute top-[66px] h-0.5 -translate-y-1/2 rounded-full bg-pm-orange"
          style={{ left: prev ? 0 : "50%", width: filled ? reach : "0px" }}
        />
        {prev && (
          <span aria-hidden="true" className="absolute left-[12%] top-[66px] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white">
            <span className="block opacity-40">
              <RankInsignia rank={prev.key} size={64} />
            </span>
          </span>
        )}
        <span aria-hidden="true" className="absolute left-1/2 top-[66px] flex h-[112px] w-[112px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white">
          <svg viewBox="0 0 112 112" className="absolute inset-0 -rotate-90">
            <circle cx="56" cy="56" r={R} fill="none" stroke="var(--pm-grey-tint)" strokeWidth="4" />
            <circle
              cx="56"
              cy="56"
              r={R}
              fill="none"
              stroke="var(--pm-orange)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${C * (filled ? ringFrac : 0)} ${C}`}
              className="transition-[stroke-dasharray] duration-[1100ms] ease-out motion-reduce:transition-none"
            />
          </svg>
          <RankInsignia key={pop} rank={rank.key} size={108} pop={pop > 0} />
          {rankUp > 0 && <Burst key={rankUp} />}
        </span>
        {next && (
          <span aria-hidden="true" className="absolute left-[88%] top-[66px] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white">
            <span className="block opacity-40">
              <RankInsignia rank={next.key} size={64} />
            </span>
          </span>
        )}
      </button>

      <div className="flex flex-col items-center">
        <span className="font-display text-[24px] font-semibold leading-none text-zinc-900">{rank.title}</span>
        {rankUp > 0 && (
          <span key={rankUp} className="rk-chip mt-1.5 rounded-full bg-pm-orange px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F7F4EC]">
            Rank up
          </span>
        )}
      </div>

      <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.12em] tabular-nums text-zinc-500">
        {next ? `${fmt(next.minPoints - Math.max(0, points))} PP to ${next.title}` : "Top rank"}
      </p>
    </section>
  );
}

/** A ring of flat orange dots off the crest when a title is earned. */
function Burst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="rk-burst-dot"
          style={{ "--a": `${(i / 12) * 360}deg`, background: i % 2 ? "var(--pm-orange-text)" : "var(--pm-orange)" } as CSSProperties}
        />
      ))}
    </span>
  );
}
