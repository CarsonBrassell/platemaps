import type { Restaurant } from "@/data/restaurants";
import { StarRating } from "@/components/StarRating";
import { UtensilsIcon } from "@/components/icons";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";

export function RestaurantHeader({ restaurant }: { restaurant: Restaurant }) {
  return (
    <div className="border-b border-zinc-100">
      <div className="relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br from-pm-orange-tint via-orange-100 to-pm-orange/30">
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          sizes="(max-width: 768px) 100vw, 640px"
          /* The hero of the detail page — never lazy-load it. */
          priority
          fallback={
            <>
              <div
                className="absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.8), transparent 40%), radial-gradient(circle at 85% 85%, rgba(181,80,43,0.2), transparent 45%)",
                }}
                aria-hidden="true"
              />
              <UtensilsIcon className="relative h-10 w-10 text-pm-orange-text/90" />
            </>
          }
        />
        {restaurant.trending && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pm-orange-text shadow-sm backdrop-blur-sm">
            Trending
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        <h1 className="text-2xl font-medium text-zinc-900">{restaurant.name}</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {restaurant.cuisine} &middot; {restaurant.walkTime} &middot; {restaurant.closingTime}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <StarRating rating={restaurant.rating} />
          <span className="text-sm font-medium text-zinc-500">{restaurant.rating.toFixed(1)}</span>
          <span className="text-sm text-zinc-400">
            ({restaurant.reviewCount.toLocaleString()} ratings)
          </span>
        </div>
        {/* Yelp's display requirements: content sourced from them has to be
            credited and linked back to the business's own Yelp page. */}
        {restaurant.yelpUrl && (
          <a
            href={restaurant.yelpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-400 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-pm-orange-text hover:decoration-pm-orange-border"
          >
            Photo and rating via Yelp
          </a>
        )}
      </div>
    </div>
  );
}
