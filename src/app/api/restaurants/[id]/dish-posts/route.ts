import { NextRequest, NextResponse } from "next/server";
import { getDishPosts } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * The posts about one plate — what `DishSheet` fills its "What people said"
 * card with when a dish is tapped on a restaurant page.
 *
 * A route rather than another read on the restaurant page, because the page
 * already ships one payload per dish it knows about (`getDishRatingsForRestaurant`
 * is a number per plate) and a menu here runs to a hundred rows. Fetching every
 * plate's *prose* up front would be most of a feed downloaded so one dish could
 * be read.
 *
 * The dish travels as a name, not an id: `posts.dish_name` is free text with no
 * id column behind it (see the note on `dishId` in components/feed/types.ts), so
 * the name normalised by `dishRatingKey` is the only join there is.
 *
 * Signed-out is a legitimate caller — a restaurant page is public — and
 * `getDishPosts` narrows the response accordingly: no viewer means no
 * block list to filter by and no per-viewer vote or heart state.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dish = req.nextUrl.searchParams.get("dish");
  if (!dish || !dish.trim()) {
    return NextResponse.json({ error: "Name a dish." }, { status: 400 });
  }

  const user = await getCurrentUser();
  const posts = await getDishPosts(id, dish, user?.id ?? null);
  return NextResponse.json({ posts });
}
