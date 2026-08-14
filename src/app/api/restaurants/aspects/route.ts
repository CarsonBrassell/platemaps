import { NextResponse } from "next/server";
import { getAllRestaurantAspectTallies } from "@/lib/db";

/**
 * Per-category verdict tallies for every restaurant, for Discover's "Rated
 * well for" filter.
 *
 * Discover's page reads its restaurants from Postgres and passes them down, but
 * `DiscoverBrowser` itself is a client component and cannot query anything —
 * `lib/db.ts` imports the Neon client at module scope. Tallies arrive after
 * first paint rather than with the rows because the filter treats them as
 * optional (a null reads as "can't evaluate yet"), so waiting on them would
 * delay the grid to no purpose. The scoring stays on the client in
 * `lib/aspectScores.ts`, where the restaurant page already does it.
 *
 * Public and viewer-independent: these are aggregate counts over reviews that
 * are already public, with no per-user state and nothing to strip.
 */
export async function GET() {
  const tallies = await getAllRestaurantAspectTallies();
  return NextResponse.json({ tallies });
}
