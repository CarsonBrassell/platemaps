"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  FREE_FOOD_ACTIVE_MS,
  FREE_FOOD_ENDS_AT,
  FREE_FOOD_STARTS_AT,
  FREE_FOOD_TICKET_LABEL,
  mmss,
  ticketHandle,
  ticketNumber,
} from "@/lib/freeFoodEvent";
import { ClaimCounter } from "./ClaimCounter";
import { DoorsCountdown, TicketAction, TicketCard } from "./TicketCard";
import { useEventTicket, useTicketNow } from "./useEventTicket";
import "./freefood.css";

const PT = "America/Los_Angeles";

/** "5:42:07 PM", the counter staff's clock (Boulder is not the issue, the
    event is on Pacific time). */
function fullTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: PT,
  });
}

/** "5:42pm" */
function shortTime(ms: number) {
  return new Date(ms)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: PT })
    .replace(" ", "")
    .toLowerCase();
}

/**
 * The ticket card on the signed-in user's own Profile, once they have claimed
 * one: waits for doors, activates at the counter, runs live for five minutes,
 * then reads as used. Renders nothing for an account without a ticket, and
 * nothing until mounted (it depends on the clock).
 */
export function ProfileTicket() {
  const { account } = useAuth();
  const { ticket, offset, busy, error, slicesLeft, simOn, activate } = useEventTicket(!!account);
  const now = useTicketNow(offset);
  const [confirming, setConfirming] = useState(false);

  if (!account || !ticket || now === null) return null;

  const activatedAt = ticket.activatedAt ? Date.parse(ticket.activatedAt) : null;
  const handle = ticketHandle(account.name);
  const number = ticketNumber(account.id);
  const liveLeft = activatedAt === null ? 0 : activatedAt + FREE_FOOD_ACTIVE_MS - now;

  let body;
  let tone: "default" | "used" = "default";
  let live = false;

  if (activatedAt !== null && liveLeft > 0) {
    live = true;
    body = (
      <div role="timer" aria-label={`Ticket live, ${mmss(liveLeft)} left`}>
        <p className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-pm-orange-text">
          <span className="ff-dot h-1.5 w-1.5 rounded-full bg-pm-orange" aria-hidden="true" />
          Live
        </p>
        <p className="mt-1 font-mono text-[34px] font-bold leading-tight tabular-nums">{fullTime(now)}</p>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-pm-orange-text">{mmss(liveLeft)}</p>
        <p className="mt-1 text-xs text-zinc-600">Show this screen at the counter.</p>
      </div>
    );
  } else if (activatedAt !== null) {
    tone = "used";
    body = (
      <p className="font-mono text-sm font-semibold uppercase tracking-[0.08em] text-zinc-600">
        Used · activated at {shortTime(activatedAt)}
      </p>
    );
  } else if (now >= FREE_FOOD_ENDS_AT) {
    return null;
  } else if (now < FREE_FOOD_STARTS_AT) {
    body = (
      <div>
        <TicketAction disabled>Activate</TicketAction>
        <p className="mt-3 text-sm font-semibold">Activation opens Thu Nov 19 · 5pm</p>
        <div className="mt-4">
          <DoorsCountdown msLeft={FREE_FOOD_STARTS_AT - now} />
        </div>
      </div>
    );
  } else if (confirming) {
    body = (
      <div>
        <p className="text-sm font-semibold">Activate now? It lasts 5 minutes — do it at the counter.</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-12 flex-1 rounded-full bg-zinc-200 font-mono text-sm font-semibold uppercase tracking-[0.1em] text-pm-charcoal"
          >
            Not yet
          </button>
          <div className="flex-1">
            <TicketAction
              disabled={busy}
              onClick={async () => {
                if (await activate()) setConfirming(false);
              }}
            >
              {busy ? "..." : "Activate"}
            </TicketAction>
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <div>
        <TicketAction onClick={() => setConfirming(true)}>Activate</TicketAction>
        <p className="mt-3 text-xs text-zinc-600">Do this at the counter. It stays live for 5 minutes.</p>
      </div>
    );
  }

  return (
    <section aria-label={FREE_FOOD_TICKET_LABEL} className="mb-5 flex flex-col items-center">
      {now >= FREE_FOOD_STARTS_AT && <ClaimCounter left={slicesLeft} sim={simOn} ground="cream" />}
      <TicketCard handle={handle} number={number} tone={tone} live={live}>
        {body}
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-pm-orange-text">
            {error.message}
          </p>
        )}
      </TicketCard>
    </section>
  );
}
