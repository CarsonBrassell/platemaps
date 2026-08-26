import Link from "next/link";
import type { RestaurantView } from "@/data/restaurants";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { EMPTY_PLATE_SCORE, plateScoreLabel, type PlateScore } from "@/lib/plateScore";

/**
 * The three-per-row density.
 *
 * Not the web grid's `RestaurantCard` reused at a smaller size — that one is
 * tuned for a desktop grid column (220px+), and at a phone's actual
 * three-across width (~120px) its single-line name truncated to two or three
 * characters. This card is built for that width instead: a square photo,
 * a two-line clamp on the name rather than a truncated one, and distance /
 * hours dropped entirely — there isn't room to state them without crowding
 * the name, and both are one tap away on the restaurant page.
 */
export function PhoneRestaurantCardGrid({
  restaurant,
  score = EMPTY_PLATE_SCORE,
  priority = false,
  matchedCuisine = false,
}: {
  restaurant: RestaurantView;
  score?: PlateScore;
  priority?: boolean;
  /**
   * The grid is filtered to this restaurant's cuisine, so the line below says
   * why the card is here rather than repeating a fact in muted grey.
   *
   * Only the cuisine, where the web card marks four things — this card is
   * ~120px wide and the cuisine is the only one of them it prints at all. Same
   * decision (`matchMarksFor`), less room to show it.
   */
  matchedCuisine?: boolean;
}) {
  return (
    <Link
      href={`/m/restaurant/${restaurant.id}`}
      className="block overflow-hidden rounded-xl bg-white transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
    >
      <div className="relative aspect-square w-full bg-[var(--pm-tone-1)]">
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          sizes="33vw"
          priority={priority}
          fallback={null}
        />
        {score.percent !== null ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/95 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none tabular-nums text-pm-orange-text">
            {score.percent}%
          </span>
        ) : (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/95 px-1.5 py-0.5 font-mono text-[9px] font-medium leading-none text-zinc-500">
            {plateScoreLabel(score)}
          </span>
        )}
      </div>
      <div className="px-2 pb-2 pt-1.5">
        <p className="line-clamp-2 font-display text-[12px] font-semibold leading-snug tracking-tight text-zinc-900">
          {restaurant.name}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-zinc-500">
          <span
            className={
              matchedCuisine
                ? "rounded-full bg-pm-orange-tint px-1.5 py-0.5 font-medium text-pm-orange-text"
                : undefined
            }
          >
            {restaurant.cuisine}
          </span>
        </p>
      </div>
    </Link>
  );
}
