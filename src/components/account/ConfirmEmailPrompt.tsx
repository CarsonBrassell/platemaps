"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * "Confirm your email", as a step somebody can finish without leaving.
 *
 * Shared by the contacts sheet, the "be found" card and the Settings row,
 * because all three hit the same wall: matching only works between confirmed
 * addresses, and almost no account has one yet.
 *
 * Three things keep it from being a dead end:
 *
 * - **Nothing is sent until the button is tapped.** The server allows one
 *   link a minute, so a link sent silently on the way in would make the first
 *   tap here fail.
 * - **"Too soon" is a countdown, not an error.** A 429 from the send route
 *   means a link is already on its way; the button waits out the seconds the
 *   server named instead of saying something went wrong.
 * - **It re-checks by itself.** The link opens in Safari, which shares
 *   nothing with the app, and the account in memory is only as fresh as the
 *   last `refresh()`. So this asks again every time the page becomes visible,
 *   and "I've confirmed it" does the same by hand in case that event never
 *   fires in the WebView.
 *
 * Always sits on a white card, so its muted text is `zinc-500`.
 */
export function ConfirmEmailPrompt({
  compact = false,
  onConfirmed,
}: {
  /** Tighter type and a content-width button, for inside a Settings row. */
  compact?: boolean;
  /** Called once, when the account's email turns confirmed while this is showing. */
  onConfirmed?: () => void;
}) {
  const { account, resendVerification, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [stillWaiting, setStillWaiting] = useState(false);
  /* The wait as a wall-clock moment rather than a number of ticks: a timer
     in a backgrounded WebView stops, and the person is in Safari for most of
     this minute. `now` is state so render never reads the clock itself. */
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(0);

  const confirmed = account?.emailVerified === true;
  const secondsLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  useEffect(() => {
    if (waitUntil <= now) return;
    // One timeout per second, and only while a countdown is on screen.
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [waitUntil, now]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // `refresh` is a new function on every render of the provider; the
    // listener only needs to exist once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the change from unconfirmed to confirmed counts, never "was already".
  const wasConfirmed = useRef(confirmed);
  useEffect(() => {
    if (confirmed && !wasConfirmed.current) onConfirmed?.();
    wasConfirmed.current = confirmed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  if (!account) return null;

  if (confirmed) {
    return (
      <p role="status" className={`text-zinc-500 ${compact ? "text-xs" : "text-sm"}`}>
        Email confirmed.
      </p>
    );
  }

  function startWait(seconds: number) {
    const from = Date.now();
    setNow(from);
    setWaitUntil(from + seconds * 1000);
  }

  async function send() {
    setBusy(true);
    setError("");
    setStillWaiting(false);
    const result = await resendVerification();
    setBusy(false);
    if (result.retryAfterSeconds) {
      // A link went out moments ago. Wait it out; nothing failed.
      startWait(result.retryAfterSeconds);
      setSent(true);
      return;
    }
    if (result.error) {
      setError("We couldn’t send the email. Try again later.");
      return;
    }
    setSent(true);
    setNotice(result.notice ?? "");
    startWait(60);
  }

  async function recheck() {
    setChecking(true);
    setStillWaiting(false);
    await refresh();
    setChecking(false);
    // If it worked, this component re-renders as "Email confirmed." and the
    // line below is never seen.
    setStillWaiting(true);
  }

  const address = account.pendingEmail ?? account.email;
  const small = compact ? "text-xs" : "text-sm";

  return (
    <div>
      <p className={`leading-snug text-zinc-500 ${small}`}>
        We&rsquo;ll email a link to{" "}
        <span className="break-all font-mono text-[12px] tracking-[0.02em] text-zinc-800">
          {address}
        </span>
        .
      </p>

      <button
        type="button"
        onClick={() => void send()}
        disabled={busy || secondsLeft > 0}
        className={`mt-3 min-h-11 rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${
          compact ? "" : "w-full"
        } ${FOCUS}`}
      >
        {busy ? (
          "Sending…"
        ) : secondsLeft > 0 ? (
          <>
            Send again in <span className="font-mono tabular-nums">{secondsLeft}s</span>
          </>
        ) : sent ? (
          "Send again"
        ) : (
          "Send the link"
        )}
      </button>

      {sent && !error && (
        <p role="status" className={`mt-2 leading-snug text-zinc-500 ${small}`}>
          Sent. Open the link, then come back here.{notice && ` ${notice}`}
        </p>
      )}
      {error && (
        <p role="alert" className={`mt-2 text-red-700 ${small}`}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void recheck()}
        disabled={checking}
        className={`mt-1 flex min-h-11 items-center rounded-lg text-sm text-pm-orange-text underline underline-offset-2 disabled:opacity-50 ${
          compact ? "" : "w-full justify-center"
        } ${FOCUS}`}
      >
        {checking ? "Checking…" : "I’ve confirmed it"}
      </button>
      {stillWaiting && !checking && (
        <p role="status" className={`leading-snug text-zinc-500 ${small}`}>
          Not confirmed yet. Open the link in the email, then try again.
        </p>
      )}
    </div>
  );
}
