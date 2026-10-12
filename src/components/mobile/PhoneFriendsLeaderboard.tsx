"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { POINT_RULES, formatPoints } from "@/lib/points";
import { PhoneSectionLabel } from "@/components/mobile/PhoneSectionLabel";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ChangeMark } from "@/components/mobile/leaderboard/ChangeMark";
import { MovementBanner } from "@/components/mobile/leaderboard/MovementBanner";
import { Podium } from "@/components/mobile/leaderboard/Podium";
import { RivalCallout } from "@/components/mobile/leaderboard/RivalCallout";
import { SeatDetail } from "@/components/mobile/leaderboard/SeatDetail";
import { deriveMovement, readSnapshot, writeSnapshot } from "@/components/mobile/leaderboard/memory";
import { CountUp, layoutCenter, usePrefersReducedMotion } from "@/components/mobile/leaderboard/motion";
import { Avatar, Sparks } from "@/components/mobile/leaderboard/parts";
import type { BoardCtx, Entry, Seat } from "@/components/mobile/leaderboard/types";
import "@/components/mobile/leaderboard/leaderboard.css";

export type { Seat } from "@/components/mobile/leaderboard/types";

/**
 * Plate Points, ranked against your friends and only your friends — never the
 * whole site. Ranking is computed here, client-side, off the same `friends`
 * list and `account` the rest of the screen already fetched; no new endpoint.
 *
 * **It is built to make you want to post.** Carson asked (2026-10) for the
 * table to be "more interactive", for out-pointing your friends to be a
 * bigger post incentive, and for the animation to be obvious — which
 * supersedes the earlier quiet printed-menu treatment. So, top to bottom:
 *
 * - **Movement banner** — since your last visit (a browser-local snapshot,
 *   `leaderboard/memory.ts`): "You passed Sam!" with sparks, or "Sam slipped
 *   past you — 1 plate takes it back".
 * - **Rival callout** — the nearest friend strictly ahead and the plates it
 *   takes to pass them, with the composer one tap away. Leading, it says by
 *   how much.
 * - **Podium** — the top three on stepped plinths, №1 crowned and glowing,
 *   springing in one after another.
 * - **The line** — everyone else, each row a button that opens the gap to the
 *   seat above, the plates it takes, and their rank title with progress.
 *   Rows that moved since last visit slide in from their old seat; yours
 *   climbs past the people you overtook, then bursts.
 *
 * Every animation is transform/opacity (CSS keyframes, plus WAAPI for the
 * climb, measured off the offset chain so no layout is read mid-animation),
 * and `prefers-reduced-motion` collapses all of it to the end state.
 *
 * **No count of people appears anywhere**, and none may be added — not "5 at
 * the table", not a rank denominator like `№2 of 6`. Friend counts never
 * display in this product (see PhoneFriendsScreen's header comment and
 * `getFriends` in lib/db.ts); a leaderboard is the easiest place to leak one
 * back in, since its last rank *is* the count. The movement banner names
 * people rather than counting them for the same reason.
 */

/**
 * The one ranking, exported so the friends list above can badge each row with
 * the same `№` this card gives them. Ties put you first, then by name, so the
 * order is stable between visits (a tie that reshuffled would read as a move).
 */
export function rankSeats(friends: Entry[], you: Entry): Seat[] {
  const ranked = [...friends.filter((f) => f.id !== you.id), you].sort(
    (a, b) =>
      b.points - a.points ||
      (a.id === you.id ? -1 : b.id === you.id ? 1 : a.name.localeCompare(b.name)),
  );
  return ranked.map((entry, index) => ({
    entry,
    rank: index + 1,
    gap: index > 0 ? ranked[index - 1].points - entry.points : 0,
    isYou: entry.id === you.id,
  }));
}

/** When the climb starts: after the podium and the rows have landed. */
const CLIMB_DELAY = 900;
const CLIMB_MS = 1000;

