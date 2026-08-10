import { NextResponse } from "next/server";
import { getRestaurants } from "@/lib/db";

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
 * Public: restaurants are public data and nothing here is viewer-dependent.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase();
  const restaurants = await getRestaurants();

  if (!q) return NextResponse.json({ restaurants });

  return NextResponse.json({
    restaurants: restaurants.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        r.neighborhood.toLowerCase().includes(q),
    ),
  });
}
