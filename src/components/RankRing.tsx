"use client";

import "@/components/rank/rankTracker.css";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { InfoIcon } from "@/components/icons";
import { RankInsignia } from "@/components/RankInsignia";
import { LADDER_GRADIENT, RANK_ACCENT, accentVars, shortPoints } from "@/components/rank/rankAccent";
import { POINT_RULES, formatPoints } from "@/lib/points";
import { RANKS, rankFor, type RankKey } from "@/lib/ranks";

/**
 * The owner's rank card — the progression screen for Plate Points.
 *
 * A charcoal card lit in the colour of the rung you are on (`rankAccent.ts`),
 * with, top to bottom: your crest on a cream medallion inside a glowing
 * progress ring, your title in Fraunces, your total counting up in big mono,
 * how far the next title is (in points and in plates), and the whole six-rung
 * ladder as a rail — past rungs filled, the current one lit and pulsing, the
 * ones ahead locked. Tapping anywhere on the card opens `RankLadderModal`; the
 * info button in the corner opens the earning rules.
 *
 * History: a 6px track beside a 46px crest (2026-08), then a bare ring on the
 * cream with "no card" (Calvin, 2026-09). Carson asked for it to be "wayyyy
 * cooler" with obvious animation (2026-10), which overrides the no-card rule
 * for this surface; see rankTracker.css for what that sanctions and doesn't.
 *
 * Motion, all of it keyed off the `points` prop changing:
 *
 * - **Mount** counts the total up from zero, draws the ring and the rail in,
 *   and pops the rail's rungs in one after another.
 * - **Points rising** (the profile's roll-call counts `displayPoints` up)
 *   tweens the ring, ticks and rail after the number with a little overshoot;
 *   once the number stops moving the tip flashes and the crest wobbles — one
 *   acknowledgment per delivery, not one per tick.
 * - **Crossing a threshold** fills the ring, flashes the card, fires two
 *   shockwaves and a burst of sparks, flares the rays, drops a "Rank up"
 *   banner, flips the old crest out and the new one in star by star
 *   (`RankInsignia pop`), slides the new title up, fades the whole card into
 *   the new rung's colour, pops the new rung on the rail, then draws the new
 *   rung's progress. Skipping two rungs in one delivery plays it twice.
 * - **Idle**: rays turn, the aura breathes, sparks drift up, a shine runs
 *   round the arc, a glint runs along the rail, the current rung pings.
 *
 * `prefers-reduced-motion` collapses all of it to instant paints and flat
 * swaps. The ring, ticks, rail and number are driven imperatively (rAF +
 * WAAPI) rather than through React state, because the count-up changes
 * `points` every frame and the tweens have to outlive any one render.
 */

/** Ring radius in the 100-unit viewBox. rankTracker.css hardcodes 2πR (270.18). */
const R = 43;
const C = 2 * Math.PI * R;
const TICKS = 40;
const LAST = RANKS.length - 1;

/** Idle sparks: left %, size px, delay s, duration s, x drift px. */
const FLOATS: Array<[number, number, number, number, number]> = [
  [18, 4, 0, 3.6, -8],
  [32, 3, 1.1, 4.2, 6],
  [48, 5, 2.3, 3.8, -4],
  [62, 3, 0.6, 4.6, 10],
  [76, 4, 1.8, 3.4, -10],
  [40, 3, 3.0, 4.0, 4],
  [56, 4, 3.6, 3.7, -6],
];

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeBack = (k: number) => {
  const c = 0.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};

function model(points: number) {
  const rank = rankFor(points);
  const index = RANKS.findIndex((r) => r.key === rank.key);
  const next = RANKS[index + 1] ?? null;
  const pct = next
    ? clamp(((points - rank.minPoints) / (next.minPoints - rank.minPoints)) * 100)
    : 100;
  return { rank, index, next, pct };
}

