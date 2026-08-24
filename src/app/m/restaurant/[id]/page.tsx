import { notFound } from "next/navigation";
import { PhoneDetailScreen } from "@/components/mobile/PhoneDetailScreen";
import {
  getDishRatingsForRestaurant,
  getDishesForRestaurant,
  getRestaurantAspectTally,
  getRestaurantById,
  getRestaurantPlateScore,
} from "@/lib/db";

/**
 * A restaurant, phone version.
 *
 * The data half of this file is `src/app/restaurant/[id]/page.tsx` verbatim —
 * the same four reads, issued together rather than in sequence, and the same
 * `notFound()` on a missing row. That is the architecture of this whole tree
 * (see m/layout.tsx): two designs over one data layer. Nothing here queries
 * differently, filters differently or derives a number the web page doesn't;
 * the only thing that changes below /m is which components render the result.
 *
 * What this page does *not* carry is the web page's chrome: no `Header`, no
 * max-w-5xl column, no "back to discover" row above the fold. The back link
 * moved onto the photo (`PhoneDetailHero`) and the nav is PhoneShell's.
 */
export default async function PhoneRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // All five read the database, which PhoneDetailScreen cannot do itself — it
  // is a client component. Issued together rather than in sequence: they don't
  // depend on each other, and awaiting them one at a time would make the page
  // five round trips deep.
  const [restaurant, dishes, aspectTally, plateScore, dishRatings] = await Promise.all([
    getRestaurantById(id),
    getDishesForRestaurant(id),
    getRestaurantAspectTally(id),
    getRestaurantPlateScore(id),
    getDishRatingsForRestaurant(id),
  ]);
  if (!restaurant) notFound();

  return (
    <PhoneDetailScreen
      restaurant={restaurant}
      dishes={dishes}
      aspectTally={aspectTally}
      plateScore={plateScore}
      dishRatings={dishRatings}
    />
  );
}
