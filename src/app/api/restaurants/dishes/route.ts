import { NextResponse } from "next/server";
import { getDishesByRestaurant } from "@/lib/db";

/**
 * Menus keyed by restaurant id — the shape the old `dishesByRestaurant` map
 * had, for the client surfaces that were reading it directly.
 *
 * `?ids=3,7,12` limits the response to those restaurants. Without it the whole
 * dish table comes back, which is what the feed map needs today: it resolves
 * every bubble's dish name against a menu, for every restaurant on screen.
 *
 * That unbounded mode is the one thing here that does not scale, and it is
 * deliberately the easy thing to fix — the map already knows which restaurants
 * it is drawing, so passing their ids is a one-line change at the call site
 * whenever the dish table gets big enough to care.
 *
 * Public: menus are public data, same as the restaurants themselves.
 */
export async function GET(req: Request) {
  const ids = new URL(req.url).searchParams.get("ids");
  const dishes = await getDishesByRestaurant(
    ids ? ids.split(",").filter(Boolean) : undefined,
  );
  return NextResponse.json({ dishes });
}
