import type { NextRequest } from "next/server";
import { getFriendsFeed } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { resolvePostRefs } from "@/lib/discover";
import { decodeCursor, encodeCursor, parseFeedLimit } from "@/lib/feedCursor";
import { cachedJson } from "@/lib/httpCache";

/**
 * Mutual friends only, strictly chronological — see getFriendsFeed in
 * lib/db.ts. Signed out has no friends to show, not an error.
 *
 * Paged by cursor the same way as /api/posts/discover (probe/PERF-PLAN.md
 * S5): `nextCursor` out, `?cursor=` back in, an undecodable one meaning the
 * first page.
 *
 * `places` carries the restaurant attributes the feed's filters read, the same
 * as on /api/posts/discover — the filter rail is the same rail on both tabs and
 * must not be able to answer differently on one of them.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return cachedJson(req, { posts: [], places: {}, nextCursor: null }, { scope: "private" });
  }

  const cursor = decodeCursor(req.nextUrl.searchParams.get("cursor"));
  const limit = parseFeedLimit(req.nextUrl.searchParams.get("limit"));
  const { posts: feed, nextCursor } = await getFriendsFeed(user.id, limit, cursor);
  const { posts, places } = await resolvePostRefs(feed);
  return cachedJson(
    req,
    { posts, places, nextCursor: nextCursor ? encodeCursor(nextCursor) : null },
    { scope: "private" },
  );
}
