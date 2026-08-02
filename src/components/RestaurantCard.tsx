import Link from "next/link";
import type { Restaurant } from "@/data/restaurants";
import { StarIcon, UtensilsIcon } from "@/components/icons";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const isCalm = restaurant.status === "calm";
  return (
    <Link
      href={`/restaurant/${restaurant.id}`}
      className="card-lift group block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm hover:border-pm-orange-border active:scale-[0.98]"
    >
      <div className="relative flex h-16 items-center justify-center overflow-hidden bg-gradient-to-br from-pm-grey-tint to-zinc-100">
        <UtensilsIcon className="h-5 w-5 text-zinc-400 transition-transform duration-300 group-hover:scale-110 group-hover:text-pm-orange-text" />
      </div>
      <div className="p-3">
        <div className="mb-0.5 flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium">{restaurant.name}</p>
          <span className="shrink-0 text-xs text-zinc-400">{restaurant.distance}</span>
        </div>
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
              ? "inline-flex items-center gap-1 rounded-full bg-pm-grey-tint px-2.5 py-1 text-xs font-medium text-pm-grey-text"
              : "inline-flex items-center gap-1 rounded-full bg-pm-orange-tint px-2.5 py-1 text-xs font-medium text-pm-orange-text"
          }
        >
          <span
            className={isCalm ? "h-1.5 w-1.5 rounded-full bg-zinc-400" : "h-1.5 w-1.5 rounded-full bg-pm-orange"}
            aria-hidden="true"
          />
          {restaurant.statusLabel}
        </span>
      </div>
    </Link>
  );
}
