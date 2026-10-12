"use client";

import "@/components/rank/rankTracker.css";
import type { CSSProperties } from "react";
import { Dialog } from "@/components/feed/Dialog";
import { RankInsignia } from "@/components/RankInsignia";
import { RANK_ACCENT, accentVars } from "@/components/rank/rankAccent";
import { POINT_RULES, formatPoints } from "@/lib/points";
import { RANKS, rankFor } from "@/lib/ranks";

/**
 * Every rung of the ladder, top to bottom, with the lifetime total each one
 * takes. Opens from a tap on the owner's rank card (`RankRing`).
 *
 * It wears the card's clothes (rankTracker.css): a charcoal panel, each rung
 * in its own light, joined by a spine that is lit up to where you stand. The
 * rungs you've passed carry a check, yours is lit and says so, the next one
 * shows a bar and the points and plates still owed, and the ones beyond are
 * locked. Ordered highest first so the thing worth reaching is what you see
 * at the top of the sheet, not the badge everyone starts with.
 */
export function RankLadderModal({ points, onClose }: { points: number; onClose: () => void }) {
  const current = rankFor(points);
  const currentIndex = RANKS.findIndex((r) => r.key === current.key);
  const next = RANKS[currentIndex + 1] ?? null;
  const rungs = [...RANKS].reverse();

  return (
    <Dialog title="The ladder" onClose={onClose} variant="sheet">
      <div className="px-5 py-4">
        <p className="mb-4 text-sm leading-relaxed text-zinc-600">
          Titles are earned on lifetime Plate Points and never lost. You have{" "}
          <span className="font-mono font-semibold tabular-nums text-pm-orange-text">{formatPoints(points)}</span>.
        </p>

        <ol className="rk-card space-y-3 p-3" style={accentVars(current.key)}>
          {rungs.map((rank, i) => {
            const index = RANKS.length - 1 - i;
            const isCurrent = rank.key === current.key;
            const isNext = next?.key === rank.key;
            const earned = points >= rank.minPoints;
            const owed = rank.minPoints - points;
            const accent = RANK_ACCENT[rank.key];
            const prev = RANKS[index - 1];
            const pct =
              isNext && prev
                ? Math.max(0, Math.min(100, ((points - current.minPoints) / (rank.minPoints - current.minPoints)) * 100))
                : 0;
            const plates = Math.ceil(Math.max(0, owed) / POINT_RULES.createPost);
            return (
              <li
                key={rank.key}
                aria-current={isCurrent ? "true" : undefined}
                className={`rk-step rk-step-in flex items-center gap-3.5 rounded-2xl px-3 py-2.5 ${
                  isCurrent ? "rk-step-now" : ""
                }`}
                style={
                  {
                    "--node-a": accent.a,
                    "--node-b": accent.b,
                    "--rd": `${80 + i * 70}ms`,
                    // The spine above this rung is lit once the rung *above*
                    // it is reached, i.e. the whole climb so far glows.
                    "--spine": index < currentIndex ? accent.a : undefined,
                  } as CSSProperties
                }
              >
                <span
                  className={`rk-node shrink-0 ${
                    isCurrent ? "rk-node-now" : earned ? "rk-node-done" : "rk-node-locked"
                  }`}
                  style={{ width: 52, height: 52, animation: "none" }}
                >
                  <RankInsignia rank={rank.key} size={44} />
                  {!earned && (
                    <span className="rk-lock" aria-hidden="true">
                      <svg viewBox="0 0 12 12" width="8" height="8" fill="currentColor">
                        <path d="M3.5 5V3.8a2.5 2.5 0 015 0V5h.3c.4 0 .7.3.7.7v4.1c0 .4-.3.7-.7.7H3.2a.7.7 0 01-.7-.7V5.7c0-.4.3-.7.7-.7zm1.2 0h2.6V3.8a1.3 1.3 0 00-2.6 0z" />
                      </svg>
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-display text-[18px] font-semibold leading-tight text-[#f7f4ec]">
                    <span className={earned ? "" : "opacity-75"}>{rank.title}</span>
                    {isCurrent && (
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1b1814]"
                        style={{ background: accent.a }}
                      >
                        You
                      </span>
                    )}
                    {earned && !isCurrent && (
                      <span className="font-mono text-[12px]" style={{ color: accent.a }}>
                        <span aria-hidden="true">✓</span>
                        <span className="sr-only">earned</span>
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] tabular-nums text-[#f7f4ec]/70">
                    {rank.minPoints === 0 ? "Start here" : `${formatPoints(rank.minPoints)} points`}
                    {!earned && (
                      <>
                        {" · "}
                        <span style={{ color: isNext ? accent.b : undefined }}>
                          {formatPoints(owed)} to go
                        </span>
                      </>
                    )}
                  </p>
                  {isNext && (
                    <>
                      <div className="rk-bar mt-2" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[#f7f4ec]/70">
                        ≈ {plates} {plates === 1 ? "plate" : "plates"} at +{POINT_RULES.createPost} each
                      </p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Dialog>
  );
}
