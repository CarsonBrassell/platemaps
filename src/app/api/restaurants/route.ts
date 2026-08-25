import { NextResponse } from "next/server";
import { getAllRestaurantPlateScores, getRestaurants, searchRestaurants } from "@/lib/db";
import { EMPTY_PLATE_SCORE } from "@/lib/plateScore";

/**
 * The restaurant list, for client components that can't be handed it as props.
 *
 * Discover doesn't use this — its page is a server component and passes rows
 * straight down. This is for the surfaces that are client components all the
 * way up and only need the list after an interaction: the header's search box,
 * the composer's restaurant picker, the feed map, the favorite-restaurant
 * picker in account settings.
 *
 * `?q=` narrows to restaurants whose name, cuisine or neighbourhood contains
 * the term — the same three fields the header's search ranks on, so it can do
 * its ranking over what comes back without ever holding the corpus.
 *
 * `?q=` is now a real search: `searchRestaurants` filters and caps in Postgres
 * against a trigram index, rather than reading every row and matching in JS.
 * That was the seam this parameter existed to create, and it was worth taking —
 * measured at 4,053 listed rows, the old path moved 2.8 MB and took ~1.8s per
 * request on localhost, to render a typeahead of a dozen results. No caller
 * changed: the predicate is the same three fields matched the same way, so
 * restaurantRank.ts still ranks the candidates it always did.
 *
 * The un-parameterised call still returns the whole corpus, because six
 * surfaces ask for it that way (the feed map, the composer's picker, the
 * account favourite picker, the draft map stage). Those are the remaining
 * weight: none of them needs 4,053 rows, and each one that moves to `?q=` or a
 * viewport-bounded read takes another 2.8 MB off the page it sits on.
 *
 * Each row carries its plate score (lib/plateScore.ts) alongside the projection,
 * because a client component has no way to derive one and the map's dropdown
 * prints it. Four small fields a row rather than a second request per surface;
 * the callers that ignore it — the composer's picker, the account favorite
 * picker — pay a few bytes each for the ones that don't.
 *
 * Public: restaurants are public data and nothing here is viewer-dependent.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();

  const [rows, plates] = await Promise.all([
    q ? searchRestaurants(q) : getRestaurants(),
    getAllRestaurantPlateScores(),
  ]);

  return NextResponse.json({
    restaurants: rows.map((r) => ({
      ...r,
      plateScore: plates[r.id] ?? EMPTY_PLATE_SCORE,
    })),
  });
}
