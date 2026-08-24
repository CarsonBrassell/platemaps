import type { Restaurant } from "@/data/restaurants";
import { OpenStatePill } from "@/components/OpenStatePill";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { StarRating } from "@/components/StarRating";
import { EMPTY_PLATE_SCORE, plateScoreLabel, type PlateScore } from "@/lib/plateScore";
import {
  BLEND_CAPTION,
  BLEND_DISCLOSURE,
  PLATE_SCORE_CAPTION,
  SHOW_BLEND_STARS,
  blendLabel,
} from "@/lib/ratingDisplay";

/**
 * The detail page's hero, and the one surface with room to show both numbers in
 * full: the plate score with its sample and what it is an average of, and the
 * blend's stars with their denominator and their provenance.
 *
 * Every other surface (grid card, picks strip, search rows, map tip) shows a
 * compressed version of the same pair. All of them read `SHOW_BLEND_STARS` from
 * lib/ratingDisplay.ts, so the stars leave everywhere at once — see that file.
 */
export function RestaurantHeader({
  restaurant,
  score = EMPTY_PLATE_SCORE,
}: {
  restaurant: Restaurant;
  score?: PlateScore;
}) {
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
        {/* The street address sits under the neighbourhood rather than beside
            it: the two answer the same question at different resolutions, and
            a reader wants the coarse one first. Omitted entirely when unknown —
            an empty slot or a placeholder would both claim more than we have.

            Not mono, despite being a machine value in the loose sense. The rule
            in AGENTS.md covers numbers and machine identifiers, and an address
            is read as prose; setting it in Spline Sans Mono would make a
            secondary line shout louder than the cuisine above it. */}
        {restaurant.address && (
          <p className="mt-0.5 text-sm text-zinc-500">{restaurant.address}</p>
        )}

        {/* Both numbers, stacked so neither can be read as the other.

            The plate score leads and is the only orange here — a percentage is
            exactly what the accent is reserved for (DESIGN.md) — and it names
            itself in words directly underneath, because the stars sitting beside
            it are the reason a bare 88% would be ambiguous. The stars are the
            same size as the metadata around them: outside context, informing
            without competing.

            When the plate score is null the stars carry the header alone and the
            gap is stated in words, never filled with a borrowed percent. */}
        <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2">
          {score.percent !== null && (
            <div>
              <span className="font-mono text-4xl font-bold leading-none tabular-nums text-pm-orange">
                {score.percent}%
              </span>
              <p className="mt-1.5 font-mono text-[11px] leading-tight text-zinc-500">
                {PLATE_SCORE_CAPTION}
                <span className="block text-zinc-400">
                  {score.ratingCount.toLocaleString()}{" "}
                  {score.ratingCount === 1 ? "rating" : "ratings"} across{" "}
                  {score.dishCount} {score.dishCount === 1 ? "plate" : "plates"}
                </span>
              </p>
            </div>
          )}

          {/* `rating` is optional now: a restaurant sourced from OpenStreetMap
              has none until the Google pass runs. Draw nothing rather than a
              zero-star row — an unrated place is normally unlisted, but its
              page is still reachable by direct link. */}
          {SHOW_BLEND_STARS && restaurant.rating != null && (
            <div className={score.percent !== null ? "pb-0.5" : ""}>
              <span className="flex items-center gap-1.5">
                <StarRating rating={restaurant.rating} className="h-4 w-4" />
                <span className="font-mono text-sm font-medium tabular-nums text-zinc-700">
                  {blendLabel(restaurant.rating)}
                </span>
              </span>
              <p className="mt-1 font-mono text-[11px] leading-tight text-zinc-400">
                {BLEND_CAPTION}
                {restaurant.reviewCount != null &&
                  ` · ${restaurant.reviewCount.toLocaleString()} reviews`}
              </p>
            </div>
          )}

          {/* No plate score yet — see lib/plateScore.ts for why a thinly-rated
              place gets words instead of a confident percent. */}
          {score.percent === null && (
            <span className="pb-0.5 font-mono text-sm text-pm-grey-text">
              {plateScoreLabel(score)}
            </span>
          )}
        </div>

        {/* Metadata pills: open state, walk time. All machine values, all
            monospace, all tan — the accent stays out of this row. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <OpenStatePill hours={restaurant.hours ?? null} />
          <span className="inline-flex items-center rounded-full bg-pm-grey-tint px-3 py-1.5 font-mono text-xs font-medium text-pm-grey-text">
            {restaurant.walkTime}
          </span>
        </div>

        {/* That the stars aren't ours, said once and plainly. Copy lives in
            lib/ratingDisplay.ts — it names no source, on purpose; see the note
            there.

            Yelp's display requirements: content sourced from them has to be
            credited and linked back to the business's own Yelp page. That link
            covers the photo, and sits in this same line. */}
        <p className="mt-3 font-mono text-[11px] text-zinc-500">
          {SHOW_BLEND_STARS && <span className="text-zinc-400">{BLEND_DISCLOSURE}</span>}
          {restaurant.yelpUrl && (
            <>
              {" · "}
              <a
                href={restaurant.yelpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900"
              >
                Photo via Yelp
              </a>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
