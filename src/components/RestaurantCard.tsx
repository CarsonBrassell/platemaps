import type { Restaurant } from "@/data/restaurants";
import { StarIcon } from "@/components/icons";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const isCalm = restaurant.status === "calm";
  return (
    <div className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-pm-orange-border hover:shadow-md active:scale-[0.98]">
      <p className="mb-0.5 text-sm font-medium">{restaurant.name}</p>
      <div className="mb-1 flex items-center gap-1">
        <StarIcon className="h-3.5 w-3.5 text-pm-orange" />
        <span className="text-xs font-medium text-zinc-700">
          {restaurant.rating.toFixed(1)}
        </span>
        <span className="text-xs text-zinc-400">
          ({restaurant.reviewCount.toLocaleString()})
        </span>
      </div>
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
