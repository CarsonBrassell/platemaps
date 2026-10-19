"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CheckIcon, InfoIcon } from "@/components/icons";
import { RankInsignia } from "@/components/RankInsignia";
import { POINT_RULES, formatPoints } from "@/lib/points";
import { RANKS, rankFor } from "@/lib/ranks";
import "@/components/rank/rankTracker.css";

/**
 * The owner's rank card on their own profile (Carson picked this design on
 * 2026-10-19 from five concepts: "the Collection" crossed with "the Level
 * Bar", with more detail).
 *
 * Top to bottom:
 * - **Header**: `PLATE POINTS · LV 3 OF 6` and the earn-rules info button.
 * - **The collection**: every title as a card in a swipeable, snapping row.
 *   Yours is the big tinted card in the middle (YOU tag, its rating weight,
 *   "since N PP"); earned ones carry an orange check, locked ones a 🔒 and the
 *   total they unlock at. Any card opens the full ladder.
 * - **The level bar**: this crest, a quartered bar with the points marks under
 *   it, and the next crest waiting locked on the right.
 * - **Unlock panel**: points to go, what that is in plates, comments or
 *   upvotes (from `POINT_RULES`), and the real perk of the next title — its
 *   rating weight from `lib/ranks.ts`.
 *
 * Motion: the total counts up and the bar fills on mount; new points count up,
 * float a "+N" and pulse the bar's tip. Crossing a threshold bursts dots off
 * your card, pops the new crest, shows a "Rank up" chip and scrolls the row to
 * the new card. `prefers-reduced-motion` gets instant paints.
 */

const fmt = formatPoints;

