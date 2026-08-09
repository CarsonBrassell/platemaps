import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { RestaurantDetail } from "@/components/RestaurantDetail";
import { restaurants } from "@/data/restaurants";
import { dishesByRestaurant } from "@/data/dishes";
import { getRestaurantAspectTally } from "@/lib/db";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const restaurant = restaurants.find((r) => r.id === id);
  if (!restaurant) notFound();

  const dishes = dishesByRestaurant[id] ?? [];
  // Fetched here rather than in RestaurantDetail because that component is a
  // client component and this reads the database directly.
  const aspectTally = await getRestaurantAspectTally(id);

  return (
    /* No shell card: the page is the cream ground, and each section below is
       its own white card sitting on it. */
    <div className="mx-auto w-full max-w-5xl pb-12">
      <Header />
      <div className="px-4 sm:px-6">
        <div className="py-2">
          <Link
            href="/"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full text-sm text-zinc-500 transition-all hover:-translate-x-0.5 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to discover
          </Link>
        </div>
        {/* Phone-width column on small screens, but released on lg so the menu
            and the comment thread can sit side by side rather than leaving
            ~575px of the column empty next to a single narrow strip. */}
        <div className="mx-auto max-w-md lg:max-w-none">
          <RestaurantDetail restaurant={restaurant} dishes={dishes} aspectTally={aspectTally} />
        </div>
      </div>
    </div>
  );
}
