import { NextResponse } from "next/server";
import { getAllRestaurantPlateScores, getRestaurants } from "@/lib/db";
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
 * It is a filter, not yet a search index: it still reads every row and matches
 * in JS, so it returns the right answer at any size but gets slower with the
 * table. The reason it exists as a parameter at all is that it is the seam to
 * move into SQL — a trigram index and a LIMIT go here, and no caller changes.
 *
 * Each row carries its plate score (lib/plateScore.ts) alongside the projection,
 * because a client component has no way to derive one and the map's dropdown
 * prints it. Four small fields a row rather than a second request per surface;
 * the callers that ignore it — the composer's picker, the account favorite
 * picker — pay a few bytes each for the ones that don't.
 *
 * Public: restaurants are public data and nothing here is viewer-dependent.
 * That is also what makes it safe to cache at Vercel's edge — no caller-
 * specific data ever goes into this response.
 */

/**
 * 60s to match `CORPUS_TTL_MS` in `discover.ts` — the plate scores embedded
 * in every row come from live votes, so this can't be cached indefinitely,
 * but it can be cached as long as Discover already tolerates the same numbers
 * being a minute stale. `stale-while-revalidate` means a cache miss after
 * expiry still serves the old response immediately and refreshes in the
 * background, rather than making that one request pay for a cold fetch.
 */
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase();
  const [rows, plates] = await Promise.all([
    getRestaurants(),
    getAllRestaurantPlateScores(),
  ]);

  const restaurants = rows.map((r) => ({
    ...r,
    plateScore: plates[r.id] ?? EMPTY_PLATE_SCORE,
  }));

  const headers = { "Cache-Control": CACHE_CONTROL };

  if (!q) return NextResponse.json({ restaurants }, { headers });

  return NextResponse.json(
    {
      restaurants: restaurants.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.cuisine.toLowerCase().includes(q) ||
          r.neighborhood.toLowerCase().includes(q),
      ),
    },
    { headers },
  );
}
