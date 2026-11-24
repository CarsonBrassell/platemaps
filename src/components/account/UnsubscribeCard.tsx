"use client";

import { useState } from "react";
import { noticeButton } from "@/components/account/NoticeCard";

type Phase = "ask" | "done" | "undone";

/**
 * The unsubscribe card. Nothing changes until the button is pressed, because
 * mail scanners open links and a GET that unsubscribed would opt people out
 * by accident.
 */
export function UnsubscribeCard({ token }: { token: string | null }) {
  const [phase, setPhase] = useState<Phase>("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(undo: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, undo }),
      });
      if (res.ok) setPhase(undo ? "undone" : "done");
      else setError("This link isn't valid. Nothing was changed.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  let title = "Unsubscribe from PlateMaps emails";
  let body = "Press the button and we will stop sending you PlateMaps update emails.";
  if (!token) {
    title = "This link isn't valid";
    body = "Open the unsubscribe link from the email again.";
  } else if (phase === "done") {
    title = "You're unsubscribed";
    body =
      "You will get no more PlateMaps update emails. Account emails, like password resets, will still arrive.";
  } else if (phase === "undone") {
    title = "You're back on the list";
    body = "You will keep getting PlateMaps update emails.";
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <div className="rounded-2xl bg-white px-6 py-8">
        <p className="mono-label mb-3 text-zinc-500">Email</p>
        <h1 className="mb-2 font-display text-xl font-semibold text-zinc-900">{title}</h1>
        <p className="text-sm leading-relaxed text-zinc-500" aria-live="polite">
          {body}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {token && phase === "ask" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => send(false)}
            className={`mt-5 ${noticeButton}`}
          >
            {busy ? "Working…" : "Unsubscribe"}
          </button>
        )}
        {token && phase === "done" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => send(true)}
            className="mt-4 min-h-11 rounded-full px-4 text-sm font-semibold text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange disabled:opacity-60"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
