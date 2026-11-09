"use client";

import { useState } from "react";
import { useAdminAccess } from "@/lib/auth";

const TEXT_BUTTON =
  "min-h-11 rounded-full px-2 font-mono text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * The admin's delete, as a text control beside Reply and Report — the same
 * clothes those wear, in the menu's red. Renders nothing for anyone who is not
 * an admin (lib/adminGate.ts); the route checks the session id regardless.
 *
 * Two taps, like the post menu: "Delete", then "Delete for good" / "Keep".
 * A comment delete takes every reply under it and is not undoable.
 *
 * `kind` picks the route. `onDeleted` runs only after the server said yes, so
 * nothing vanishes from the screen that is still on the site.
 */
export function AdminDeleteButton({
  kind,
  targetId,
  onDeleted,
  label = "Delete",
}: {
  kind: "comment" | "post";
  targetId: string;
  onDeleted: () => void;
  label?: string;
}) {
  const admin = useAdminAccess();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!admin) return null;

  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/${kind === "post" ? "posts" : "comments"}/${targetId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("failed");
      onDeleted();
    } catch {
      setFailed(true);
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`${TEXT_BUTTON} text-red-700 hover:bg-red-50`}
      >
        {failed ? "Couldn't delete. Retry" : label}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className={`${TEXT_BUTTON} bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50`}
      >
        Delete for good
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(false)}
        className={`${TEXT_BUTTON} text-zinc-500 hover:text-zinc-900`}
      >
        Keep
      </button>
    </>
  );
}
