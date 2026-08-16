"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

const button =
  "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Sits beside ProfileFriendButton on a public profile. Reads the same
 * GET /api/blocks list the account settings panel uses to find out whether
 * this profile is already blocked, rather than a dedicated status endpoint.
 */
export function ProfileBlockButton({ userId }: { userId: string }) {
  const { account, isSignedIn } = useAuth();
  const [blocked, setBlocked] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isSignedIn || account?.id === userId) return;
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
  }, [isSignedIn, account?.id, userId]);

  // Own profile, signed out, or still loading — no button to show.
  if (!isSignedIn || account?.id === userId || blocked === null) return null;

  async function toggle() {
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
    <button
      type="button"
      onClick={toggle}
      className={`${button} ${
        blocked
          ? "bg-pm-grey-tint text-pm-grey-text"
          : "bg-white text-red-700 ring-1 ring-red-100 hover:bg-red-50"
      }`}
    >
      {blocked ? "Unblock" : "Block"}
    </button>
  );
}
