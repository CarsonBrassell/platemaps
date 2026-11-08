"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  FREE_FOOD_CLAIM_CTA,
  FREE_FOOD_DATE_LINE,
  FREE_FOOD_ENDS_AT,
  FREE_FOOD_PARTNER,
  FREE_FOOD_SIGNUP_CTA,
  FREE_FOOD_STARTS_AT,
  FREE_FOOD_TITLE,
  freeFoodLive,
  ticketHandle,
  ticketNumber,
} from "@/lib/freeFoodEvent";
import { CloseIcon } from "@/components/icons";
import { InviteFriends } from "./InviteFriends";
import { DoorsCountdown, TicketAction, TicketCard } from "./TicketCard";
import { ClaimCounter } from "./ClaimCounter";
import { isNativeApp, useEventTicket, useTicketNow } from "./useEventTicket";
import "./freefood.css";

/**
 * The claim popup: Pizza on Pearl x PlateMaps, a free slice. Opened from
 * `TicketButton` on the feed. Claiming needs the iOS app, a signed-in account
 * and one post; the claimed ticket is activated from the Profile.
 *
 * Orange head, white body holding the ticket card: the one place the accent is
 * a ground rather than a fill, the same exception the Friends hero card makes.
 */

export function TicketPopup({ onClose }: { onClose: () => void }) {
  const { account } = useAuth();
  const [native, setNative] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { ticket, loaded, busy, error, slicesLeft, simOn, offset, claim } = useEventTicket(!!account);
  const now = useTicketNow(offset) ?? Date.now() + offset;

  const live = freeFoodLive(now);
  const over = now >= FREE_FOOD_ENDS_AT;

  useEffect(() => {
    setNative(isNativeApp() || simOn);
  }, [simOn]);

  /* Modal plumbing: Escape closes, focus moves into the dialog and goes back
     where it came from, the page behind does not scroll. */
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

  const handle = account ? ticketHandle(account.name) : "Guest";
  const number = ticketNumber(account?.id ?? "guest");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ff-title"
      ref={dialogRef}
      tabIndex={-1}
      className="ff-root fixed outline-none inset-0 z-50 flex flex-col overflow-hidden bg-pm-orange animate-sheet-in"
    >
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
            <span className={`h-1.5 w-1.5 rounded-full bg-white ${over ? "" : "ff-dot"}`} aria-hidden="true" />
            {over ? "Ended" : live ? "Live" : "Free"}
          </span>
        </div>

        <div className="mt-1 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#fbe3d3]">
            {FREE_FOOD_PARTNER} <span className="text-pm-charcoal">×</span> PlateMaps
          </p>
          <h2 id="ff-title" className="mt-1.5 font-display text-[29px] font-bold leading-tight">
            {FREE_FOOD_TITLE}
          </h2>
          <p className="mt-1 text-sm text-[#fbe3d3]">{FREE_FOOD_DATE_LINE}</p>
        </div>
      </div>


      {/* ---- Body: the ticket ---- */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7">
        {live && <ClaimCounter left={slicesLeft} sim={simOn} />}
        <TicketCard handle={handle} number={number}>
          {over ? (
            <p className="text-sm font-semibold">This event has ended.</p>
          ) : ticket ? (
            <div>
              <p className="font-display text-xl font-bold">Claimed!</p>
              <p className="mt-1 text-sm text-zinc-600">
                Go to your Profile to activate it at the counter.
              </p>
              <Link
                href="/m/account"
                onClick={onClose}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-pm-orange px-5 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-white"
              >
                Open Profile
              </Link>
            </div>
          ) : (
            <div>
              {!account ? (
                <>
                  <TicketAction disabled>{FREE_FOOD_CLAIM_CTA}</TicketAction>
                  <Link
                    href="/m/account"
                    className="mt-3 inline-block text-sm text-pm-orange-text underline underline-offset-2"
                  >
                    {FREE_FOOD_SIGNUP_CTA}
                  </Link>
                </>
              ) : !native ? (
                <TicketAction disabled>Claim it in the PlateMaps app</TicketAction>
              ) : (
                <TicketAction disabled={busy || !loaded} onClick={claim}>
                  {busy ? "Claiming..." : "Claim"}
                </TicketAction>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm font-semibold text-pm-orange-text">
                  {error.message}
                </p>
              )}
            </div>
          )}
          {!over && !live && !ticket && (
            <div className="mt-5">
              <DoorsCountdown msLeft={FREE_FOOD_STARTS_AT - now} />
            </div>
          )}
        </TicketCard>
        <InviteFriends />
      </div>
    </div>
  );
}
