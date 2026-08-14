"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth";

/**
 * The unread dots on the nav's Friends and Profile slots.
 *
 * "Unread" is computed, not stored server-side: each source already carries a
 * `createdAt`, so the newest one is compared against a timestamp we write to
 * localStorage the moment you land on that page. Opening the page is the only
 * thing that clears the dot — which is what the dot is claiming, so a
 * server-side `read_at` column would be a schema change buying nothing the
 * timestamps don't already answer.
 *
 * Two sources, matching what each page actually shows:
 * - Friends → incoming friend requests, the same `/api/friends` read the header
 *   already made for its request dot.
 * - Profile → other people's comments, hearts and upvotes on your own plates,
 *   i.e. the "Activity on your plates" list. `/api/account/activity` takes no
 *   userId and must never grow one (see its route comment), so this is safe to
 *   call from the client — it can only ever return the caller's own activity.
 *
 * Never having opened a page counts as unread. Someone signing in on a new
 * device lands with dots on whatever is waiting, which is the honest reading of
 * "you haven't opened this".
 */

/* Local mirror of the one field this reads off FriendRequestSummary and
   ActivityEvent (src/lib/db.ts). Importing the originals would pull the Neon
   driver into the browser bundle — db.ts is server-only. */
type Stamped = { createdAt: string };

export type NavAlerts = { friends: boolean; profile: boolean };

const NONE: NavAlerts = { friends: false, profile: false };

/** Per account: signing in as someone else must not inherit their seen marks. */
const seenKey = (userId: string, slot: keyof NavAlerts) =>
  `platemaps:nav-seen:${userId}:${slot}`;

/* localStorage throws rather than returning null in Safari private mode and
   under a blocked-cookies policy. A dot that won't clear is a bad day; a dot
   that never shows is merely the old behaviour, so both sides fail quiet. */
function readSeen(key: string): number {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeSeen(key: string, at: number) {
  try {
    window.localStorage.setItem(key, String(at));
  } catch {
    /* ignore */
  }
}

/** Newest createdAt as epoch ms, or 0 for an empty or unparseable list. */
function newest(items: Stamped[] | undefined): number {
  let max = 0;
  for (const item of items ?? []) {
    const at = Date.parse(item.createdAt);
    if (!Number.isNaN(at) && at > max) max = at;
  }
  return max;
}

export function useNavAlerts(): NavAlerts {
  const pathname = usePathname();
  const { account, isSignedIn } = useAuth();
  const userId = account?.id;
  const [alerts, setAlerts] = useState<NavAlerts>(NONE);

  useEffect(() => {
    if (!isSignedIn || !userId) return;

    let cancelled = false;

    Promise.all([
      fetch("/api/friends")
        .then((res) => res.json())
        .then((data: { incoming?: Stamped[] }) => newest(data.incoming))
        .catch(() => 0),
      fetch("/api/account/activity")
        .then((res) => res.json())
        .then((data: { activity?: Stamped[] }) => newest(data.activity))
        .catch(() => 0),
    ]).then(([friendsAt, profileAt]) => {
      if (cancelled) return;

      // Landing on the page is what marks it read, so the dot is already gone
      // by the time that page paints rather than clearing a beat later.
      const onFriends = pathname === "/friends";
      const onProfile = pathname === "/account";
      if (onFriends) writeSeen(seenKey(userId, "friends"), friendsAt);
      if (onProfile) writeSeen(seenKey(userId, "profile"), profileAt);

      setAlerts({
        friends: !onFriends && friendsAt > readSeen(seenKey(userId, "friends")),
        profile: !onProfile && profileAt > readSeen(seenKey(userId, "profile")),
      });
    });

    return () => {
      cancelled = true;
    };
    // Re-read on navigation: answering a request or opening either page is
    // what changes the answer, and both are navigations.
  }, [isSignedIn, userId, pathname]);

  // Sign-out is answered here rather than by resetting state in the effect, so
  // a stale `true` from the previous session can never paint on the way out.
  return isSignedIn ? alerts : NONE;
}
