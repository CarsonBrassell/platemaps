"use client";

import { useState } from "react";
import { LedgerRow, type LedgerVariant } from "@/components/account/ledger";
import { useAuth, type PhoneResult } from "@/lib/auth";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/** A server refusal in words. A limit reads as a wait, not as a fault. */
function failureText(result: PhoneResult): string {
  if (result.code === "rate-limited") {
    const seconds = result.retryAfterSeconds ?? 0;
    if (seconds <= 0) return "Too many tries. Try again later.";
    const hours = Math.round(seconds / 3600);
    const minutes = Math.max(1, Math.round(seconds / 60));
    return hours >= 1
      ? `Too many tries. Try again in about ${hours} ${hours === 1 ? "hour" : "hours"}.`
      : `Too many tries. Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
  }
  if (result.code === "limiter-unavailable") return "Try again in a moment.";
  if (result.code === "verify-first") return "Confirm your email first, in the Email row above.";
  return result.error ?? "Something went wrong.";
}

/**
 * The account's optional phone number: add, confirm with a texted code,
 * confirm again after a year, remove.
 *
 * The caller draws this row only when the server says a phone can be
 * verified on this deployment (`account.phoneVerifyAvailable`), or when a
 * number is already on file, so that it can always be taken off. With the
 * texting service unconfigured and no number on file there is no row at all.
 *
 * Things that are true here on purpose:
 *
 * - **We never have the number to show.** The server keeps a keyed hash and
 *   the last four digits, so the row can say `•••• 0123` and nothing more,
 *   and "Confirm again" has to ask for the number to be typed again.
 * - **The number typed and the number confirmed are the same string.** The
 *   code step sends back exactly what the send step sent; the input is locked
 *   once a code is out, and changing it starts over.
 * - **A phone is not a way in.** It is never used to sign in or recover an
 *   account, only to be found by people who already have the number, and
 *   only if "Find me from contacts" is on.
 * - **Nothing is sent until the button is tapped**, and each text costs
 *   money, so a limit from the server is shown as a plain wait.
 */
export function PhoneNumberRow({
  variant,
  open,
  onToggle,
}: {
  variant: LedgerVariant;
  open: boolean;
  onToggle: () => void;
}) {
  const { account } = useAuth();
  if (!account) return null;

  const state = account.phoneVerified
    ? `•••• ${account.phoneLast4 ?? ""}`
    : account.phoneNeedsReconfirm
      ? "Confirm again"
      : "Not added";

  return (
    <LedgerRow
      label="Phone number"
      state={state}
      description={
        account.phoneNeedsReconfirm
          ? "It has been over a year since this number was confirmed, so it has stopped being used to find you. Numbers get reassigned; confirming again takes one text."
          : "Optional. Lets people who already have your number find you, if “Find me from contacts” is on. It is never used to sign in."
      }
      variant={variant}
      open={open}
      onToggle={onToggle}
    >
      {/* Its own component so a half-typed number or code is state that dies
          with the panel, however the row came to be closed. */}
      <PhonePanel variant={variant} />
    </LedgerRow>
  );
}

function PhonePanel({ variant }: { variant: LedgerVariant }) {
  const { account, sendPhoneCode, verifyPhoneCode, removePhone } = useAuth();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  /** The exact string a code was sent for; null until one is out. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  if (!account) return null;

  const onFile = account.phoneLast4 !== undefined;
  const canVerify = account.phoneVerifyAvailable === true;
  const masked = `•••• ${account.phoneLast4 ?? ""}`;

  const small = variant === "phone" ? "text-[13px]" : "text-xs";
  const input = `min-h-11 w-full rounded-full bg-pm-grey-tint/60 px-4 text-zinc-900 outline-none transition-colors disabled:opacity-50 ${FOCUS} ${
    /* text-base on the phone: iOS zooms the viewport for anything under 16px. */
    variant === "phone" ? "text-base" : "text-sm"
  }`;
  const plain = `min-h-11 rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-zinc-700 transition-all hover:bg-pm-grey-tint/70 active:scale-[0.98] disabled:opacity-50 ${FOCUS} ${
    variant === "phone" ? "w-full" : ""
  }`;
  const primary = `min-h-11 rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${FOCUS} ${
    variant === "phone" ? "w-full" : ""
  }`;

  function reset() {
    setEditing(false);
    setPhone("");
    setSentTo(null);
    setCode("");
    setError("");
  }

  async function send() {
    const value = phone.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    setStatus("");
    const result = await sendPhoneCode(value);
    setBusy(false);
    if (result.error) {
      setError(failureText(result));
      return;
    }
    setSentTo(value);
    setCode("");
    setStatus("Code sent. It can take a minute to arrive.");
  }

  async function verify() {
    if (!sentTo) return;
    setBusy(true);
    setError("");
    setStatus("");
    const result = await verifyPhoneCode(sentTo, code.trim());
    setBusy(false);
    if (result.error) {
      setError(failureText(result));
      return;
    }
    reset();
    setStatus("Phone number confirmed.");
  }

  async function remove() {
    setBusy(true);
    setError("");
    setStatus("");
    const result = await removePhone();
    setBusy(false);
    if (result.error) {
      setError(failureText(result));
      return;
    }
    reset();
    setStatus("Phone number removed.");
  }

  const showForm = canVerify && (editing || !onFile);

  return (
    <>
      {onFile && !editing && (
        <>
          <p className="mb-3 font-mono text-[13px] tracking-[0.02em] text-zinc-800">{masked}</p>
          <div className={variant === "phone" ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
            {canVerify && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setStatus("");
                }}
                disabled={busy}
                className={plain}
              >
                {account.phoneNeedsReconfirm ? "Confirm again" : "Change number"}
              </button>
            )}
            <button type="button" onClick={() => void remove()} disabled={busy} className={plain}>
              {busy ? "Removing…" : "Remove"}
            </button>
          </div>
        </>
      )}

      {showForm && sentTo === null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-label="Mobile number"
            placeholder="Mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={busy}
            className={`${input} mb-2 font-mono`}
          />
          <p className={`mb-3 leading-snug text-zinc-500 ${small}`}>
            US numbers only. We&rsquo;ll text you a code. Msg &amp; data rates may apply. We keep
            a scrambled version of your number, not the number itself.
            {onFile && " We don’t have the old one to show, so type the full number."}
          </p>
          <div className={variant === "phone" ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
            <button type="submit" disabled={busy || !phone.trim()} className={primary}>
              {busy ? "Sending…" : "Text me a code"}
            </button>
            {onFile && (
              <button type="button" onClick={reset} disabled={busy} className={plain}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {showForm && sentTo !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className={`mb-2 leading-snug text-zinc-500 ${small}`}>
            Enter the code we texted to{" "}
            <span className="font-mono text-[12px] tracking-[0.02em] text-zinc-800">{sentTo}</span>.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            aria-label="Code from the text message"
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            disabled={busy}
            className={`${input} mb-3 font-mono tracking-[0.2em]`}
          />
          <div className={variant === "phone" ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
            <button type="submit" disabled={busy || code.trim().length < 4} className={primary}>
              {busy ? "Checking…" : "Confirm number"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setCode("");
                setError("");
                setStatus("");
              }}
              disabled={busy}
              className={plain}
            >
              Use a different number
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className={`mt-2 text-red-700 ${small}`}>
          {error}
        </p>
      )}
      {status && !error && (
        <p role="status" className={`mt-2 leading-snug text-zinc-500 ${small}`}>
          {status}
        </p>
      )}
    </>
  );
}
