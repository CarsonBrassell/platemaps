"use client";

import { useState, type FormEvent } from "react";
import { Header } from "@/components/Header";
import { NoticeCard, noticeButton, noticeInput } from "@/components/account/NoticeCard";

/**
 * "I can't get in" — asks for an address and posts it to `/api/auth/forgot`.
 *
 * The success state does not say whether the address is one we know, because
 * the route deliberately doesn't tell this page either. Anyone can type any
 * address into this form, so a page that distinguished "sent" from "no such
 * account" would be a free membership checker. The wording says what was done
 * rather than what was found: if there's an account, the mail is on its way.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch {
      // The only failure this page can honestly report is not reaching the
      // server at all. Anything the server actually answered is a success by
      // construction — see the route.
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <Header />
      {sent ? (
        <NoticeCard
          label="Password"
          title="Check your email"
          body={
            <>
              If there&rsquo;s an account for{" "}
              <span className="font-mono text-[13px] tracking-[0.02em] text-zinc-800">
                {email.trim()}
              </span>
              , a reset link is on its way. It works once and expires in an hour.
            </>
          }
          action={{ href: "/account", label: "Back to sign in" }}
        />
      ) : (
        <NoticeCard
          label="Password"
          title="Forgot your password?"
          body="Enter the email on your account and we'll send you a link to set a new one."
        >
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              aria-label="Email address"
              placeholder="name@email.com"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className={`${noticeInput} mb-3`}
            />
            {error && (
              <p role="alert" className="mb-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || email.trim().length === 0} className={noticeButton}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </NoticeCard>
      )}
    </>
  );
}
