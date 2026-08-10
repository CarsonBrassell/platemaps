import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { RestaurantDetail } from "@/components/RestaurantDetail";
import {
  getDishesForRestaurant,
  getRestaurantAspectTally,
  getRestaurantById,
} from "@/lib/db";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // All three read the database, which RestaurantDetail cannot do itself — it
  // is a client component. Issued together rather than in sequence: they don't
  // depend on each other, and awaiting them one at a time would make the page
  // three round trips deep.
  const [restaurant, dishes, aspectTally] = await Promise.all([
    getRestaurantById(id),
    getDishesForRestaurant(id),
    getRestaurantAspectTally(id),
  ]);
  if (!restaurant) notFound();

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