function SeatRow({ seat, ctx, index }: { seat: Seat; ctx: BoardCtx; index: number }) {
  const { entry, rank, isYou } = seat;
  const open = ctx.openId === entry.id;
  const panelId = `lb-detail-${entry.id}`;
  const gained = ctx.movement?.gained.get(entry.id) ?? 0;
  const climbed = (ctx.movement?.change.get(entry.id) ?? 0) > 0;
  const delay = 520 + index * 70;

  return (
    <li
      ref={ctx.slotRef(rank)}
      className="lb-row-in"
      style={{ "--lb-delay": `${delay}ms` } as CSSProperties}
    >
      <div
        ref={ctx.moverRef(entry.id)}
        className={`relative rounded-xl ${isYou ? "lb-you bg-pm-orange-tint" : ""} ${
          isYou && climbed ? "lb-climber" : ""
        }`}
      >
        {isYou && ctx.landed && <Sparks count={18} spread={90} />}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => ctx.toggle(entry.id)}
          className="relative flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <span className="flex w-8 shrink-0 flex-col items-start gap-0.5">
            <span className="font-mono text-[12px] font-semibold tabular-nums text-zinc-500">№{rank}</span>
            <ChangeMark id={entry.id} ctx={ctx} />
          </span>

          <Avatar entry={entry} size={40} className={isYou ? "ring-2 ring-pm-orange" : ""} />

          <span className="min-w-0 flex-1">
            <span className="font-display flex min-w-0 items-center gap-1 text-[15px] font-semibold leading-tight text-zinc-900">
              <span className="truncate">{isYou ? "You" : entry.name}</span>
              <VerifiedBadge userId={entry.id} />
            </span>
            <span className="mt-0.5 block truncate font-mono text-[11px] leading-tight tabular-nums text-zinc-500">
              {seat.gap > 0 ? `${formatPoints(seat.gap)} PP to №${rank - 1}` : `Level with №${rank - 1}`}
            </span>
          </span>

          <span className="flex shrink-0 flex-col items-end">
            <span className="whitespace-nowrap font-mono text-[15px] font-semibold leading-none text-zinc-900">
              <CountUp
                to={entry.points}
                from={gained ? entry.points - gained : 0}
                delay={delay + 120}
                reduced={ctx.reduced}
              />
              <span className="ml-0.5 text-[10px] font-medium text-pm-grey-text" aria-hidden="true">
                PP
              </span>
              <span className="sr-only">{entry.points.toLocaleString("en-US")} Plate Points</span>
            </span>
            {gained > 0 && (
              <span
                className="lb-gain mt-1 font-mono text-[10px] font-semibold tabular-nums text-pm-orange-text"
                style={{ "--lb-delay": `${delay + 900}ms` } as CSSProperties}
              >
                +{formatPoints(gained)}
                <span className="sr-only"> Plate Points since your last visit</span>
              </span>
            )}
          </span>

          <span
            aria-hidden="true"
            className={`shrink-0 text-pm-grey-text transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        <div id={panelId} hidden={!open}>
          {open && <SeatDetail seat={seat} seats={ctx.seats} youSeat={ctx.youSeat} />}
        </div>
      </div>
    </li>
  );
}

export function PhoneFriendsLeaderboard({ friends, you }: { friends: Entry[]; you: Entry }) {
  const seats = useMemo(() => rankSeats(friends, you), [friends, you]);
  const youSeat = seats.find((s) => s.isYou) ?? seats[0];
  const reduced = usePrefersReducedMotion();

  /* Read once, at mount: "since your last visit" is fixed for this visit. */
  const [memory] = useState(() => readSnapshot(you.id));
  const movement = useMemo(() => deriveMovement(memory, seats, you.id), [memory, seats, you.id]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [landed, setLanded] = useState(false);

  const slots = useRef(new Map<number, HTMLElement>());
  const movers = useRef(new Map<string, HTMLElement>());
  const climbed = useRef(false);

  const slotRef = useCallback(
    (rank: number) => (el: HTMLElement | null) => {
      if (el) slots.current.set(rank, el);
      else slots.current.delete(rank);
    },
    [],
  );
  const moverRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) movers.current.set(id, el);
      else movers.current.delete(id);
    },
    [],
  );
  const toggle = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), []);

  useEffect(() => {
    if (friends.length > 0) writeSnapshot(you.id, seats);
  }, [friends.length, you.id, seats]);

  /* The climb. Every seat that moved since last visit starts at its old
     slot and springs into its new one — so the people you passed visibly
     drop as you rise past them. Runs once per visit. */
  useLayoutEffect(() => {
    if (climbed.current || !movement || reduced) return;
    climbed.current = true;
    const n = seats.length;
    let yours: Animation | null = null;
    for (const seat of seats) {
      const d = movement.change.get(seat.entry.id);
      if (!d) continue;
      const src = slots.current.get(Math.min(n, Math.max(1, seat.rank + d)));
      const dst = slots.current.get(seat.rank);
      const mover = movers.current.get(seat.entry.id);
      if (!src || !dst || !mover || src === dst || typeof mover.animate !== "function") continue;
      const a = layoutCenter(src);
      const b = layoutCenter(dst);
      const lift = seat.isYou && d > 0;
      const anim = mover.animate(
        [
          { transform: `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${lift ? 1.08 : 1})` },
          { transform: `translate(${(a.x - b.x) * 0.15}px, ${(a.y - b.y) * 0.15}px) scale(${lift ? 1.1 : 1})`, offset: 0.7 },
          { transform: "translate(0, 0) scale(1)" },
        ],
        {
          duration: CLIMB_MS,
          delay: CLIMB_DELAY,
          easing: "cubic-bezier(0.45, 0, 0.2, 1)",
          fill: "backwards",
        },
      );
      if (lift) yours = anim;
    }
    if (yours) {
      (yours as Animation).finished.then(() => setLanded(true)).catch(() => {});
    }
  }, [movement, reduced, seats]);

  if (friends.length === 0) return null;

  const ctx: BoardCtx = {
    seats,
    youSeat,
    openId,
    toggle,
    slotRef,
    moverRef,
    movement,
    reduced,
    landed,
  };

  const top = seats.slice(0, 3);
  const rest = seats.slice(3);

  return (
    <section aria-labelledby="phone-leaderboard-heading" className="lb-root mb-7 px-4">
      <PhoneSectionLabel>Leaderboard</PhoneSectionLabel>

      <div className="overflow-hidden rounded-2xl bg-white pb-3">
        <div className="lb-cover relative overflow-hidden bg-pm-charcoal px-4 py-4 text-center">
          <span className="lb-cover-sweep" aria-hidden="true" />
          <p className="mono-label relative text-pm-orange-tint">Tonight&rsquo;s service</p>
          <h2
            id="phone-leaderboard-heading"
            className="font-display relative mt-1.5 text-[22px] font-semibold leading-tight text-[#F7F4EC]"
          >
            Friends&rsquo; Table
          </h2>
          <p className="relative mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#bdb3a4]">
            Out-post your friends · tap anyone
          </p>
        </div>

        {movement && bannerOpen && (
          <MovementBanner
            passed={movement.passed}
            passedBy={movement.passedBy}
            youSeat={youSeat}
            reduced={reduced}
            onDismiss={() => setBannerOpen(false)}
          />
        )}

        <RivalCallout seats={seats} youSeat={youSeat} />

        <Podium top={top} ctx={ctx} />

        {rest.length > 0 && (
          <ol start={4} className="mt-1 flex flex-col gap-1 px-2">
            {rest.map((seat, i) => (
              <SeatRow key={seat.entry.id} seat={seat} ctx={ctx} index={i} />
            ))}
          </ol>
        )}

        <p className="mt-3 px-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-pm-grey-text">
          Plate +{POINT_RULES.createPost} · upvote +{POINT_RULES.receiveUpvote} · comment +
          {POINT_RULES.receiveComment}
        </p>
      </div>
    </section>
  );
}
