import { NextResponse } from "next/server";
import {
  getAllRestaurantPlateScores,
  getRestaurantIndex,
  getRestaurantMapRows,
  getRestaurants,
  searchRestaurants,
} from "@/lib/db";
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
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();

  /*
   * `?fields=index` returns the five fields a picker reads and skips the plate
   * scores entirely — see `getRestaurantIndex`. The three surfaces that use it
   * (both composers' restaurant pickers and the account favourite picker) were
   * pulling 2.8 MB and a full aggregate over `posts` to render a list of names.
   *
   * A parameter rather than a second route because the shape is a projection of
   * the same resource, and because the caching header above applies unchanged:
   * neither variant is viewer-dependent.
   */
  if (params.get("fields") === "index") {
    return NextResponse.json(
      { restaurants: await getRestaurantIndex() },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  /*
   * `?fields=map` is the same idea for the two map surfaces, which do keep
   * their plate scores — the bubble prints one — but drop both photos, the
   * cuisine, the neighbourhood, the distance, the price band, the review count
   * and the trending flag. See `getRestaurantMapRows`.
   */
  if (params.get("fields") === "map") {
    const [rows, plates] = await Promise.all([
      getRestaurantMapRows(),
      getAllRestaurantPlateScores(),
    ]);
    /*
     * A restaurant with no rated plates sends no `plateScore` at all, and the
     * client substitutes `EMPTY_PLATE_SCORE` — which is what that constant is
     * exported for ("a restaurant absent from an aggregate and one with no
     * ratings are the same restaurant").
     *
     * It is worth a branch because of how lopsided the corpus is: measured on
     * production, 4,768 of 4,792 rows — 99.5% — carried the identical
     * `{percent:null,dishCount:0,ratingCount:0,ready:false}`, which is 344 KB
     * of the 1,133 KB this endpoint shipped. Both map surfaces fetch it on
     * mount and parse it on the main thread, so that repetition was paid for
     * in phone jank, twice.
     *
     * This shrinks as the corpus gets rated, which is the right direction: the
     * payload grows only with restaurants that actually have a score to send.
     */
    return NextResponse.json(
      {
        restaurants: rows.map((r) => {
          const plateScore = plates[r.id];
          return plateScore ? { ...r, plateScore } : r;
        }),
      },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  const [rows, plates] = await Promise.all([
    q ? searchRestaurants(q) : getRestaurants(),
    getAllRestaurantPlateScores(),
  ]);

  /* No filtering left to do here: `searchRestaurants` already applied the
     predicate in Postgres and capped the result, so the rows in hand are the
     answer for both the search and the whole-corpus call. The branch that
     used to matter on this line was a JS `.filter` over every row, which is
     the thing the trigram index replaced. */
  return NextResponse.json(
    {
      restaurants: rows.map((r) => ({
        ...r,
        plateScore: plates[r.id] ?? EMPTY_PLATE_SCORE,
      })),
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
