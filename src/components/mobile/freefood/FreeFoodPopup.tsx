"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { LeaderboardEntry, UserRank } from "@/lib/db";
import { rankFor } from "@/lib/ranks";
import {
  FREE_FOOD_ENDS_AT,
  FREE_FOOD_PARTNER,
  FREE_FOOD_PRIZE,
  FREE_FOOD_TITLE,
  FREE_FOOD_WINNERS,
  freeFoodClock,
  freeFoodLocked,
} from "@/lib/freeFoodEvent";
import { CloseIcon } from "@/components/icons";
import { PhoneSectionLabel } from "@/components/mobile/PhoneSectionLabel";
import { Avatar, plates, platesToPass } from "@/components/mobile/leaderboard/parts";
import { CountUp, usePrefersReducedMotion } from "@/components/mobile/leaderboard/motion";
import "./freefood.css";

/**
 * The Plate-Off board: Pizza on Pearl x PlateMaps, top ten by Plate Points eat
 * free. Opened from `ClaimFreeFoodButton` on the feed.
 *
 * The orange head carries the event (partner, title, flip-clock countdown, the
 * prize); the white body under it is the live board. The board is the real
 * all-time leaderboard, polled while the popup is open, so a post anyone makes
 * shows up here within one poll. Two places past the cut are drawn so the
 * people fighting for #10 can see each other.
 *
 * Orange head, white body: the one place the accent is a ground rather than a
 * fill, the same exception the Friends hero card makes.
 */

const POLL_MS = 15_000;
const SHOWN = FREE_FOOD_WINNERS + 2;

type Board = { leaderboard: LeaderboardEntry[]; you: UserRank | null };

/** Same handle rule as the feed byline — "Maya Ellis" reads as "mayaellis". */
function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

