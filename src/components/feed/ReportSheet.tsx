"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import { FlagIcon } from "@/components/icons";
import { MAX_POST_TEXT } from "@/lib/postLimits";

/**
 * Reporting a plate: pick a reason, optionally say more, send.
 *
 * One component for both cards. The web and phone feed cards duplicate a lot
 * on purpose, but not this — a reason list that drifted between the two would
 * put values in the `content_reports.reason` column that only half the triage
 * queue understands.
 *
 * **A reason list rather than a bare "Report" button.** The button that shipped
 * before this sent nothing at all; the cheapest replacement would have been one
 * that files with a fixed reason. A closed list is worth the extra screen: it
 * is what makes the queue sortable, and it is what an App Review tester expects
 * to see when they press the flag on a social app (Guideline 1.2).
 *
 * The labels are what a person would say, and the values are what the database
 * stores — `REPORT_REASONS` in lib/db.ts is the authority on the values, and
 * the route rejects anything not in it.
 */
const REASONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech or a slur" },
  { value: "sexual", label: "Sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "spam", label: "Spam or a scam" },
  { value: "wrong-info", label: "Wrong restaurant or dish" },
  { value: "other", label: "Something else" },
];

export function ReportSheet({
  postId,
  onClose,
  onReported,
}: {
  postId: string;
  /** Dismissed without sending. */
  onClose: () => void;
  /** Sent successfully — the card swaps itself for its confirmation. */
  onReported: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, reason, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't send that report.");
        setSending(false);
        return;
      }
      onReported();
    } catch {
      /* The report is not filed, so the card must not claim it was. */
      setError("Couldn't reach PlateMaps. Try again.");
      setSending(false);
    }
  }

  return (
    <Dialog title="Report this plate" onClose={onClose} variant="sheet">
      <div className="px-5 py-4">
        <p className="mb-4 text-sm leading-relaxed text-zinc-600">
          Tell us what&rsquo;s wrong and we&rsquo;ll take a look. Your name isn&rsquo;t shown
          to the person who posted it.
        </p>

        <div role="radiogroup" aria-label="Reason" className="flex flex-col gap-1.5">
          {REASONS.map((r) => {
            const on = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(r.value)}
                className={`flex min-h-11 items-center rounded-xl px-3.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                  on
                    ? "bg-pm-orange-tint font-medium text-pm-orange-text"
                    : "bg-pm-grey-tint/60 text-zinc-700 hover:bg-pm-grey-tint"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <label htmlFor="report-note" className="mono-label mb-1.5 mt-4 block text-zinc-500">
          Anything else (optional)
        </label>
        <textarea
          id="report-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={MAX_POST_TEXT}
          className="w-full resize-none rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
          placeholder="What should we look at?"
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!reason || sending}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-[0.98] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <FlagIcon className="h-4 w-4 shrink-0" />
          {sending ? "Sending…" : "Send report"}
        </button>
      </div>
    </Dialog>
  );
}