function replay(el: Element | null | undefined, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  // Reading a layout property forces the style flush that lets the same
  // animation class start over instead of being ignored as already applied.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 12 12" width="8" height="8" aria-hidden="true" fill="currentColor">
      <path d="M3.5 5V3.8a2.5 2.5 0 015 0V5h.3c.4 0 .7.3.7.7v4.1c0 .4-.3.7-.7.7H3.2a.7.7 0 01-.7-.7V5.7c0-.4.3-.7.7-.7zm1.2 0h2.6V3.8a1.3 1.3 0 00-2.6 0z" />
    </svg>
  );
}

export function RankRing({
  points,
  size = 148,
  className = "",
  onOpenLadder,
  onOpenInfo,
}: {
  points: number;
  /** Outer diameter of the ring in px. The crest is drawn at ~64% of it. */
  size?: number;
  className?: string;
  /** When given, the whole card is one button that opens the ladder. */
  onOpenLadder?: () => void;
  /** When given, an info button in the card's corner (the earning rules). */
  onOpenInfo?: () => void;
}) {
  const now = model(points);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradId = `rk-grad-${uid}`;
  const maskId = `rk-mask-${uid}`;

  const cardRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const maskArcRef = useRef<SVGCircleElement>(null);
  const tipRef = useRef<SVGCircleElement>(null);
  const tipGlowRef = useRef<SVGCircleElement>(null);
  const tipFlashRef = useRef<SVGCircleElement>(null);
  const tickRefs = useRef<Array<SVGLineElement | null>>([]);
  const railFillRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const crestRef = useRef<HTMLDivElement>(null);
  const halo1Ref = useRef<HTMLSpanElement>(null);
  const halo2Ref = useRef<HTMLSpanElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const bannerRef = useRef<HTMLSpanElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);

  const reducedRef = useRef(false);
  const shownRef = useRef(0);
  const litRef = useRef(-1);
  const paintIndexRef = useRef(now.index);
  const animRef = useRef(0);
  const numAnimRef = useRef(0);
  const numShownRef = useRef<number | null>(null);
  const seenRankRef = useRef<RankKey | null>(null);
  const busyRef = useRef(false);
  const latestRef = useRef(points);
  const timersRef = useRef<number[]>([]);

  const [crest, setCrest] = useState<{ rank: RankKey; flip: "out" | "in" | null; pop: number }>({
    rank: now.rank.key,
    flip: null,
    pop: 0,
  });
  const [title, setTitle] = useState<{ text: string; prev: string | null; key: number }>({
    text: now.rank.title,
    prev: null,
    key: 0,
  });

  /* Kept current after each render (not during it) for the async animation callbacks. */
  useEffect(() => {
    latestRef.current = points;
  });

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timers = timersRef.current;
    return () => {
      animRef.current += 1;
      numAnimRef.current += 1;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  /* The big number. Its own tween, so it keeps counting straight through a
     rank-up sequence that is busy with the ring. React never renders a child
     into the span, so it never fights this for the text. */
  useEffect(() => {
    const el = numRef.current;
    if (!el) return;
    const target = Math.max(0, points);
    const from = numShownRef.current;
    if (reducedRef.current || from === target) {
      numShownRef.current = target;
      el.textContent = formatPoints(target);
      return;
    }
    const start = from ?? 0;
    const dur = from === null ? 1300 : 600;
    const id = ++numAnimRef.current;
    const t0 = performance.now();
    const frame = (t: number) => {
      if (id !== numAnimRef.current) return;
      const k = Math.min(1, (t - t0) / dur);
      const v = Math.round(start + (target - start) * easeOut(k));
      numShownRef.current = v;
      el.textContent = formatPoints(v);
      if (k < 1) requestAnimationFrame(frame);
    };
    frame(t0);
  }, [points]);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timersRef.current.push(id);
      return id;
    };

    function paint(pct: number) {
      const c = clamp(pct);
      shownRef.current = c;
      const arc = arcRef.current;
      const tip = tipRef.current;
      const glow = tipGlowRef.current;
      const flash = tipFlashRef.current;
      if (!arc || !tip || !flash || !glow) return;
      const offset = String(C * (1 - c / 100));
      arc.style.strokeDashoffset = offset;
      if (maskArcRef.current) maskArcRef.current.style.strokeDashoffset = offset;
      const th = (c / 100) * Math.PI * 2;
      const x = (50 + R * Math.cos(th)).toFixed(2);
      const y = (50 + R * Math.sin(th)).toFixed(2);
      for (const el of [tip, glow, flash]) {
        el.setAttribute("cx", x);
        el.setAttribute("cy", y);
      }
      const hidden = c <= 0.5 ? "hidden" : "visible";
      tip.style.visibility = hidden;
      glow.style.visibility = hidden;

      const lit = Math.round((c / 100) * TICKS);
      if (lit !== litRef.current) {
        litRef.current = lit;
        tickRefs.current.forEach((t, i) => t?.classList.toggle("rk-tick-on", i < lit));
      }

      // The rail: through every rung earned, plus this rung's share of the
      // gap to the next. At 100% the ring is full exactly as the fill reaches
      // the next rung, so a rank-up's reset to 0 on the new index lands on
      // the same spot.
      const fill = railFillRef.current;
      if (fill) {
        const f = Math.min(1, (paintIndexRef.current + c / 100) / LAST);
        fill.style.clipPath = `inset(0 ${((1 - f) * 100).toFixed(2)}% 0 0 round 999px)`;
      }
    }

    function animateTo(target: number, dur: number, ease: (k: number) => number) {
      if (reducedRef.current || !dur) {
        paint(target);
        return Promise.resolve();
      }
      const id = ++animRef.current;
      const from = shownRef.current;
      const t0 = performance.now();
      return new Promise<void>((resolve) => {
        const frame = (t: number) => {
          if (id !== animRef.current) return resolve();
          const k = Math.min(1, (t - t0) / dur);
          paint(from + (target - from) * ease(k));
          if (k < 1) requestAnimationFrame(frame);
          else resolve();
        };
        frame(t0);
      });
    }

    function tipFlash() {
      if (reducedRef.current) return;
      tipFlashRef.current?.animate(
        [
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(4)", opacity: 0 },
        ],
        { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" }
      );
    }

    function burst(n: number) {
      const host = ringRef.current;
      if (!host || reducedRef.current) return;
      const d0 = size / 2 - 6;
      const palette = ["var(--rk-a)", "var(--rk-b)", "#ffffff"];
      for (let i = 0; i < n; i++) {
        const s = document.createElement("span");
        s.className = "rk-burst";
        s.style.background = palette[i % 3];
        s.style.boxShadow = `0 0 8px ${palette[i % 2]}`;
        if (i % 4 === 1) s.style.width = s.style.height = "4px";
        if (i % 5 === 2) {
          // A few streaks among the dots.
          s.style.width = "12px";
          s.style.height = "3px";
          s.style.borderRadius = "2px";
        }
        host.appendChild(s);
        const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const d1 = d0 * 1.5 + Math.random() * size * 0.35;
        const rot = `rotate(${(a * 180) / Math.PI}deg)`;
        s.animate(
          [
            {
              transform: `translate(-50%,-50%) translate(${Math.cos(a) * d0 * 0.6}px,${Math.sin(a) * d0 * 0.6}px) ${rot} scale(1.2)`,
              opacity: 1,
            },
            {
              transform: `translate(-50%,-50%) translate(${Math.cos(a) * d1}px,${Math.sin(a) * d1 + 18}px) ${rot} scale(.2)`,
              opacity: 0,
            },
          ],
          { duration: 800 + Math.random() * 500, easing: "cubic-bezier(.12,.9,.3,1)", fill: "forwards" }
        ).finished.then(() => s.remove(), () => s.remove());
      }
    }

    function rankUp(to: ReturnType<typeof model>) {
      busyRef.current = true;
      tipFlash();
      void animateTo(100, 520, easeOut).then(() => {
        burst(26);
        replay(halo1Ref.current, "rk-halo-go");
        replay(halo2Ref.current, "rk-halo-go");
        replay(flashRef.current, "rk-flash-go");
        replay(bannerRef.current, "rk-banner-go");
        replay(cardRef.current, "rk-hype");
        setCrest((c) => ({ ...c, flip: "out" }));
        setTitle((t) => ({ text: to.rank.title, prev: t.text, key: t.key + 1 }));
        later(() => {
          paintIndexRef.current = to.index;
          setCrest({ rank: to.rank.key, flip: "in", pop: Date.now() });
          later(() => {
            // WAAPI rather than a class: the rung's className is React's, and
            // the next render that touches it would strip a pop class and
            // restart the mount animation instead.
            nodeRefs.current[to.index]?.animate(
              [{ transform: "scale(.4)" }, { transform: "scale(1.4)" }, { transform: "scale(1)" }],
              { duration: 700, easing: "cubic-bezier(.2,1.6,.4,1)" }
            );
          }, 30);
        }, 240);
        later(() => setTitle((t) => ({ ...t, prev: null })), 700);
        later(() => {
          paint(0);
          busyRef.current = false;
          const latest = model(latestRef.current);
          if (latest.rank.key !== seenRankRef.current) {
            // Two rungs in one delivery: play it again for the second one.
            seenRankRef.current = latest.rank.key;
            void animateTo(100, 700, easeOut).then(() => rankUp(latest));
          } else {
            void animateTo(latest.pct, 1000, easeOut);
          }
        }, 900);
      });
    }

    const seen = seenRankRef.current;
    if (seen === null) {
      seenRankRef.current = now.rank.key;
      paintIndexRef.current = now.index;
      paint(0);
      void animateTo(now.pct, 1300, easeOut);
      return;
    }
    if (busyRef.current) return;

    if (now.rank.key !== seen) {
      seenRankRef.current = now.rank.key;
      const seenIndex = RANKS.findIndex((r) => r.key === seen);
      if (now.index < seenIndex || reducedRef.current) {
        // Downward only ever happens on a dev reset; no motion means no
        // ceremony. Either way: swap flat and paint the new rung.
        animRef.current += 1;
        paintIndexRef.current = now.index;
        setCrest({ rank: now.rank.key, flip: null, pop: 0 });
        setTitle({ text: now.rank.title, prev: null, key: 0 });
        paint(now.pct);
        return;
      }
      rankUp(now);
      return;
    }

    void animateTo(now.pct, 650, easeBack);
    const settle = later(() => {
      if (busyRef.current) return;
      tipFlash();
      replay(crestRef.current, "rk-nudge");
    }, 320);
    return () => window.clearTimeout(settle);
    // `now` is derived from `points`; `size` only matters to burst distances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  /* What is drawn follows the crest, not the raw total, so the colour, the
     rail and the "to go" line all change at the moment the crest flips. */
  const shownIndex = RANKS.findIndex((r) => r.key === crest.rank);
  const shownRank = RANKS[shownIndex];
  const shownNext = RANKS[shownIndex + 1] ?? null;
  const owed = shownNext ? shownNext.minPoints - Math.max(0, points) : 0;
  const plates = Math.ceil(Math.max(0, owed) / POINT_RULES.createPost);

  const ladderLabel = `${shownRank.title}, rank ${shownIndex + 1} of ${RANKS.length}. ${
    shownNext
      ? `${formatPoints(Math.max(0, owed))} points to ${shownNext.title}.`
      : "Top of the ladder."
  } See the ladder`;

  const crestSize = Math.round(size * 0.64);

  return (
    <div
      ref={cardRef}
      className={`rk-card @container px-5 pb-5 pt-3 ${className}`}
      style={accentVars(crest.rank)}
    >
      <span className="rk-sheen" aria-hidden="true" />
      <span ref={flashRef} className="rk-flash" aria-hidden="true" />

      {onOpenLadder && (
        <button type="button" className="rk-hit" onClick={onOpenLadder} aria-label={ladderLabel} />
      )}

      {/* Header: the label, which rung of six, and the rules. */}
      <div className="flex min-h-11 items-center justify-between gap-2">
        <p className="mono-label rk-label flex items-center gap-2">
          <span>Plate Points</span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--rk-a)]" />
          <span className="rk-accent tabular-nums">
            Rank {shownIndex + 1}/{RANKS.length}
          </span>
        </p>
        {onOpenInfo && (
          <button
            type="button"
            onClick={onOpenInfo}
            aria-label="How Plate Points work"
            className="rk-info -mr-3 flex h-11 w-11 items-center justify-center rounded-full text-[#f7f4ec]/75 transition-colors hover:bg-white/10 hover:text-[#f7f4ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <InfoIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-col items-center text-center @xl:flex-row @xl:items-center @xl:justify-center @xl:gap-12 @xl:text-left">
        {/* ── The ring ── */}
        <div
          ref={ringRef}
          className="rk-ring mt-3 @xl:mt-1"
          style={{ width: size, height: size }}
          aria-hidden="true"
        >
          <div className="rk-rays-wrap">
            <div className="rk-rays" />
          </div>
          <span className="rk-aura" />
          {FLOATS.map(([x, s, d, t, dx], i) => (
            <span
              key={i}
              className="rk-float"
              style={
                {
                  "--x": `${x}%`,
                  "--s": `${s}px`,
                  "--d": `${d}s`,
                  "--t": `${t}s`,
                  "--dx": `${dx}px`,
                } as CSSProperties
              }
            />
          ))}

          <svg viewBox="0 0 100 100" className="rk-svg">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--rk-b)" }} />
                <stop offset="100%" style={{ stopColor: "var(--rk-a)" }} />
              </linearGradient>
              <mask id={maskId} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
                <circle
                  ref={maskArcRef}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="7"
                  strokeLinecap="round"
                  style={{ strokeDasharray: C, strokeDashoffset: C }}
                />
              </mask>
            </defs>
            {Array.from({ length: TICKS }, (_, i) => {
              const a = (i / TICKS) * Math.PI * 2;
              const major = i % 5 === 0;
              const r1 = major ? 48 : 48.8;
              const r2 = 51;
              return (
                <line
                  key={i}
                  ref={(el) => {
                    tickRefs.current[i] = el;
                  }}
                  className="rk-tick"
                  x1={(50 + r1 * Math.cos(a)).toFixed(2)}
                  y1={(50 + r1 * Math.sin(a)).toFixed(2)}
                  x2={(50 + r2 * Math.cos(a)).toFixed(2)}
                  y2={(50 + r2 * Math.sin(a)).toFixed(2)}
                />
              );
            })}
            <circle className="rk-track" cx="50" cy="50" r={R} />
            <circle
              ref={arcRef}
              className="rk-arc"
              cx="50"
              cy="50"
              r={R}
              stroke={`url(#${gradId})`}
              style={{ strokeDasharray: C, strokeDashoffset: C }}
            />
            <g mask={`url(#${maskId})`}>
              <circle className="rk-shine" cx="50" cy="50" r={R} />
            </g>
            <circle ref={tipGlowRef} className="rk-tipglow" cx="93" cy="50" r="5" style={{ visibility: "hidden" }} />
            <circle ref={tipFlashRef} className="rk-tipflash" cx="93" cy="50" r="3" />
            <circle ref={tipRef} className="rk-tip" cx="93" cy="50" r="2.6" style={{ visibility: "hidden" }} />
          </svg>

          <span ref={halo1Ref} className="rk-halo" />
          <span ref={halo2Ref} className="rk-halo rk-halo-2" />
          <span className="rk-medal" />
          <div className="rk-crest-flip absolute inset-0">
            <div
              ref={crestRef}
              className={`rk-crest ${
                crest.flip === "out" ? "rk-crest-out" : crest.flip === "in" ? "rk-crest-in" : ""
              }`}
            >
              <RankInsignia key={crest.pop} rank={crest.rank} size={crestSize} pop={crest.pop > 0} />
            </div>
          </div>
          <span ref={bannerRef} className="rk-banner font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
            Rank up
          </span>
        </div>

        {/* ── Title, total, distance ── */}
        <div className="flex min-w-0 flex-col items-center @xl:items-start">
          <p
            className="rk-title rk-rise mt-4 font-display text-[30px] font-semibold leading-tight tracking-tight text-[#f7f4ec] @xl:mt-0"
            style={{ "--rd": "120ms" } as CSSProperties}
          >
            {title.prev !== null && (
              <span key={`o${title.key}`} aria-hidden="true" className="rk-title-out">
                {title.prev}
              </span>
            )}
            <span key={`n${title.key}`} className={title.key > 0 ? "rk-title-in" : "block"}>
              {title.text}
            </span>
          </p>

          <p
            className="rk-rise mt-1 flex items-baseline gap-2 font-mono tabular-nums"
            style={{ "--rd": "200ms" } as CSSProperties}
          >
            <span ref={numRef} aria-hidden="true" className="rk-total text-[44px] font-semibold leading-none tracking-tight" />
            <span className="sr-only">{formatPoints(Math.max(0, points))}</span>
            <span className="rk-label text-[12px] uppercase tracking-[0.14em]">points</span>
          </p>

          <p
            className="rk-chip rk-rise mt-3 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full px-3.5 py-1.5 font-mono text-[12px] tabular-nums text-[#f7f4ec]"
            style={{ "--rd": "280ms" } as CSSProperties}
          >
            {shownNext ? (
              owed > 0 ? (
                <>
                  <span>
                    <span className="font-semibold rk-accent-b">{formatPoints(owed)}</span> to{" "}
                    <span className="font-semibold" style={{ color: RANK_ACCENT[shownNext.key].a }}>
                      {shownNext.title}
                    </span>
                  </span>
                  <span aria-hidden="true" className="rk-quiet">
                    ·
                  </span>
                  <span className="rk-label">
                    ≈ {plates} {plates === 1 ? "plate" : "plates"}
                  </span>
                </>
              ) : (
                <span className="font-semibold rk-accent-b">Unlocking {shownNext.title}…</span>
              )
            ) : (
              <span className="font-semibold rk-accent-b">★ Top of the ladder</span>
            )}
          </p>
        </div>
      </div>

      {/* ── The ladder rail: every rung, ahead and behind ── */}
      <div
        className="rk-rail rk-rise mt-6"
        style={{ "--rd": "340ms" } as CSSProperties}
        aria-hidden="true"
      >
        <div className="rk-rail-line">
          <div ref={railFillRef} className="rk-rail-fill" style={{ background: LADDER_GRADIENT }} />
        </div>
        <ol className="relative grid grid-cols-6">
          {RANKS.map((rank, i) => {
            const state = i < shownIndex ? "done" : i === shownIndex ? "now" : "locked";
            return (
              <li key={rank.key} className="rk-node-slot">
                <span className="rk-node-box">
                  <span
                    ref={(el) => {
                      nodeRefs.current[i] = el;
                    }}
                    className={`rk-node rk-node-${state}`}
                    style={
                      {
                        "--node-a": RANK_ACCENT[rank.key].a,
                        "--nd": `${420 + i * 90}ms`,
                      } as CSSProperties
                    }
                  >
                    <RankInsignia rank={rank.key} size={state === "now" ? 34 : 24} />
                    {state === "locked" && (
                      <span className="rk-lock">
                        <LockGlyph />
                      </span>
                    )}
                  </span>
                </span>
                <span
                  className={`mt-1.5 font-mono text-[10px] tabular-nums leading-none ${
                    state === "now" ? "rk-accent font-semibold" : state === "done" ? "rk-label" : "rk-quiet"
                  }`}
                >
                  {shortPoints(rank.minPoints)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {onOpenLadder && (
        <p className="rk-quiet mt-3 text-center font-mono text-[10px] uppercase tracking-[0.16em]" aria-hidden="true">
          Tap for the full ladder ›
        </p>
      )}
    </div>
  );
}