export function FreeFoodPopup({ onClose }: { onClose: () => void }) {
  const { account } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [climbers, setClimbers] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  /* The cascade is an entrance, not a reaction: after the first second the
     rows stop carrying it, so a reorder on a later poll cannot replay it. */
  const [entering, setEntering] = useState(true);
  const lastRanks = useRef<Map<string, number> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const locked = freeFoodLocked(now);

  /* The clock. */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setEntering(false), 1600);
    return () => clearTimeout(id);
  }, []);

  /* The board, polled while open and visible. */
  useEffect(() => {
    let alive = true;
    async function load() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/leaderboard?window=all&limit=${SHOWN}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as Board;
        if (!alive) return;
        setFailed(false);
        setBoard(next);
      } catch {
        if (alive) setFailed(true);
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  /* Movement between polls: anyone who climbed lights up, and anyone who
     climbed *into* the winners gets announced. Nothing on the first load —
     everyone is new then, and none of it is news. */
  useEffect(() => {
    if (!board) return;
    const ranks = new Map(board.leaderboard.map((e) => [e.id, e.rank]));
    const prev = lastRanks.current;
    lastRanks.current = ranks;
    if (!prev) return;

    const up = board.leaderboard.filter((e) => {
      const was = prev.get(e.id);
      return was === undefined ? e.rank <= FREE_FOOD_WINNERS : e.rank < was;
    });
    if (up.length === 0) return;
    setClimbers(new Set(up.map((e) => e.id)));
    const clear = setTimeout(() => setClimbers(new Set()), 1700);

    const entered = up.find(
      (e) => e.rank <= FREE_FOOD_WINNERS && (prev.get(e.id) ?? Infinity) > FREE_FOOD_WINNERS,
    );
    if (entered) {
      const name = entered.id === account?.id ? "You" : `@${handleFor(entered.name)}`;
      setToast({ key: Date.now(), text: `${name} just took #${entered.rank}.` });
    }
    return () => clearTimeout(clear);
  }, [board, account?.id]);

  /* Modal plumbing: Escape closes, focus moves into the dialog and goes back
     where it came from, the page behind does not scroll. Focus lands on the
     dialog itself rather than the close button, so opening it does not paint
     a focus ring on the X. */
  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      restore?.focus?.();
    };
  }, [onClose]);

  const rows = board?.leaderboard.slice(0, SHOWN) ?? [];
  const cutEntry = rows.find((e) => e.rank === FREE_FOOD_WINNERS) ?? rows[FREE_FOOD_WINNERS - 1];
  const clock = freeFoodClock(FREE_FOOD_ENDS_AT - now);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ff-title"
      ref={dialogRef}
      tabIndex={-1}
      className="ff-root fixed outline-none inset-0 z-50 flex flex-col overflow-hidden bg-pm-orange animate-sheet-in"
    >
      {toast && (
        <p
          key={toast.key}
          role="status"
          className="ff-toast absolute inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-10 rounded-2xl bg-pm-charcoal px-4 py-3 text-sm text-white"
          onAnimationEnd={() => setToast(null)}
        >
          {toast.text}
        </p>
      )}

      {/* ---- Head: the event ---- */}
      <div className="shrink-0 px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
            <span className={`h-1.5 w-1.5 rounded-full bg-white ${locked ? "" : "ff-dot"}`} aria-hidden="true" />
            {locked ? "Board locked" : "Live"}
          </span>
        </div>

        <div className="mt-1 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#fbe3d3]">
            {FREE_FOOD_PARTNER} <span className="text-pm-charcoal">×</span> PlateMaps
          </p>
          <h2 id="ff-title" className="mt-1.5 font-display text-[29px] font-bold leading-tight">
            {FREE_FOOD_TITLE}
          </h2>

          <div
            className="mt-3 flex items-center justify-center font-mono text-[22px] font-semibold tabular-nums"
            role="timer"
            aria-label={locked ? "The board is locked" : `${clock} until the board locks`}
          >
            {clock.split("").map((c, i) =>
              c === ":" ? (
                <span key={i} className="px-0.5 text-[#f6c9ab]" aria-hidden="true">
                  :
                </span>
              ) : (
                <span
                  key={i}
                  aria-hidden="true"
                  className="ff-tile relative mx-[1.5px] h-11 w-[30px] overflow-hidden rounded-lg bg-pm-charcoal leading-[44px] text-white"
                >
                  <span key={c} className="ff-digit">
                    {c}
                  </span>
                </span>
              ),
            )}
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f6c9ab]">
            {locked ? "Final standings" : "Until the board locks"}
          </p>

          <p className="ff-nudge mt-3 inline-flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-pm-charcoal">
            <PizzaMark />
            <PizzaMark className="-ml-4" />
            <CupMark />
            <b className="text-[13.5px] font-semibold">
              Top {FREE_FOOD_WINNERS} each get {FREE_FOOD_PRIZE}
            </b>
          </p>
        </div>
      </div>

      {/* ---- Body: the board ---- */}
      <div className="flex min-h-0 flex-1 flex-col rounded-t-[28px] bg-white">
        <div className="flex items-center justify-between px-[18px] pt-4">
          <PhoneSectionLabel>Global leaderboard</PhoneSectionLabel>
          <span className="mb-2 font-mono text-[10.5px] text-zinc-500">Plate Points</span>
        </div>

        <ol className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!board && !failed &&
            Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="flex h-12 items-center gap-2.5 border-b border-zinc-100 px-3.5">
                <span className="h-[30px] w-[30px] animate-pulse rounded-full bg-zinc-100" />
                <span className="h-3 w-28 animate-pulse rounded-full bg-zinc-100" />
              </li>
            ))}
          {failed && !board && (
            <li className="px-5 py-8 text-center text-sm text-zinc-500">
              The board didn&apos;t load. It retries on its own every few seconds.
            </li>
          )}
          {board && rows.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-zinc-500">
              Nobody has points yet. Post a plate and you&apos;re #1.
            </li>
          )}
          {rows.map((e, i) => {
            const win = e.rank <= FREE_FOOD_WINNERS;
            const isYou = e.id === account?.id;
            const showCut = !win && (i === 0 || rows[i - 1].rank <= FREE_FOOD_WINNERS);
            return (
              <FragmentRow
                key={e.id}
                entry={e}
                index={i}
                win={win}
                isYou={isYou}
                showCut={showCut}
                climbed={climbers.has(e.id)}
                entering={entering}
              />
            );
          })}
        </ol>

        <YouBar you={board?.you ?? null} cut={cutEntry} signedIn={!!account} locked={locked} />
      </div>
    </div>
  );
}

function FragmentRow({
  entry,
  index,
  win,
  isYou,
  showCut,
  climbed,
  entering,
}: {
  entry: LeaderboardEntry;
  index: number;
  win: boolean;
  isYou: boolean;
  showCut: boolean;
  climbed: boolean;
  entering: boolean;
}) {
  const delay = { "--ff-delay": `${200 + index * 70}ms` } as React.CSSProperties;
  const reduced = usePrefersReducedMotion();
  /* Points count up from 0 on open, and from the last value on each poll. */
  const [count, setCount] = useState({ from: 0, to: entry.points });
  if (count.to !== entry.points) setCount({ from: count.to, to: entry.points });
  const from = count.from;
  return (
    <>
      {showCut && (
        <li
          aria-hidden="true"
          className="flex items-center gap-2 px-3.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-pm-orange-text before:flex-1 before:border-t-[1.5px] before:border-dashed before:border-pm-orange after:flex-1 after:border-t-[1.5px] after:border-dashed after:border-pm-orange"
        >
          The cut · top {FREE_FOOD_WINNERS} eat free
        </li>
      )}
      <li style={delay} className={entering ? "ff-row" : undefined}>
        <Link
          href={isYou ? "/m/account" : `/m/u/${entry.id}?from=feed`}
          className={`flex min-h-12 items-center gap-2.5 border-b border-zinc-100 px-3.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${
            isYou ? "bg-pm-orange-tint" : ""
          } ${climbed ? "ff-climb" : ""} ${win ? "" : "opacity-60"}`}
        >
          <span
            className={`w-6 text-center font-display text-lg font-bold ${
              entry.rank === 1 ? "text-pm-orange" : "text-pm-charcoal"
            }`}
          >
            {entry.rank}
          </span>
          <Avatar entry={entry} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-sm font-semibold text-pm-charcoal">
              {isYou ? "You" : `@${handleFor(entry.name)}`}
            </span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-zinc-500">
              {rankFor(entry.points).title}
            </span>
          </span>
          {win && (
            <span
              style={delay}
              className={`${entering ? "ff-tag" : ""} rounded-md bg-pm-orange px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.1em] text-white`}
            >
              FREE
            </span>
          )}
          <span className="w-[68px] text-right font-mono text-sm font-semibold tabular-nums text-pm-charcoal">
            <CountUp from={from} to={entry.points} delay={entering ? 200 + index * 70 : 0} reduced={reduced} />
            <span className="sr-only">{entry.points}</span>
            <small className="ml-0.5 text-[10px] font-medium text-zinc-500">PP</small>
          </span>
        </Link>
      </li>
    </>
  );
}

