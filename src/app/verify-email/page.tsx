"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { NoticeCard } from "@/components/account/NoticeCard";
import { useAuth } from "@/lib/auth";

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
export default function VerifyEmailPage() {
  return (
    <>
      <Header />
      {/* useSearchParams needs a Suspense boundary above it; the fallback is
          the same card in its opening state, so nothing jumps. */}
      <Suspense fallback={<NoticeCard label="Email" title="Confirming your email" body="One moment…" />}>
        <VerifyEmail />
      </Suspense>
    </>
  );
}

type State =
  | { kind: "working" }
  | { kind: "done"; email: string }
  | { kind: "failed"; message: string };

function VerifyEmail() {
  const token = useSearchParams().get("token");
  const { refresh } = useAuth();
  /* A link with no token is knowable at render — no request to make, nothing
     to wait for — so it is the initial state rather than something an effect
     discovers and then sets. */
  const [state, setState] = useState<State>(() =>
    token ? { kind: "working" } : { kind: "failed", message: "That link is missing its token." }
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
    return <NoticeCard label="Email" title="Confirming your email" body="One moment…" />;
  }

  if (state.kind === "failed") {
    return (
      <NoticeCard
        label="Email"
        title="That link didn't work"
        body={state.message}
        action={{ href: "/account", label: "Go to your account" }}
      />
    );
  }

  return (
    <NoticeCard
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
      action={{ href: "/account", label: "Go to your account" }}
    />
  );
}
