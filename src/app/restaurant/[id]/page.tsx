import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { RestaurantDetail } from "@/components/RestaurantDetail";
import { restaurants } from "@/data/restaurants";
import { dishesByRestaurant } from "@/data/dishes";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const restaurant = restaurants.find((r) => r.id === id);
  if (!restaurant) notFound();

  const dishes = dishesByRestaurant[id] ?? [];

  return (
    <div className="app-shell mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200/60">
      <Header />
      {/* Phone-width column on small screens, but released on lg so the menu
          and the comment thread can sit side by side rather than leaving
          ~575px of the shell empty next to a single narrow column. */}
      <div className="mx-auto max-w-md bg-white lg:max-w-none">
        <div className="border-b border-zinc-100 px-5 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-all hover:-translate-x-0.5 hover:text-pm-orange-text"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to discover
          </Link>
        </div>
        <RestaurantDetail restaurant={restaurant} dishes={dishes} />
      </div>
    </div>
  );
}
