"use client";

import { useEffect, useRef, useState } from "react";
import { RankInsignia } from "@/components/RankInsignia";
import { formatPoints } from "@/lib/points";
import { RANKS, rankFor, type RankKey } from "@/lib/ranks";

/**
 * The rung you are on, drawn as a ring: your crest, an orange arc around it
 * that is your progress toward the next title, your title under it in Fraunces
 * and the total and the points still owed in mono. It sits straight on the
 * cream — no card, no plaque — with the crest in its usual inks.
 *
 * This is the owner's progression view — `PlatePointsPanel` mounts it under
 * the rules row on both the web and phone profiles. It replaced a 6px track
 * beside a 46px crest (2026-09): the arc says the same thing as the track but
 * puts the crest, which is the thing you actually earned, at the centre.
 *
 * Motion, all of it keyed off the `points` prop changing:
 *
 * - **Mount** draws the arc in from empty over 900ms.
 * - **Points rising** (the profile's roll-call counts `displayPoints` up over
 *   a few hundred ms) tweens the arc after the number with a little overshoot,
 *   and once the number stops moving the tip flashes and the crest nudges —
 *   one acknowledgment per delivery, not one per tick.
 * - **Crossing a threshold** fills the arc to full, throws sparks and two
 *   halos, scales the old crest out, pops the new one in star by star
 *   (`RankInsignia pop`), slides the new title up under the old, then empties
 *   the arc and draws the new rung's progress. Skipping two rungs in one
 *   delivery plays the sequence twice.
 *
 * `prefers-reduced-motion` collapses all of it to instant paints and flat
 * swaps. The arc, tip and sparks are driven imperatively (rAF + WAAPI) rather
 * than through React state because the count-up changes `points` every frame
 * and a re-render per frame of a 300ms roll is exactly the jank it would be
 * trying to animate over.
 */

const R = 46;
const C = 2 * Math.PI * R;

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

