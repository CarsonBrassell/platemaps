import { Suspense } from "react";
import { notFound } from "next/navigation";
import { QuerySync } from "@/components/QuerySync";
import { Header } from "@/components/Header";
import { RestaurantDetail } from "@/components/RestaurantDetail";
import { BackLink } from "./BackLink";
import { getRestaurantPageData } from "@/lib/restaurantPage";

/*
 * Static per restaurant (probe/PERF-PLAN.md S4). The page reads only
 * `params`, so Next renders it once and serves the copy for an hour, or until
 * a post lands at or leaves this restaurant — `getRestaurantPageData` tags
 * its data `restaurant:<id>` and the post routes revalidate that tag, which
 * takes the page with it. Nothing here is viewer-dependent: what the visitor
 * has voted comes from a client fetch inside RestaurantDetail, and the deep
 * links it honours (`?dish=`, `?post=`) reach it through QuerySync rather
 * than `useSearchParams`, which would have made the page unprerenderable
 * (lib/queryString.ts).
 */
export const revalidate = 3600;

/*
 * Empty on purpose. Without this a dynamic segment is rendered on every
 * request and never cached, whatever `revalidate` says; with it, every id is
 * rendered on first visit and kept (`dynamicParams` defaults to true). Nothing
 * is built ahead because ~5,000 restaurant pages would make every deploy pay
 * for pages nobody may open.
 */
export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [];
}

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { restaurant, dishes, aspectTally, plateScore, dishRatings, otherLocations } =
    await getRestaurantPageData(id);
  if (!restaurant) notFound();

  return (
    /* Cream ground; RestaurantDetail draws its own white card sitting on it. */
    <div className="mx-auto w-full max-w-5xl pb-12">
      <Suspense fallback={null}>
        <QuerySync />
      </Suspense>
      <Header />
      <div className="px-4 sm:px-6">
        <div className="py-2">
          <BackLink />
        </div>
        {/* Phone-width column on small screens, but released on lg so the menu
            and the comment thread can sit side by side rather than leaving
            ~575px of the column empty next to a single narrow strip. */}
        <div className="mx-auto max-w-md lg:max-w-none">
          <RestaurantDetail
            restaurant={restaurant}
            dishes={dishes}
            aspectTally={aspectTally}
            plateScore={plateScore}
            dishRatings={dishRatings}
            otherLocations={otherLocations}
          />
        </div>
      </div>
    </div>
  );
}
