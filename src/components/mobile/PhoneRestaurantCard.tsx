import Link from "next/link";
import type { RestaurantView } from "@/data/restaurants";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { OpenStatePill } from "@/components/OpenStatePill";
import { EMPTY_PLATE_SCORE, plateScoreLabel, type PlateScore } from "@/lib/plateScore";
import { placeLine } from "@/lib/placeLine";

/**
 * The phone version's discover card.
 *
 * Same information as `RestaurantCard` and the same rules about which number is
 * whose — the percentage is the restaurant's own plate score from
 * `lib/plateScore.ts`, never the Yelp/Google blend, and a place below that
 * model's floor says so in words rather than borrowing one.
 *
 * What changes is the proportion. The web card is one of three in a grid, so its
 * photo is a 128px inset strip and the name has to survive at 15px. Here there
 * is one card per row and a whole phone width to spend, so the photo runs the
 * full width of the card at 16:10 and the name sets at 18px. A food app on a
 * phone is a photo feed that happens to have names on it; the grid card is a
 * directory entry that happens to have a photo.
 *
 * The photo is flush to the card edge rather than inset by 8px like the grid's.
 * At 390px wide that inset reads as a mount around a picture; at 220px it reads
 * as a card with a thumbnail in it.
 */
export function PhoneRestaurantCard({
  restaurant,
  score = EMPTY_PLATE_SCORE,
  priority = false,
}: {
  restaurant: RestaurantView;
  score?: PlateScore;
  /** Set on the first couple of cards so the fold isn't lazy-loaded. */
  priority?: boolean;
}) {
  return (
    <Link
      href={`/m/restaurant/${restaurant.id}`}
      className="block overflow-hidden rounded-2xl bg-white transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
    >
      <div className="relative aspect-[16/10] w-full bg-[var(--pm-tone-1)]">
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          /* One card per row, so the photo is the column width — 390px in the
             desktop preview column, the full viewport on a handset. The 2x
             cap keeps a 3x phone from pulling a needlessly large file over
             cellular for a 16:10 slot. */
          sizes="(min-width: 480px) 390px, 100vw"
          priority={priority}
          fallback={null}
        />

        {score.percent !== null ? (
          <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-pm-orange-text">
            {score.percent}%
            <span className="text-[10px] font-medium text-zinc-500">
              ({score.ratingCount.toLocaleString()})
            </span>
          </span>
        ) : (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-white/95 px-2.5 py-1 font-mono text-[10px] font-medium text-zinc-500">
            {plateScoreLabel(score)}
          </span>
        )}

        {restaurant.trending && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-700">
            Promoted
          </span>
        )}

        {/* Yelp requires attribution wherever their photo appears. The card is
            one <Link>, so this cannot be the anchor to the business page
            without nesting anchors — same trade the grid card makes. */}
        {restaurant.photo && (
          <span className="absolute bottom-2.5 right-2.5 whitespace-nowrap rounded-full bg-white/85 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
            Photo: Yelp
          </span>
        )}
      </div>

      <div className="px-4 pb-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display min-w-0 flex-1 text-[18px] font-semibold leading-tight tracking-tight text-zinc-900">
            {restaurant.name}
          </p>
          <span className="shrink-0 pt-1 font-mono text-xs tabular-nums text-zinc-500">
            {restaurant.distance}
          </span>
        </div>
        <p className="mb-3 mt-1 truncate text-[13px] text-zinc-500">
          {placeLine(restaurant.cuisine, restaurant.neighborhood)}
        </p>
        {/* The pill gains a neighbour only while a dish search put this card
            here — see the note on the web card. It matters more on a phone,
            not less: the screen shows two or three results at a time, so a
            wall of identical subtitles costs more scrolling to see through. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <OpenStatePill hours={restaurant.hours} />
          {restaurant.matchedDish && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-pm-orange-tint px-3 py-1.5 text-[12px] font-medium text-pm-orange-text">
              <span className="truncate">{restaurant.matchedDish.name}</span>
              {restaurant.matchedDish.price && (
                <span className="shrink-0 font-mono font-semibold tabular-nums">
                  {restaurant.matchedDish.price}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
