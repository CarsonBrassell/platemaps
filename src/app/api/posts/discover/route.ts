import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDiscoverFeed } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseFeedSort } from "@/lib/feedSort";
import { resolvePostRefs } from "@/lib/discover";
import { decodeCursor, encodeCursor, parseFeedLimit } from "@/lib/feedCursor";
import { cachedJson } from "@/lib/httpCache";
import type { Coords } from "@/lib/geo";

/**
 * The public feed — everyone, unfiltered by friendship. `?sort=trending`
 * (default) ranks by net votes over a steep time decay; `?sort=new` is
 * strictly newest-first. Either ordering can additionally be narrowed to
 * posts within `NEARBY_RADIUS_MI` of a position the caller supplies — the
 * Nearby filter chip, not a third sort — by POSTing `{ coords }`. See
 * getDiscoverFeed in lib/db.ts for both orderings, the radius filter and the
 * photo-privacy stripping; `discoverFeed` below is the thin pass-through
 * shared by GET and POST so that logic exists in exactly one place.
 *
 * An unrecognised sort falls back to trending rather than 400-ing —
 * `parseFeedSort` is what narrows it, and it is the only thing allowed to
 * turn a query string into an ordering. (That includes a stale
 * `?sort=nearby` from before Nearby became a filter — it lands on trending
 * rather than erroring.)
 *
 * Paged by cursor (probe/PERF-PLAN.md S5): the answer carries `nextCursor`,
 * opaque to the client, and `?cursor=` hands it back for the page after. A
 * cursor that fails to decode is treated as no cursor — the first page again
 * — rather than a 400, since the only way to hold a bad one is a stale tab.
 *
 * `places` rides along so the screen can filter what it was sent — see
 * `resolvePostRefs`. It is one entry per restaurant, not per post.
 *
 * ## GET vs POST
 *
 * `sort`, `cursor` and `limit` are always read from the query string, on both
 * verbs — none of them says where anyone is standing, so none of them has any
 * reason to avoid a URL. Only a viewer's coordinates do, and coordinates never
 * belong in a URL/query string (shared, logged by every hop, kept in browser
 * history) — the same rule `api/restaurants/discover/route.ts` follows. So a
 * request with the Nearby filter off stays a plain GET; turning it on moves
 * the same request to a POST body instead, `{ coords: { lat, lng } }`, which
 * GET has no way to send — a GET always reaches `getDiscoverFeed` with
 * `here: null` and gets back the unfiltered page for whichever sort was
 * asked for, rather than guessing at a position nobody gave it.
 *
 * Private to the viewer either way: the response depends on who is asking
 * (blocks, votes) and, with the filter on, exactly where they are, so it is
 * never shared through a CDN. The GET path still sends an ETag so a refresh
 * that finds nothing new saves the body; the POST path (coordinates, never
 * cached per the rule above) answers with a plain `NextResponse.json`.
 */
async function discoverFeed(req: NextRequest, here: Coords | null) {
  const user = await getCurrentUser();
  const sort = parseFeedSort(req.nextUrl.searchParams.get("sort"));
  const cursor = decodeCursor(req.nextUrl.searchParams.get("cursor"));
  const limit = parseFeedLimit(req.nextUrl.searchParams.get("limit"));
  const { posts: feed, nextCursor } = await getDiscoverFeed(
    user?.id ?? null,
    limit,
    sort,
    cursor,
    here,
  );
  const { posts, places } = await resolvePostRefs(feed);
  return { posts, places, nextCursor: nextCursor ? encodeCursor(nextCursor) : null };
}

export async function GET(req: NextRequest) {
  const data = await discoverFeed(req, null);
  return cachedJson(req, data, { scope: "private" });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  // Validated rather than trusted, the same check api/restaurants/discover
  // makes on the same shape: these reach a haversine WHERE clause, and a NaN
  // there would quietly match or exclude every row rather than erroring.
  const { coords } = (body ?? {}) as { coords?: unknown };
  const position =
    typeof coords === "object" && coords !== null
      ? (coords as { lat?: unknown; lng?: unknown })
      : null;
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  const here: Coords | null =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;

  const data = await discoverFeed(req, here);
  // Carries a viewer position — unlike the GET above, this is never cached.
  return NextResponse.json(data);
}
