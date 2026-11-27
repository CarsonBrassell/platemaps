"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ReportButton } from "@/components/feed/ReportButton";

/**
 * The three dots on a public profile's charcoal band (Calvin, 2026-11-27):
 * Share profile, Report and Block, in that order.
 *
 * Block and Report used to be two red-outlined buttons beside Add friend
 * (`ProfileBlockButton`, which `/u/[id]` still renders). They are the two
 * things you can do *about* a person, and standing next to the one thing you
 * do *with* them made the card read as three choices of equal weight. Behind
 * the dots they are still two taps away, which is what App Store Guideline 1.2
 * asks for, and the card has one action.
 *
 * The block read and write are `ProfileBlockButton`'s, unchanged: the same
 * `GET /api/blocks` list and the same `POST` / `DELETE`. Report is the same
 * `ReportButton`. Share hands the profile's own address to the system share
 * sheet, and copies it where there is none.
 *
 * On your own profile only Share shows; `ReportButton` hides itself for the
 * owner and the block row is skipped.
 */

const ROW =
  "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export function PhoneProfileMenu({ userId, name }: { userId: string; name: string }) {
  const { account, isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isSelf = account?.id === userId;

  useEffect(() => {
    if (!isSignedIn || isSelf) return;
    let cancelled = false;
    fetch("/api/blocks")
      .then((res) => res.json())
      .then((data: { blocked: { id: string }[] }) => {
        if (!cancelled) setBlocked(data.blocked.some((b) => b.id === userId));
      })
      .catch(() => setBlocked(false));
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, isSelf, userId]);

  /* Closes on a press anywhere else and on Escape. The report sheet is a
     descendant of this root, so a press inside it does not count as outside. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function share() {
    const url = `${window.location.origin}/m/u/${userId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} on PlateMaps`, url });
        setOpen(false);
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Dismissing the share sheet rejects, and so does a clipboard the
         WebView refuses. Neither is worth a message. */
    }
  }

  async function toggleBlock() {
    const next = !blocked;
    setBlocked(next);
    try {
      const res = await fetch("/api/blocks", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setBlocked(!next);
    }
  }

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-10">
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-48 rounded-2xl bg-white p-1 ring-1 ring-zinc-900/10">
          <button type="button" onClick={share} className={`${ROW} text-zinc-900`}>
            <span role="status">{copied ? "Link copied" : "Share profile"}</span>
          </button>
          <ReportButton
            kind="user"
            targetId={userId}
            authorId={userId}
            currentUserId={account?.id ?? null}
            className={`${ROW} text-zinc-900`}
          />
          {isSignedIn && !isSelf && blocked !== null && (
            <button type="button" onClick={toggleBlock} className={`${ROW} text-red-700`}>
              {blocked ? "Unblock" : "Block"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
