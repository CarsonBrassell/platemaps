import Link from "next/link";
import type { Restaurant } from "@/data/restaurants";
import { StarIcon } from "@/components/icons";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { OpenStatePill } from "@/components/OpenStatePill";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  return (
    <Link
      href={`/restaurant/${restaurant.id}`}
      className="card-lift group block overflow-hidden rounded-2xl bg-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
    >
      {/* Photo inset from the card edge; a warm tone block holds the slot
          when no photo exists yet. */}
      <div className="relative m-2 h-32 overflow-hidden rounded-[10px] bg-[var(--pm-tone-1)]">
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 220px"
          className="transition-transform duration-500 ease-out group-hover:scale-[1.07]"
          fallback={null}
        />
        {/* Rating rides on the photo so the body below is just name and
            context — one less row competing for attention. */}
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-zinc-900">
          <StarIcon className="h-3 w-3 text-zinc-500" />
          {restaurant.rating.toFixed(1)}
          <span className="text-[10px] text-zinc-500">
            ({restaurant.reviewCount.toLocaleString()})
          </span>
        </span>
        {restaurant.trending && (
          <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-700">
            Promoted
          </span>
        )}
        {/* Yelp wants their photos credited wherever they appear. The whole
            card is already one <Link>, so this can't be the anchor back to the
            business's Yelp page without nesting anchors — that link lives on
            the detail page's header, which is one tap away. */}
        {restaurant.photo && (
          <span className="absolute bottom-2 right-2 whitespace-nowrap rounded-full bg-white/85 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
            Photo: Yelp
          </span>
        )}
      </div>

      <div className="px-3.5 pb-3.5 pt-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display truncate text-[15px] font-semibold tracking-tight text-zinc-900 transition-colors group-hover:text-pm-orange-text">
            {restaurant.name}
          </p>
          <span className="shrink-0 pt-0.5 font-mono text-xs tabular-nums text-zinc-500">
            {restaurant.distance}
          </span>
        </div>
        <p className="mb-2.5 mt-0.5 truncate text-xs text-zinc-500">
          {restaurant.cuisine} &middot; {restaurant.neighborhood}
        </p>
        <OpenStatePill closingTime={restaurant.closingTime} />
      </div>
    </Link>
  );
}