function YouBar({
  you,
  cut,
  signedIn,
  locked,
}: {
  you: UserRank | null;
  cut: LeaderboardEntry | undefined;
  signedIn: boolean;
  locked: boolean;
}) {
  const shell = "shrink-0 border-t border-zinc-100 bg-white px-3.5 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]";
  const post =
    "mt-3 flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-pm-orange font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

  if (!signedIn) {
    return (
      <div className={shell}>
        <p className="text-sm text-pm-charcoal">
          <b>Sign in to get on the board.</b> <span className="text-zinc-500">Every plate you post is +5 PP.</span>
        </p>
        <Link href="/m/account" className={post}>
          Sign in
        </Link>
      </div>
    );
  }

  const rank = you?.rank ?? null;
  const points = you?.points ?? 0;
  const winning = rank !== null && rank <= FREE_FOOD_WINNERS;
  /* Points to go strictly ahead of whoever holds #10 right now. */
  const gap = cut ? Math.max(0, cut.points - points + 1) : 0;
  const progress = cut && cut.points > 0 ? Math.min(1, points / (cut.points + 1)) : 0;

  let line: React.ReactNode;
  if (locked) {
    line = winning ? (
      <>
        <b>You finished #{rank}.</b> <span className="text-zinc-500">Show this screen at the counter.</span>
      </>
    ) : (
      <>
        <b>The board is locked.</b> <span className="text-zinc-500">Winners, show this screen at the counter.</span>
      </>
    );
  } else if (winning) {
    line = (
      <>
        <b>You&apos;re #{rank}. You&apos;re eating free.</b>{" "}
        <span className="text-zinc-500">Keep posting to hold it.</span>
      </>
    );
  } else {
    line = (
      <>
        <b>{rank ? `You're #${rank}.` : "You're not on the board yet."}</b>{" "}
        <span className="text-zinc-500">{gap > 0 ? `${gap} PP to make the cut` : "Post a plate to take a spot"}</span>
      </>
    );
  }

  return (
    <div className={shell}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-pm-charcoal">{line}</p>
        {!locked && !winning && gap > 0 && (
          <span className="shrink-0 font-mono text-[11px] text-pm-orange-text">= {plates(platesToPass(gap - 1))}</span>
        )}
      </div>
      {!locked && !winning && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-pm-grey-tint" aria-hidden="true">
          <div className="ff-bar h-full rounded-full bg-pm-orange" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {!locked && (
        <Link href="/m/post" className={post}>
          + Post a plate
          <span className="rounded-full bg-white/20 px-2 py-0.5 font-mono text-xs">+5 PP</span>
        </Link>
      )}
    </div>
  );
}

function PizzaMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={26} height={26} aria-hidden="true" className={className}>
      <circle cx="20" cy="20" r="18" fill="#e9b15a" />
      <circle cx="20" cy="20" r="14.5" fill="#d9572a" />
      <circle cx="20" cy="20" r="13" fill="#f2c46b" opacity=".55" />
      <g fill="#9e2f1c">
        <circle cx="14" cy="14" r="2.6" />
        <circle cx="25" cy="13" r="2.4" />
        <circle cx="27" cy="23" r="2.6" />
        <circle cx="17" cy="25" r="2.5" />
        <circle cx="21" cy="19" r="2" />
      </g>
    </svg>
  );
}

function CupMark() {
  return (
    <svg viewBox="0 0 40 40" width={24} height={24} aria-hidden="true">
      <path d="M11 12h18l-2.2 22a2 2 0 0 1-2 1.8h-9.6a2 2 0 0 1-2-1.8z" fill="#fff" stroke="#232019" strokeWidth="1.6" />
      <path d="M12.2 20h15.6l-1.3 13.6a1.5 1.5 0 0 1-1.5 1.4h-10a1.5 1.5 0 0 1-1.5-1.4z" fill="#c9591f" />
      <rect x="9.5" y="9" width="21" height="4" rx="1.5" fill="#232019" />
      <path d="M22 9l3-6h4" stroke="#232019" strokeWidth="1.6" fill="none" />
    </svg>
  );
}
