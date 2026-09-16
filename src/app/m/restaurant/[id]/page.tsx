import { notFound } from "next/navigation";
import { PhoneDetailScreen } from "@/components/mobile/PhoneDetailScreen";
import { getRestaurantPageData } from "@/lib/restaurantPage";

/**
 * A restaurant, phone version.
 *
 * The data half of this file is `src/app/restaurant/[id]/page.tsx` verbatim —
 * the same cached bundle (lib/restaurantPage.ts) and the same `notFound()` on
 * a missing row. That is the architecture of this whole tree (see
 * m/layout.tsx): two designs over one data layer. Nothing here queries
 * differently, filters differently or derives a number the web page doesn't;
 * the only thing that changes below /m is which components render the result.
 *
 * Static per restaurant, an hour at most, and sooner when a post lands at or
 * leaves it — see the web page and probe/PERF-PLAN.md S4.
 *
 * What this page does *not* carry is the web page's chrome: no `Header`, no
 * max-w-5xl column, no "back to discover" row above the fold. The back link
 * moved onto the photo (`PhoneDetailHero`) and the nav is PhoneShell's.
 */
export const revalidate = 3600;

/* Empty on purpose — see the web page: on-demand ISR needs it to exist. */
export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [];
}

export default async function PhoneRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { restaurant, dishes, aspectTally, plateScore, dishRatings, otherLocations } =
    await getRestaurantPageData(id);
  if (!restaurant) notFound();

  return (
    <PhoneDetailScreen
      restaurant={restaurant}
      dishes={dishes}
      aspectTally={aspectTally}
      plateScore={plateScore}
      dishRatings={dishRatings}
      otherLocations={otherLocations}
    />
  );
}
