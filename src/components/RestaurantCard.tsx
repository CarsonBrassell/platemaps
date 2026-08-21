import Link from "next/link";
import type { RestaurantView } from "@/data/restaurants";
import { StarIcon } from "@/components/icons";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { OpenStatePill } from "@/components/OpenStatePill";
import { EMPTY_PLATE_SCORE, plateScoreLabel, type PlateScore } from "@/lib/plateScore";
import { ASPECT_SCALE_MAX, SHOW_BLEND_STARS, blendLabel } from "@/lib/ratingDisplay";
import { photoCreditFor } from "@/lib/photoCredit";

/**
 * The category the grid is currently filtered to, and what this place scored in
 * it — from lib/discoverFilters.ts, the same model the restaurant page renders.
 *
 * Only passed while a "rated well for" filter is on. Without it the visitor has
 * to open a restaurant to see the number they filtered on, which is the one
 * thing they already told us they care about.
 */
export type AspectHighlight = {
  aspect: string;
  /** The category's rating on 1-5. */
  score: number;
  praised: number;
};

export function RestaurantCard({
  restaurant,
  score = EMPTY_PLATE_SCORE,
  highlight = null,
}: {
  restaurant: RestaurantView;
  /**
   * What this restaurant's plates add up to. Defaults to the unrated score so a
   * caller without the aggregate renders the honest gap rather than crashing —
   * lib/discover.ts attaches the real one to every grid result.
   */
  score?: PlateScore;
  highlight?: AspectHighlight | null;
}) {
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
        {/* Both numbers ride on the photo so the body below is just name and
            context — one less row competing for attention.

            The plate score comes first and wears the accent, because it is ours
            (lib/plateScore.ts); the blend's stars follow behind a divider, muted
            and always with their denominator, because they are someone else's and
            a bare 4.1 beside an 88% is exactly the pair a reader could misread.
            A single star glyph rather than five: at pill size five of them plus
            two numbers is a smudge, and the /5 already names the scale.

            A restaurant with no plate score yet shows only the stars, and the
            words for the gap move to the body row below — the blend is what
            carries a cold-start card, but it never gets to occupy the slot that
            says "PlateMaps rated this". */}
        <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-0.5 font-mono text-xs tabular-nums">
          {score.percent !== null && (
            <span className="font-bold text-pm-orange-text">
              {score.percent}%
              <span className="ml-0.5 text-[10px] font-medium text-zinc-500">
                ({score.ratingCount.toLocaleString()})
              </span>
            </span>
          )}
          {SHOW_BLEND_STARS && (
            <>
              {score.percent !== null && <span className="text-zinc-300">·</span>}
              <span className="flex items-center gap-0.5 font-medium text-zinc-600">
                <StarIcon className="h-3 w-3 text-zinc-400" />
                {blendLabel(restaurant.rating)}
              </span>
            </>
          )}
        </span>
        {restaurant.trending && (
          <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-700">
            Promoted
          </span>
        )}
        {/* Yelp wants their photos credited wherever they appear. The whole
            card is already one <Link>, so this can't be the anchor back to the
            business's Yelp page without nesting anchors — that link lives on
            the detail page's header, which is one tap away.

            Derived rather than hardcoded: photos now also come off restaurants'
            own sites, and those are not Yelp's to be credited for. */}
        {photoCreditFor(restaurant.photo) && (
          <span className="absolute bottom-2 right-2 whitespace-nowrap rounded-full bg-white/85 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
            {photoCreditFor(restaurant.photo)}
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
        {/* The filtered category rides beside the open/closed pill rather than
            on the photo: the photo already carries the overall score, and two
            percentages stacked in the same corner read as one contradictory
            pair. Orange tint marks it as the answer to the active filter — the
            open pill stays tan, so the two never blur together. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <OpenStatePill hours={restaurant.hours} />
          {/* The gap, in the body rather than over the photo — the pill up there
              is where a PlateMaps number goes, and leaving it empty of one is the
              honest signal. Stated in words so "we have no ratings" never reads
              as "rated badly". */}
          {score.percent === null && (
            <span className="font-mono text-[11px] text-zinc-400">
              {plateScoreLabel(score)}
            </span>
          )}
          {highlight && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-pm-orange-tint px-3 py-1.5 text-xs font-medium text-pm-orange-text"
              aria-label={`${highlight.aspect} rated ${highlight.score.toFixed(1)} out of ${ASPECT_SCALE_MAX}`}
            >
              {/* No emoji, unlike RestaurantAspects. That block sets it at
                  14px where a fried egg still reads as one; at pill size it
                  collapses to a coloured smudge and the label says it anyway.

                  Out of 5 with its denominator, and the category label sits
                  right against it — which is what keeps it from reading as the
                  sourced star rating in the pill above. */}
              {highlight.aspect}
              <span className="font-mono font-semibold tabular-nums" aria-hidden="true">
                {highlight.score.toFixed(1)}/{ASPECT_SCALE_MAX}
              </span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
