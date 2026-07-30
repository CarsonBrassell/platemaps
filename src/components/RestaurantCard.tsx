import type { Restaurant } from "@/data/restaurants";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const isCalm = restaurant.status === "calm";
  return (
    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
      <p className="mb-0.5 text-sm font-medium">{restaurant.name}</p>
      <p className="mb-2 text-xs text-zinc-500">
        {restaurant.cuisine} &middot; {restaurant.neighborhood}
      </p>
      <span
        className={
          isCalm
            ? "rounded-md bg-pm-grey-tint px-2 py-1 text-xs font-medium text-pm-grey-text"
            : "rounded-md bg-pm-orange-tint px-2 py-1 text-xs font-medium text-pm-orange-text"
        }
      >
        {restaurant.statusLabel}
      </span>
    </div>
  );
}
