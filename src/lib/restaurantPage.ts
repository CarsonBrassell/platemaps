import { revalidateTag, unstable_cache } from "next/cache";
import {
  getDishRatingsForRestaurant,
  getDishesForRestaurant,
  getRestaurantAspectTally,
  getRestaurantById,
  getRestaurantPlateScore,
  getSiblingLocations,
} from "@/lib/db";

/**
 * A restaurant page's data, cached per id and invalidated by tag
 * (probe/PERF-PLAN.md S4).
 *
 * `/restaurant/[id]` and `/m/restaurant/[id]` each issued the same six reads
 * on every visit. They are viewer-independent — nothing on either page reads
 * the session; what the visitor has voted comes from a client fetch — so the
 * whole bundle is cacheable, and the page that renders it can be static.
 *
 * The cache is the Vercel Data Cache (`unstable_cache`), shared across
 * instances, keyed by id, tagged `restaurant:<id>`. A post landing at or
 * leaving a restaurant calls `invalidateRestaurantPage`, which marks the tag
 * stale; the tag is also recorded against the page that rendered it, so the
 * ISR copy of both surfaces goes with it. Menus change from import scripts
 * that never call this, so a one-hour ceiling catches those.
 *
 * Why not `'use cache'`: it needs `cacheComponents` on, which changes the
 * rendering rules for the whole app. This is one function.
 */
const REVALIDATE_SECONDS = 60 * 60;

export function restaurantTag(id: string): string {
  return `restaurant:${id}`;
}

export type RestaurantPageData = {
  restaurant: Awaited<ReturnType<typeof getRestaurantById>>;
  dishes: Awaited<ReturnType<typeof getDishesForRestaurant>>;
  aspectTally: Awaited<ReturnType<typeof getRestaurantAspectTally>>;
  plateScore: Awaited<ReturnType<typeof getRestaurantPlateScore>>;
  dishRatings: Awaited<ReturnType<typeof getDishRatingsForRestaurant>>;
  otherLocations: Awaited<ReturnType<typeof getSiblingLocations>>;
};

async function readRestaurantPage(id: string): Promise<RestaurantPageData> {
  // Issued together rather than in sequence: they don't depend on each
  // other, and awaiting them one at a time would make the page six round
  // trips deep.
  const [restaurant, dishes, aspectTally, plateScore, dishRatings, otherLocations] =
    await Promise.all([
      getRestaurantById(id),
      getDishesForRestaurant(id),
      getRestaurantAspectTally(id),
      getRestaurantPlateScore(id),
      getDishRatingsForRestaurant(id),
      getSiblingLocations(id),
    ]);
  return { restaurant, dishes, aspectTally, plateScore, dishRatings, otherLocations };
}

export function getRestaurantPageData(id: string): Promise<RestaurantPageData> {
  // Built per id because the tag has to name the id; `unstable_cache` keys
  // the entry on the function source plus `keyParts`, so this is one entry
  // per restaurant, not one per call.
  return unstable_cache(() => readRestaurantPage(id), ["restaurant-page", id], {
    tags: [restaurantTag(id)],
    revalidate: REVALIDATE_SECONDS,
  })();
}

/**
 * Call after anything that changes what a restaurant page shows: a post
 * created at or deleted from it. Missing ids (a post with no restaurant) are
 * a no-op. `"max"` is stale-while-revalidate — the next visitor may get the
 * old page once while the refresh runs, which is the right trade for a page
 * that is never the one the poster is looking at.
 */
export function invalidateRestaurantPage(id: string | null | undefined): void {
  if (!id) return;
  revalidateTag(restaurantTag(id), "max");
}

