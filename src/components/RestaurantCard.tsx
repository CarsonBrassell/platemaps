import Link from "next/link";
import type { Restaurant } from "@/data/restaurants";
import { StarIcon, UtensilsIcon } from "@/components/icons";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { OpenStatePill } from "@/components/OpenStatePill";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  return (
    <Link
      href={`/restaurant/${restaurant.id}`}
      className="card-lift group block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm hover:border-pm-orange-border active:scale-[0.98]"
    >
      {/* h-16 was sized for an icon placeholder. With real photography the
          card can afford roughly 16:10, which is enough to read a dish. */}
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-pm-grey-tint to-zinc-100">
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 220px"
          className="transition-transform duration-500 ease-out group-hover:scale-[1.07]"
          fallback={
            <UtensilsIcon className="h-6 w-6 text-zinc-400 transition-transform duration-300 group-hover:scale-110 group-hover:text-pm-orange-text" />
          }
        />
        {/* Rating rides on the photo so the body below is just name and
            context — one less row competing for attention. */}
        <span className="absolute bottom-2 left-2 flex items-baseline gap-1 rounded-full bg-white/95 px-2 py-0.5 shadow-sm backdrop-blur-sm">
          <StarIcon className="h-3 w-3 translate-y-0.5 text-pm-orange" />
          <span className="text-xs font-bold text-zinc-900">{restaurant.rating.toFixed(1)}</span>
          <span className="text-[10px] text-zinc-500">
            ({restaurant.reviewCount.toLocaleString()})
          </span>
        </span>
        {restaurant.trending && (
          <span className="absolute right-2 top-2 rounded-full bg-pm-orange px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            Trending
          </span>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display truncate text-[15px] font-semibold tracking-tight text-zinc-900 transition-colors group-hover:text-pm-orange-text">
            {restaurant.name}
          </p>
          <span className="shrink-0 pt-0.5 text-xs text-zinc-400">{restaurant.distance}</span>
        </div>
        <p className="mb-2.5 mt-0.5 truncate text-xs text-zinc-500">
          {restaurant.cuisine} &middot; {restaurant.neighborhood}
        </p>
        <OpenStatePill closingTime={restaurant.closingTime} />
      </div>
    </Link>
  );
}
