"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FriendStatus } from "@/components/feed/FoodPostCard";
import { useAuth } from "@/lib/auth";

/**
 * The add/added control on a public profile, phone version.
 *
 * Same single `/api/friends` read and same `/api/friends/request` write as
 * `src/components/ProfileFriendButton.tsx` — the status is derived from the
 * one payload the feed already uses, not from a per-user lookup. The two
 * differences are that every destination stays inside /m and that the button
 * runs full width, because it is the only action on the screen.
 *
 * An incoming request is answered on /m/friends rather than here: that is where
 * accept and decline live, and offering only "accept" from a profile would be a
 * one-sided version of a two-sided decision.
 */

const BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 text-sm font-medium transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export function PhoneProfileFriendButton({ userId }: { userId: string }) {
  const { account, isSignedIn } = useAuth();
  const nav = useSearchParams().get("nav");
  const to = (href: string) => (nav ? `${href}?nav=${nav}` : href);

  const [status, setStatus] = useState<FriendStatus | null>(null);

  useEffect(() => {
    if (!isSignedIn || account?.id === userId) return;
    let cancelled = false;
    fetch("/api/friends")
      .then((res) => res.json())
      .then(
        (data: {
          friendIds: string[];
          incoming: { userId: string }[];
          outgoing: { userId: string }[];
        }) => {
          if (cancelled) return;
          if (data.friendIds.includes(userId)) setStatus("friends");
          else if (data.outgoing.some((r) => r.userId === userId)) setStatus("requested");
          else if (data.incoming.some((r) => r.userId === userId)) setStatus("incoming");
          else setStatus("none");
        },
      )
      .catch(() => setStatus("none"));
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, account?.id, userId]);

  async function sendRequest() {
    setStatus("requested");
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("failed");
      const data: { status: FriendStatus } = await res.json();
      setStatus(data.status);
    } catch {
      setStatus("none");
    }
  }

  if (!isSignedIn) {
    return (
      <Link href={to("/m/account")} className={`${BUTTON} bg-pm-charcoal text-[#F7F4EC]`}>
        Sign in to add friends
      </Link>
    );
  }

  // Own profile, or still loading — render nothing rather than a flash of the
  // wrong state.
  if (account?.id === userId || status === null) return null;

  if (status === "friends") {
    return <span className={`${BUTTON} bg-pm-grey-tint text-pm-grey-text`}>Friends</span>;
  }

  if (status === "requested") {
    return <span className={`${BUTTON} bg-pm-grey-tint text-pm-grey-text`}>Request sent</span>;
  }

  if (status === "incoming") {
    return (
      <Link href={to("/m/friends")} className={`${BUTTON} bg-pm-orange font-semibold text-[#F7F4EC]`}>
        Respond to their request
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={sendRequest}
      className={`${BUTTON} bg-pm-orange font-semibold text-[#F7F4EC]`}
    >
      Add friend
    </button>
  );
}
