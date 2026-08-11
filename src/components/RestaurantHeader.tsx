import type { Restaurant } from "@/data/restaurants";
import { OpenStatePill } from "@/components/OpenStatePill";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { StarIcon } from "@/components/icons";

export function RestaurantHeader({ restaurant }: { restaurant: Restaurant }) {
  return (
    <section className="rounded-2xl bg-white">
      {/* Photo inset from the card edge so both radii stay visible. When no
          photo exists yet, a warm tone block holds the slot — deliberate,
          not a gray box. */}
      <div className="relative m-2.5 h-40 overflow-hidden rounded-xl bg-[var(--pm-tone-1)] sm:h-52">
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          sizes="(max-width: 768px) 100vw, 960px"
          /* The hero of the detail page — never lazy-load it. */
          priority
          fallback={null}
        />
        {restaurant.trending && (
          <span className="mono-label absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-zinc-700">
            Trending
          </span>
        )}
      </div>

      <div className="px-5 pb-5 pt-1 sm:px-6">
        {/* Machine-issued record number above the human name. */}
        <p className="mono-label text-zinc-500">
          Spot №{restaurant.id.padStart(3, "0")}
        </p>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-zinc-900 sm:text-4xl">
          {restaurant.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {restaurant.cuisine} · {restaurant.neighborhood}
        </p>

        {/* Metadata pills: open state, walk time, rating. All machine values,
            all monospace, all tan — the accent stays out of this row. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <OpenStatePill hours={restaurant.hours ?? null} />
          <span className="inline-flex items-center rounded-full bg-pm-grey-tint px-3 py-1.5 font-mono text-xs font-medium text-pm-grey-text">
            {restaurant.walkTime}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pm-grey-tint px-3 py-1.5 font-mono text-xs font-medium tabular-nums text-pm-grey-text">
            <StarIcon className="h-3 w-3 text-zinc-500" />
            {restaurant.rating.toFixed(1)}
            <span className="text-zinc-500">({restaurant.reviewCount.toLocaleString()})</span>
          </span>
        </div>

        {/* Yelp's display requirements: content sourced from them has to be
            credited and linked back to the business's own Yelp page. This
            covers the photo only — `rating` is a blend of several sources
            rather than Yelp's figure, so crediting it to them would be wrong. */}
        {restaurant.yelpUrl && (
          <a
            href={restaurant.yelpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-zinc-500 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900"
          >
            Photo via Yelp
          </a>
        )}
      </div>
    </section>
  );
}