function model(points: number) {
  const p = Math.max(0, points);
  const rank = rankFor(p);
  const index = RANKS.findIndex((r) => r.key === rank.key);
  const next = RANKS[index + 1] ?? null;
  const span = next ? next.minPoints - rank.minPoints : 1;
  const pct = next ? Math.min(100, ((p - rank.minPoints) / span) * 100) : 100;
  const toGo = next ? next.minPoints - p : 0;
  return { rank, index, next, span, pct, toGo };
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
  /** Any card in the row opens the full ladder (`RankLadderModal`). */
  onOpenLadder?: () => void;
  /** The header info button opens the earn rules (`PointsInfoModal`). */
  onOpenInfo?: () => void;
}) {
  const now = model(points);

  const rowRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
  const [tipKey, setTipKey] = useState(0);

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

  /* Centre a card in the row. Instant on mount, smooth on a rank-up. */
  function centre(index: number, smooth: boolean) {
    const row = rowRef.current;
    const card = cardRefs.current[index];
    if (!row || !card) return;
    const left = card.offsetLeft - (row.clientWidth - card.offsetWidth) / 2;
    row.scrollTo({ left, behavior: smooth && !reducedRef.current ? "smooth" : "auto" });
  }

  useLayoutEffect(() => {
    centre(now.index, false);
    // Mount only: later moves are rank-ups, handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      timersRef.current.push(window.setTimeout(fn, ms));
    };

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
      if (points > before && !reducedRef.current) {
        setGain({ n: points - before, key: Date.now() });
        setTipKey(Date.now());
      }
    }, 320);

    if (now.index > prevIndex) {
      setPop(Date.now());
      setRankUp(Date.now());
      later(() => setRankUp(0), 3200);
      later(() => centre(now.index, true), 150);
    } else if (now.index < prevIndex) {
      centre(now.index, false);
    }
    return () => window.clearTimeout(settle);
    // `now` is derived from `points`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const { rank, index: cur, next, span, pct, toGo } = now;
  const plates = Math.ceil(toGo / POINT_RULES.createPost);
  const comments = Math.ceil(toGo / POINT_RULES.receiveComment);
  const upvotes = Math.ceil(toGo / POINT_RULES.receiveUpvote);
  const marks = [0, 25, 50, 75, 100];

  return (
    <section
      aria-label={`Plate Points: ${fmt(points)}. ${rank.title}, level ${cur + 1} of ${RANKS.length}.`}
      className={`rk-card rounded-2xl bg-white pb-4 pt-3.5 ${className}`}
    >
      <div className="flex items-center gap-2 px-4">
        <span className="mono-label text-pm-orange-text">Plate Points</span>
        <span aria-hidden="true" className="mono-label text-zinc-400">·</span>
        <span className="mono-label text-pm-grey-text">
          Lv {cur + 1} of {RANKS.length}
        </span>
        {onOpenInfo && (
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="How Plate Points work"
            className="-my-3 -mr-3 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-pm-grey-text transition-colors hover:bg-pm-grey-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <InfoIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* The collection. Real horizontal scroll with snap; the side padding
          lets the first and last cards reach the middle too. */}
      <div
        ref={rowRef}
        className="rk-row mt-3 flex snap-x snap-mandatory items-end gap-2.5 overflow-x-auto px-[calc(50%-98px)]"
      >
        {RANKS.map((r, i) => {
          const isCur = i === cur;
          const earned = i < cur;
          const locked = i > cur;
          return (
            <button
              key={r.key}
              ref={(node) => {
                cardRefs.current[i] = node;
              }}
              type="button"
              onClick={onOpenLadder}
              aria-label={`${r.title}: ${isCur ? "your title" : earned ? "earned" : `unlocks at ${fmt(r.minPoints)} Plate Points`}. See the ladder.`}
              style={{ animationDelay: `${Math.abs(i - cur) * 70}ms` }}
              className={`rk-tile relative flex shrink-0 snap-center flex-col items-center rounded-2xl px-2.5 pb-3 pt-3.5 transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                isCur ? "w-[196px] bg-pm-orange-tint" : earned ? "w-[104px] bg-[#FBF8F2]" : "w-[104px] bg-[#F4F1EA]"
              }`}
            >
              {isCur && (
                <>
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-pm-orange px-2 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#F7F4EC]">
                    You
                  </span>
                  <span className="absolute right-2.5 top-2.5 font-mono text-[10px] tabular-nums text-pm-orange-text">
                    ×{r.weight.toFixed(2)}
                  </span>
                </>
              )}
              <span
                className={`relative ${isCur ? "rk-plate flex h-[112px] w-[112px] items-center justify-center rounded-full bg-white" : "block"}`}
              >
                <span className={locked ? "block opacity-30 grayscale" : "block"}>
                  <RankInsignia
                    key={isCur ? pop : 0}
                    rank={r.key}
                    size={isCur ? 96 : 60}
                    pop={isCur && pop > 0}
                  />
                </span>
                {locked && (
                  <span aria-hidden="true" className="absolute bottom-0 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px]">
                    🔒
                  </span>
                )}
                {earned && (
                  <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC]">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                )}
                {isCur && rankUp > 0 && <Burst key={rankUp} />}
              </span>
              <span
                className={`mt-2 font-display font-semibold leading-tight ${
                  isCur ? "text-[24px] text-zinc-900" : earned ? "text-[14px] text-zinc-900" : "text-[14px] text-zinc-500"
                }`}
              >
                {r.title}
              </span>
              {isCur ? (
                rankUp > 0 ? (
                  <span key={rankUp} className="rk-chip mt-1 rounded-full bg-pm-orange px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F7F4EC]">
                    Rank up
                  </span>
                ) : (
                  <span className="mt-0.5 font-mono text-[11px] tabular-nums text-pm-orange-text">
                    Since {fmt(r.minPoints)} PP
                  </span>
                )
              ) : (
                <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] tabular-nums text-zinc-500">
                  {earned ? "Earned" : `${fmt(r.minPoints)} PP`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div aria-hidden="true" className="mt-3 flex justify-center gap-1.5">
        {RANKS.map((r, i) => (
          <span
            key={r.key}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === cur ? "w-5 bg-pm-orange" : i < cur ? "w-1.5 bg-pm-orange-border" : "w-1.5 bg-pm-grey-tint"
            }`}
          />
        ))}
      </div>

      {/* The level bar. */}
      <div className="mx-4 mt-4 flex items-center gap-2.5">
        <span aria-hidden="true" className="shrink-0">
          <RankInsignia rank={rank.key} size={40} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between font-mono tabular-nums">
            <span className="flex items-baseline">
              <span ref={totalRef} className="text-[22px] font-semibold leading-none text-pm-orange">
                {fmt(points)}
              </span>
              <span className="ml-1 text-[11px] text-pm-grey-text">PP</span>
              {gain && (
                <span key={gain.key} aria-hidden="true" className="rk-gain ml-1.5 inline-block text-[12px] font-semibold text-pm-orange-text">
                  +{fmt(gain.n)}
                </span>
              )}
            </span>
            <span className="text-[11px] text-zinc-500">{next ? `${fmt(next.minPoints)} PP` : "Top rank"}</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label={next ? `Progress to ${next.title}` : "Top of the ladder"}
            className="relative mt-1.5 h-3.5 overflow-hidden rounded-full bg-pm-grey-tint"
          >
            <div
              className="rk-fill relative h-full rounded-full bg-pm-orange"
              style={{ width: filled ? `${pct}%` : "0%" }}
            >
              {tipKey > 0 && <span key={tipKey} className="rk-tip-flash absolute inset-y-0 right-0 w-6 rounded-full" />}
            </div>
            {[25, 50, 75].map((t) => (
              <span key={t} className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${t}%` }} />
            ))}
          </div>
          {next && (
            <div aria-hidden="true" className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-zinc-500">
              {marks.map((t) => (
                <span key={t} className={pct >= t ? "text-pm-orange-text" : ""}>
                  {fmt(rank.minPoints + Math.round((span * t) / 100))}
                </span>
              ))}
            </div>
          )}
        </div>
        {next && (
          <span aria-hidden="true" className="relative block shrink-0">
            <span className="block opacity-30 grayscale">
              <RankInsignia rank={next.key} size={40} />
            </span>
            <span className="absolute -bottom-1 -right-1 text-[11px]">🔒</span>
          </span>
        )}
      </div>

      {/* What the next title takes, and what it gives. */}
      {next ? (
        <div className="mx-4 mt-4 rounded-xl bg-[#FBF8F2] p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-pm-grey-text">
              Unlock <span className="text-pm-orange-text">{next.title}</span>
            </p>
            <p className="font-mono text-[11px] tabular-nums text-zinc-900">
              <span className="font-semibold">{fmt(toGo)}</span> PP to go
            </p>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-600">Get there with any mix of</p>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {[
              { n: plates, label: plates === 1 ? "plate" : "plates", each: POINT_RULES.createPost },
              { n: comments, label: comments === 1 ? "comment" : "comments", each: POINT_RULES.receiveComment },
              { n: upvotes, label: upvotes === 1 ? "upvote" : "upvotes", each: POINT_RULES.receiveUpvote },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-white px-2 py-2 text-center">
                <p className="font-mono text-[17px] font-semibold leading-none tabular-nums text-zinc-900">{fmt(s.n)}</p>
                <p className="mt-1 text-[11px] leading-tight text-zinc-600">{s.label}</p>
                <p className="font-mono text-[9px] tabular-nums text-zinc-500">+{s.each} each</p>
              </div>
            ))}
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 text-[12px] leading-snug text-zinc-600">
            <span aria-hidden="true" className="text-pm-orange">★</span>
            Your dish ratings count{" "}
            <span className="font-mono font-semibold tabular-nums text-pm-orange-text">{next.weight.toFixed(2)}×</span> at {next.title}
          </p>
        </div>
      ) : (
        <div className="mx-4 mt-4 rounded-xl bg-[#FBF8F2] p-3 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-pm-orange-text">Top of the ladder</p>
          <p className="mt-1 text-[12px] text-zinc-600">
            Your dish ratings count{" "}
            <span className="font-mono font-semibold tabular-nums text-pm-orange-text">{rank.weight.toFixed(2)}×</span>, the most anyone&rsquo;s do.
          </p>
        </div>
      )}
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
