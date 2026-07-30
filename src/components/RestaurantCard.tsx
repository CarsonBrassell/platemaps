import type { Restaurant } from "@/data/restaurants";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const isCalm = restaurant.status === "calm";
  return (
    <div className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <p className="mb-0.5 text-sm font-medium">{restaurant.name}</p>
      <p className="mb-2 text-xs text-zinc-500">
        {restaurant.cuisine} &middot; {restaurant.neighborhood}
      </p>
      <span
        className={
          isCalm
            ? "rounded-full bg-pm-grey-tint px-2.5 py-1 text-xs font-medium text-pm-grey-text"
            : "rounded-full bg-pm-orange-tint px-2.5 py-1 text-xs font-medium text-pm-orange-text"
        }
      >
        {restaurant.statusLabel}
      </span>
    </div>
  );
}
