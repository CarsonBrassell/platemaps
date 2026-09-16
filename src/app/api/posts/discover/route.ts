import type { NextRequest } from "next/server";
import { getDiscoverFeed } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseFeedSort } from "@/lib/feedSort";
import { resolvePostRefs } from "@/lib/discover";
import { decodeCursor, encodeCursor, parseFeedLimit } from "@/lib/feedCursor";
import { cachedJson } from "@/lib/httpCache";

/**
 * The public feed — everyone, unfiltered by friendship. `?sort=trending`
 * (default) ranks by net votes over a steep time decay; `?sort=new` is
 * strictly newest-first. See getDiscoverFeed in lib/db.ts for both orderings
 * and the photo-privacy stripping; this route is a thin pass-through so that
 * logic exists in exactly one place.
 *
 * An unrecognised sort falls back to trending rather than 400-ing —
 * `parseFeedSort` is what narrows it, and it is the only thing allowed to
 * turn a query string into an ordering.
 *
 * Paged by cursor (probe/PERF-PLAN.md S5): the answer carries `nextCursor`,
 * opaque to the client, and `?cursor=` hands it back for the page after. A
 * cursor that fails to decode is treated as no cursor — the first page again
 * — rather than a 400, since the only way to hold a bad one is a stale tab.
 *
 * `places` rides along so the screen can filter what it was sent — see
 * `resolvePostRefs`. It is one entry per restaurant, not per post.
 *
 * Private to the viewer: the response depends on who is asking (blocks,
 * votes), so it is never shared through a CDN, but the ETag still saves the
 * body on a refresh that finds nothing new.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const sort = parseFeedSort(req.nextUrl.searchParams.get("sort"));
  const cursor = decodeCursor(req.nextUrl.searchParams.get("cursor"));
  const limit = parseFeedLimit(req.nextUrl.searchParams.get("limit"));
  const { posts: feed, nextCursor } = await getDiscoverFeed(user?.id ?? null, limit, sort, cursor);
  const { posts, places } = await resolvePostRefs(feed);
  return cachedJson(
    req,
    { posts, places, nextCursor: nextCursor ? encodeCursor(nextCursor) : null },
    { scope: "private" },
  );
}
