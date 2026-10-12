import type { CSSProperties } from "react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { CountUp } from "./motion";
import { Avatar, Crown, Sparks } from "./parts";
import { ChangeMark } from "./ChangeMark";
import { SeatDetail } from "./SeatDetail";
import type { BoardCtx, Seat } from "./types";

/** Visual column, plinth height, avatar size and entrance delay per place. */
const SPOT = {
  1: { col: "col-start-2", plinth: 96, avatar: 68, delay: 260 },
  2: { col: "col-start-1", plinth: 66, avatar: 54, delay: 130 },
  3: { col: "col-start-3", plinth: 46, avatar: 54, delay: 0 },
} as const;

export const PODIUM_DETAIL_ID = "lb-podium-detail";

function Spot({ seat, ctx }: { seat: Seat; ctx: BoardCtx }) {
  const place = seat.rank as 1 | 2 | 3;
  const spot = SPOT[place];
  const open = ctx.openId === seat.entry.id;
  const climbed = (ctx.movement?.change.get(seat.entry.id) ?? 0) > 0;
  const gained = ctx.movement?.gained.get(seat.entry.id) ?? 0;
  const from = gained ? seat.entry.points - gained : 0;

  return (
    <li
      ref={ctx.slotRef(seat.rank)}
      className={`${spot.col} row-start-1 flex min-w-0 flex-col items-center justify-end`}
    >
      <button
        ref={ctx.moverRef(seat.entry.id)}
        type="button"
        aria-expanded={open}
        aria-controls={PODIUM_DETAIL_ID}
        onClick={() => ctx.toggle(seat.entry.id)}
        className={`lb-drop relative flex w-full min-w-0 flex-col items-center rounded-2xl px-1 pb-2 pt-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          open ? "bg-pm-orange-tint" : ""
        } ${seat.isYou && climbed ? "lb-climber" : ""}`}
        style={{ "--lb-delay": `${spot.delay + 280}ms` } as CSSProperties}
      >
        <span className="relative">
          {place === 1 && <span className="lb-halo" aria-hidden="true" />}
          {place === 1 && (
            <span className="absolute -top-[22px] left-1/2 -translate-x-1/2">
              <Crown className="lb-crown block h-[22px] w-8" />
            </span>
          )}
          <span className={`relative block rounded-full ${seat.isYou ? "lb-you-ring" : ""}`}>
            <Avatar entry={seat.entry} size={spot.avatar} className="ring-[3px] ring-white" />
          </span>
          <span className="absolute -right-2 -top-1">
            <ChangeMark id={seat.entry.id} ctx={ctx} />
          </span>
          {seat.isYou && ctx.landed && <Sparks count={16} spread={60} />}
        </span>
        <span className="font-display mt-1.5 flex max-w-full items-center gap-0.5 text-[14px] font-semibold leading-tight text-zinc-900">
          <span className="sr-only">№{seat.rank}, </span>
          <span className="truncate">{seat.isYou ? "You" : seat.entry.name}</span>
          <VerifiedBadge userId={seat.entry.id} />
        </span>
        <span className="mt-0.5 font-mono text-[13px] font-semibold leading-none text-zinc-900">
          <CountUp to={seat.entry.points} from={from} delay={spot.delay + 450} reduced={ctx.reduced} />
          <span className="ml-0.5 text-[10px] font-medium text-pm-grey-text" aria-hidden="true">
            PP
          </span>
          <span className="sr-only">{seat.entry.points.toLocaleString("en-US")} Plate Points</span>
        </span>
        {gained > 0 && (
          <span
            className="lb-gain mt-1 font-mono text-[10px] font-semibold tabular-nums text-pm-orange-text"
            style={{ "--lb-delay": `${spot.delay + 1500}ms` } as CSSProperties}
          >
            +{gained.toLocaleString("en-US")}
            <span className="sr-only"> Plate Points since your last visit</span>
          </span>
        )}
      </button>
      <div
        aria-hidden="true"
        className={`lb-plinth lb-plinth-${place} flex w-full items-start justify-center rounded-t-xl pt-1.5`}
        style={{ height: spot.plinth, "--lb-delay": `${spot.delay}ms` } as CSSProperties}
      >
        <span className="font-display text-[26px] font-bold leading-none text-[#F7F4EC]">{place}</span>
      </div>
    </li>
  );
}

/**
 * The top three on stepped plinths — №1 in the middle, tallest, crowned and
 * glowing. DOM order is still 1-2-3 (the columns are placed by grid), so the
 * list reads in rank order to a screen reader.
 */
export function Podium({ top, ctx }: { top: Seat[]; ctx: BoardCtx }) {
  const open = top.find((s) => s.entry.id === ctx.openId) ?? null;
  return (
    <div className="px-3 pt-8">
      <ol className="grid grid-cols-3 items-end gap-1.5">
        {top.map((seat) => (
          <Spot key={seat.entry.id} seat={seat} ctx={ctx} />
        ))}
      </ol>
      <div className="lb-floor h-1.5 rounded-b-md bg-pm-charcoal" aria-hidden="true" />
      <div id={PODIUM_DETAIL_ID} className="pt-2">
        {open && <SeatDetail seat={open} seats={ctx.seats} youSeat={ctx.youSeat} />}
      </div>
    </div>
  );
}
