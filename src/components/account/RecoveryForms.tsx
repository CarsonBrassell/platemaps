"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { NoticeCard, noticeButton, noticeInput } from "@/components/account/NoticeCard";
import { PASSWORD_HINT, checkPassword } from "@/lib/password";
import { useAuth } from "@/lib/auth";

/**
 * The three signed-out account screens — forgot your password, set a new one,
 * confirm your email — as one implementation for both bodies.
 *
 * The desktop pages (`/forgot-password`, `/reset-password`, `/verify-email`)
 * wrap these in `Header`; the phone pages (`/m/...`) wrap them in the phone
 * back bar. What differs between the bodies is only where the links inside go,
 * so that is all `RecoveryLinks` carries: the sign-in screen, the forgot-password
 * screen, and whether the card sits tight under a back bar (`compact`).
 */
export type RecoveryLinks = {
  /** Where "Sign in" / "Go to your account" lead: `/account` or `/m/account`. */
  signIn: string;
  /** Where "Send a new link" leads: `/forgot-password` or `/m/forgot-password`. */
  forgot: string;
  /** Drops the card's tall top padding so it sits right under a back bar. */
  compact?: boolean;
};

/**
 * "I can't get in" — asks for an address and posts it to `/api/auth/forgot`.
 *
 * The success state does not say whether the address is one we know, because
 * the route deliberately doesn't tell this page either. Anyone can type any
 * address into this form, so a page that distinguished "sent" from "no such
 * account" would be a free membership checker. The wording says what was done
 * rather than what was found: if there's an account, the mail is on its way.
 */
export function ForgotPasswordForm({ links }: { links: RecoveryLinks }) {
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

  if (sent) {
    return (
      <NoticeCard
        compact={links.compact}
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
        action={{ href: links.signIn, label: "Back to sign in" }}
      />
    );
  }

  return (
    <NoticeCard
      compact={links.compact}
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
  );
}

/**
 * Where a reset link lands: set a new password.
 *
 * Unlike the verify screen, this spends nothing on arrival. A reset link
 * only does something once a password has been typed, so there is no work for
 * a mail scanner following the URL to trigger, and the token is checked for the
 * first time on submit.
 *
 * Whether the link is any good is therefore not known until then, which is why
 * an expired token surfaces as an error under the form rather than as its own
 * screen — the alternative is asking the server "is this valid?" up front,
 * which is a second way to spend a guess and tells an attacker the same thing.
 */
export function ResetPasswordForm({ links }: { links: RecoveryLinks }) {
  return (
    <Suspense
      fallback={<NoticeCard compact={links.compact} label="Password" title="Set a new password" />}
    >
      <ResetPassword links={links} />
    </Suspense>
  );
}

function ResetPassword({ links }: { links: RecoveryLinks }) {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  /* The same function the server runs, for a message that appears as you type
     rather than after a round trip. It is a courtesy — the server checks
     again, and the server's answer is the one that decides. */
  const problem = password.length > 0 ? checkPassword(password) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setDone(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <NoticeCard
        compact={links.compact}
        label="Password"
        title="Password changed"
        /* Says the sign-outs happened rather than leaving somebody to discover
           it on another device. Being signed out everywhere is the point of a
           reset, but unexplained it reads as a bug. */
        body="You're signed out on every device, including this one. Sign in with your new password."
        action={{ href: links.signIn, label: "Sign in" }}
      />
    );
  }

  if (!token) {
    return (
      <NoticeCard
        compact={links.compact}
        label="Password"
        title="That link didn't work"
        body="This link looks incomplete. Ask for a new reset link and open the most recent email."
        action={{ href: links.forgot, label: "Send a new link" }}
      />
    );
  }

  return (
    <NoticeCard
      compact={links.compact}
      label="Password"
      title="Set a new password"
      body={PASSWORD_HINT}
    >
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          aria-label="New password"
          placeholder="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          disabled={busy}
          className={`${noticeInput} mb-3`}
        />
        {problem && <p className="mb-3 text-xs text-zinc-500">{problem}</p>}
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || problem !== null || !password} className={noticeButton}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </NoticeCard>
  );
}

/**
 * Where a verification link lands.
 *
 * The page spends the token rather than the link doing it, because mail
 * scanners and link previewers follow URLs in messages and a token spent by a
 * robot is a token the recipient finds already used. A POST from this page
 * needs a browser that runs scripts, which is a decent proxy for a person.
 *
 * It is reachable signed out, and has to be: the link opens in whichever
 * browser the mail app prefers, which is routinely not the one holding the
 * session. Nothing here reads the session — the token carries the whole
 * result, and confirming an address deliberately does not sign anybody in.
 */
export function VerifyEmailForm({ links }: { links: RecoveryLinks }) {
  return (
    /* useSearchParams needs a Suspense boundary above it; the fallback is
       the same card in its opening state, so nothing jumps. */
    <Suspense
      fallback={
        <NoticeCard
          compact={links.compact}
          label="Email"
          title="Confirming your email"
          body="One moment…"
        />
      }
    >
      <VerifyEmail links={links} />
    </Suspense>
  );
}

type VerifyState =
  | { kind: "working" }
  | { kind: "done"; email: string }
  | { kind: "failed"; message: string };

function VerifyEmail({ links }: { links: RecoveryLinks }) {
  const token = useSearchParams().get("token");
  const { refresh } = useAuth();
  /* A link with no token is knowable at render — no request to make, nothing
     to wait for — so it is the initial state rather than something an effect
     discovers and then sets. */
  const [state, setState] = useState<VerifyState>(() =>
    token
      ? { kind: "working" }
      : { kind: "failed", message: "That link looks incomplete. Ask for a new one." }
  );

  /* The token works once, and React runs effects twice in development. Without
     this the second run spends nothing and reports "already used" over the top
     of a success that really happened. */
  const spent = useRef(false);

  useEffect(() => {
    if (spent.current || !token) return;
    spent.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/account/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (!res.ok) {
          setState({ kind: "failed", message: data.error ?? "Something went wrong." });
          return;
        }

        setState({ kind: "done", email: data.email });

        // Only does anything when this browser happens to hold the session —
        // which is the common case, and the one where a stale "Unverified" on
        // the settings ledger would be actively misleading.
        await refresh();
      } catch {
        setState({
          kind: "failed",
          message: "Couldn't reach the server. Check your connection and open the link again.",
        });
      }
    })();
    // Runs once for the token this page was opened with; `refresh` is stable
    // enough that listing it would only re-arm the guard for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state.kind === "working") {
    return (
      <NoticeCard
        compact={links.compact}
        label="Email"
        title="Confirming your email"
        body="One moment…"
      />
    );
  }

  if (state.kind === "failed") {
    return (
      <NoticeCard
        compact={links.compact}
        label="Email"
        title="That link didn't work"
        body={state.message}
        action={{ href: links.signIn, label: "Go to your account" }}
      />
    );
  }

  return (
    <NoticeCard
      compact={links.compact}
      label="Email"
      title="Email confirmed"
      body={
        <>
          <span className="font-mono text-[13px] tracking-[0.02em] text-zinc-800">
            {state.email}
          </span>{" "}
          is now the address on your account. It&rsquo;s where we&rsquo;d reach you if you ever
          needed to get back in.
        </>
      }
      action={{ href: links.signIn, label: "Go to your account" }}
    />
  );
}
