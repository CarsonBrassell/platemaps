import { NextResponse } from "next/server";
import { getFriendsFeed } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { resolvePostRefs } from "@/lib/discover";

/**
 * Mutual friends only, strictly chronological — see getFriendsFeed in
 * lib/db.ts. Signed out has no friends to show, not an error.
 *
 * `places` carries the restaurant attributes the feed's filters read, the same
 * as on /api/posts/discover — the filter rail is the same rail on both tabs and
 * must not be able to answer differently on one of them.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ posts: [], places: {} });

  const feed = await getFriendsFeed(user.id);
  const { posts, places } = await resolvePostRefs(feed);
  return NextResponse.json({ posts, places });
}
