import Link from "next/link";
import type { RestaurantView } from "@/data/restaurantTypes";
import { StarIcon } from "@/components/icons";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { EMPTY_PLATE_SCORE, plateScoreLabel, type PlateScore } from "@/lib/plateScore";
import { SHOW_BLEND_STARS, blendLabel } from "@/lib/ratingDisplay";
import { photoCreditFor } from "@/lib/photoCredit";
import { placeLine } from "@/lib/placeLine";

/** A pick's plate score, or the unrated one when the caller didn't attach it. */
const score = (r: { plateScore?: PlateScore }) => r.plateScore ?? EMPTY_PLATE_SCORE;

/**
 * Takes its picks as a prop rather than filtering the restaurant array itself.
 *
 * It renders inside `DiscoverBrowser`, which is a client component, so anything
 * this file imports is downloaded by every visitor — and it only ever needs two
 * rows. The caller already holds the list and does the filtering.
 */
export function OurPicks({
  picks,
}: {
  picks: readonly (RestaurantView & { plateScore?: PlateScore })[];
}) {
  if (picks.length === 0) return null;

  return (
    <section aria-labelledby="our-picks" className="mb-7">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 id="our-picks" className="mono-label text-zinc-500">
          Our picks
        </h2>
        <span className="mono-label text-zinc-400">Featured this week</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {picks.map((r) => (
          <Link
            key={r.id}
            href={`/restaurant/${r.id}`}
            className="card-lift group block overflow-hidden rounded-2xl bg-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {/* A full 16:9 is worth it for a real photo; without one a warm
                tone block holds a shorter slot deliberately. */}
            <div
              className={`relative m-2 overflow-hidden rounded-[10px] bg-[var(--pm-tone-2)] ${
                r.photo ? "aspect-[16/9]" : "h-20"
              }`}
            >
              <RestaurantPhoto
                photo={r.photo}
                photoAlt={r.photoAlt}
                sizes="(max-width: 640px) 100vw, 300px"
                /* Above the fold on the homepage, and only ever two of them. */
                priority
                className="transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                fallback={null}
              />
              <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-700">
                Promoted
              </span>
              {/* Same credit the grid cards carry — see the note in
                  RestaurantCard for why it isn't the link back, and why the
                  source is derived from the URL rather than assumed. */}
              {photoCreditFor(r.photo) && (
                <span className="absolute bottom-2 right-2 whitespace-nowrap rounded-full bg-white/85 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                  {photoCreditFor(r.photo)}
                </span>
              )}
            </div>
            <div className="px-3.5 pb-3.5 pt-1">
              <p className="font-display text-[15px] font-semibold tracking-tight text-zinc-900 transition-colors group-hover:text-pm-orange-text">
                {r.name}
              </p>
              {/* Both numbers, same rule and same order as the grid card: our
                  percent in the accent first, the blend's stars muted behind a
                  divider with their denominator. Never the blend alone dressed as
                  ours. */}
              <div className="mb-1 mt-1 flex items-center gap-1.5 font-mono text-xs tabular-nums">
                {score(r).percent !== null ? (
                  <span className="font-bold text-pm-orange-text">
                    {score(r).percent}%
                    <span className="ml-0.5 font-medium text-zinc-500">
                      ({score(r).ratingCount.toLocaleString()})
                    </span>
                  </span>
                ) : (
                  <span className="text-zinc-400">{plateScoreLabel(score(r))}</span>
                )}
                {SHOW_BLEND_STARS && r.rating != null && (
                  <>
                    <span className="text-zinc-300">·</span>
                    <span className="flex items-center gap-0.5 font-medium text-zinc-600">
                      <StarIcon className="h-3 w-3 text-zinc-400" />
                      {blendLabel(r.rating)}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                {placeLine(r.cuisine, r.neighborhood)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