function replay(el: Element | null, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  // Reading a layout property forces the style flush that lets the same
  // animation class start over instead of being ignored as already applied.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

export function RankRing({
  points,
  size = 116,
  className = "",
}: {
  points: number;
  /** Outer diameter in px. The crest inside is drawn at 60% of it. */
  size?: number;
  className?: string;
}) {
  const now = model(points);

  const hostRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const tipRef = useRef<SVGCircleElement>(null);
  const tipFlashRef = useRef<SVGCircleElement>(null);
  const crestRef = useRef<HTMLDivElement>(null);
  const halo1Ref = useRef<HTMLSpanElement>(null);
  const halo2Ref = useRef<HTMLSpanElement>(null);

  const reducedRef = useRef(false);
  const shownRef = useRef(0);
  const animRef = useRef(0);
  const seenRankRef = useRef<RankKey | null>(null);
  const busyRef = useRef(false);
  const latestRef = useRef(points);
  const timersRef = useRef<number[]>([]);
  latestRef.current = points;

  const [crest, setCrest] = useState<{ rank: RankKey; out: boolean; pop: number }>({
    rank: now.rank.key,
    out: false,
    pop: 0,
  });
  const [title, setTitle] = useState<{ text: string; prev: string | null; key: number }>({
    text: now.rank.title,
    prev: null,
    key: 0,
  });

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timers = timersRef.current;
    return () => {
      animRef.current += 1;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

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
      const flash = tipFlashRef.current;
      if (!arc || !tip || !flash) return;
      arc.style.strokeDashoffset = String(C * (1 - c / 100));
      const th = (c / 100) * Math.PI * 2;
      const x = (50 + R * Math.cos(th)).toFixed(2);
      const y = (50 + R * Math.sin(th)).toFixed(2);
      tip.setAttribute("cx", x);
      tip.setAttribute("cy", y);
      flash.setAttribute("cx", x);
      flash.setAttribute("cy", y);
      tip.style.visibility = c <= 0.5 ? "hidden" : "visible";
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

    function spark() {
      if (reducedRef.current) return;
      tipFlashRef.current?.animate(
        [
          { transform: "scale(1)", opacity: 0.9 },
          { transform: "scale(3.2)", opacity: 0 },
        ],
        { duration: 450, easing: "cubic-bezier(.16,1,.3,1)" }
      );
    }

    function sparks(n: number) {
      const host = hostRef.current;
      if (!host || reducedRef.current) return;
      const d0 = size / 2 - 4;
      for (let i = 0; i < n; i++) {
        const s = document.createElement("span");
        s.className = "rank-ring-spark";
        if (i % 3 === 1) s.style.background = "var(--pm-orange-border)";
        if (i % 3 === 2) s.style.width = s.style.height = "4px";
        host.appendChild(s);
        const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const d1 = d0 * 1.4 + Math.random() * size * 0.22;
        s.animate(
          [
            {
              transform: `translate(-50%,-50%) translate(${Math.cos(a) * d0}px,${Math.sin(a) * d0}px) scale(1)`,
              opacity: 1,
            },
            {
              transform: `translate(-50%,-50%) translate(${Math.cos(a) * d1}px,${Math.sin(a) * d1}px) scale(.2)`,
              opacity: 0,
            },
          ],
          { duration: 650 + Math.random() * 350, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" }
        ).finished.then(() => s.remove(), () => s.remove());
      }
    }

    function rankUp(to: ReturnType<typeof model>) {
      busyRef.current = true;
      spark();
      void animateTo(100, 480, easeOut).then(() => {
        sparks(14);
        replay(halo1Ref.current, "rank-ring-halo-go");
        replay(halo2Ref.current, "rank-ring-halo-go");
        setCrest((c) => ({ ...c, out: true }));
        setTitle((t) => ({ text: to.rank.title, prev: t.text, key: t.key + 1 }));
        later(() => setCrest({ rank: to.rank.key, out: false, pop: Date.now() }), 220);
        later(() => setTitle((t) => ({ ...t, prev: null })), 620);
        later(() => {
          paint(0);
          busyRef.current = false;
          const latest = model(latestRef.current);
          if (latest.rank.key !== seenRankRef.current) {
            // Two rungs in one delivery: play it again for the second one.
            seenRankRef.current = latest.rank.key;
            void animateTo(100, 700, easeOut).then(() => rankUp(latest));
          } else {
            void animateTo(latest.pct, 900, easeOut);
          }
        }, 380);
      });
    }

    const seen = seenRankRef.current;
    if (seen === null) {
      seenRankRef.current = now.rank.key;
      paint(0);
      void animateTo(now.pct, 900, easeOut);
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
        setCrest({ rank: now.rank.key, out: false, pop: 0 });
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
      spark();
      replay(crestRef.current, "rank-ring-nudge");
    }, 320);
    return () => window.clearTimeout(settle);
    // `now` is derived from `points`; `size` only matters to spark distances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <div ref={hostRef} className="rank-ring" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="rank-ring-svg" aria-hidden="true">
          <circle className="rank-ring-track" cx="50" cy="50" r={R} />
          <circle
            ref={arcRef}
            className="rank-ring-arc"
            cx="50"
            cy="50"
            r={R}
            style={{ strokeDasharray: C, strokeDashoffset: C }}
          />
          <circle ref={tipFlashRef} className="rank-ring-tipflash" cx="96" cy="50" r="3" />
          <circle
            ref={tipRef}
            className="rank-ring-tip"
            cx="96"
            cy="50"
            r="3"
            style={{ visibility: "hidden" }}
          />
        </svg>
        <span ref={halo1Ref} className="rank-ring-halo" aria-hidden="true" />
        <span ref={halo2Ref} className="rank-ring-halo rank-ring-halo-2" aria-hidden="true" />
        {/* The crest labels itself "<title> rank" and the title is written
            right under it, so the picture is decorative to a screen reader. */}
        <div
          ref={crestRef}
          aria-hidden="true"
          className={`rank-ring-crest ${crest.out ? "rank-ring-crest-out" : ""}`}
        >
          <RankInsignia
            key={crest.pop}
            rank={crest.rank}
            size={Math.round(size * 0.62)}
            pop={crest.pop > 0}
          />
        </div>
      </div>

      <p className="rank-ring-title mt-3.5 font-display text-[22px] font-semibold leading-tight text-pm-charcoal">
        {title.prev !== null && (
          <span key={`o${title.key}`} aria-hidden="true" className="rank-ring-title-out">
            {title.prev}
          </span>
        )}
        <span key={`n${title.key}`} className={title.key > 0 ? "rank-ring-title-in" : "block"}>
          {title.text}
        </span>
      </p>
      <p className="mt-1.5 font-mono text-[12px] tabular-nums text-pm-grey-text">
        <span className="text-[14px] font-semibold text-pm-orange-text">{formatPoints(points)}</span>{" "}
        points ·{" "}
        {now.next
          ? `${formatPoints(Math.max(0, now.next.minPoints - points))} to ${now.next.title}`
          : "top of the ladder"}
      </p>
    </div>
  );
}
