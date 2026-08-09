import { NextResponse } from "next/server";
import { getAllRestaurantAspectTallies } from "@/lib/db";

/**
 * Per-category verdict tallies for every restaurant, for Discover's "Rated
 * well for" filter.
 *
 * Discover renders from the static `src/data/restaurants.ts` array and knows
 * nothing about Postgres — `lib/db.ts` imports the Neon client at module scope
 * and can't be pulled into a client component. So the one thing the filter
 * needs that isn't static comes over the wire here, and the scoring stays on
 * the client in `lib/aspectScores.ts` where the restaurant page already does
 * it.
 *
 * Public and viewer-independent: these are aggregate counts over reviews that
 * are already public, with no per-user state and nothing to strip.
 */
export async function GET() {
  const tallies = await getAllRestaurantAspectTallies();
  return NextResponse.json({ tallies });
}
