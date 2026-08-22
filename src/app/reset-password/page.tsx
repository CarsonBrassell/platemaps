"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { NoticeCard, noticeButton, noticeInput } from "@/components/account/NoticeCard";
import { PASSWORD_HINT, checkPassword } from "@/lib/password";

/**
 * Where a reset link lands: set a new password.
 *
 * Unlike `/verify-email`, this page spends nothing on arrival. A reset link
 * only does something once a password has been typed, so there is no work for
 * a mail scanner following the URL to trigger, and the token is checked for the
 * first time on submit.
 *
 * Whether the link is any good is therefore not known until then, which is why
 * an expired token surfaces as an error under the form rather than as its own
 * screen — the alternative is asking the server "is this valid?" up front,
 * which is a second way to spend a guess and tells an attacker the same thing.
 */
export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<NoticeCard label="Password" title="Set a new password" />}>
        <ResetPassword />
      </Suspense>
    </>
  );
}

function ResetPassword() {
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
        label="Password"
        title="Password changed"
        /* Says the sign-outs happened rather than leaving somebody to discover
           it on another device. Being signed out everywhere is the point of a
           reset, but unexplained it reads as a bug. */
        body="You're signed out on every device, including this one. Sign in with your new password."
        action={{ href: "/account", label: "Sign in" }}
      />
    );
  }

  if (!token) {
    return (
      <NoticeCard
        label="Password"
        title="That link didn't work"
        body="It's missing its token. Ask for a new reset link and open the most recent email."
        action={{ href: "/forgot-password", label: "Send a new link" }}
      />
    );
  }

  return (
    <NoticeCard label="Password" title="Set a new password" body={PASSWORD_HINT}>
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
