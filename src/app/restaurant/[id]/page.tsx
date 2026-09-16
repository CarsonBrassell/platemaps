import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { RestaurantDetail } from "@/components/RestaurantDetail";
import { BackLink } from "./BackLink";
import {
  getDishesForRestaurant,
  getRestaurantAspectTally,
  getRestaurantById,
  getRestaurantPlateScore,
  getDishRatingsForRestaurant,
  getSiblingLocations,
} from "@/lib/db";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // All six read the database, which RestaurantDetail cannot do itself — it
  // is a client component. Issued together rather than in sequence: they don't
  // depend on each other, and awaiting them one at a time would make the page
  // six round trips deep.
  const [restaurant, dishes, aspectTally, plateScore, dishRatings, otherLocations] =
    await Promise.all([
      getRestaurantById(id),
      getDishesForRestaurant(id),
      getRestaurantAspectTally(id),
      getRestaurantPlateScore(id),
      getDishRatingsForRestaurant(id),
      getSiblingLocations(id),
    ]);
  if (!restaurant) notFound();

  return (
    /* No shell card: the page is the cream ground, and each section below is
       its own white card sitting on it. */
    <div className="mx-auto w-full max-w-5xl pb-12">
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
