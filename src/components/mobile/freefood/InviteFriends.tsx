"use client";

import { useEffect, useState } from "react";
import {
  FREE_FOOD_INVITE_ERROR,
  FREE_FOOD_INVITE_HEADING,
  FREE_FOOD_INVITE_PLACEHOLDER,
  FREE_FOOD_INVITE_SEND,
  FREE_FOOD_INVITE_SHARE,
  FREE_FOOD_INVITE_TEXT,
  FREE_FOOD_SHARE_URL,
} from "@/lib/freeFoodEvent";
import "./freefood.css";

/** Digits and a leading +, nothing else; "" when it is too short to dial. */
function cleanNumber(raw: string): string {
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  if (digits.length < 10) return "";
  return (t.startsWith("+") ? "+" : "") + digits;
}

function isIOS(): boolean {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() === "ios" || /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * "Bring 2 friends": two number fields and a button that opens the phone's own
 * Messages composer. Purely client-side: the numbers never go to our server.
 */
export function InviteFriends() {
  const [nums, setNums] = useState(["", ""]);
  const [error, setError] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const text = `${FREE_FOOD_INVITE_TEXT} ${FREE_FOOD_SHARE_URL}`;

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  function send() {
    const list = nums.map(cleanNumber).filter(Boolean);
    if (list.length === 0) {
      setError(true);
      return;
    }
    setError(false);
    const body = encodeURIComponent(text);
    const to = list.join(",");
    window.location.href = isIOS() ? `sms:${to}&body=${body}` : `sms:${to}?body=${body}`;
  }

  function share() {
    navigator.share({ text }).catch(() => {});
  }

  return (
    <section aria-labelledby="ff-invite-title" className="ff-root mt-6 w-full max-w-sm">
      <h3 id="ff-invite-title" className="font-display text-lg font-bold leading-snug text-pm-charcoal">
        {FREE_FOOD_INVITE_HEADING}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {nums.map((v, i) => (
          <input
            key={i}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={FREE_FOOD_INVITE_PLACEHOLDER}
            aria-label={`${FREE_FOOD_INVITE_PLACEHOLDER} ${i + 1}`}
            value={v}
            onChange={(e) => {
              setNums((n) => n.map((x, j) => (j === i ? e.target.value : x)));
              setError(false);
            }}
            className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-pm-charcoal placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-pm-orange-text">
          {FREE_FOOD_INVITE_ERROR}
        </p>
      )}
      <button
        type="button"
        onClick={send}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-pm-orange px-5 font-mono text-sm font-semibold uppercase tracking-[0.1em] text-white transition-transform active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        {FREE_FOOD_INVITE_SEND}
      </button>
      {canShare && (
        <button
          type="button"
          onClick={share}
          className="mt-1 flex min-h-11 w-full items-center justify-center text-sm text-pm-orange-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          {FREE_FOOD_INVITE_SHARE}
        </button>
      )}
    </section>
  );
}
