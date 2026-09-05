import Link from "next/link";
import type { RestaurantView } from "@/data/restaurantTypes";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { EMPTY_PLATE_SCORE, plateScoreLabel, type PlateScore } from "@/lib/plateScore";
import { photoRatio } from "@/lib/photoShape";
import { StarIcon } from "@/components/icons";
import { ASPECT_SCALE_MAX, SHOW_BLEND_STARS, blendLabel } from "@/lib/ratingDisplay";
import type { AspectHighlight } from "@/components/RestaurantCard";

/**
 * The card in Discover's two-across wall.
 *
 * Not the web grid's `RestaurantCard` reused at a smaller size — that one is
 * tuned for a desktop grid column and prints distance, hours and a wrapping row
 * of chips under a single-line name. This card drops all of that: a two-line
 * clamp on the name rather than a truncated one, and no distance or hours,
 * because on a screen this size they crowd the name and both are one tap away
 * on the restaurant page.
 *
 * It was three across with a square photo until the wall went uneven. Three fit
 * more places on screen at the cost of making every photo small and identically
 * shaped, which on a screen that is mostly photograph is the wrong trade. The
 * photo now keeps its own proportions, so the two columns run to different
 * lengths — that raggedness is the point, and `packColumns` in m/page.tsx is
 * what keeps the two of them roughly level.
 */
export function PhoneRestaurantCardGrid({
  restaurant,
  score = EMPTY_PLATE_SCORE,
  priority = false,
  matchedCuisine = false,
  aspect = null,
}: {
  restaurant: RestaurantView;
  score?: PlateScore;
  priority?: boolean;
  /**
   * The grid is filtered to this restaurant's cuisine, so the line below says
   * why the card is here rather than repeating a fact in muted grey.
   *
   * Only the cuisine, where the web card marks four things — this card is
   * ~167px wide and the cuisine is the only one of them it prints at all. Same
   * decision (`matchMarksFor`), less room to show it.
   */
  matchedCuisine?: boolean;
  /**
   * What this restaurant scored in the category the grid is filtered to, or
   * null when no category filter is on.
   *
   * Only ever set while `filters.aspect` is — the same rule the web card
   * follows. A category on an unfiltered card would be a fourth number
   * competing with the plate score and the blend for a 167px row, and nobody
   * asked it a question.
   */
  aspect?: AspectHighlight | null;
}) {
  return (
    <Link
      href={`/m/restaurant/${restaurant.id}`}
      className="block overflow-hidden rounded-xl bg-white transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
    >
      {/* The photo's own proportions, from the measured size — a square crop
          made every card the same height, which is what the two-across layout
          exists to stop. `aspect-ratio` so the box is correct before the image
          lands; see lib/photoShape.ts. */}
      <div
        className="relative w-full bg-[var(--pm-tone-1)]"
        style={{ aspectRatio: photoRatio(restaurant) }}
      >
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          /* Half the viewport now, not a third. Left at 33vw the optimizer
             would serve an image sized for the old three-across row and it
             would arrive soft. */
          sizes="50vw"
          priority={priority}
          fallback={null}
        />
        {/* The same pair, and the same order, as the web card: our percentage
            first in the accent, the sourced blend behind a divider in muted
            grey and never without its `/5`. A restaurant has two numbers and
            they answer different questions — a bare 4.5 beside an 88% is
            exactly the pair a reader collapses into one.

            This card used to print the percentage alone and, when there wasn't
            one, the words for the gap in the same corner. The blend is what
            carries a cold-start card and it was missing from the phone
            entirely, so the words moved to the body — where the web card has
            always kept them — and the stars took the slot. */}
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums">
          {score.percent !== null && (
            <span className="font-bold text-pm-orange-text">{score.percent}%</span>
          )}
          {SHOW_BLEND_STARS && restaurant.rating != null && (
            <>
              {score.percent !== null && <span className="text-zinc-300">·</span>}
              <span className="flex items-center gap-0.5 font-medium text-zinc-600">
                <StarIcon className="h-2.5 w-2.5 text-zinc-400" />
                {blendLabel(restaurant.rating)}
              </span>
            </>
          )}
        </span>
      </div>
      <div className="px-2 pb-2 pt-1.5">
        <p className="line-clamp-2 font-display text-[12px] font-semibold leading-snug tracking-tight text-zinc-900">
          {restaurant.name}
        </p>
        {/* The dish takes this line over when a dish search is what produced
            the card, because it is the answer and the cuisine is not: anyone
            reading "Carne Asada Fries" has already been told it is Mexican.
            Same call the header dropdown makes, and it matters most here —
            this grid is two cards wide, so a column of identical "Mexican"
            lines is the least useful thing the card could say.

            Flex rather than one truncating run so the *name* absorbs the
            overflow and the price survives it. A price is the reason to
            compare two of these ($6.90 against $21.00 for the same burrito),
            and truncating it away would leave the comparison unmade. */}
        {restaurant.matchedDish ? (
          <p className="mt-0.5 flex items-center gap-1 text-[10px]">
            <span className="truncate rounded-full bg-pm-orange-tint px-1.5 py-0.5 font-medium text-pm-orange-text">
              {restaurant.matchedDish.name}
            </span>
            {restaurant.matchedDish.price && (
              <span className="shrink-0 font-mono font-semibold tabular-nums text-pm-orange-text">
                {restaurant.matchedDish.price}
              </span>
            )}
          </p>
        ) : (
          // Dropped entirely rather than left as an empty line for the ~400
          // restaurants with no cuisine — see `RestaurantView`.
          restaurant.cuisine && (
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
          )
        )}
        {/* The gap, in words, in the body — the pill on the photo is where a
            PlateMaps number goes, and the honest signal is leaving it without
            one rather than filling it with somebody else's. Spelled out so
            "we have no ratings" never reads as "rated badly". */}
        {score.percent === null && (
          <p className="mt-1 truncate font-mono text-[9px] leading-none text-zinc-400">
            {plateScoreLabel(score)}
          </p>
        )}
        {/* The answer to the filter that is on, without opening the card.
            Filtering by Ambiance and getting a grid that never says what
            anything scored for ambiance makes the reader tap every result to
            find out what they already asked.

            Same treatment as the web card — orange tint for "this is what you
            asked for", the label against its number so it cannot be misread as
            the sourced stars above, and no emoji: at 9px the fried egg that
            works on the restaurant page is a coloured smudge. */}
        {aspect && (
          <p
            className="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-pm-orange-tint px-1.5 py-0.5 text-[9px] font-medium leading-none text-pm-orange-text"
            aria-label={`${aspect.aspect} rated ${aspect.score.toFixed(1)} out of ${ASPECT_SCALE_MAX}`}
          >
            <span className="truncate">{aspect.aspect}</span>
            <span className="shrink-0 font-mono font-semibold tabular-nums" aria-hidden="true">
              {aspect.score.toFixed(1)}/{ASPECT_SCALE_MAX}
            </span>
          </p>
        )}
      </div>
    </Link>
  );
}
