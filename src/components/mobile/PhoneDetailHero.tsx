import Link from "next/link";
import type { Restaurant } from "@/data/restaurantTypes";
import { OpenStatePill } from "@/components/OpenStatePill";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";
import { StarRating } from "@/components/StarRating";
import { EMPTY_PLATE_SCORE, plateScoreLabel, type PlateScore } from "@/lib/plateScore";
import {
  BLEND_CAPTION,
  PLATE_SCORE_CAPTION,
  SHOW_BLEND_STARS,
  blendLabel,
} from "@/lib/ratingDisplay";
import { placeLine } from "@/lib/placeLine";

/**
 * The phone detail screen's hero — `RestaurantHeader` re-proportioned, not
 * re-decided.
 *
 * Same information in the same order and under the same rules about which
 * number is whose: the plate score is ours and takes the accent, the Yelp/Google
 * blend follows muted and always with its `/5`, and a restaurant under the
 * plate-score floor says so in words rather than borrowing the blend into the
 * slot where a PlateMaps number goes (lib/plateScore.ts, lib/ratingDisplay.ts).
 *
 * Three things are shaped for the phone:
 *
 * - **The photo is full-bleed, and the name is not on it.** The web hero insets
 *   its photo inside a white card so both radii read; at 390px that mount is a
 *   third of the width spent on framing. Edge-to-edge continues
 *   `PhoneRestaurantCard`'s language — the card the reader just tapped had a
 *   flush photo, so the detail screen opening on the same photo, wider, reads as
 *   that card expanding. The name stays *below* the photo: laid over it, a
 *   Fraunces name has to survive whatever the photograph is doing behind it, and
 *   the answer is always a scrim, which is a gradient this system doesn't have.
 * - **Back is a floating chip, not a text link above the fold.** It is the one
 *   control on this screen with nowhere else to live, so it sits in the top-left
 *   thumb arc over the photo, 44px tall, and stays inside `/m`.
 * - **The numbers sit in a white card.** The name and metadata read fine
 *   directly on the cream, but the score block's two caption levels do not —
 *   `zinc-500`/`zinc-400` clear 4.5:1 on white only (AGENTS.md). Putting the
 *   pair on a card is also the dish sheet's grammar for exactly this content
 *   (DESIGN.md), so the fix and the house style are the same move.
 */
export function PhoneDetailHero({
  restaurant,
  score = EMPTY_PLATE_SCORE,
  backHref,
}: {
  restaurant: Restaurant;
  score?: PlateScore;
  /** Always inside `/m`, and carrying `?nav=` while the nav variants are live. */
  backHref: string;
}) {
  return (
    <section>
      <div className="relative aspect-[16/10] w-full bg-[var(--pm-tone-1)]">
        <RestaurantPhoto
          photo={restaurant.photo}
          photoAlt={restaurant.photoAlt}
          /* Full viewport width on a handset; the 390px desktop preview column
             (phone.css) is the other case. Same pair the discover card uses. */
          sizes="(min-width: 480px) 390px, 100vw"
          /* The hero of the screen — never lazy-loaded. */
          priority
          fallback={null}
        />

        {/* `env(safe-area-inset-top)` because the root layout opts into
            `viewport-fit=cover` — without it this chip sits under the notch on
            the phones this version is being built for. */}
        <Link
          href={backHref}
          className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/95 px-4 text-sm font-medium text-zinc-900 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </Link>

        {/* Yelp requires attribution wherever their photo appears. The chip
            marks the photo; the *link* back to the business lives in the
            disclosure line below, where it can be a real 44px target instead of
            a 10px label floating on an image. */}
        {restaurant.photo && (
          <span className="absolute bottom-2.5 right-2.5 whitespace-nowrap rounded-full bg-white/85 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
            Photo: Yelp
          </span>
        )}
      </div>

      <div className="px-4 pt-4">
        {/* Machine-issued record number above the human name — same as the web
            header, and the reason the two screens read as one product. */}
        <p className="mono-label text-pm-grey-text">
          Spot №{restaurant.id.padStart(3, "0")}
        </p>
        <h1 className="font-display mt-1.5 text-[26px] font-semibold leading-tight tracking-tight text-zinc-900">
          {restaurant.name}
        </h1>
        <p className="mt-1 text-[13px] text-pm-grey-text">
          {placeLine(restaurant.cuisine, restaurant.neighborhood, restaurant.distance)}
        </p>

        <div className="mt-3">
          <OpenStatePill hours={restaurant.hours ?? null} />
        </div>

        {/* Both numbers, and neither can be read as the other: the plate score
            leads in the accent with what it is an average of written under it,
            the blend follows at metadata size with its denominator. */}
        <div className="mt-3 rounded-2xl bg-white px-5 py-4">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            {score.percent !== null && (
              <div>
                <span className="font-mono text-4xl font-bold leading-none tabular-nums text-pm-orange">
                  {score.percent}%
                </span>
                <p className="mt-1.5 font-mono text-[11px] leading-tight text-zinc-500">
                  {PLATE_SCORE_CAPTION}
                  <span className="block text-zinc-500">
                    {score.ratingCount.toLocaleString()}{" "}
                    {score.ratingCount === 1 ? "rating" : "ratings"} across{" "}
                    {score.dishCount} {score.dishCount === 1 ? "plate" : "plates"}
                  </span>
                </p>
              </div>
            )}

            {/* No plate score yet — words, never a borrowed percent, and in the
                slot the percent would have taken. The web header can put this
                last because its row never wraps; here it would end up *under*
                the stars, which reads as a footnote to them rather than as the
                PlateMaps number's absence. */}
            {score.percent === null && (
              <span className="pb-0.5 font-mono text-sm text-zinc-500">
                {plateScoreLabel(score)}
              </span>
            )}

            {/* See the matching note in RestaurantHeader: `rating` is optional
                since restaurants now arrive from OpenStreetMap unrated, and a
                missing number is shown as absent, never as zero stars. */}
            {SHOW_BLEND_STARS && restaurant.rating != null && (
              <div className={score.percent !== null ? "pb-0.5" : ""}>
                <span className="flex items-center gap-1.5">
                  <StarRating rating={restaurant.rating} className="h-4 w-4" />
                  <span className="font-mono text-sm font-medium tabular-nums text-zinc-700">
                    {blendLabel(restaurant.rating)}
                  </span>
                </span>
                <p className="mt-1 font-mono text-[11px] leading-tight text-zinc-500">
                  {BLEND_CAPTION}
                  {restaurant.reviewCount != null &&
                    ` · ${restaurant.reviewCount.toLocaleString()} reviews`}
                </p>
              </div>
            )}
          </div>

          {/* Where the blend comes from, and Yelp's link-back, spelled out once.
              The link is padded to the 44px floor rather than left as an 11px
              hit target. */}
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-zinc-500">
            {SHOW_BLEND_STARS &&
              "Star rating is a weighted blend of Yelp and Google reviews, not PlateMaps ratings."}
            {restaurant.yelpUrl && (
              <>
                {SHOW_BLEND_STARS && " "}
                <a
                  href={restaurant.yelpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full underline decoration-zinc-300 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Photo via Yelp
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
