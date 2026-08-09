"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { FriendStatus } from "@/components/feed/FoodPostCard";

const button =
  "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Same friend-status logic FoodPostCard's header button uses, standalone
 * here since a profile page has no feed of posts to derive it from a prop.
 */
export function ProfileFriendButton({ userId }: { userId: string }) {
  const { account, isSignedIn } = useAuth();
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

  if (!isSignedIn) {
    return (
      <Link href="/account" className={`${button} bg-pm-charcoal text-white hover:brightness-110`}>
        Sign in to add friends
      </Link>
    );
  }

  // Own profile, or still loading — render nothing rather than a flash of
  // the wrong state.
  if (account?.id === userId || status === null) return null;

  if (status === "friends") {
    return (
      <span className={`${button} bg-pm-grey-tint text-pm-grey-text`}>Friends</span>
    );
  }
  if (status === "requested") {
    return <span className={`${button} bg-pm-grey-tint text-pm-grey-text`}>Request sent</span>;
  }
  if (status === "incoming") {
    return (
      <Link href="/account" className={`${button} bg-pm-orange text-white hover:brightness-105`}>
        Respond to their request
      </Link>
    );
  }

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

  return (
    <button
      type="button"
      onClick={sendRequest}
      className={`${button} bg-pm-orange text-white hover:brightness-105`}
    >
      Add friend
    </button>
  );
}
