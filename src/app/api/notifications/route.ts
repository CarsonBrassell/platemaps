import { NextResponse } from "next/server";
import {
  getActivityForAuthor,
  getNotificationsSeenAt,
  getPendingFriendRequests,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * The notification center's feed: other people's comments, hearts and
 * upvotes on the caller's plates, plus incoming friend requests,
 * and when the caller last looked.
 *
 * Like /api/account/activity there is no `userId` parameter — only the
 * session's own id goes down, which keeps hearts author-only. Upvoters are
 * named — they are public anyway (see getPostUpvoters). Signed out returns an empty center, not a 401.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ activity: [], requests: [], seenAt: null });

  const [activity, pending, seenAt] = await Promise.all([
    getActivityForAuthor(user.id, 50),
    getPendingFriendRequests(user.id),
    getNotificationsSeenAt(user.id),
  ]);
  return NextResponse.json({ activity, requests: pending.incoming, seenAt });
}
