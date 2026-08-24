import { NextResponse } from "next/server";
import { getDishesByRestaurant } from "@/lib/db";

/**
 * How many restaurants one request may ask about.
 *
 * The cap is here to keep a hand-written query string from turning into a
 * multi-kilobyte URL and an arbitrarily wide `= ANY(...)`.
 *
 * It refuses rather than truncating: a silently short menu map is indis-
 * tinguishable from restaurants that genuinely have no dishes, and the bubbles
 * would just quietly stop linking. If a caller ever legitimately needs more,
 * it should ask in batches — do not raise this to paper over one.
 *
 * **The feed map does legitimately need more, and it asks in batches.** This
 * comment used to say nothing came close, on the reasoning that the map's set
 * is bounded by `getDiscoverFeed`'s 120 posts plus the ~19 seeded restaurants.
 * It isn't: `menuRestaurantIdsKey` matches restaurants by NAME, so one post
 * about a chain names every listing that shares it — 200 Starbucks, 135
 * Subways in this corpus — and four chain posts clear 500. The client-side
 * half of the contract is `MENU_IDS_PER_REQUEST` in `src/lib/mapBubbles.ts`,
 * which must stay under this number; move one and move the other.
 */
const MAX_IDS = 500;

/**
 * Menus keyed by restaurant id — the shape the old `dishesByRestaurant` map
 * had, for the client surfaces that were reading it directly.
 *
 * `?ids=3,7,12` limits the response to those restaurants, and both map surfaces
 * now pass it: only a restaurant that actually gets a bubble needs a menu, so
 * `/feed` and `/m/feed` ask for the few dozen they draw rather than the 10.5MB
 * of every dish in the corpus they used to pull on mount.
 *
 * The no-`ids` mode still returns the whole dish table, unchanged, because
 * `DraftMapStage` still reads it that way. That one is narrowable too — it only
 * ever resolves seeded chatter, so `Object.keys(mapCommentsByRestaurant)` is
 * its whole id set — but it is not on the map-feed path this change is about.
 *
 * Public: menus are public data, same as the restaurants themselves.
 */
export async function GET(req: Request) {
  const ids = new URL(req.url).searchParams.get("ids");
  const requested = ids ? ids.split(",").filter(Boolean) : undefined;
  if (requested && requested.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Too many ids — ${MAX_IDS} at a time.` },
      { status: 400 },
    );
  }
  const dishes = await getDishesByRestaurant(requested);
  return NextResponse.json({ dishes });
}
