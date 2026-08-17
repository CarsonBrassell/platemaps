import Link from "next/link";
import type { RestaurantView } from "@/data/restaurants";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { EMPTY_PLATE_SCORE, type PlateScore } from "@/lib/plateScore";

/**
 * The five-per-row density: a photo wall for browsing by picture rather than
 * reading. At ~70px wide there is room for the photo and a one-line name and
 * nothing else — no cuisine, no distance, no open/closed pill. Those live one
 * tap away on the restaurant page; this card's whole job is "does this photo
 * make me want to open it".
 *
 * Square rather than 16:10 like the other two phone cards: a wall of
 * consistent squares reads as a grid at a glance, where thirty 16:10 strips
 * at this width would read as a list that got compressed by accident.
 */
export function PhoneRestaurantCardTiny({
  restaurant,
  score = EMPTY_PLATE_SCORE,
  priority = false,
}: {
  restaurant: RestaurantView;
  score?: PlateScore;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/m/restaurant/${restaurant.id}`}
      className="block overflow-hidden rounded-lg bg-white transition-transform active:scale-[0.95] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
    >
      <div className="relative aspect-square w-full bg-[var(--pm-tone-1)]">
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          sizes="20vw"
          priority={priority}
          fallback={null}
        />
        {score.percent !== null && (
          <span className="absolute bottom-1 left-1 rounded bg-white/95 px-1 py-px font-mono text-[9px] font-bold leading-tight tabular-nums text-pm-orange-text">
            {score.percent}%
          </span>
        )}
      </div>
      <p className="truncate px-0.5 pb-1 pt-1 text-center text-[10px] font-medium leading-tight text-zinc-800">
        {restaurant.name}
      </p>
    </Link>
  );
}
