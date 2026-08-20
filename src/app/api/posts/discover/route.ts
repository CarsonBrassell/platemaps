import { NextResponse, type NextRequest } from "next/server";
import { getDiscoverFeed } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseFeedSort } from "@/lib/feedSort";

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
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const sort = parseFeedSort(req.nextUrl.searchParams.get("sort"));
  const posts = await getDiscoverFeed(user?.id ?? null, undefined, sort);
  return NextResponse.json({ posts });
}
